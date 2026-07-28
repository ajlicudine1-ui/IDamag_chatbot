const {
  normalizeText,
  similarity,
  singularizeToken,
} = require("./utils");
const {
  inferValueFilters,
  mergeFilters,
} = require("./filterEngine");

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

const TARGET_PREFIX_PATTERNS = [
  /^(?:please\s+)?(?:list|show|display|enumerate|name)\s+(?:all\s+)?(?:the\s+)?(.+)$/,
  /^(?:what|which)\s+(?:are|is)\s+(?:all\s+)?(?:the\s+)?(.+?)\??$/,
  /^(?:give|tell)\s+me\s+(?:all\s+)?(?:the\s+)?(.+)$/,
  /^(?:how many|number of|count of)\s+(?:the\s+)?(.+)$/,
  /^(?:what is|what are)\s+(?:the\s+)?(?:total|sum|average|avg|mean|median|highest|lowest|maximum|minimum)\s+(?:of\s+)?(.+)$/,
];

const OPERATION_WORDS = new Set([
  "all",
  "average",
  "avg",
  "bottom",
  "combined",
  "count",
  "different",
  "display",
  "distinct",
  "enumerate",
  "give",
  "highest",
  "in",
  "list",
  "lowest",
  "max",
  "maximum",
  "mean",
  "median",
  "minimum",
  "min",
  "number",
  "of",
  "overall",
  "show",
  "sum",
  "tell",
  "the",
  "top",
  "total",
  "unique",
  "value",
  "values",
]);

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function normalizeTarget(value) {
  return normalizeText(value)
    .replace(/[?]+$/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map(singularizeToken)
    .filter((token) => !OPERATION_WORDS.has(token))
    .join(" ")
    .trim();
}

function extractTargetPhrase(question) {
  const text = normalizeText(question);

  for (const pattern of TARGET_PREFIX_PATTERNS) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return normalizeTarget(match[1]);
    }
  }

  const byMatch = text.match(
    /\b(?:by|per|for each|grouped by)\s+(.+)$/
  );

  if (byMatch?.[1]) {
    return normalizeTarget(
      text.replace(byMatch[0], "")
    );
  }

  return normalizeTarget(text);
}

