const {
  rankColumns,
} = require("./columnMatcher");

const {
  getColumns,
} = require("./utils");

/**
 * CONFIDENCE ENGINE
 * -----------------
 * Detects plans that are technically valid
 * but may still be ambiguous.
 *
 * It does NOT:
 * - calculate answers
 * - modify dataset values
 * - invent columns
 * - call Groq
 */

function confident(
  details = {}
) {
  return {
    confident: true,
    ...details,
  };
}

function uncertain(
  reason,
  question,
  details = {}
) {
  return {
    confident: false,
    reason,
    question,
    ...details,
  };
}

/**
 * Convert a column name into readable text.
 */
function readableColumn(
  column
) {
  return String(column || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect ambiguous column matching.
 *
 * Example:
 *
 * requested:
 * "salary"
 *
 * candidates:
 * ACTUAL SALARY
 * AUTHORIZED SALARY
 */
function checkColumnConfidence({
  rows,
  requestedColumn,
  resolvedColumn,
}) {
  if (
    !requestedColumn ||
    !resolvedColumn
  ) {
    return confident();
  }

  const ranked =
    rankColumns(
      rows,
      requestedColumn
    );

  if (!ranked.length) {
    return uncertain(
      "COLUMN_NOT_FOUND",
      `I couldn't determine which field you mean by "${requestedColumn}".`
    );
  }

  const best =
    ranked[0];

  const second =
    ranked[1];

  /**
   * Strong match.
   */
  if (
    best.score >= 2.5
  ) {
    return confident({
      column:
        resolvedColumn,
      score:
        best.score,
    });
  }

  /**
   * If two columns score almost the same,
   * ask instead of guessing.
   */
  if (
    second &&
    best.score >= 0.75 &&
    second.score >= 0.75 &&
    Math.abs(
      best.score -
      second.score
    ) < 0.2
  ) {
    const candidates = [
      best.column,
      second.column,
    ];

    return uncertain(
      "AMBIGUOUS_COLUMN",
      `Do you mean ${readableColumn(
        candidates[0]
      )} or ${readableColumn(
        candidates[1]
      )}?`,
      {
        candidates,
      }
    );
  }

  return confident({
    column:
      resolvedColumn,
    score:
      best.score,
  });
}

/**
 * Check whether a filter value actually
 * appears in the resolved column.
 *
 * This catches things such as:
 *
 * NAME = "Roberto Peralez"
 *
 * when no matching value was resolved.
 *
 * We keep this conservative because the
 * calculation engine may already support
 * fuzzy value matching.
 */
function checkFilterConfidence({
  rows,
  filters,
}) {
  if (
    !Array.isArray(filters) ||
    !filters.length
  ) {
    return confident();
  }

  for (const filter of filters) {
    if (
      !filter?.column ||
      filter.value === undefined ||
      filter.value === null
    ) {
      continue;
    }

    const operator =
      String(
        filter.operator ||
        "equals"
      ).toLowerCase();

    /**
     * Only evaluate exact filters here.
     */
    if (
      operator !== "equals"
    ) {
      continue;
    }

    const requested =
      String(filter.value)
        .trim()
        .toLowerCase();

    if (!requested) {
      continue;
    }

    const values =
      new Set(
        (rows || [])
          .map((row) =>
            String(
              row?.[
                filter.column
              ] ?? ""
            )
              .trim()
              .toLowerCase()
          )
          .filter(Boolean)
      );

    if (
      values.has(requested)
    ) {
      continue;
    }

    /**
     * Don't reject here.
     *
     * Your existing value-matching logic may
     * still resolve spelling/name variations.
     */
    return confident({
      warning:
        "FILTER_VALUE_NOT_EXACT",
      filter,
    });
  }

  return confident();
}

/**
 * Main confidence check.
 */
function evaluatePlanConfidence({
  datasets,
  plan,
}) {
  if (
    !plan ||
    plan.route !== "dataset"
  ) {
    return confident();
  }

  const datasetName =
    plan.dataset;

  const rows =
    datasets?.[
      datasetName
    ];

  if (
    !Array.isArray(rows) ||
    !rows.length
  ) {
    return uncertain(
      "DATASET_UNAVAILABLE",
      "I couldn't determine which worksheet should be used for that question."
    );
  }

  const availableColumns =
    getColumns(rows);

  if (
    !availableColumns.length
  ) {
    return uncertain(
      "NO_COLUMNS",
      "I couldn't find usable fields for that question."
    );
  }

  // ========================================================
  // COLUMN CONFIDENCE
  // ========================================================

  if (plan.column) {
    const columnCheck =
      checkColumnConfidence({
        rows,

        requestedColumn:
          plan.column,

        resolvedColumn:
          plan.column,
      });

    if (
      !columnCheck.confident
    ) {
      return columnCheck;
    }
  }

  // ========================================================
  // SELECT COLUMN CONFIDENCE
  // ========================================================

  if (
    Array.isArray(
      plan.selectColumns
    )
  ) {
    for (
      const column of
      plan.selectColumns
    ) {
      const columnCheck =
        checkColumnConfidence({
          rows,

          requestedColumn:
            column,

          resolvedColumn:
            column,
        });

      /**
       * Cross-worksheet lookups may have
       * output columns outside the primary
       * dataset, so don't reject them here.
       */
      if (
        !columnCheck.confident &&
        plan.operation !==
          "lookup"
      ) {
        return columnCheck;
      }
    }
  }

  // ========================================================
  // GROUPING CONFIDENCE
  // ========================================================

  if (plan.groupBy) {
    const groupCheck =
      checkColumnConfidence({
        rows,

        requestedColumn:
          plan.groupBy,

        resolvedColumn:
          plan.groupBy,
      });

    if (
      !groupCheck.confident
    ) {
      return groupCheck;
    }
  }

  // ========================================================
  // FILTER CONFIDENCE
  // ========================================================

  const filterCheck =
    checkFilterConfidence({
      rows,
      filters:
        plan.filters,
    });

  if (
    !filterCheck.confident
  ) {
    return filterCheck;
  }

  return confident({
    dataset:
      datasetName,
  });
}

module.exports = {
  evaluatePlanConfidence,
  checkColumnConfidence,
  checkFilterConfidence,
};