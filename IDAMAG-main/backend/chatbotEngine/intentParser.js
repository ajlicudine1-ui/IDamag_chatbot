const {
  normalizeText,
  similarity,
} = require("./utils");

const GENERAL_PATTERNS = [
  /\b(translate|translation)\b/,
  /\b(correct|fix|check|improve)\b.*\b(grammar|sentence|paragraph|writing)\b/,
  /\b(write|rewrite|compose|draft|make)\b.*\b(letter|paragraph|essay|message|caption|report|email)\b/,
  /\b(explain|define|meaning of|what does .* mean)\b/,
  /\b(hello|hi|hey|good morning|good afternoon|good evening|thanks|thank you)\b/,
];

const SCHEMA_PATTERNS = {
  datasets: [
    /\b(worksheet|worksheets|sheet|sheets|dataset|datasets)\b.*\b(available|exist|loaded|have)\b/,
    /\bwhat\b.*\b(worksheet|worksheets|sheet|sheets|dataset|datasets)\b/,
  ],
  columns: [
    /\b(column|columns|field|fields|header|headers)\b.*\b(available|exist|have|show|list)\b/,
    /\bwhat\b.*\b(column|columns|field|fields|header|headers)\b/,
  ],
  row_counts: [
    /\b(row count|rows per|records per|entries per)\b/,
    /\bhow many rows\b.*\b(each|worksheet|sheet|dataset)\b/,
  ],
  find_column: [
    /\b(which|what)\b.*\b(worksheet|sheet|dataset)\b.*\b(contain|contains|has|have)\b/,
    /\bwhere\b.*\b(column|field)\b/,
  ],
};

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function getAllColumns(schema) {
  const columns = [];

  for (const dataset of schema) {
    for (const column of dataset.columns || []) {
      columns.push({
        dataset: dataset.name,
        name: column.name,
        type: column.type,
        examples: column.examples || [],
      });
    }
  }

  return columns;
}