function extractGroupingPhrase(question) {
  const text = normalizeText(question);
  const match = text.match(
    /\b(?:by|per|for each|grouped by)\s+(.+)$/
  );

  return match?.[1]
    ? normalizeTarget(match[1])
    : null;
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

function scoreColumnTarget(target, columnName) {
  const cleanTarget = normalizeTarget(target);
  const cleanColumn = normalizeTarget(columnName);

  if (!cleanTarget || !cleanColumn) {
    return 0;
  }

  if (cleanTarget === cleanColumn) {
    return 2;
  }

  let score = similarity(cleanTarget, cleanColumn);

  if (
    cleanTarget.includes(cleanColumn) ||
    cleanColumn.includes(cleanTarget)
  ) {
    score += 0.8;
  }

  const targetTokens = new Set(
    cleanTarget.split(/\s+/)
  );
  const columnTokens = new Set(
    cleanColumn.split(/\s+/)
  );

  let matched = 0;

  for (const token of columnTokens) {
    if (targetTokens.has(token)) {
      matched += 1;
    }
  }

  if (columnTokens.size) {
    score += matched / columnTokens.size;
  }

  return score;
}

function rankDatasets(question, schema) {
  return schema
    .map((dataset) => {
      let score = similarity(
        question,
        dataset.name
      );

      for (const column of dataset.columns || []) {
        score = Math.max(
          score,
          scoreColumnTarget(
            extractTargetPhrase(question),
            column.name
          ) * 0.9
        );

        for (const example of column.examples || []) {
          const normalizedExample =
            normalizeText(example);

          if (
            normalizedExample.length >= 2 &&
            normalizeText(question).includes(
              normalizedExample
            )
          ) {
            score += Math.min(
              normalizedExample.length / 50,
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

function rankColumns(
  target,
  schema,
  datasetName = null
) {
  const cleanTarget = extractTargetPhrase(target);

  return getAllColumns(schema)
    .filter(
      (item) =>
        !datasetName ||
        item.dataset === datasetName
    )
    .map((item) => ({
      ...item,
      score: scoreColumnTarget(
        cleanTarget,
        item.name
      ),
    }))
    .sort((a, b) => b.score - a.score);
}

function detectLimit(question, fallback = 10) {
  const text = normalizeText(question);

  const match =
    text.match(
      /\b(?:top|bottom|first|last)\s+(\d{1,3})\b/
    ) ||
    text.match(
      /\b(\d{1,3})\s+(?:highest|lowest|largest|smallest)\b/
    );

  if (!match) return fallback;

  const value = Number(match[1]);

  return Number.isInteger(value)
    ? Math.min(Math.max(value, 1), 100)
    : fallback;
}

function detectOperation(
  question,
  selectedColumn
) {
  const text = normalizeText(question);
  const isNumeric =
    selectedColumn?.type === "number";

  const hasGrouping =
    /\b(by|per|for each|grouped by|each)\b/.test(
      text
    );

  let baseOperation = null;

  if (/\b(median|middle value)\b/.test(text)) {
    baseOperation = "median";
  } else if (
    /\b(average|avg|mean)\b/.test(text)
  ) {
    baseOperation = "average";
  } else if (
    /\b(top|highest|maximum|max|largest|greatest|most)\b/.test(
      text
    )
  ) {
    baseOperation = "maximum";
  } else if (
    /\b(bottom|lowest|minimum|min|smallest|least)\b/.test(
      text
    )
  ) {
    baseOperation = "minimum";
  } else if (
    /\b(sum|total|combined|overall|altogether|in all)\b/.test(
      text
    )
  ) {
    baseOperation = "sum";
  } else if (
    /\b(unique|distinct|different)\b/.test(
      text
    ) &&
    /\b(how many|count|number)\b/.test(text)
  ) {
    baseOperation = "distinct_count";
  } else if (
    /\b(list|show all|display all|enumerate|what are|which are|give me all|name all)\b/.test(
      text
    )
  ) {
    baseOperation = "list";
  } else if (
    /\b(show|find|lookup|search|get|retrieve)\b/.test(
      text
    )
  ) {
    baseOperation = "lookup";
  } else if (
    /\b(how many rows|number of rows|row count|records|entries)\b/.test(
      text
    )
  ) {
    baseOperation = "row_count";
  } else if (
    /\b(how many|number of|count)\b/.test(
      text
    )
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
    if (baseOperation === "sum") {
      return "group_sum";
    }

    if (baseOperation === "average") {
      return "group_average";
    }

    if (baseOperation === "minimum") {
      return "group_minimum";
    }

    if (baseOperation === "maximum") {
      return "group_maximum";
    }

    if (baseOperation === "row_count") {
      return "group_count";
    }
  }

  return baseOperation;
}

function findGroupingColumn(
  question,
  schema,
  datasetName,
  metricColumn
) {
  const groupingTarget =
    extractGroupingPhrase(question);

  if (!groupingTarget) {
    return null;
  }

  const candidates = rankColumns(
    groupingTarget,
    schema,
    datasetName
  ).filter(
    (item) =>
      item.name !== metricColumn?.name
  );

  return (
    candidates.find(
      (item) =>
        item.type !== "number" &&
        item.score >= 0.75
    ) || null
  );
}

function findExplicitFilters(
  question,
  schema,
  datasetName,
  excluded = []
) {
  const text = normalizeText(question);
  const excludedSet = new Set(
    excluded.filter(Boolean)
  );
  const filters = [];

  const columns = getAllColumns(schema).filter(
    (item) =>
      item.dataset === datasetName &&
      !excludedSet.has(item.name)
  );

  for (const column of columns) {
    for (const example of column.examples || []) {
      const normalizedExample =
        normalizeText(example);

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

function detectSchemaPlan(
  question,
  schema
) {
  const text = normalizeText(question);

  for (const [intent, patterns] of Object.entries(
    SCHEMA_PATTERNS
  )) {
    if (!matchesAny(text, patterns)) {
      continue;
    }

    const datasetRank =
      rankDatasets(question, schema);
    const dataset =
      datasetRank[0]?.score >= 0.55
        ? datasetRank[0].dataset
        : null;

    const target =
      extractTargetPhrase(question);
    const columnRank = rankColumns(
      target,
      schema,
      dataset
    );
    const column =
      columnRank[0]?.score >= 0.75
        ? columnRank[0].name
        : null;

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

  const targetMatch = text.match(
    /^(?:what|which|who|show|give|tell me)?\s*(?:is|are|was|were)?\s*(?:the\s+)?(.+?)\s+(?:of|for|from)\s+/
  );

  const rawTarget = targetMatch?.[1]
    ? targetMatch[1].trim()
    : extractTargetPhrase(question);

  let transform = null;

  if (/\bfirst name\b/.test(text)) {
    transform = "first_word";
  } else if (/\blast name\b/.test(text)) {
    transform = "last_word";
  }

  // For "first name" and "last name", match the underlying name/person
  // column, then apply the requested word transformation.
  const targetText = normalizeTarget(
    rawTarget
      .replace(/\bfirst name\b/g, "name")
      .replace(/\blast name\b/g, "name")
  );

  const candidates = rankColumns(
    targetText,
    schema,
    datasetName
  )
    .filter(
      (item) =>
        !filterColumns.includes(item.name)
    )
    .map((item) => {
      let score = item.score;
      const normalizedColumn = normalizeText(item.name);
      const examples = Array.isArray(item.examples)
        ? item.examples
        : [];

      const asksForName =
        /\b(name|person|who)\b/.test(targetText) ||
        transform !== null;

      if (
        asksForName &&
        /\b(name|farmer|person|respondent|beneficiary|owner|operator|employee|staff|applicant|client|customer|student|teacher|member)\b/.test(
          normalizedColumn
        )
      ) {
        score += 1;
      }

      // Generic evidence that a text column contains full names.
      if (
        asksForName &&
        item.type === "text" &&
        examples.some((value) =>
          /^[\p{L}.'-]+(?:\s+[\p{L}.'-]+)+$/u.test(
            String(value).trim()
          )
        )
      ) {
        score += 0.35;
      }

      return {
        ...item,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

  const selected =
    candidates[0]?.score >= 0.55
      ? [candidates[0].name]
      : [];

  return {
    selectColumns: selected,
    transform,
    outputRequested:
      Boolean(targetMatch?.[1]) ||
      transform !== null,
  };
}

function createLocalPlan({
  question,
  schema,
  datasets = {},
}) {
  const schemaPlan =
    detectSchemaPlan(question, schema);

  if (schemaPlan) {
    return schemaPlan;
  }

  const generalPlan =
    detectGeneralPlan(question);

  if (generalPlan) {
    return generalPlan;
  }

  const datasetRanking =
    rankDatasets(question, schema);
  const bestDataset = datasetRanking[0];

  let datasetName = null;

  if (schema.length === 1) {
    datasetName = schema[0].name;
  } else if (bestDataset?.score >= 0.25) {
    datasetName = bestDataset.dataset;
  }

  const currentRows =
    Array.isArray(datasets?.[datasetName])
      ? datasets[datasetName]
      : [];

  if (!datasetName) {
    return {
      route: "clarify",
      question:
        "Which worksheet should I use? Available worksheets: " +
        schema
          .map((item) => item.name)
          .join(", "),
      confidence: 0.2,
    };
  }

  const target =
    extractTargetPhrase(question);
  const columnRanking = rankColumns(
    target,
    schema,
    datasetName
  );

  const selectedColumn =
    columnRanking[0]?.score >= 0.75
      ? columnRanking[0]
      : null;

  const operation = detectOperation(
    question,
    selectedColumn
  );

  if (!operation) {
    const schemaFilters = findExplicitFilters(
      question,
      schema,
      datasetName,
      []
    );

    const liveFilters = currentRows.length
      ? inferValueFilters(
          currentRows,
          question,
          []
        )
      : [];

    const filters = mergeFilters(
      schemaFilters,
      liveFilters
    );

    const output =
      detectRequestedOutputColumns(
        question,
        schema,
        datasetName,
        filters.map(
          (filter) => filter.column
        )
      );

    // If the question identifies a real current-row value, it is a
    // dataset lookup even when the value was added after startup.
    if (filters.length) {
      return {
        route: "dataset",
        dataset: datasetName,
        operation: "lookup",
        column: null,
        groupBy: null,
        filters,
        selectColumns:
          output.selectColumns,
        transform: output.transform,
        outputRequested: output.outputRequested,
        limit: detectLimit(question),
        confidence: 0.9,
      };
    }

    return {
      route: "general",
      confidence: 0.4,
    };
  }

  const groupingColumn =
    operation.startsWith("group_") ||
    ["minimum", "maximum"].includes(
      operation
    )
      ? findGroupingColumn(
          question,
          schema,
          datasetName,
          selectedColumn
        )
      : null;

  const schemaFilters = findExplicitFilters(
    question,
    schema,
    datasetName,
    [
      selectedColumn?.name,
      groupingColumn?.name,
    ]
  );

  const liveFilters = currentRows.length
    ? inferValueFilters(
        currentRows,
        question,
        [
          selectedColumn?.name,
          groupingColumn?.name,
        ]
      )
    : [];

  const filters = mergeFilters(
    schemaFilters,
    liveFilters
  );

  if (
    !selectedColumn &&
    ![
      "row_count",
      "group_count",
      "lookup",
    ].includes(operation)
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
          filters.map(
            (filter) => filter.column
          )
        )
      : {
          selectColumns: [],
          transform: null,
        };

  return {
    route: "dataset",
    dataset: datasetName,
    operation,
    column:
      selectedColumn?.name || null,
    groupBy:
      groupingColumn?.name || null,
    filters,
    selectColumns:
      output.selectColumns,
    transform: output.transform,
    outputRequested: output.outputRequested,
    limit: detectLimit(question),
    confidence: Math.min(
      1,
      0.65 +
        (selectedColumn?.score || 0) *
          0.2 +
        (bestDataset?.score || 0) *
          0.1
    ),
  };
}

async function createPlan({
  question,
  schema,
  datasets = {},
}) {
  return createLocalPlan({
    question,
    schema,
    datasets,
  });
}

module.exports = {
  createPlan,
  createLocalPlan,
  extractTargetPhrase,
  extractGroupingPhrase,
};
