const { buildSchema } = require("./schemaBuilder");
const { createPlan } = require("./intentParser");
const { executePlan } = require("./calculationEngine");
const { answerSchemaQuestion } = require("./schemaEngine");
const {
  answerGeneralQuestion,
  createSchemaAwarePlan,
} = require("./groqService");
const {
  normalizeDatasets,
  normalizeText,
  singularizeToken,
} = require("./utils");
const {
  findDatasetName,
  findDatasetsContainingColumn,
} = require("./columnMatcher");
const {
  inferDatasetValueFilters,
} = require("./filterEngine");

const DATASET_OPERATIONS = new Set([
  "sum",
  "average",
  "median",
  "minimum",
  "maximum",
  "row_count",
  "non_empty_count",
  "distinct_count",
  "list",
  "lookup",
  "group_list",
  "group_count",
  "group_sum",
  "group_average",
  "group_minimum",
  "group_maximum",
  "rank_rows",
  "rank_groups",
]);

const FILTER_OPERATORS = new Set([
  "equals",
  "not_equals",
  "contains",
  "starts_with",
  "ends_with",
  "greater_than",
  "greater_or_equal",
  "less_than",
  "less_or_equal",
]);

function cleanTokens(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map(singularizeToken);
}

function sameName(left, right) {
  return (
    normalizeText(left) ===
    normalizeText(right)
  );
}

function getSchemaColumns(schema) {
  const columns = [];

  for (const dataset of schema || []) {
    for (const column of dataset.columns || []) {
      columns.push({
        dataset: dataset.name,
        name: column.name,
        type: column.type,
      });
    }
  }

  return columns;
}

function resolveDataset(
  datasets,
  requested
) {
  if (!requested) {
    return null;
  }

  return findDatasetName(
    datasets,
    requested
  );
}

function resolveColumnAcrossSchema({
  datasets,
  requested,
  preferredDataset = null,
}) {
  if (!requested) {
    return null;
  }

  const matches =
    findDatasetsContainingColumn(
      datasets,
      requested
    );

  if (!matches.length) {
    return null;
  }

  const preferred =
    preferredDataset
      ? matches.find(
          (item) =>
            item.dataset ===
            preferredDataset
        )
      : null;

  return preferred || matches[0];
}

function scoreQuestionColumn(
  question,
  columnName
) {
  const questionTokens =
    new Set(
      cleanTokens(question)
    );

  const columnTokens =
    cleanTokens(columnName);

  if (!columnTokens.length) {
    return 0;
  }

  let matched = 0;

  for (const token of columnTokens) {
    if (questionTokens.has(token)) {
      matched += 1;
    }
  }

  const coverage =
    matched / columnTokens.length;

  const normalizedQuestion =
    normalizeText(question);

  const normalizedColumn =
    normalizeText(columnName);

  const phraseBonus =
    normalizedQuestion.includes(
      normalizedColumn
    )
      ? 1
      : 0;

  return coverage + phraseBonus;
}

function findMentionedColumns(
  question,
  schema
) {
  return getSchemaColumns(schema)
    .map((item) => ({
      ...item,
      score:
        scoreQuestionColumn(
          question,
          item.name
        ),
    }))
    .filter(
      (item) =>
        item.score >= 0.75
    )
    .sort(
      (a, b) =>
        b.score - a.score
    );
}

function detectExplicitLimit(
  question
) {
  const text =
    normalizeText(question);

  const match =
    text.match(
      /\b(?:top|bottom|first|last)\s+(\d{1,3})\b/
    ) ||
    text.match(
      /\b(\d{1,3})\s+(?:highest|lowest|largest|smallest|biggest|greatest|most|least)\b/
    ) ||
    text.match(
      /\b(?:show|list|give|display)\s+(?:me\s+)?(?:the\s+)?(\d{1,3})\b/
    );

  if (!match) {
    return null;
  }

  const value =
    Number(match[1]);

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    return null;
  }

  return Math.min(value, 100);
}

function detectDirection(question) {
  const text =
    normalizeText(question);

  if (
    /\b(bottom|lowest|minimum|smallest|least)\b/.test(
      text
    )
  ) {
    return "asc";
  }

  return "desc";
}

function detectAggregation(question) {
  const text =
    normalizeText(question);

  if (
    /\b(average|avg|mean)\b/.test(
      text
    )
  ) {
    return "average";
  }

  if (
    /\b(count|how many|number of|most|fewest)\b/.test(
      text
    )
  ) {
    return "count";
  }

  return "sum";
}

