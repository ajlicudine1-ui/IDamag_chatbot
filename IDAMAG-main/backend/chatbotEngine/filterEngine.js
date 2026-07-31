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
    case "not_equals": return leftText !== rightText;
    case "contains": return leftText.includes(rightText);
    case "starts_with": return leftText.startsWith(rightText);
    case "ends_with": return leftText.endsWith(rightText);
    case "greater_than": return leftNumber !== null && rightNumber !== null && leftNumber > rightNumber;
    case "greater_or_equal": return leftNumber !== null && rightNumber !== null && leftNumber >= rightNumber;
    case "less_than": return leftNumber !== null && rightNumber !== null && leftNumber < rightNumber;
    case "less_or_equal": return leftNumber !== null && rightNumber !== null && leftNumber <= rightNumber;
    case "equals":
    default: return leftText === rightText;
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

function removeControlNumbers(question) {
  let text = normalizeText(question);
  text = text.replace(/\b(top|bottom|first|last)\s+\d{1,3}\b/g, "$1");
  text = text.replace(
    /\b\d{1,3}\s+(?=[\p{L}][\p{L}\s._%()/+-]*\s+(?:with|having)\s+(?:the\s+)?(?:highest|lowest|largest|smallest|biggest|greatest|most|least)\b)/gu,
    ""
  );
  text = text.replace(
    /\b(?:show|list|give|display|return|get)\s+\d{1,3}\s+(?=[\p{L}])/g,
    (match) => match.replace(/\d{1,3}/, "")
  );
  return text.replace(/\s+/g, " ").trim();
}

function inferValueFilters(rows, question, excludedColumns = []) {
  const normalizedQuestion = removeControlNumbers(question);
  const excluded = new Set(excludedColumns.filter(Boolean));
  const matches = [];

  for (const column of getColumns(rows)) {
    if (excluded.has(column)) continue;

    const type = inferType(rows, column);
    const seen = new Set();

    for (const row of rows) {
      const raw = row?.[column];
      if (raw === null || raw === undefined || String(raw).trim() === "") continue;

      const display = String(raw).trim();
      const normalizedValue = normalizeText(display);
      if (!normalizedValue || seen.has(normalizedValue)) continue;
      seen.add(normalizedValue);

      if (type === "number") {
        const escaped = normalizedValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const boundaryPattern = new RegExp(`(^|\\D)${escaped}(\\D|$)`);

        if (boundaryPattern.test(normalizedQuestion)) {
          matches.push({
            column,
            operator: "equals",
            value: display,
            score: 1000 + normalizedValue.length,
          });
        }
      } else if (
        normalizedValue.length >= 2 &&
        normalizedQuestion.includes(normalizedValue)
      ) {
        matches.push({
          column,
          operator: "equals",
          value: display,
          score: normalizedValue.length,
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

function inferDatasetValueFilters(datasets, question, excluded = {}) {
  const matches = [];

  for (const [datasetName, rows] of Object.entries(datasets || {})) {
    if (!Array.isArray(rows) || !rows.length) continue;

    const excludedColumns = Array.isArray(excluded?.[datasetName])
      ? excluded[datasetName]
      : [];

    const filters = inferValueFilters(rows, question, excludedColumns);

    for (const filter of filters) {
      matches.push({
        dataset: datasetName,
        ...filter,
        valueLength: normalizeText(filter.value).length,
      });
    }
  }

  return matches.sort((a, b) => b.valueLength - a.valueLength);
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
      compare(row?.[filter.column], filter.value, filter.operator)
    )
  );
}

module.exports = {
  compare,
  removeControlNumbers,
  resolveFilters,
  inferValueFilters,
  inferDatasetValueFilters,
  mergeFilters,
  applyFilters,
};
