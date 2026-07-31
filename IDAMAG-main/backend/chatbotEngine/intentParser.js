const {
  normalizeText,
  similarity,
  singularizeToken,
} = require("./utils");
const {
  inferValueFilters,
  inferDatasetValueFilters,
  mergeFilters,
} = require("./filterEngine");
const {
  findDatasetsContainingColumn,
} = require("./columnMatcher");

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


function detectShowAll(question) {
  const text = normalizeText(question);

  return (
    /\b(all|every|entire|complete|full)\b/.test(text) ||
    /\blist of\b/.test(text)
  );
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


function extractRankingRequest(
  question,
  schema,
  datasetName
) {
  const text = normalizeText(question);

  const hasDescendingMetric =
    /\b(highest|largest|biggest|greatest|most)\b/.test(text);
  const hasAscendingMetric =
    /\b(lowest|smallest|least)\b/.test(text);

  const direction =
    hasAscendingMetric
      ? "asc"
      : hasDescendingMetric
        ? "desc"
        : /\b(bottom|last)\b/.test(text)
          ? "asc"
          : /\b(top|first)\b/.test(text)
            ? "desc"
            : null;

  if (!direction) {
    return null;
  }

  const limit = detectLimit(question, 10);

  let labelTarget = null;
  let metricTarget = null;
  let aggregation = null;

  // Examples:
  // top 10 farmers by area
  // bottom 5 municipalities by production
  let match = text.match(
    /\b(?:top|bottom|first|last)\s+\d{1,3}\s+(.+?)\s+(?:by|based on|according to)\s+(.+)$/
  );

  if (match) {
    labelTarget = normalizeTarget(match[1]);
    metricTarget = normalizeTarget(match[2]);
  }

  // Examples:
  // top 5 farmers with the biggest area
  // 10 farmers with highest expected yield
  if (!match) {
    match = text.match(
      /\b(?:top|bottom|first|last)?\s*(?:\d{1,3})?\s*(.+?)\s+(?:with|having)\s+(?:the\s+)?(?:highest|lowest|largest|smallest|biggest|greatest|most|least)\s+(.+)$/
    );

    if (match) {
      labelTarget = normalizeTarget(match[1]);
      metricTarget = normalizeTarget(match[2]);
    }
  }

  // Examples:
  // highest area farmers
  // lowest yield municipalities
  if (!labelTarget || !metricTarget) {
    match = text.match(
      /\b(?:highest|lowest|largest|smallest|biggest|greatest|most|least)\s+(.+?)\s+(?:for|among)\s+(.+)$/
    );

    if (match) {
      metricTarget = normalizeTarget(match[1]);
      labelTarget = normalizeTarget(match[2]);
    }
  }

  if (!labelTarget || !metricTarget) {
    return null;
  }

  // If the metric explicitly asks for an aggregate, preserve that intent.
  if (/\b(total|sum|combined|overall)\b/.test(metricTarget)) {
    aggregation = "sum";
  } else if (/\b(average|avg|mean)\b/.test(metricTarget)) {
    aggregation = "average";
  } else if (/\b(count|number)\b/.test(metricTarget)) {
    aggregation = "count";
  }

  metricTarget = metricTarget
    .replace(/\b(total|sum|combined|overall|average|avg|mean|count|number)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const labelCandidates = rankColumns(
    labelTarget,
    schema,
    datasetName
  )
    .filter((item) => item.type !== "number")
    .sort((a, b) => b.score - a.score);

  const metricCandidates = rankColumns(
    metricTarget,
    schema,
    datasetName
  )
    .filter((item) => item.type === "number")
    .sort((a, b) => b.score - a.score);

  const labelColumn =
    labelCandidates[0]?.score >= 0.75
      ? labelCandidates[0]
      : null;

  const metricColumn =
    metricCandidates[0]?.score >= 0.75
      ? metricCandidates[0]
      : null;

  if (!labelColumn || !metricColumn) {
    return null;
  }

  return {
    labelColumn: labelColumn.name,
    metricColumn: metricColumn.name,
    direction,
    limit,
    aggregation,
  };
}


function extractCrossDatasetLookupParts(question) {
  const text = normalizeText(question);

  const match = text.match(
    /^(?:what|which|who|show|give|tell me|get|find|lookup)?\s*(?:is|are|was|were)?\s*(?:the\s+)?(.+?)\s+(?:of|for|by|from)\s+(.+?)\??$/
  );

  if (!match?.[1] || !match?.[2]) {
    return null;
  }

  return {
    requestedField: normalizeTarget(match[1]),
    identifierText: normalizeText(match[2]),
  };
}

function detectCrossDatasetLookup(question, schema, datasets) {
  if (!datasets || Object.keys(datasets).length < 2) {
    return null;
  }

  const parts = extractCrossDatasetLookupParts(question);

  if (!parts?.requestedField || !parts?.identifierText) {
    return null;
  }

  const outputCandidates = findDatasetsContainingColumn(
    datasets,
    parts.requestedField
  );

  if (!outputCandidates.length) {
    return null;
  }

  const identifierMatches = inferDatasetValueFilters(
    datasets,
    parts.identifierText
  );

  if (!identifierMatches.length) {
    return null;
  }

  for (const output of outputCandidates) {
    const identifier =
      identifierMatches.find(
        (item) => item.dataset !== output.dataset
      ) ||
      identifierMatches.find(
        (item) => item.dataset === output.dataset
      );

    if (!identifier) {
      continue;
    }

    if (identifier.dataset === output.dataset) {
      return {
        route: "dataset",
        dataset: output.dataset,
        operation: "lookup",
        column: output.column,
        groupBy: null,
        filters: [
          {
            column: identifier.column,
            operator: identifier.operator || "equals",
            value: identifier.value,
          },
        ],
        selectColumns: [output.column],
        transform: null,
        outputRequested: true,
        limit: detectLimit(question),
        showAll: detectShowAll(question),
        confidence: 0.99,
      };
    }

    return {
      route: "dataset",
      dataset: output.dataset,
      operation: "lookup",
      column: output.column,
      groupBy: null,
      filters: [],
      selectColumns: [output.column],
      transform: null,
      outputRequested: true,

      // calculationEngine uses this to locate the identifier in another
      // worksheet and bridge the worksheets through a shared live column.
      crossDatasetFilter: {
        sourceDataset: identifier.dataset,
        sourceColumn: identifier.column,
        operator: identifier.operator || "equals",
        value: identifier.value,
      },

      limit: detectLimit(question),
      showAll: detectShowAll(question),
      confidence: 0.99,
    };
  }

  return null;
}


function detectMultiFieldLookup(question, schema, datasets) {
  const text = normalizeText(question);

  /*
   * Handles questions like:
   * "name of farmer with farm id 1001 and planting month"
   * "farmer name and planting month for farm id 1001"
   * "show farmer, municipality and fertilizer used for 1001"
   */

  const identifierMatches =
    inferDatasetValueFilters(datasets, text);

  if (!identifierMatches.length) {
    return null;
  }

  const identifier = identifierMatches[0];

  // Remove the identifying value from the question so column matching
  // focuses on the requested output fields.
  let outputText = text.replace(
    normalizeText(identifier.value),
    " "
  );

  outputText = outputText
    .replace(
      /\b(?:what|which|who|show|give|tell|me|get|find|lookup|is|are|was|were|the|of|for|from|with|by|and|its|their|his|her)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  const allColumns = getAllColumns(schema);

  const requested = allColumns
    .map((item) => ({
      ...item,
      score: scoreColumnTarget(
        outputText,
        item.name
      ),
    }))
    .filter(
      (item) =>
        item.score >= 0.75 &&
        !(
          item.dataset === identifier.dataset &&
          normalizeText(item.name) ===
            normalizeText(identifier.column)
        )
    )
    .sort((a, b) => b.score - a.score);

  // Keep best unique column names.
  const selectColumns = [];
  const seen = new Set();

  for (const item of requested) {
    const key = normalizeText(item.name);

    if (!seen.has(key)) {
      seen.add(key);
      selectColumns.push(item.name);
    }
  }

  if (!selectColumns.length) {
    return null;
  }

  return {
    route: "dataset",

    // Start from the worksheet where the identifying value was found.
    // calculationEngine.js can then merge requested fields from other
    // worksheets using the existing generic cross-worksheet lookup.
    dataset: identifier.dataset,

    operation: "lookup",
    column: null,
    groupBy: null,

    filters: [
      {
        column: identifier.column,
        operator:
          identifier.operator ||
          "equals",
        value:
          identifier.value,
      },
    ],

    selectColumns,
    transform: null,
    outputRequested: true,
    limit: detectLimit(question),
    showAll: detectShowAll(question),
    confidence: 0.995,
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

  // Resolve multi-field lookups FIRST.
  // Example:
  // "name of farmer with farm id 1001 and planting month"
  const multiFieldLookup =
    detectMultiFieldLookup(
      question,
      schema,
      datasets
    );

  if (multiFieldLookup) {
    return multiFieldLookup;
  }

  // Resolve exact cross-worksheet lookups BEFORE choosing one worksheet.
  // Example: "fertilizer used by Maria Santos" where the name is in one
  // sheet and Fertilizer Used is in another.
  const crossDatasetLookup =
    detectCrossDatasetLookup(
      question,
      schema,
      datasets
    );

  if (crossDatasetLookup) {
    return crossDatasetLookup;
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

  const rankingRequest = extractRankingRequest(
    question,
    schema,
    datasetName
  );

  if (rankingRequest) {
    const schemaFilters = findExplicitFilters(
      question,
      schema,
      datasetName,
      [
        rankingRequest.labelColumn,
        rankingRequest.metricColumn,
      ]
    );

    const liveFilters = currentRows.length
      ? inferValueFilters(
          currentRows,
          question,
          [
            rankingRequest.labelColumn,
            rankingRequest.metricColumn,
          ]
        )
      : [];

    return {
      route: "dataset",
      dataset: datasetName,
      operation: rankingRequest.aggregation
        ? "rank_groups"
        : "rank_rows",
      column: rankingRequest.metricColumn,
      labelColumn: rankingRequest.labelColumn,
      groupBy: rankingRequest.labelColumn,
      aggregation: rankingRequest.aggregation,
      direction: rankingRequest.direction,
      filters: mergeFilters(
        schemaFilters,
        liveFilters
      ),
      selectColumns: [
        rankingRequest.labelColumn,
        rankingRequest.metricColumn,
      ],
      limit: rankingRequest.limit,
      confidence: 0.95,
    };
  }

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
        showAll: detectShowAll(question),
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
    showAll: detectShowAll(question),
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
  detectCrossDatasetLookup,
  detectMultiFieldLookup,
};