function normalizeFilters(filters) {
  if (!Array.isArray(filters)) {
    return [];
  }

  return filters
    .filter(
      (filter) =>
        filter &&
        filter.column &&
        filter.value !== undefined
    )
    .map((filter) => ({
      column:
        String(filter.column).trim(),
      operator:
        FILTER_OPERATORS.has(
          filter.operator
        )
          ? filter.operator
          : "equals",
      value:
        filter.value,
    }));
}

function addLiveFilterWhenMissing({
  plan,
  datasets,
  question,
}) {
  if (
    plan.filters.length ||
    plan.crossDatasetFilter
  ) {
    return plan;
  }

  const valueMatches =
    inferDatasetValueFilters(
      datasets,
      question
    );

  if (!valueMatches.length) {
    return plan;
  }

  const preferred =
    valueMatches.find(
      (item) =>
        item.dataset ===
        plan.dataset
    );

  const selected =
    preferred ||
    valueMatches[0];

  if (
    selected.dataset ===
    plan.dataset
  ) {
    plan.filters = [
      {
        column:
          selected.column,
        operator:
          selected.operator ||
          "equals",
        value:
          selected.value,
      },
    ];

    return plan;
  }

  if (
    [
      "lookup",
      "list",
      "non_empty_count",
      "distinct_count",
    ].includes(plan.operation)
  ) {
    plan.crossDatasetFilter = {
      sourceDataset:
        selected.dataset,
      sourceColumn:
        selected.column,
      operator:
        selected.operator ||
        "equals",
      value:
        selected.value,
    };
  }

  return plan;
}

function repairRankingPlan({
  plan,
  datasets,
  schema,
  question,
}) {
  if (
    ![
      "rank_rows",
      "rank_groups",
    ].includes(plan.operation)
  ) {
    return plan;
  }

  const mentioned =
    findMentionedColumns(
      question,
      schema
    );

  const explicitLimit =
    detectExplicitLimit(
      question
    );

  if (explicitLimit) {
    plan.limit =
      explicitLimit;
  }

  plan.direction =
    detectDirection(
      question
    );

  /*
   * Questions containing "count", "number of", or "most"
   * are grouped rankings, even when Groq mistakenly returns
   * rank_rows.
   */
  const inferredAggregation =
    detectAggregation(
      question
    );

  if (
    inferredAggregation ===
      "count" &&
    plan.operation ===
      "rank_rows"
  ) {
    plan.operation =
      "rank_groups";
  }

  if (
    plan.operation ===
    "rank_groups"
  ) {
    plan.aggregation =
      ["sum", "average", "count"].includes(
        plan.aggregation
      )
        ? plan.aggregation
        : inferredAggregation;

    const currentGroup =
      plan.labelColumn ||
      plan.groupBy;

    let groupMatch =
      resolveColumnAcrossSchema({
        datasets,
        requested:
          currentGroup,
        preferredDataset:
          plan.dataset,
      });

    /*
     * If Groq omitted or confused the grouping field,
     * use the first explicitly mentioned text field.
     */
    if (!groupMatch) {
      groupMatch =
        mentioned.find(
          (item) =>
            item.type !==
            "number"
        ) || null;
    }

    if (groupMatch) {
      plan.groupBy =
        groupMatch.name;
      plan.labelColumn =
        groupMatch.name;
      plan.dataset =
        groupMatch.dataset;
    }

    let metricMatch =
      resolveColumnAcrossSchema({
        datasets,
        requested:
          plan.column,
      });

    /*
     * A common bad plan is:
     *
     * groupBy = Municipality
     * column  = Municipality
     *
     * for:
     * "top 5 municipalities by count of commodities"
     *
     * For count rankings, choose a different explicitly
     * mentioned field as the counted column.
     */
    if (
      plan.aggregation ===
        "count" &&
      (
        !metricMatch ||
        sameName(
          metricMatch.name,
          plan.groupBy
        )
      )
    ) {
      metricMatch =
        mentioned.find(
          (item) =>
            !sameName(
              item.name,
              plan.groupBy
            )
        ) || null;
    }

    if (!groupMatch) {
      return {
        route: "clarify",
        confidence: 1,
        question:
          "Which field should I rank or group?",
      };
    }

    if (!metricMatch) {
      return {
        route: "clarify",
        confidence: 1,
        question:
          `Which field should I ${
            plan.aggregation ===
              "count"
              ? "count"
              : "use as the metric"
          } for each ${plan.groupBy}?`,
      };
    }

    plan.column =
      metricMatch.name;

    return plan;
  }

  /*
   * rank_rows requires a numeric metric.
   */
  const metricMatch =
    resolveColumnAcrossSchema({
      datasets,
      requested:
        plan.column,
      preferredDataset:
        plan.dataset,
    });

  const labelMatch =
    resolveColumnAcrossSchema({
      datasets,
      requested:
        plan.labelColumn ||
        plan.groupBy,
      preferredDataset:
        plan.dataset,
    });

  if (!metricMatch) {
    return {
      route: "clarify",
      confidence: 1,
      question:
        "Which numeric field should I use for the ranking?",
    };
  }

  if (!labelMatch) {
    return {
      route: "clarify",
      confidence: 1,
      question:
        "Which field should label the ranked results?",
    };
  }

  plan.column =
    metricMatch.name;
  plan.labelColumn =
    labelMatch.name;
  plan.groupBy =
    labelMatch.name;
  plan.dataset =
    labelMatch.dataset;

  return plan;
}

