from pathlib import Path

src = r'''/**
 * Improved chatbot calculation service.
 *
 * Answers natural-language questions using rows already loaded
 * from a public Google Sheet.
 *
 * Features:
 * - Flexible column matching
 * - Common spelling/wording variations
 * - Totals, averages, min/max, counts, unique values
 * - Top/bottom rankings
 * - Grouped counts, sums, and averages
 * - Lists of values such as provinces or municipalities
 * - Friendly responses to greetings, thanks, and concerns
 *
 * This file intentionally calculates values directly from the
 * dataset so numeric answers are not invented by an AI model.
 */

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "could",
  "do",
  "does",
  "for",
  "from",
  "give",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "please",
  "show",
  "tell",
  "that",
  "the",
  "there",
  "to",
  "what",
  "which",
  "who",
  "with",
  "would",
  "you",
]);

const WORD_ALIASES = {
  amt: "amount",
  ave: "average",
  avg: "average",
  barangays: "barangay",
  brgy: "barangay",
  count: "number",
  female: "women",
  females: "women",
  highest: "maximum",
  largest: "maximum",
  lowest: "minimum",
  male: "men",
  males: "men",
  max: "maximum",
  min: "minimum",
  municipalities: "municipality",
  nos: "number",
  num: "number",
  province: "province",
  provinces: "province",
  qty: "quantity",
  sum: "total",
  summed: "total",
  totaling: "total",
  totals: "total",
};

const COLUMN_SYNONYMS = {
  area: ["hectare", "hectares", "ha", "land area"],
  barangay: ["brgy", "village"],
  commodity: ["crop", "product", "produce"],
  female: ["women", "woman", "girls"],
  farmer: ["farmers", "beneficiary", "beneficiaries", "respondent"],
  male: ["men", "man", "boys"],
  member: ["members", "membership"],
  municipality: ["municipal", "town", "city"],
  production: ["produce", "output", "harvest"],
  province: ["provincial"],
  quantity: ["qty", "volume"],
  yield: ["expected yield", "harvest"],
};

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s()./%_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularizeWord(word) {
  if (word.endsWith("ies") && word.length > 4) {
    return `${word.slice(0, -3)}y`;
  }

  if (word.endsWith("ses") && word.length > 4) {
    return word.slice(0, -2);
  }

  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) {
    return word.slice(0, -1);
  }

  return word;
}

function normalizeWord(word) {
  const cleaned = singularizeWord(normalizeText(word));
  return WORD_ALIASES[cleaned] || cleaned;
}

function tokenize(value, removeStopWords = true) {
  const words = normalizeText(value)
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);

  return removeStopWords
    ? words.filter((word) => !STOP_WORDS.has(word))
    : words;
}

function normalizeColumnName(value) {
  return tokenize(value)
    .filter(
      (word) =>
        !["expected", "total", "overall", "number", "no"].includes(word)
    )
    .join(" ")
    .trim();
}

function parseNumber(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return null;
  }

  let text = String(value).trim();
  const isParenthesizedNegative =
    text.startsWith("(") && text.endsWith(")");

  text = text
    .replace(/,/g, "")
    .replace(/%/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();

  if (text === "" || text === "-" || text === ".") {
    return null;
  }

  const number = Number(text);

  if (!Number.isFinite(number)) {
    return null;
  }

  return isParenthesizedNegative ? -Math.abs(number) : number;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function getAllColumns(rows) {
  const columns = new Set();

  for (const row of rows) {
    Object.keys(row || {}).forEach((column) => {
      if (String(column).trim()) {
        columns.add(column);
      }
    });
  }

  return Array.from(columns);
}

function editDistance(left, right) {
  const a = String(left);
  const b = String(right);

  const matrix = Array.from(
    { length: a.length + 1 },
    () => Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function wordSimilarity(left, right) {
  if (left === right) return 1;
  if (!left || !right) return 0;

  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) /
      Math.max(left.length, right.length);
  }

  const distance = editDistance(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function expandColumnTokens(column) {
  const tokens = new Set(tokenize(column));

  for (const token of Array.from(tokens)) {
    const synonyms = COLUMN_SYNONYMS[token] || [];
    synonyms.forEach((synonym) => {
      tokenize(synonym).forEach((word) => tokens.add(word));
    });
  }

  return Array.from(tokens);
}

function scoreColumn(question, column) {
  const questionTokens = tokenize(question);
  const columnTokens = expandColumnTokens(column);

  if (columnTokens.length === 0 || questionTokens.length === 0) {
    return 0;
  }

  const normalizedQuestion = normalizeColumnName(question);
  const normalizedColumn = normalizeColumnName(column);

  if (
    normalizedQuestion.includes(normalizedColumn) &&
    normalizedColumn.length >= 2
  ) {
    return 1;
  }

  let totalScore = 0;

  for (const columnToken of columnTokens) {
    let bestTokenScore = 0;

    for (const questionToken of questionTokens) {
      bestTokenScore = Math.max(
        bestTokenScore,
        wordSimilarity(columnToken, questionToken)
      );
    }

    if (bestTokenScore >= 0.72) {
      totalScore += bestTokenScore;
    }
  }

  const coverage = totalScore / columnTokens.length;
  const precision =
    totalScore / Math.max(questionTokens.length, columnTokens.length);

  return coverage * 0.75 + precision * 0.25;
}

function rankColumns(question, columns) {
  return columns
    .map((column) => ({
      column,
      score: scoreColumn(question, column),
    }))
    .sort((a, b) => b.score - a.score);
}

function findColumn(question, columns, options = {}) {
  const { numericOnly = false, rows = [] } = options;

  const ranked = rankColumns(question, columns).filter(({ column }) => {
    if (!numericOnly) return true;

    return rows.some(
      (row) => parseNumber(row[column]) !== null
    );
  });

  if (!ranked.length || ranked[0].score < 0.38) {
    return null;
  }

  return ranked[0].column;
}

function getNumericColumns(rows, columns) {
  return columns.filter((column) => {
    const nonBlank = rows.filter(
      (row) =>
        row[column] !== null &&
        row[column] !== undefined &&
        String(row[column]).trim() !== ""
    );

    if (!nonBlank.length) return false;

    const numericCount = nonBlank.filter(
      (row) => parseNumber(row[column]) !== null
    ).length;

    return numericCount / nonBlank.length >= 0.6;
  });
}

function findNumericColumn(rows, question, columns) {
  return findColumn(question, columns, {
    numericOnly: true,
    rows,
  });
}

function findFilter(rows, question, excludedColumns = []) {
  const normalizedQuestion = normalizeText(question);
  const excluded = new Set(
    Array.isArray(excludedColumns)
      ? excludedColumns
      : [excludedColumns]
  );
  const columns = getAllColumns(rows);
  const candidates = [];

  for (const column of columns) {
    if (excluded.has(column)) continue;

    const values = Array.from(
      new Set(
        rows
          .map((row) => row[column])
          .filter(
            (value) =>
              value !== null &&
              value !== undefined &&
              String(value).trim() !== ""
          )
          .map((value) => String(value).trim())
      )
    );

    if (values.length > 500) continue;

    for (const value of values) {
      const normalizedValue = normalizeText(value);

      if (
        normalizedValue.length >= 2 &&
        normalizedQuestion.includes(normalizedValue)
      ) {
        candidates.push({
          column,
          value,
          score: normalizedValue.length,
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function applyFilter(rows, filter) {
  if (!filter) return rows;

  return rows.filter(
    (row) =>
      normalizeText(row[filter.column]) ===
      normalizeText(filter.value)
  );
}

function countByColumn(rows, column) {
  const counts = new Map();

  for (const row of rows) {
    const value = String(row[column] ?? "").trim();
    if (!value) continue;

    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return Array.from(counts.entries()).sort(
    (a, b) => b[1] - a[1]
  );
}

function aggregateByColumn(
  rows,
  groupColumn,
  numericColumn,
  operation = "sum"
) {
  const groups = new Map();

  for (const row of rows) {
    const groupValue = String(row[groupColumn] ?? "").trim();
    const numericValue = parseNumber(row[numericColumn]);

    if (!groupValue || numericValue === null) continue;

    if (!groups.has(groupValue)) {
      groups.set(groupValue, {
        sum: 0,
        count: 0,
        min: numericValue,
        max: numericValue,
      });
    }

    const group = groups.get(groupValue);
    group.sum += numericValue;
    group.count += 1;
    group.min = Math.min(group.min, numericValue);
    group.max = Math.max(group.max, numericValue);
  }

  return Array.from(groups.entries())
    .map(([label, group]) => {
      let value;

      switch (operation) {
        case "average":
          value = group.sum / group.count;
          break;
        case "minimum":
          value = group.min;
          break;
        case "maximum":
          value = group.max;
          break;
        default:
          value = group.sum;
      }

      return {
        label,
        value,
        recordsUsed: group.count,
      };
    })
    .sort((a, b) => b.value - a.value);
}

function extractRequestedLimit(question, fallback = 10) {
  const normalized = normalizeText(question);

  const match =
    normalized.match(/\b(?:top|bottom|first|last)\s+(\d{1,3})\b/) ||
    normalized.match(/\b(\d{1,3})\s+(?:highest|lowest|largest|smallest)\b/);

  if (!match) return fallback;

  const value = Number(match[1]);
  return Number.isInteger(value)
    ? Math.min(Math.max(value, 1), 100)
    : fallback;
}

function detectOperation(question) {
  const normalized = normalizeText(question);

  if (
    /\b(hello|hi|hey|good morning|good afternoon|good evening)\b/.test(
      normalized
    )
  ) {
    return "greeting";
  }

  if (/\b(thank you|thanks|salamat)\b/.test(normalized)) {
    return "thanks";
  }

  if (
    /\b(wrong|incorrect|not correct|mistake|concern|problem|issue)\b/.test(
      normalized
    )
  ) {
    return "concern";
  }

  if (
    /\b(help|what can i ask|what can you answer|available column)\b/.test(
      normalized
    )
  ) {
    return "help";
  }

  if (
    /\b(top|highest|maximum|max|largest|greatest|most)\b/.test(
      normalized
    )
  ) {
    return "maximum";
  }

  if (
    /\b(bottom|lowest|minimum|min|smallest|least)\b/.test(
      normalized
    )
  ) {
    return "minimum";
  }

  if (/\b(average|avg|mean)\b/.test(normalized)) {
    return "average";
  }

  if (
    /\b(sum|total|combined|overall|altogether|in all)\b/.test(
      normalized
    )
  ) {
    return "sum";
  }

  if (/\b(unique|distinct|different)\b/.test(normalized)) {
    return "unique";
  }

  if (
    /\b(list|enumerate|name all|what are the|which are the|show all)\b/.test(
      normalized
    )
  ) {
    return "list";
  }

  if (
    /\b(breakdown|distribution|grouped|group|per|by each|for each)\b/.test(
      normalized
    )
  ) {
    return "group";
  }

  if (
    /\b(how many|number of|count|records|entries)\b/.test(
      normalized
    )
  ) {
    return "count";
  }

  return "unknown";
}

function findGroupingColumn(question, columns, metricColumn = null) {
  const normalized = normalizeText(question);
  const byMatch = normalized.match(
    /\b(?:by|per|for each|grouped by)\s+(.+)$/
  );

  if (byMatch) {
    const match = findColumn(byMatch[1], columns);
    if (match && match !== metricColumn) return match;
  }

  const ranked = rankColumns(question, columns)
    .filter(({ column }) => column !== metricColumn)
    .filter(({ column }) => {
      const normalizedColumn = normalizeColumnName(column);
      return !/\b(total|number|amount|area|yield|production|quantity)\b/.test(
        normalizedColumn
      );
    });

  return ranked.length && ranked[0].score >= 0.38
    ? ranked[0].column
    : null;
}

function createHelpMessage(columns) {
  const preview = columns.slice(0, 20).join(", ");

  return (
    "I can calculate and summarize the Google Sheet data. " +
    `Available columns include: ${preview}` +
    (columns.length > 20 ? ", and more." : ".") +
    '\n\nExamples:\n' +
    '• "What is the total Area (ha)?"\n' +
    '• "How many farmers are in Ilocos Norte?"\n' +
    '• "Which municipality has the highest production?"\n' +
    '• "Show the top 10 municipalities by expected yield."\n' +
    '• "What is the average number of members by province?"\n' +
    '• "List all provinces."\n' +
    '• "Give me the count by commodity."'
  );
}

function buildFilterText(filter) {
  return filter
    ? ` where ${filter.column} is "${filter.value}"`
    : "";
}

function listDistinctValues(rows, column, limit = 50) {
  return Array.from(
    new Set(
      rows
        .map((row) => String(row[column] ?? "").trim())
        .filter(Boolean)
    )
  )
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit);
}

function answerQuestion(rows, question) {
  if (!question || !String(question).trim()) {
    return {
      success: false,
      answer: "Please enter a question.",
    };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      success: false,
      answer: "The selected Google Sheet has no available data.",
    };
  }

  const normalizedQuestion = normalizeText(question);
  const columns = getAllColumns(rows);
  const operation = detectOperation(question);
  const numericColumns = getNumericColumns(rows, columns);

  if (operation === "greeting") {
    return {
      success: true,
      operation,
      answer:
        "Hello! You can ask me natural questions about the Google Sheet, including totals, averages, counts, rankings, provinces, municipalities, commodities, and other available fields.",
    };
  }

  if (operation === "thanks") {
    return {
      success: true,
      operation,
      answer: "You're welcome! Ask another question about the data anytime.",
    };
  }

  if (operation === "concern") {
    return {
      success: true,
      operation,
      answer:
        "I understand your concern. My numeric answers are calculated directly from the selected Google Sheet. Please mention the exact field and any filter you expect, such as “total members in Ilocos Norte,” so I can recalculate it precisely.",
    };
  }

  if (operation === "help") {
    return {
      success: true,
      operation,
      answer: createHelpMessage(columns),
    };
  }

  let selectedColumn = findColumn(question, columns);
  let numericColumn = findNumericColumn(rows, question, numericColumns);

  if (
    selectedColumn &&
    numericColumns.includes(selectedColumn)
  ) {
    numericColumn = selectedColumn;
  }

  const groupingColumn = findGroupingColumn(
    question,
    columns,
    numericColumn
  );

  const filter = findFilter(rows, question, [
    selectedColumn,
    numericColumn,
    groupingColumn,
  ].filter(Boolean));

  const filteredRows = applyFilter(rows, filter);
  const filterText = buildFilterText(filter);

  if (operation === "list") {
    const listColumn =
      selectedColumn ||
      findGroupingColumn(question, columns);

    if (!listColumn) {
      return {
        success: false,
        operation,
        answer:
          "Please mention what you want to list, such as provinces, municipalities, commodities, or farmers.",
      };
    }

    const values = listDistinctValues(
      filteredRows,
      listColumn,
      extractRequestedLimit(question, 50)
    );

    if (!values.length) {
      return {
        success: false,
        operation,
        answer: `No values were found in "${listColumn}"${filterText}.`,
      };
    }

    return {
      success: true,
      operation: "list_values",
      column: listColumn,
      count: values.length,
      results: values,
      answer:
        `${listColumn} values${filterText}:\n` +
        values
          .map((value, index) => `${index + 1}. ${value}`)
          .join("\n"),
    };
  }

  const asksForGrouping =
    operation === "group" ||
    /\b(by|per|for each|grouped by)\b/.test(
      normalizedQuestion
    );

  if (
    asksForGrouping &&
    groupingColumn &&
    numericColumn &&
    ["sum", "average", "maximum", "minimum"].includes(operation)
  ) {
    const aggregateOperation =
      operation === "maximum"
        ? "maximum"
        : operation === "minimum"
          ? "minimum"
          : operation;

    const results = aggregateByColumn(
      filteredRows,
      groupingColumn,
      numericColumn,
      aggregateOperation
    );

    if (!results.length) {
      return {
        success: false,
        operation,
        answer:
          `No usable "${numericColumn}" values were found by ` +
          `"${groupingColumn}"${filterText}.`,
      };
    }

    const limit = extractRequestedLimit(question, 10);
    const shouldReverse = operation === "minimum";
    const displayed = shouldReverse
      ? results.slice().sort((a, b) => a.value - b.value).slice(0, limit)
      : results.slice(0, limit);

    const formatted = displayed
      .map(
        (item, index) =>
          `${index + 1}. ${item.label}: ${formatNumber(item.value)}`
      )
      .join("\n");

    return {
      success: true,
      operation: `${aggregateOperation}_by_group`,
      column: numericColumn,
      groupColumn: groupingColumn,
      results: displayed,
      answer:
        `${aggregateOperation} ${numericColumn} by ` +
        `${groupingColumn}${filterText}:\n${formatted}`,
    };
  }

  if (
    ["maximum", "minimum"].includes(operation) &&
    numericColumn
  ) {
    const validRows = filteredRows
      .map((row) => ({
        row,
        value: parseNumber(row[numericColumn]),
      }))
      .filter((item) => item.value !== null)
      .sort((a, b) =>
        operation === "maximum"
          ? b.value - a.value
          : a.value - b.value
      );

    if (!validRows.length) {
      return {
        success: false,
        operation,
        answer: `No numeric values were found in "${numericColumn}"${filterText}.`,
      };
    }

    const limit = /\b(top|bottom)\b/.test(normalizedQuestion)
      ? extractRequestedLimit(question, 10)
      : 1;

    const labelColumn =
      groupingColumn ||
      columns.find((column) =>
        /\b(farmer|municipality|province|commodity|crop|farm id|name)\b/.test(
          normalizeText(column)
        )
      );

    const displayed = validRows.slice(0, limit);
    const formatted = displayed
      .map((item, index) => {
        const label =
          labelColumn && item.row[labelColumn]
            ? `${item.row[labelColumn]}: `
            : "";

        return `${index + 1}. ${label}${formatNumber(item.value)}`;
      })
      .join("\n");

    if (limit === 1) {
      const best = displayed[0];
      const label =
        labelColumn && best.row[labelColumn]
          ? ` (${labelColumn}: ${best.row[labelColumn]})`
          : "";

      return {
        success: true,
        operation,
        column: numericColumn,
        value: best.value,
        answer:
          `The ${operation === "maximum" ? "highest" : "lowest"} ` +
          `${numericColumn}${filterText} is ` +
          `${formatNumber(best.value)}${label}.`,
      };
    }

    return {
      success: true,
      operation: `${operation}_ranking`,
      column: numericColumn,
      results: displayed.map((item) => item.row),
      answer:
        `${operation === "maximum" ? "Top" : "Bottom"} ${limit} ` +
        `${numericColumn}${filterText}:\n${formatted}`,
    };
  }

  if (operation === "average" && numericColumn) {
    const values = filteredRows
      .map((row) => parseNumber(row[numericColumn]))
      .filter((value) => value !== null);

    if (!values.length) {
      return {
        success: false,
        operation,
        answer: `No numeric values were found in "${numericColumn}"${filterText}.`,
      };
    }

    const average =
      values.reduce((sum, value) => sum + value, 0) /
      values.length;

    return {
      success: true,
      operation,
      column: numericColumn,
      value: average,
      recordsUsed: values.length,
      answer:
        `The average ${numericColumn}${filterText} is ` +
        `${formatNumber(average)} based on ` +
        `${formatNumber(values.length)} record(s).`,
    };
  }

  if (operation === "sum" && numericColumn) {
    const values = filteredRows
      .map((row) => parseNumber(row[numericColumn]))
      .filter((value) => value !== null);

    if (!values.length) {
      return {
        success: false,
        operation,
        answer: `No numeric values were found in "${numericColumn}"${filterText}.`,
      };
    }

    const total = values.reduce(
      (sum, value) => sum + value,
      0
    );

    return {
      success: true,
      operation,
      column: numericColumn,
      value: total,
      recordsUsed: values.length,
      answer:
        `The total ${numericColumn}${filterText} is ` +
        `${formatNumber(total)} based on ` +
        `${formatNumber(values.length)} record(s).`,
    };
  }

  if (operation === "unique") {
    const uniqueColumn = selectedColumn || groupingColumn;

    if (!uniqueColumn) {
      return {
        success: false,
        operation,
        answer:
          "Please mention the field whose unique values you want to count.",
      };
    }

    const values = listDistinctValues(
      filteredRows,
      uniqueColumn,
      Number.MAX_SAFE_INTEGER
    );

    return {
      success: true,
      operation: "unique_count",
      column: uniqueColumn,
      value: values.length,
      answer:
        `There are ${formatNumber(values.length)} unique ` +
        `${uniqueColumn} value(s)${filterText}.`,
    };
  }

  if (asksForGrouping && groupingColumn) {
    const counts = countByColumn(
      filteredRows,
      groupingColumn
    );

    if (!counts.length) {
      return {
        success: false,
        operation,
        answer: `No values were found in "${groupingColumn}"${filterText}.`,
      };
    }

    const limit = extractRequestedLimit(question, 10);
    const results = counts.slice(0, limit);

    return {
      success: true,
      operation: "group_count",
      column: groupingColumn,
      results,
      answer:
        `Record count by ${groupingColumn}${filterText}:\n` +
        results
          .map(
            ([value, count], index) =>
              `${index + 1}. ${value}: ${formatNumber(count)}`
          )
          .join("\n"),
    };
  }

  if (operation === "count") {
    if (selectedColumn) {
      const selectedValues = filteredRows
        .map((row) =>
          String(row[selectedColumn] ?? "").trim()
        )
        .filter(Boolean);

      const asksUnique =
        /\b(unique|distinct|different|farmer|association|member)\b/.test(
          normalizedQuestion
        );

      if (asksUnique) {
        const uniqueValues = new Set(selectedValues);

        return {
          success: true,
          operation: "unique_count",
          column: selectedColumn,
          value: uniqueValues.size,
          answer:
            `There are ${formatNumber(uniqueValues.size)} unique ` +
            `${selectedColumn} value(s)${filterText}.`,
        };
      }

      return {
        success: true,
        operation: "non_empty_count",
        column: selectedColumn,
        value: selectedValues.length,
        answer:
          `There are ${formatNumber(selectedValues.length)} populated ` +
          `${selectedColumn} record(s)${filterText}.`,
      };
    }

    return {
      success: true,
      operation: "row_count",
      value: filteredRows.length,
      answer:
        `There are ${formatNumber(filteredRows.length)} ` +
        `record(s)${filterText}.`,
    };
  }

  if (filter && filteredRows.length > 0) {
    const preview = filteredRows
      .slice(0, 5)
      .map((row, index) => {
        const details = columns
          .slice(0, 8)
          .map(
            (column) =>
              `${column}: ${row[column] ?? ""}`
          )
          .join(", ");

        return `${index + 1}. ${details}`;
      })
      .join("\n");

    return {
      success: true,
      operation: "filtered_records",
      count: filteredRows.length,
      answer:
        `I found ${formatNumber(filteredRows.length)} record(s)` +
        `${filterText}.\n${preview}`,
    };
  }

  const likelyColumns = rankColumns(question, columns)
    .filter((item) => item.score >= 0.2)
    .slice(0, 3)
    .map((item) => item.column);

  return {
    success: false,
    operation: "unknown",
    suggestions: likelyColumns,
    answer:
      "I could not confidently determine the requested calculation. " +
      (likelyColumns.length
        ? `Did you mean one of these columns: ${likelyColumns.join(", ")}?\n\n`
        : "") +
      createHelpMessage(columns),
  };
}

module.exports = {
  answerQuestion,
};
'''

out = Path("/mnt/data/chatbotService.js")
out.write_text(src, encoding="utf-8")
print(out)