function rankDatasets(question, schema) {
  return schema
    .map((dataset) => {
      let score = similarity(question, dataset.name);

      for (const column of dataset.columns || []) {
        score = Math.max(
          score,
          similarity(question, column.name) * 0.9
        );

        for (const example of column.examples || []) {
          if (
            normalizeText(example).length >= 2 &&
            normalizeText(question).includes(normalizeText(example))
          ) {
            score += Math.min(
              normalizeText(example).length / 50,
              0.45
            );
          }
        }
      }

      return {
        dataset: dataset.name,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function rankColumns(question, schema, datasetName = null) {
  return getAllColumns(schema)
    .filter(
      (item) =>
        !datasetName || item.dataset === datasetName
    )
    .map((item) => {
      let score = similarity(question, item.name);

      const normalizedName = normalizeText(item.name);
      const normalizedQuestion = normalizeText(question);

      if (
        normalizedName &&
        normalizedQuestion.includes(normalizedName)
      ) {
        score += 0.8;
      }

      return {
        ...item,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function detectLimit(question, fallback = 10) {
  const text = normalizeText(question);

  const match =
    text.match(/\b(?:top|bottom|first|last)\s+(\d{1,3})\b/) ||
    text.match(/\b(\d{1,3})\s+(?:highest|lowest|largest|smallest)\b/);

  if (!match) return fallback;

  const value = Number(match[1]);

  return Number.isInteger(value)
    ? Math.min(Math.max(value, 1), 100)
    : fallback;
}

function detectOperation(question, selectedColumn) {
  const text = normalizeText(question);
  const isNumeric =
    selectedColumn?.type === "number";

  const hasGrouping =
    /\b(by|per|for each|grouped by|each)\b/.test(text);

  let baseOperation = null;

  if (/\b(median|middle value)\b/.test(text)) {
    baseOperation = "median";
  } else if (/\b(average|avg|mean)\b/.test(text)) {
    baseOperation = "average";
  } else if (
    /\b(top|highest|maximum|max|largest|greatest|most)\b/.test(text)
  ) {
    baseOperation = "maximum";
  } else if (
    /\b(bottom|lowest|minimum|min|smallest|least)\b/.test(text)
  ) {
    baseOperation = "minimum";
  } else if (
    /\b(sum|total|combined|overall|altogether|in all)\b/.test(text)
  ) {
    baseOperation = "sum";
  } else if (
    /\b(unique|distinct|different)\b/.test(text) &&
    /\b(how many|count|number)\b/.test(text)
  ) {
    baseOperation = "distinct_count";
  } else if (
    /\b(list|show all|display all|enumerate|what are the|which are the)\b/.test(text)
  ) {
    baseOperation = "list";
  } else if (
    /\b(show|find|lookup|search|get|retrieve)\b/.test(text)
  ) {
    baseOperation = "lookup";
  } else if (
    /\b(how many rows|number of rows|row count|records|entries)\b/.test(text)
  ) {
    baseOperation = "row_count";
  } else if (
    /\b(how many|number of|count)\b/.test(text)
  ) {
    baseOperation = isNumeric
      ? "sum"
      : selectedColumn
        ? "distinct_count"
        : "row_count";
  }

  if (!baseOperation) {
    return null;
  }

  if (hasGrouping) {
    if (baseOperation === "sum") return "group_sum";
    if (baseOperation === "average") return "group_average";
    if (baseOperation === "minimum") return "group_minimum";
    if (baseOperation === "maximum") return "group_maximum";
    if (baseOperation === "row_count") return "group_count";
  }

  return baseOperation;
}

function findGroupingColumn(question, schema, datasetName, metricColumn) {
  const text = normalizeText(question);

  const explicitMatch = text.match(
    /\b(?:by|per|for each|grouped by|each)\s+(.+)$/
  );

  const candidates = rankColumns(
    explicitMatch ? explicitMatch[1] : question,
    schema,
    datasetName
  ).filter((item) => item.name !== metricColumn?.name);

  const preferred = candidates.find(
    (item) => item.type !== "number" && item.score >= 0.35
  );

  return preferred || null;
}

function findExplicitFilters(question, schema, datasetName, excluded = []) {
  const text = normalizeText(question);
  const excludedSet = new Set(excluded.filter(Boolean));
  const filters = [];

  const columns = getAllColumns(schema).filter(
    (item) =>
      item.dataset === datasetName &&
      !excludedSet.has(item.name)
  );

  for (const column of columns) {
    for (const example of column.examples || []) {
      const normalizedExample = normalizeText(example);

      if (
        normalizedExample.length >= 2 &&
        text.includes(normalizedExample)
      ) {
        filters.push({
          column: column.name,
          operator: "equals",
          value: example,
          score: normalizedExample.length,
        });
      }
    }
  }

  filters.sort((a, b) => b.score - a.score);

  const finalFilters = [];
  const usedColumns = new Set();

  for (const filter of filters) {
    if (!usedColumns.has(filter.column)) {
      usedColumns.add(filter.column);
      const { score, ...clean } = filter;
      finalFilters.push(clean);
    }
  }

  return finalFilters;
}

function detectSchemaPlan(question, schema) {
  const text = normalizeText(question);

  for (const [intent, patterns] of Object.entries(SCHEMA_PATTERNS)) {
    if (!matchesAny(text, patterns)) continue;

    let dataset = null;
    let column = null;

    const datasetRank = rankDatasets(question, schema);
    if (datasetRank[0]?.score >= 0.55) {
      dataset = datasetRank[0].dataset;
    }

    const columnRank = rankColumns(question, schema, dataset);
    if (columnRank[0]?.score >= 0.45) {
      column = columnRank[0].name;
    }

    return {
      route: "schema",
      intent,
      dataset,
      column,
      confidence: 0.95,
    };
  }

  return null;
}

function detectGeneralPlan(question) {
  const text = normalizeText(question);

  if (matchesAny(text, GENERAL_PATTERNS)) {
    return {
      route: "general",
      confidence: 0.95,
    };
  }

  return null;
}


function detectRequestedOutputColumns(
  question,
  schema,
  datasetName,
  filterColumns = []
) {
  const text = normalizeText(question);
  const candidates = [];

  // Prefer the phrase before "of", "for", or "from" as the requested output.
  const targetMatch = text.match(
    /^(?:what|which|who|show|give|tell me)?\s*(?:is|are|was|were)?\s*(?:the\s+)?(.+?)\s+(?:of|for|from)\s+/
  );

  const targetText = targetMatch
    ? targetMatch[1].trim()
    : question;

  for (const item of rankColumns(targetText, schema, datasetName)) {
    if (filterColumns.includes(item.name)) {
      continue;
    }

    let score = item.score;

    // Generic semantic support for person/name fields.
    if (
      /\b(first name|name|person|who)\b/.test(targetText) &&
      /\b(name|farmer|person|respondent|beneficiary|owner|operator|employee|staff)\b/.test(
        normalizeText(item.name)
      )
    ) {
      score += 0.45;
    }

    candidates.push({
      ...item,
      score,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const selected =
    candidates[0]?.score >= 0.35
      ? [candidates[0].name]
      : [];

  let transform = null;

  if (/\bfirst name\b/.test(text)) {
    transform = "first_word";
  } else if (/\blast name\b/.test(text)) {
    transform = "last_word";
  }

  return {
    selectColumns: selected,
    transform,
  };
}

function createLocalPlan({
  question,
  schema,
}) {
  const schemaPlan = detectSchemaPlan(question, schema);
  if (schemaPlan) return schemaPlan;

  const generalPlan = detectGeneralPlan(question);
  if (generalPlan) return generalPlan;

  const datasetRanking = rankDatasets(question, schema);
  const bestDataset = datasetRanking[0];

  let datasetName = null;

  if (schema.length === 1) {
    datasetName = schema[0].name;
  } else if (bestDataset?.score >= 0.25) {
    datasetName = bestDataset.dataset;
  }

  if (!datasetName) {
    return {
      route: "clarify",
      question:
        "Which worksheet should I use? Available worksheets: " +
        schema.map((item) => item.name).join(", "),
      confidence: 0.2,
    };
  }

  const columnRanking = rankColumns(
    question,
    schema,
    datasetName
  );

  const selectedColumn =
    columnRanking[0]?.score >= 0.2
      ? columnRanking[0]
      : null;

  const operation = detectOperation(
    question,
    selectedColumn
  );

  if (!operation) {
    const filters = findExplicitFilters(
      question,
      schema,
      datasetName,
      []
    );

    if (filters.length) {
      const output = detectRequestedOutputColumns(
        question,
        schema,
        datasetName,
        filters.map((filter) => filter.column)
      );

      return {
        route: "dataset",
        dataset: datasetName,
        operation: "lookup",
        column: null,
        groupBy: null,
        filters,
        selectColumns: output.selectColumns,
        transform: output.transform,
        limit: detectLimit(question),
        confidence: 0.7,
      };
    }

    return {
      route: "general",
      confidence: 0.4,
    };
  }

  const groupingColumn = operation.startsWith("group_")
    ? findGroupingColumn(
        question,
        schema,
        datasetName,
        selectedColumn
      )
    : (
        ["minimum", "maximum"].includes(operation)
          ? findGroupingColumn(
              question,
              schema,
              datasetName,
              selectedColumn
            )
          : null
      );

  const filters = findExplicitFilters(
    question,
    schema,
    datasetName,
    [
      selectedColumn?.name,
      groupingColumn?.name,
    ]
  );

  if (
    !selectedColumn &&
    !["row_count", "group_count", "lookup"].includes(operation)
  ) {
    return {
      route: "clarify",
      question:
        `Which column should I use from ${datasetName}?`,
      confidence: 0.25,
    };
  }

  if (
    operation.startsWith("group_") &&
    !groupingColumn
  ) {
    return {
      route: "clarify",
      question:
        `Which column should I group by in ${datasetName}?`,
      confidence: 0.25,
    };
  }

  const output =
    operation === "lookup"
      ? detectRequestedOutputColumns(
          question,
          schema,
          datasetName,
          filters.map((filter) => filter.column)
        )
      : {
          selectColumns: [],
          transform: null,
        };

  return {
    route: "dataset",
    dataset: datasetName,
    operation,
    column: selectedColumn?.name || null,
    groupBy: groupingColumn?.name || null,
    filters,
    selectColumns: output.selectColumns,
    transform: output.transform,
    limit: detectLimit(question),
    confidence: Math.min(
      1,
      0.55 +
        (selectedColumn?.score || 0) * 0.3 +
        (bestDataset?.score || 0) * 0.15
    ),
  };
}

/**
 * Local-first parser.
 *
 * Groq is not called here. This function uses only the loaded schema,
 * worksheet names, column names, detected types, and example values.
 */
async function createPlan({
  question,
  schema,
}) {
  return createLocalPlan({
    question,
    schema,
  });
}

module.exports = {
  createPlan,
  createLocalPlan,
};
