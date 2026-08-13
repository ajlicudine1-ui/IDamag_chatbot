const {
  getColumns,
  findBestMatch,
  similarity,
  normalizeText,
  normalizeMatchTokens,
} = require("./utils");

const {
  getAliasesForColumn,
  normalizeSemanticText,
} = require("./semanticDictionary");

const QUESTION_WORDS = new Set([
  "a",
  "an",
  "are",
  "available",
  "can",
  "could",
  "display",
  "do",
  "does",
  "for",
  "from",
  "give",
  "how",
  "i",
  "in",
  "is",
  "list",
  "me",
  "of",
  "on",
  "please",
  "show",
  "tell",
  "the",
  "there",
  "to",
  "value",
  "values",
  "what",
  "which",
  "who",
  "with",
  "you",
]);

function cleanTargetText(value) {
  return normalizeMatchTokens(value)
    .filter(
      (token) =>
        !QUESTION_WORDS.has(token)
    )
    .join(" ")
    .trim();
}

/**
 * Check whether the requested wording matches
 * one of the semantic aliases assigned to
 * this real dataset column.
 *
 * Example:
 *
 * requested:
 * "job title"
 *
 * column:
 * "POSITION TITLE"
 *
 * aliases:
 * ["position", "job title", "designation", ...]
 *
 * => semantic match
 */
function scoreSemanticAlias(
  target,
  column
) {
  const normalizedTarget =
    normalizeSemanticText(
      cleanTargetText(target)
    );

  if (!normalizedTarget) {
    return 0;
  }

  const aliases =
    getAliasesForColumn(
      column
    );

  if (!aliases.length) {
    return 0;
  }

  let bestScore = 0;

  for (const alias of aliases) {
    const normalizedAlias =
      normalizeSemanticText(alias);

    if (!normalizedAlias) {
      continue;
    }

    /**
     * Exact alias match.
     *
     * Make this stronger than normal
     * fuzzy matching.
     */
    if (
      normalizedTarget ===
      normalizedAlias
    ) {
      bestScore = Math.max(
        bestScore,
        3
      );

      continue;
    }

    /**
     * Phrase containment.
     *
     * Example:
     *
     * "what is his job title"
     *
     * contains:
     *
     * "job title"
     */
    if (
      normalizedTarget.includes(
        normalizedAlias
      )
    ) {
      bestScore = Math.max(
        bestScore,
        2.6
      );
    }

    /**
     * Similar wording fallback.
     */
    const aliasSimilarity =
      similarity(
        normalizedTarget,
        normalizedAlias
      );

    if (
      aliasSimilarity >= 0.8
    ) {
      bestScore = Math.max(
        bestScore,
        1.8 +
          aliasSimilarity
      );
    }
  }

  return bestScore;
}

function scoreColumnTarget(
  target,
  column
) {
  const cleanTarget =
    cleanTargetText(target);

  const cleanColumn =
    cleanTargetText(column);

  if (
    !cleanTarget ||
    !cleanColumn
  ) {
    return 0;
  }

  /**
   * Exact real-column match remains
   * extremely strong.
   */
  if (
    cleanTarget ===
    cleanColumn
  ) {
    return 4;
  }

  /**
   * NEW:
   * Check semantic aliases.
   */
  const semanticScore =
    scoreSemanticAlias(
      target,
      column
    );

  const targetTokens =
    new Set(
      cleanTarget
        .split(/\s+/)
        .filter(Boolean)
    );

  const columnTokens =
    new Set(
      cleanColumn
        .split(/\s+/)
        .filter(Boolean)
    );

  let exactMatches = 0;

  for (
    const token of
    columnTokens
  ) {
    if (
      targetTokens.has(token)
    ) {
      exactMatches += 1;
    }
  }

  const coverage =
    columnTokens.size > 0
      ? exactMatches /
        columnTokens.size
      : 0;

  const directSimilarity =
    similarity(
      cleanTarget,
      cleanColumn
    );

  let phraseBonus = 0;

  if (
    cleanTarget.includes(
      cleanColumn
    ) ||
    cleanColumn.includes(
      cleanTarget
    )
  ) {
    phraseBonus = 0.75;
  }

  const normalScore =
    directSimilarity +
    coverage +
    phraseBonus;

  /**
   * Whichever understands the request
   * better wins:
   *
   * normal fuzzy matching
   * OR
   * semantic alias matching
   */
  return Math.max(
    normalScore,
    semanticScore
  );
}

function findDatasetName(
  datasets,
  requestedName
) {
  const names =
    Object.keys(datasets);

  if (
    names.length === 1 &&
    !requestedName
  ) {
    return names[0];
  }

  return findBestMatch(
    requestedName,
    names,
    0.45
  );
}

function findColumn(
  rows,
  requestedColumn
) {
  const ranked =
    rankColumns(
      rows,
      requestedColumn
    );

  return (
    ranked[0] &&
    ranked[0].score >= 0.75
      ? ranked[0].column
      : null
  );
}

function rankColumns(
  rows,
  target
) {
  return getColumns(rows)
    .map((column) => ({
      column,
      score:
        scoreColumnTarget(
          target,
          column
        ),
    }))
    .sort(
      (a, b) =>
        b.score - a.score
    );
}

function findDatasetsContainingColumn(
  datasets,
  requestedColumn
) {
  const results = [];

  for (
    const [
      datasetName,
      rows,
    ] of Object.entries(
      datasets || {}
    )
  ) {
    if (
      !Array.isArray(rows) ||
      !rows.length
    ) {
      continue;
    }

    const ranked =
      rankColumns(
        rows,
        requestedColumn
      );

    const best =
      ranked[0];

    if (
      best &&
      best.score >= 0.75
    ) {
      results.push({
        dataset:
          datasetName,

        column:
          best.column,

        score:
          best.score,
      });
    }
  }

  return results.sort(
    (a, b) =>
      b.score - a.score
  );
}

function normalizedColumnMap(
  rows
) {
  const map =
    new Map();

  for (
    const column of
    getColumns(rows)
  ) {
    const key =
      normalizeText(
        column
      );

    if (
      key &&
      !map.has(key)
    ) {
      map.set(
        key,
        column
      );
    }
  }

  return map;
}

function findSharedColumns(
  leftRows,
  rightRows
) {
  const left =
    normalizedColumnMap(
      leftRows
    );

  const right =
    normalizedColumnMap(
      rightRows
    );

  const shared = [];

  for (
    const [
      key,
      leftColumn,
    ] of left.entries()
  ) {
    const rightColumn =
      right.get(key);

    if (!rightColumn) {
      continue;
    }

    shared.push({
      leftColumn,
      rightColumn,
      normalizedName:
        key,
    });
  }

  return shared;
}

module.exports = {
  cleanTargetText,
  scoreSemanticAlias,
  scoreColumnTarget,
  findDatasetName,
  findColumn,
  rankColumns,
  findDatasetsContainingColumn,
  findSharedColumns,
};