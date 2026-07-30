const {
  parseNumber,
  formatNumber,
  getColumns,
} = require("./utils");
const {
  findDatasetName,
  findColumn,
  findDatasetsContainingColumn,
  findSharedColumns,
} = require("./columnMatcher");
const {
  resolveFilters,
  inferValueFilters,
  inferDatasetValueFilters,
  mergeFilters,
  applyFilters,
} = require("./filterEngine");
const {
  formatLookupAnswer,
  formatAggregateAnswer,
  formatCountAnswer,
} = require("./responseFormatter");

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function getLimit(plan) {
  const value = Number(plan?.limit);

  if (!Number.isInteger(value)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(
    Math.max(value, 1),
    MAX_LIMIT
  );
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function requireColumn(rows, requested, label) {
  const column = findColumn(rows, requested);

  if (!column) {
    throw new Error(
      `${label} "${requested || ""}" was not found. ` +
      `Available columns: ${getColumns(rows).join(", ")}`
    );
  }

  return column;
}

function describeFilters(filters) {
  if (!filters.length) return "";

  return (
    " where " +
    filters
      .map(
        (filter) =>
          `${filter.column} ${filter.operator} "${filter.value}"`
      )
      .join(" and ")
  );
}


function transformLookupValue(value, transform) {
  const text = String(value ?? "").trim();

  if (!transform || !text) {
    return text;
  }

  const parts = text
    .split(/\s+/)
    .filter(Boolean);

  if (transform === "first_word") {
    return parts[0] || "";
  }

  if (transform === "last_word") {
    return parts[parts.length - 1] || "";
  }

  return text;
}


function nonEmptyValues(rows, column) {
  const values = new Set();

  for (const row of rows || []) {
    const value = String(row?.[column] ?? "").trim();
    if (value) values.add(value.toLowerCase());
  }

  return values;
}

function scoreJoinColumn(sourceRows, targetRows, shared) {
  const sourceValues = nonEmptyValues(sourceRows, shared.leftColumn);
  const targetValues = nonEmptyValues(targetRows, shared.rightColumn);

  if (!sourceValues.size || !targetValues.size) return 0;

  let overlap = 0;
  for (const value of sourceValues) {
    if (targetValues.has(value)) overlap += 1;
  }

  const overlapRatio =
    overlap / Math.max(1, Math.min(sourceValues.size, targetValues.size));

  const sourceUniqueRatio =
    sourceValues.size / Math.max(1, sourceRows.length);

  const targetUniqueRatio =
    targetValues.size / Math.max(1, targetRows.length);

  return overlapRatio * 4 + sourceUniqueRatio + targetUniqueRatio;
}

function chooseJoin(sourceRows, targetRows) {
  const shared = findSharedColumns(sourceRows, targetRows)
    .map((item) => ({
      ...item,
      score: scoreJoinColumn(sourceRows, targetRows, item),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return shared[0] || null;
}

function getRequestedOutputColumns(datasets, plan) {
  const requested = [];

  if (Array.isArray(plan.selectColumns)) {
    requested.push(...plan.selectColumns);
  }

  if (plan.column) requested.push(plan.column);

  const results = [];
  const seen = new Set();

  for (const item of requested.filter(Boolean)) {
    for (const match of findDatasetsContainingColumn(datasets, item)) {
      const key = `${match.dataset}|${match.column}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(match);
      }
    }
  }

  return results;
}

function getRequestedColumnNames(plan) {
  const requested = [];

  if (Array.isArray(plan.selectColumns)) {
    requested.push(...plan.selectColumns);
  }

  if (plan.column) requested.push(plan.column);

  const seen = new Set();
  return requested
    .map((item) => String(item || "").trim())
    .filter((item) => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildJoinIndex(rows, column) {
  const index = new Map();

  for (const row of rows || []) {
    const key = normalizeJoinValue(row?.[column]);
    if (!key) continue;

    if (!index.has(key)) {
      index.set(key, []);
    }

    index.get(key).push(row);
  }

  return index;
}

function findBestTargetForColumn({
  datasets,
  sourceDataset,
  requestedColumn,
}) {
  const sourceRows = datasets[sourceDataset];

  if (!Array.isArray(sourceRows) || !sourceRows.length) {
    return null;
  }

  return findDatasetsContainingColumn(datasets, requestedColumn)
    .filter((match) => match.dataset !== sourceDataset)
    .map((match) => {
      const targetRows = datasets[match.dataset];

      if (!Array.isArray(targetRows) || !targetRows.length) {
        return null;
      }

      const join = chooseJoin(sourceRows, targetRows);
      if (!join) return null;

      return {
        ...match,
        join,
        targetRows,
        score: join.score || 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)[0] || null;
}

/**
 * Generic cross-worksheet lookup that MERGES requested fields
 * from multiple worksheets into one result object.
 */
function tryCrossDatasetLookup({
  datasets,
  plan,
  question,
  preferredDataset = null,
  preferredRows = null,
  preferredFilters = [],
}) {
  const requestedColumns = getRequestedColumnNames(plan);

  if (!requestedColumns.length) return null;

  const sourceCandidates = [];

  if (
    preferredDataset &&
    Array.isArray(datasets[preferredDataset]) &&
    datasets[preferredDataset].length
  ) {
    const matches = Array.isArray(preferredRows)
      ? preferredRows
      : datasets[preferredDataset];

    if (matches.length) {
      sourceCandidates.push({
        dataset: preferredDataset,
        rows: datasets[preferredDataset],
        matches,
        filters: preferredFilters,
      });
    }
  }

  const valueMatches = inferDatasetValueFilters(datasets, question);

  for (const valueMatch of valueMatches) {
    const sourceRows = datasets[valueMatch.dataset];
    if (!Array.isArray(sourceRows) || !sourceRows.length) continue;

    const sourceFilter = {
      column: valueMatch.column,
      operator: valueMatch.operator || "equals",
      value: valueMatch.value,
    };

    const sourceMatches = applyFilters(sourceRows, [sourceFilter]);
    if (!sourceMatches.length) continue;

    if (!sourceCandidates.some((item) => item.dataset === valueMatch.dataset)) {
      sourceCandidates.push({
        dataset: valueMatch.dataset,
        rows: sourceRows,
        matches: sourceMatches,
        filters: [sourceFilter],
      });
    }
  }

  for (const source of sourceCandidates) {
    const resolvers = [];
    let hasCrossDatasetColumn = false;
    let failed = false;

    for (const requested of requestedColumns) {
      const localColumn = findColumn(source.rows, requested);

      if (localColumn) {
        resolvers.push({
          dataset: source.dataset,
          column: localColumn,
          local: true,
        });
        continue;
      }

      const target = findBestTargetForColumn({
        datasets,
        sourceDataset: source.dataset,
        requestedColumn: requested,
      });

      if (!target) {
        failed = true;
        break;
      }

      hasCrossDatasetColumn = true;

      resolvers.push({
        dataset: target.dataset,
        column: target.column,
        local: false,
        join: target.join,
        index: buildJoinIndex(
          target.targetRows,
          target.join.rightColumn
        ),
      });
    }

    if (failed || !hasCrossDatasetColumn) continue;

    const limit = getLimit(plan);
    const sourceRowsToShow = plan.showAll
      ? source.matches
      : source.matches.slice(0, limit);

    const results = [];

    for (const sourceRow of sourceRowsToShow) {
      const projected = {};
      let complete = true;

      for (const resolver of resolvers) {
        if (resolver.local) {
          projected[resolver.column] = transformLookupValue(
            sourceRow?.[resolver.column],
            plan.transform
          );
          continue;
        }

        const joinKey = normalizeJoinValue(
          sourceRow?.[resolver.join.leftColumn]
        );

        const relatedRows = joinKey
          ? resolver.index.get(joinKey) || []
          : [];

        if (!relatedRows.length) {
          complete = false;
          break;
        }

        projected[resolver.column] = transformLookupValue(
          relatedRows[0]?.[resolver.column],
          plan.transform
        );
      }

      if (complete) {
        results.push(projected);
      }
    }

    if (!results.length) continue;

    const selectedColumns = resolvers.map((item) => item.column);

    return {
      success: true,
      source: "dataset",
      dataset: source.dataset,
      operation: "lookup",
      crossDataset: true,
      joins: resolvers
        .filter((item) => !item.local)
        .map((item) => ({
          sourceDataset: source.dataset,
          targetDataset: item.dataset,
          sourceColumn: item.join.leftColumn,
          targetColumn: item.join.rightColumn,
          outputColumn: item.column,
        })),
      filters: source.filters,
      count: results.length,
      results,
      answer: formatLookupAnswer({
        results,
        selectedColumns,
        count: results.length,
      }),
    };
  }

  return null;
}

function normalizeJoinValue(value) {
  return String(value ?? "").trim().toLowerCase();
}


function executePlan({
  datasets,
  plan,
  question,
}) {
  let datasetName = findDatasetName(
    datasets,
    plan.dataset
  );

  if (
    !datasetName &&
    Object.keys(datasets).length === 1
  ) {
    datasetName = Object.keys(datasets)[0];
  }

  if (!datasetName) {
    throw new Error(
      `The worksheet could not be determined. Available worksheets: ` +
      Object.keys(datasets).join(", ")
    );
  }

  const rows = datasets[datasetName];
  const column = plan.column
    ? findColumn(rows, plan.column)
    : null;
  const groupBy = plan.groupBy
    ? findColumn(rows, plan.groupBy)
    : null;

  const explicitFilters = resolveFilters(
    rows,
    plan.filters
  );

  const implicitFilters = inferValueFilters(
    rows,
    question,
    [column, groupBy]
  );

  const filters = mergeFilters(
    explicitFilters,
    implicitFilters
  );

  const filteredRows = applyFilters(rows, filters);
  const filterText = describeFilters(filters);
  const operation = String(plan.operation || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const limit = getLimit(plan);

  /*
   * Trigger cross-worksheet lookup whenever even ONE requested
   * output field is missing from the selected worksheet.
   */
  if (operation === "lookup") {
    const requestedColumns = getRequestedColumnNames(plan);

    const selectedColumnsHere = requestedColumns
      .map((item) => findColumn(rows, item))
      .filter(Boolean);

    const hasUsefulLocalFilter =
      explicitFilters.length > 0 ||
      implicitFilters.length > 0;

    const allRequestedColumnsAreLocal =
      requestedColumns.length === 0 ||
      selectedColumnsHere.length === requestedColumns.length;

    const needsCrossDataset =
      !allRequestedColumnsAreLocal ||
      !hasUsefulLocalFilter ||
      filteredRows.length === 0;

    if (needsCrossDataset) {
      const crossResult = tryCrossDatasetLookup({
        datasets,
        plan,
        question,
        preferredDataset: datasetName,
        preferredRows: filteredRows,
        preferredFilters: filters,
      });

      if (crossResult) return crossResult;
    }
  }

  if (operation === "row_count") {
    return {
      success: true,
      source: "dataset",
      dataset: datasetName,
      operation,
      value: filteredRows.length,
      filters,
      answer:
        `There are ${formatNumber(filteredRows.length)} record(s) ` +
        `in ${datasetName}${filterText}.`,
    };
  }

  if (
    [
      "list",
      "distinct_count",
      "non_empty_count",
    ].includes(operation)
  ) {
    const selectedColumn = requireColumn(
      rows,
      plan.column,
      "Column"
    );

    const values = filteredRows
      .map((row) => row?.[selectedColumn])
      .filter(
        (value) =>
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ""
      );

    if (operation === "non_empty_count") {
      return {
        success: true,
        source: "dataset",
        dataset: datasetName,
        operation,
        column: selectedColumn,
        value: values.length,
        filters,
        answer:
          `There are ${formatNumber(values.length)} populated ` +
          `${selectedColumn} value(s) in ${datasetName}${filterText}.`,
      };
    }

    const unique = [];
    const seen = new Set();

    for (const value of values) {
      const display = String(value).trim();
      const key = display.toLowerCase();

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(display);
      }
    }

    unique.sort((a, b) => a.localeCompare(b));

    if (operation === "distinct_count") {
      return {
        success: true,
        source: "dataset",
        dataset: datasetName,
        operation,
        column: selectedColumn,
        value: unique.length,
        filters,
        answer:
          `There are ${formatNumber(unique.length)} unique ` +
          `${selectedColumn} value(s) in ${datasetName}${filterText}.`,
      };
    }

    const shown = plan.showAll
      ? unique
      : unique.slice(0, limit);

    return {
      success: true,
      source: "dataset",
      dataset: datasetName,
      operation,
      column: selectedColumn,
      count: unique.length,
      results: shown,
      filters,
      answer:
        `${selectedColumn} values in ${datasetName}${filterText}:\n` +
        shown
          .map(
            (value, index) =>
              `${index + 1}. ${value}`
          )
          .join("\n"),
    };
  }

  if (operation === "lookup") {
    const selectedColumns =
      Array.isArray(plan.selectColumns) &&
      plan.selectColumns.length
        ? plan.selectColumns
            .map((item) => findColumn(rows, item))
            .filter(Boolean)
        : plan.outputRequested
          ? []
          : getColumns(rows).slice(0, 10);

    if (
      plan.outputRequested &&
      selectedColumns.length === 0
    ) {
      throw new Error(
        "I found the matching record, but could not determine which field you want returned."
      );
    }

    const shown = plan.showAll
      ? filteredRows
      : filteredRows.slice(0, limit);

    const projectedResults = shown.map((row) => {
      const projected = {};

      for (const selected of selectedColumns) {
        projected[selected] = transformLookupValue(
          row?.[selected],
          plan.transform
        );
      }

      return projected;
    });

    return {
      success: true,
      source: "dataset",
      dataset: datasetName,
      operation,
      count: filteredRows.length,
      results: projectedResults,
      filters,
      answer: formatLookupAnswer({
        results: projectedResults,
        selectedColumns,
        count: filteredRows.length,
      }),
    };
  }

  if (operation === "group_count") {
    const groupColumn = requireColumn(
      rows,
      plan.groupBy,
      "Group column"
    );

    const groups = new Map();

    for (const row of filteredRows) {
      const label = String(
        row?.[groupColumn] ?? ""
      ).trim();

      if (!label) continue;

      groups.set(label, (groups.get(label) || 0) + 1);
    }

    const results = [...groups.entries()]
      .map(([label, value]) => ({
        label,
        value,
      }))
      .sort((a, b) => b.value - a.value);

    const displayedResults = plan.showAll
      ? results
      : results.slice(0, limit);

    return {
      success: true,
      source: "dataset",
      dataset: datasetName,
      operation,
      groupBy: groupColumn,
      results: displayedResults,
      filters,
      answer:
        `Record count by ${groupColumn} in ${datasetName}${filterText}:\n` +
        displayedResults
          .map(
            (item, index) =>
              `${index + 1}. ${item.label}: ${formatNumber(item.value)}`
          )
          .join("\n"),
    };
  }

  if (
    operation === "rank_rows" ||
    operation === "rank_groups"
  ) {
    const metricColumn = requireColumn(
      rows,
      plan.column,
      "Ranking metric column"
    );

    const labelColumn = requireColumn(
      rows,
      plan.labelColumn || plan.groupBy,
      "Ranking label column"
    );

    const direction =
      plan.direction === "asc"
        ? "asc"
        : "desc";

    if (operation === "rank_rows") {
      const ranked = filteredRows
        .map((row) => ({
          label: String(row?.[labelColumn] ?? "").trim(),
          value: parseNumber(row?.[metricColumn]),
          row,
        }))
        .filter(
          (item) =>
            item.label &&
            item.value !== null
        )
        .sort((a, b) =>
          direction === "asc"
            ? a.value - b.value
            : b.value - a.value
        )
        .slice(0, limit);

      if (!ranked.length) {
        throw new Error(
          `No usable values were found for "${labelColumn}" ranked by "${metricColumn}"${filterText}.`
        );
      }

      return {
        success: true,
        source: "dataset",
        dataset: datasetName,
        operation,
        column: metricColumn,
        labelColumn,
        direction,
        results: ranked,
        filters,
        answer:
          `${direction === "desc" ? "Top" : "Bottom"} ${ranked.length} ` +
          `${labelColumn} by ${metricColumn} in ${datasetName}${filterText}:\n` +
          ranked
            .map(
              (item, index) =>
                `${index + 1}. ${item.label}: ${formatNumber(item.value)}`
            )
            .join("\n"),
      };
    }

    const aggregation =
      ["sum", "average", "count"].includes(plan.aggregation)
        ? plan.aggregation
        : "sum";

    const groups = new Map();

    for (const row of filteredRows) {
      const label = String(
        row?.[labelColumn] ?? ""
      ).trim();

      if (!label) continue;

      const numericValue =
        aggregation === "count"
          ? 1
          : parseNumber(row?.[metricColumn]);

      if (
        aggregation !== "count" &&
        numericValue === null
      ) {
        continue;
      }

      if (!groups.has(label)) {
        groups.set(label, {
          sum: 0,
          count: 0,
        });
      }

      const group = groups.get(label);

      if (aggregation === "count") {
        group.sum += 1;
        group.count += 1;
      } else {
        group.sum += numericValue;
        group.count += 1;
      }
    }

    const ranked = [...groups.entries()]
      .map(([label, group]) => ({
        label,
        value:
          aggregation === "average"
            ? group.sum / group.count
            : group.sum,
        recordsUsed: group.count,
      }))
      .sort((a, b) =>
        direction === "asc"
          ? a.value - b.value
          : b.value - a.value
      )
      .slice(0, limit);

    if (!ranked.length) {
      throw new Error(
        `No grouped ranking values were found for "${labelColumn}" by "${metricColumn}"${filterText}.`
      );
    }

    return {
      success: true,
      source: "dataset",
      dataset: datasetName,
      operation,
      column: metricColumn,
      labelColumn,
      aggregation,
      direction,
      results: ranked,
      filters,
      answer:
        `${direction === "desc" ? "Top" : "Bottom"} ${ranked.length} ` +
        `${labelColumn} by ${aggregation} ${metricColumn} in ${datasetName}${filterText}:\n` +
        ranked
          .map(
            (item, index) =>
              `${index + 1}. ${item.label}: ${formatNumber(item.value)}`
          )
          .join("\n"),
    };
  }

  const numericColumn = requireColumn(
    rows,
    plan.column,
    "Numeric column"
  );

  const numericRows = filteredRows
    .map((row) => ({
      row,
      value: parseNumber(row?.[numericColumn]),
    }))
    .filter((item) => item.value !== null);

  if (!numericRows.length) {
    throw new Error(
      `No numeric values were found in "${numericColumn}"${filterText}.`
    );
  }

  if (
    ["sum", "average", "median"].includes(operation)
  ) {
    const values = numericRows.map((item) => item.value);
    const total = values.reduce(
      (sum, value) => sum + value,
      0
    );

    const value =
      operation === "average"
        ? total / values.length
        : operation === "median"
          ? median(values)
          : total;

    return {
      success: true,
      source: "dataset",
      dataset: datasetName,
      operation,
      column: numericColumn,
      value,
      recordsUsed: values.length,
      filters,
      answer:
        `The ${operation} ${numericColumn} in ${datasetName}${filterText} ` +
        `is ${formatNumber(value)}, based on ` +
        `${formatNumber(values.length)} record(s).`,
    };
  }

  if (
    ["minimum", "maximum"].includes(operation)
  ) {
    numericRows.sort((a, b) =>
      operation === "maximum"
        ? b.value - a.value
        : a.value - b.value
    );

    const labelColumn = groupBy;
    const results = numericRows
      .slice(0, limit)
      .map((item) => ({
        label: labelColumn
          ? item.row?.[labelColumn]
          : null,
        value: item.value,
        row: item.row,
      }));

    return {
      success: true,
      source: "dataset",
      dataset: datasetName,
      operation,
      column: numericColumn,
      value: results[0]?.value,
      results,
      filters,
      answer:
        `${operation === "maximum" ? "Highest" : "Lowest"} ` +
        `${numericColumn} in ${datasetName}${filterText}:\n` +
        results
          .map(
            (item, index) =>
              `${index + 1}. ` +
              (
                item.label !== null &&
                item.label !== undefined &&
                String(item.label).trim()
                  ? `${item.label}: `
                  : ""
              ) +
              formatNumber(item.value)
          )
          .join("\n"),
    };
  }

  if (
    [
      "group_sum",
      "group_average",
      "group_minimum",
      "group_maximum",
    ].includes(operation)
  ) {
    const groupColumn = requireColumn(
      rows,
      plan.groupBy,
      "Group column"
    );

    const groups = new Map();

    for (const item of numericRows) {
      const label = String(
        item.row?.[groupColumn] ?? ""
      ).trim();

      if (!label) continue;

      if (!groups.has(label)) {
        groups.set(label, {
          sum: 0,
          count: 0,
          minimum: item.value,
          maximum: item.value,
        });
      }

      const group = groups.get(label);
      group.sum += item.value;
      group.count += 1;
      group.minimum = Math.min(group.minimum, item.value);
      group.maximum = Math.max(group.maximum, item.value);
    }

    const results = [...groups.entries()]
      .map(([label, group]) => {
        let value;

        if (operation === "group_average") {
          value = group.sum / group.count;
        } else if (operation === "group_minimum") {
          value = group.minimum;
        } else if (operation === "group_maximum") {
          value = group.maximum;
        } else {
          value = group.sum;
        }

        return {
          label,
          value,
          recordsUsed: group.count,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);

    return {
      success: true,
      source: "dataset",
      dataset: datasetName,
      operation,
      column: numericColumn,
      groupBy: groupColumn,
      results,
      filters,
      answer:
        `${operation.replace("group_", "")} ${numericColumn} by ` +
        `${groupColumn} in ${datasetName}${filterText}:\n` +
        results
          .map(
            (item, index) =>
              `${index + 1}. ${item.label}: ${formatNumber(item.value)}`
          )
          .join("\n"),
    };
  }

  throw new Error(
    `Unsupported dataset operation: ${operation}`
  );
}

module.exports = {
  executePlan,
};