function validateAndRepairPlan({
  rawPlan,
  datasets,
  schema,
  question,
}) {
  if (
    !rawPlan ||
    typeof rawPlan !==
      "object"
  ) {
    throw new Error(
      "The query planner returned an invalid plan."
    );
  }

  const plan = {
    ...rawPlan,
  };

  if (
    ![
      "dataset",
      "schema",
      "general",
      "clarify",
    ].includes(plan.route)
  ) {
    throw new Error(
      `Unsupported query route: ${String(
        plan.route ||
          "unknown"
      )}`
    );
  }

  if (
    plan.route !==
    "dataset"
  ) {
    return plan;
  }

  plan.operation =
    String(
      plan.operation || ""
    )
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");

  if (
    !DATASET_OPERATIONS.has(
      plan.operation
    )
  ) {
    throw new Error(
      `Unsupported dataset operation: ${plan.operation || "unknown"}`
    );
  }

  plan.filters =
    normalizeFilters(
      plan.filters
    );

  plan.selectColumns =
    Array.isArray(
      plan.selectColumns
    )
      ? plan.selectColumns
          .map(
            (item) =>
              String(
                item || ""
              ).trim()
          )
          .filter(Boolean)
      : [];

  const explicitLimit =
    detectExplicitLimit(
      question
    );

  const parsedLimit =
    Number(plan.limit);

  plan.limit =
    explicitLimit ||
    (
      Number.isInteger(
        parsedLimit
      ) &&
      parsedLimit > 0
        ? Math.min(
            parsedLimit,
            100
          )
        : 10
    );

  /*
   * Resolve worksheet names against the actual loaded datasets.
   */
  const resolvedDataset =
    resolveDataset(
      datasets,
      plan.dataset
    );

  if (resolvedDataset) {
    plan.dataset =
      resolvedDataset;
  }

  /*
   * Resolve output fields against the live schema.
   */
  if (plan.column) {
    const match =
      resolveColumnAcrossSchema({
        datasets,
        requested:
          plan.column,
        preferredDataset:
          plan.dataset,
      });

    if (match) {
      plan.column =
        match.name;
    }
  }

  if (plan.groupBy) {
    const match =
      resolveColumnAcrossSchema({
        datasets,
        requested:
          plan.groupBy,
        preferredDataset:
          plan.dataset,
      });

    if (match) {
      plan.groupBy =
        match.name;
    }
  }

  if (plan.labelColumn) {
    const match =
      resolveColumnAcrossSchema({
        datasets,
        requested:
          plan.labelColumn,
        preferredDataset:
          plan.dataset,
      });

    if (match) {
      plan.labelColumn =
        match.name;
    }
  }

  const resolvedSelectColumns = [];

  for (
    const requested of
    plan.selectColumns
  ) {
    const match =
      resolveColumnAcrossSchema({
        datasets,
        requested,
        preferredDataset:
          plan.dataset,
      });

    if (
      match &&
      !resolvedSelectColumns.some(
        (item) =>
          sameName(
            item,
            match.name
          )
      )
    ) {
      resolvedSelectColumns.push(
        match.name
      );
    }
  }

  plan.selectColumns =
    resolvedSelectColumns;

  const repairedRanking =
    repairRankingPlan({
      plan,
      datasets,
      schema,
      question,
    });

  if (
    repairedRanking.route ===
    "clarify"
  ) {
    return repairedRanking;
  }

  addLiveFilterWhenMissing({
    plan:
      repairedRanking,
    datasets,
    question,
  });

  /*
   * Natural list requests return all matching values unless the
   * user explicitly requested a number.
   */
  if (
    repairedRanking.operation ===
    "list"
  ) {
    repairedRanking.showAll =
      explicitLimit === null;
  }

  if (
    repairedRanking.operation ===
      "lookup" &&
    repairedRanking.selectColumns
      .length > 0
  ) {
    repairedRanking.outputRequested =
      true;
  }

  /*
   * Prevent Groq from routing an obvious dataset request to
   * "general". This check occurs here for dataset routes, while
   * the caller handles general-route rejection separately.
   */
  return repairedRanking;
}

