const {
  parseNumber,
  formatNumber,
  getColumns,
} = require("./utils");
const {
  findDatasetName,
  findColumn,
} = require("./columnMatcher");
const {
  resolveFilters,
  inferValueFilters,
  mergeFilters,
  applyFilters,
} = require("./filterEngine");

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

    const shown = unique.slice(0, limit);

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
        : getColumns(rows).slice(0, 10);

    const shown = filteredRows.slice(0, limit);

    return {
      success: true,
      source: "dataset",
      dataset: datasetName,
      operation,
      count: filteredRows.length,
      results: shown,
      filters,
      answer:
        `I found ${formatNumber(filteredRows.length)} matching ` +
        `record(s) in ${datasetName}${filterText}.\n` +
        shown
          .map(
            (row, index) =>
              `${index + 1}. ` +
              selectedColumns
                .map(
                  (selected) =>
                    `${selected}: ${row?.[selected] ?? ""}`
                )
                .join(", ")
          )
          .join("\n"),
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
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);

    return {
      success: true,
      source: "dataset",
      dataset: datasetName,
      operation,
      groupBy: groupColumn,
      results,
      filters,
      answer:
        `Record count by ${groupColumn} in ${datasetName}${filterText}:\n` +
        results
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
