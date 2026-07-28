const {
  normalizeText,
  parseNumber,
  getColumns,
} = require("./utils");
const { findColumn } = require("./columnMatcher");
const { inferType } = require("./schemaBuilder");

function compare(actual, expected, operator = "equals") {
  const leftText = normalizeText(actual);
  const rightText = normalizeText(expected);
  const leftNumber = parseNumber(actual);
  const rightNumber = parseNumber(expected);

  switch (operator) {
    case "not_equals":
      return leftText !== rightText;
    case "contains":
      return leftText.includes(rightText);
    case "starts_with":
      return leftText.startsWith(rightText);
    case "ends_with":
      return leftText.endsWith(rightText);
    case "greater_than":
      return leftNumber !== null &&
        rightNumber !== null &&
        leftNumber > rightNumber;
    case "greater_or_equal":
      return leftNumber !== null &&
        rightNumber !== null &&
        leftNumber >= rightNumber;
    case "less_than":
      return leftNumber !== null &&
        rightNumber !== null &&
        leftNumber < rightNumber;
    case "less_or_equal":
      return leftNumber !== null &&
        rightNumber !== null &&
        leftNumber <= rightNumber;
    case "equals":
    default:
      return leftText === rightText;
  }
}

function resolveFilters(rows, filters = []) {
  return (Array.isArray(filters) ? filters : [])
    .map((filter) => {
      const column = findColumn(rows, filter?.column);

      if (!column) return null;

      return {
        column,
        operator: filter.operator || "equals",
        value: filter.value,
      };
    })
    .filter(Boolean);
}

function inferValueFilters(
  rows,
  question,
  excludedColumns = []
) {
  const normalizedQuestion = normalizeText(question);
  const excluded = new Set(excludedColumns.filter(Boolean));
  const matches = [];

  for (const column of getColumns(rows)) {
    if (excluded.has(column)) continue;
    if (inferType(rows, column) === "number") continue;

    const unique = new Map();

    for (const row of rows) {
      const value = row?.[column];

      if (
        value === null ||
        value === undefined ||
        String(value).trim() === ""
      ) {
        continue;
      }

      const display = String(value).trim();
      unique.set(normalizeText(display), display);

      if (unique.size > 2000) break;
    }

    if (unique.size > 2000) continue;

    for (const [key, display] of unique.entries()) {
      if (
        key.length >= 2 &&
        normalizedQuestion.includes(key)
      ) {
        matches.push({
          column,
          operator: "equals",
          value: display,
          score: key.length,
        });
      }
    }
  }

  matches.sort((a, b) => b.score - a.score);

  const selected = [];
  const usedColumns = new Set();

  for (const match of matches) {
    if (!usedColumns.has(match.column)) {
      usedColumns.add(match.column);
      selected.push({
        column: match.column,
        operator: match.operator,
        value: match.value,
      });
    }
  }

  return selected;
}

function mergeFilters(...groups) {
  const result = [];
  const seen = new Set();

  for (const filters of groups) {
    for (const filter of filters || []) {
      const key = [
        normalizeText(filter.column),
        filter.operator,
        normalizeText(filter.value),
      ].join("|");

      if (!seen.has(key)) {
        seen.add(key);
        result.push(filter);
      }
    }
  }

  return result;
}

function applyFilters(rows, filters = []) {
  if (!filters.length) return rows;

  return rows.filter((row) =>
    filters.every((filter) =>
      compare(
        row?.[filter.column],
        filter.value,
        filter.operator
      )
    )
  );
}

module.exports = {
  compare,
  resolveFilters,
  inferValueFilters,
  mergeFilters,
  applyFilters,
};