function looksLikeDatasetQuestion({
  question,
  schema,
  datasets,
}) {
  const mentionedColumns =
    findMentionedColumns(
      question,
      schema
    );

  const valueMatches =
    inferDatasetValueFilters(
      datasets,
      question
    );

  return (
    mentionedColumns.length > 0 ||
    valueMatches.length > 0
  );
}

/**
 * Main chatbot entry point.
 *
 * GROQ-FIRST, VALIDATED, DATA-SAFE ARCHITECTURE
 * ---------------------------------------------
 * 1. Groq interprets flexible natural-language wording.
 * 2. The plan is checked and repaired against the LIVE schema.
 * 3. JavaScript executes the plan using CURRENT worksheet rows.
 * 4. Groq never calculates or invents dataset results.
 * 5. The local parser remains available as a fallback.
 */
async function answerQuestion(
  input,
  question
) {
  const cleanQuestion =
    String(
      question || ""
    ).trim();

  if (!cleanQuestion) {
    return {
      success: false,
      source: "system",
      answer:
        "Please enter a question.",
    };
  }

  const datasets =
    normalizeDatasets(input);

  if (
    !Object.keys(
      datasets
    ).length
  ) {
    return {
      success: false,
      source: "system",
      answer:
        "No usable worksheet data is currently available.",
    };
  }

  const schema =
    buildSchema(datasets);

  const executeResolvedPlan =
    async (rawPlan) => {
      const plan =
        validateAndRepairPlan({
          rawPlan,
          datasets,
          schema,
          question:
            cleanQuestion,
        });

      if (
        plan.route ===
        "schema"
      ) {
        return answerSchemaQuestion({
          datasets,
          schema,
          plan,
          question:
            cleanQuestion,
        });
      }

      if (
        plan.route ===
        "dataset"
      ) {
        return executePlan({
          datasets,
          schema,
          plan,
          question:
            cleanQuestion,
        });
      }

      if (
        plan.route ===
        "general"
      ) {
        /*
         * Do not allow a schema/data question to escape to a
         * general-language answer.
         */
        if (
          looksLikeDatasetQuestion({
            question:
              cleanQuestion,
            schema,
            datasets,
          })
        ) {
          throw new Error(
            "The planner routed a dataset question as a general question."
          );
        }

        return await answerGeneralQuestion({
          question:
            cleanQuestion,
          schema,
        });
      }

      if (
        plan.route ===
        "clarify"
      ) {
        return {
          success: false,
          source: "router",
          operation:
            "clarify",
          answer:
            plan.question ||
            "Please clarify which worksheet, field, or calculation you want.",
        };
      }

      throw new Error(
        `Unsupported query route: ${String(
          plan.route ||
            "unknown"
        )}`
      );
    };

  // ==========================================================
  // 1. GROQ FIRST
  // ==========================================================

  try {
    const groqPlan =
      await createSchemaAwarePlan({
        question:
          cleanQuestion,
        schema,
      });

    if (
      process.env.NODE_ENV !==
      "production"
    ) {
      console.log(
        "Raw Groq plan:",
        JSON.stringify(
          groqPlan,
          null,
          2
        )
      );
    }

    const result =
      await executeResolvedPlan(
        groqPlan
      );

    return result;
  } catch (groqError) {
    console.error(
      "Groq plan failed validation or execution; using local fallback:",
      groqError
    );
  }

  // ==========================================================
  // 2. LOCAL PARSER FALLBACK
  // ==========================================================

  try {
    const localPlan =
      await createPlan({
        question:
          cleanQuestion,
        schema,
        datasets,
      });

    if (
      process.env.NODE_ENV !==
      "production"
    ) {
      console.log(
        "Raw local fallback plan:",
        JSON.stringify(
          localPlan,
          null,
          2
        )
      );
    }

    return await executeResolvedPlan(
      localPlan
    );
  } catch (localError) {
    console.error(
      "Local chatbot fallback failed:",
      localError
    );

    return {
      success: false,
      source: "system",
      operation: "error",
      answer:
        localError.message ||
        "The chatbot could not safely interpret that question.",
    };
  }
}

module.exports = {
  answerQuestion,
};
