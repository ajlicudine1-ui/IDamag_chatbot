const {
  buildSchema,
} = require("./schemaBuilder");

const {
  createPlan,
} = require("./intentParser");

const {
  executePlan,
} = require("./calculationEngine");

const {
  answerSchemaQuestion,
} = require("./schemaEngine");

const {
  answerGeneralQuestion,
  createSchemaAwarePlan,
} = require("./groqService");

const {
  normalizeDatasets,
  normalizeText,
} = require("./utils");

const {
  getRelevantContext,
  updateConversation,
  getRecentResults,
} = require("./conversationManager");

const {
  normalizeQuestion,
} = require("./questionNormalizer");

const {
  validateQueryPlan,
} = require("./queryValidator");

const {
  validateResult,
} = require("./resultValidator");

const {
  generateNaturalResponse,
} = require("./responseGenerator");

const {
  resolvePlanEntities,
} = require("./entityResolver");

const {
  compareVerifiedResults,
} = require("./comparisonEngine");

const {
  inferValueFilters,
} = require("./filterEngine");

/**
 * ==========================================================
 * APPLY CONVERSATION CONTEXT
 * ==========================================================
 *
 * Allows follow-up questions such as:
 *
 * "What is the salary of Roberto?"
 * "What is his position?"
 *
 * or:
 *
 * "What is Roberto's position?"
 * "What about Vener?"
 */
function applyConversationContext(
  plan,
  context
) {
  if (
    !plan ||
    typeof plan !== "object" ||
    !context ||
    context.isFollowUp !== true
  ) {
    return plan;
  }

  const resolvedPlan = {
    ...plan,

    filters:
      Array.isArray(
        plan.filters
      )
        ? [
            ...plan.filters,
          ]
        : [],

    selectColumns:
      Array.isArray(
        plan.selectColumns
      )
        ? [
            ...plan.selectColumns,
          ]
        : [],
  };

  // ========================================================
  // 1. INHERIT LAST ENTITY
  // ========================================================
  //
  // Previous:
  // Roberto Perales
  //
  // Current:
  // "What is his position title?"
  //
  // If the current plan does not already contain the
  // entity column, inherit Roberto.
  //

  if (
    resolvedPlan.route ===
      "dataset" &&
    context.lastEntity
  ) {
    const entityColumn =
      context.lastEntity.column;

    const alreadyHasEntity =
      resolvedPlan.filters.some(
        (filter) =>
          String(
            filter?.column || ""
          )
            .trim()
            .toLowerCase() ===
          String(
            entityColumn || ""
          )
            .trim()
            .toLowerCase()
      );

    if (!alreadyHasEntity) {
      resolvedPlan.filters.push({
        column:
          context.lastEntity.column,

        operator:
          context.lastEntity
            .operator ||
          "equals",

        value:
          context.lastEntity.value,
      });
    }
  }

  // ========================================================
  // 2. INHERIT PREVIOUS OUTPUT FIELD
  // ========================================================
  //
  // Previous:
  // "What is Roberto's position title?"
  //
  // Current:
  // "What about Vener?"
  //
  // New entity:
  // Vener
  //
  // Previous output:
  // POSITION TITLE
  //

  if (
    resolvedPlan.route ===
      "dataset" &&
    resolvedPlan.operation ===
      "lookup" &&
    resolvedPlan.selectColumns
      .length === 0 &&
    context.lastMetric
  ) {
    if (
      Array.isArray(
        context.lastMetric
      )
    ) {
      resolvedPlan.selectColumns = [
        ...context.lastMetric,
      ];
    } else {
      resolvedPlan.selectColumns = [
        context.lastMetric,
      ];
    }

    resolvedPlan.outputRequested =
      true;
  }

  // ========================================================
  // 3. INHERIT PREVIOUS OPERATION
  // ========================================================
  //
  // Example:
  //
  // "What is the total production of Ilocos Norte?"
  // "How about Ilocos Sur?"
  //
  // The second question may inherit SUM.
  //

  if (
    resolvedPlan.route ===
      "dataset" &&
    (
      !resolvedPlan.operation ||
      resolvedPlan.operation ===
        "lookup"
    ) &&
    context.lastIntent &&
    context.lastIntent !==
      "general"
  ) {
    if (
      resolvedPlan.selectColumns
        .length === 0
    ) {
      resolvedPlan.operation =
        context.lastIntent;
    }
  }

  return resolvedPlan;
}


/**
 * ==========================================================
 * REPAIR MULTI-ENTITY FILTERS
 * ==========================================================
 *
 * This is fully dynamic.
 *
 * It does NOT hardcode:
 * - names
 * - divisions
 * - provinces
 * - municipalities
 * - worksheet names
 * - column names
 *
 * It scans the current selected worksheet for actual values
 * mentioned in the user's question.
 *
 * Example runtime behavior:
 *
 * Planner:
 *   LAST NAME = PERALES
 *
 * Question also contains another real LAST NAME value.
 *
 * JavaScript may safely upgrade this to:
 *
 *   LAST NAME IN [value1, value2]
 *
 * The actual column and values are discovered from the live
 * worksheet, not written into this code.
 */
function getUniqueColumnValues(
  rows,
  column
) {
  const values = [];
  const seen = new Set();

  for (const row of rows || []) {
    const raw =
      row?.[column];

    if (
      raw === null ||
      raw === undefined
    ) {
      continue;
    }

    const display =
      String(raw).trim();

    const key =
      normalizeText(display);

    if (
      !display ||
      !key ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    values.push(display);
  }

  return values;
}

function tokenSimilarity(
  left,
  right
) {
  const a =
    normalizeText(left);

  const b =
    normalizeText(right);

  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  if (
    a.includes(b) ||
    b.includes(a)
  ) {
    return 0.95;
  }

  const aTokens =
    a.split(/\s+/)
      .filter(Boolean);

  const bTokens =
    b.split(/\s+/)
      .filter(Boolean);

  const aSet =
    new Set(aTokens);

  const bSet =
    new Set(bTokens);

  let overlap = 0;

  for (const token of aSet) {
    if (bSet.has(token)) {
      overlap += 1;
    }
  }

  const denominator =
    Math.max(
      aSet.size,
      bSet.size,
      1
    );

  return overlap / denominator;
}

function questionContainsValue(
  question,
  value
) {
  const q =
    normalizeText(question);

  const v =
    normalizeText(value);

  if (!q || !v) {
    return false;
  }

  if (q.includes(v)) {
    return true;
  }

  const tokens =
    v.split(/\s+/)
      .filter(
        (token) =>
          token.length >= 3
      );

  if (!tokens.length) {
    return false;
  }

  return tokens.every(
    (token) =>
      q.includes(token)
  );
}

function collectQuestionMatchesForColumn({
  rows,
  column,
  question,
  seedValues = [],
}) {
  const actualValues =
    getUniqueColumnValues(
      rows,
      column
    );

  if (!actualValues.length) {
    return [];
  }

  const selected = [];
  const selectedKeys =
    new Set();

  const addValue =
    (value) => {
      const key =
        normalizeText(value);

      if (
        !key ||
        selectedKeys.has(key)
      ) {
        return;
      }

      selectedKeys.add(key);
      selected.push(value);
    };

  /**
   * Preserve values already identified by the planner.
   */
  for (
    const seedValue of
    Array.isArray(seedValues)
      ? seedValues
      : [seedValues]
  ) {
    if (
      seedValue === null ||
      seedValue === undefined ||
      String(seedValue).trim() === ""
    ) {
      continue;
    }

    const exact =
      actualValues.find(
        (candidate) =>
          normalizeText(candidate) ===
          normalizeText(seedValue)
      );

    if (exact) {
      addValue(exact);
      continue;
    }

    let best = null;

    for (const candidate of actualValues) {
      const score =
        tokenSimilarity(
          seedValue,
          candidate
        );

      if (
        !best ||
        score > best.score
      ) {
        best = {
          value:
            candidate,
          score,
        };
      }
    }

    if (
      best &&
      best.score >= 0.75
    ) {
      addValue(
        best.value
      );
    }
  }

  /**
   * Dynamically find every actual value from this column that
   * appears in the user's question.
   */
  for (
    const candidate of
    actualValues
  ) {
    if (
      questionContainsValue(
        question,
        candidate
      )
    ) {
      addValue(candidate);
    }
  }

  return selected;
}

/**
 * ==========================================================
 * REPAIR MULTI-ENTITY FILTERS
 * ==========================================================
 *
 * Fully dynamic:
 *
 * - no employee names are hardcoded
 * - no LAST NAME column is hardcoded
 * - no division/province/municipality is hardcoded
 * - no worksheet name is hardcoded
 *
 * The planner's existing filter tells us which column is
 * acting as the entity column. We then scan the ACTUAL values
 * of that column and recover any additional values explicitly
 * present in the user's question.
 */
function repairMultiEntityFilters({
  datasets,
  plan,
  question,
}) {
  if (
    !plan ||
    plan.route !== "dataset" ||
    !plan.dataset
  ) {
    return plan;
  }

  const rows =
    datasets?.[plan.dataset];

  if (
    !Array.isArray(rows) ||
    !rows.length
  ) {
    return plan;
  }

  const currentFilters =
    Array.isArray(
      plan.filters
    )
      ? plan.filters.map(
          (filter) => ({
            ...filter,

            value:
              Array.isArray(
                filter?.value
              )
                ? [...filter.value]
                : filter?.value,
          })
        )
      : [];

  /**
   * Keep the existing exact inference as an additional source.
   */
  const inferred =
    inferValueFilters(
      rows,
      question,
      []
    );

  let repaired = false;

  const repairedFilters =
    currentFilters.map(
      (filter) => {
        if (
          !filter ||
          !filter.column
        ) {
          return filter;
        }

        const operator =
          String(
            filter.operator ||
              "equals"
          )
            .trim()
            .toLowerCase();

        if (
          operator !== "equals" &&
          operator !== "in"
        ) {
          return filter;
        }

        const seedValues =
          Array.isArray(
            filter.value
          )
            ? filter.value
            : [filter.value];

        const matches =
          collectQuestionMatchesForColumn({
            rows,

            column:
              filter.column,

            question,

            seedValues,
          });

        /**
         * Also merge any values found by inferValueFilters()
         * for this same dynamically selected column.
         */
        const inferredSameColumn =
          (Array.isArray(inferred)
            ? inferred
            : []
          ).filter(
            (candidate) =>
              candidate &&
              normalizeText(
                candidate.column
              ) ===
                normalizeText(
                  filter.column
                )
          );

        for (
          const candidate of
          inferredSameColumn
        ) {
          const values =
            Array.isArray(
              candidate.value
            )
              ? candidate.value
              : [candidate.value];

          for (const value of values) {
            if (
              value === null ||
              value === undefined ||
              String(value).trim() === ""
            ) {
              continue;
            }

            if (
              !matches.some(
                (existing) =>
                  normalizeText(
                    existing
                  ) ===
                  normalizeText(
                    value
                  )
              )
            ) {
              matches.push(value);
            }
          }
        }

        if (
          matches.length <= 1
        ) {
          return filter;
        }

        repaired = true;

        return {
          ...filter,

          operator:
            "in",

          value:
            matches,
        };
      }
    );

  /**
   * If the planner produced no filter at all, retain the
   * previous generic inference behavior only when one
   * unambiguous multi-value column is discovered.
   */
  if (
    currentFilters.length === 0 &&
    Array.isArray(inferred)
  ) {
    const multiCandidates =
      inferred.filter(
        (candidate) =>
          candidate &&
          candidate.column &&
          String(
            candidate.operator || ""
          )
            .trim()
            .toLowerCase() === "in" &&
          Array.isArray(
            candidate.value
          ) &&
          candidate.value.length > 1
      );

    if (
      multiCandidates.length === 1
    ) {
      repaired = true;

      repairedFilters.push({
        column:
          multiCandidates[0].column,

        operator:
          "in",

        value: [
          ...multiCandidates[0].value,
        ],
      });
    }
  }

  if (!repaired) {
    return plan;
  }

  return {
    ...plan,

    filters:
      repairedFilters,

    showAll:
      plan.operation === "lookup"
        ? true
        : plan.showAll,
  };
}

/**
 * ==========================================================
 * STEP 10 — DETECT ANALYTICAL COMPARISONS
 * ==========================================================
 *
 * Examples:
 *
 * "Who has the higher salary?"
 * "Which one is lower?"
 * "What is the difference?"
 * "Compare them."
 *
 * This does NOT perform calculations.
 *
 * It only determines which comparison operation
 * JavaScript should execute.
 */
function detectComparisonRequest(
  question
) {
  const text = String(
    question || ""
  )
    .toLowerCase()
    .trim();

  if (!text) {
    return null;
  }

  // ========================================================
  // DIFFERENCE
  // ========================================================

  if (
    /\b(?:what(?:'s| is) )?(?:the )?difference\b/i.test(
      text
    ) ||
    /\bhow much (?:more|less|higher|lower)\b/i.test(
      text
    )
  ) {
    return "difference";
  }

  // ========================================================
  // LOWER
  // ========================================================

  if (
    /\bwhich (?:one )?is (?:the )?lower\b/i.test(
      text
    ) ||
    /\bwho (?:has|have) (?:the )?lower\b/i.test(
      text
    ) ||
    /\bwhich (?:one )?has (?:the )?lower\b/i.test(
      text
    )
  ) {
    return "lower";
  }

  // ========================================================
  // HIGHER
  // ========================================================

  if (
    /\bwhich (?:one )?is (?:the )?higher\b/i.test(
      text
    ) ||
    /\bwho (?:has|have) (?:the )?higher\b/i.test(
      text
    ) ||
    /\bwhich (?:one )?has (?:the )?higher\b/i.test(
      text
    )
  ) {
    return "higher";
  }

  // ========================================================
  // GENERIC COMPARISON
  // ========================================================

  if (
    /\bcompare (?:them|those|the two)\b/i.test(
      text
    )
  ) {
    return "higher";
  }

  return null;
}

/**
 * ==========================================================
 * MAIN CHATBOT ENTRY POINT
 * ==========================================================
 *
 * GROQ-FIRST, DATA-SAFE ARCHITECTURE
 *
 * 1. Normalize question.
 * 2. Load current datasets.
 * 3. Retrieve conversation context.
 * 4. Handle analytical comparison follow-ups.
 * 5. Groq interprets natural language.
 * 6. JavaScript applies conversation context.
 * 7. Query Validator validates the plan.
 * 8. Entity Resolver resolves real dataset values.
 * 9. JavaScript executes the plan.
 * 10. Result Validator verifies the result.
 * 11. Verified result is saved to conversation memory.
 * 12. Natural Response Generator improves wording.
 *
 * Groq never performs dataset calculations.
 */
async function answerQuestion(
  input,
  question,
  sessionId = "default"
) {
  const originalQuestion =
    String(
      question || ""
    ).trim();

  const cleanQuestion =
    normalizeQuestion(
      originalQuestion
    );

  if (!cleanQuestion) {
    return {
      success: false,
      source: "system",
      answer:
        "Please enter a question.",
    };
  }

  // ========================================================
  // NORMALIZE ALL CURRENT DATASETS
  // ========================================================

  const datasets =
    normalizeDatasets(
      input
    );

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

  // ========================================================
  // BUILD LIVE SCHEMA
  // ========================================================

  const schema =
    buildSchema(
      datasets
    );

  // ========================================================
  // LOAD CONVERSATION CONTEXT
  // ========================================================

  const conversationContext =
    getRelevantContext(
      sessionId,
      cleanQuestion
    );

  if (
    process.env.NODE_ENV !==
      "production"
  ) {
    console.log(
      "Chatbot conversation context:",
      JSON.stringify(
        conversationContext,
        null,
        2
      )
    );
  }

  // ========================================================
  // STEP 10 — ANALYTICAL COMPARISON FOLLOW-UPS
  // ========================================================
  //
  // These questions should NOT be sent through the normal
  // dataset planner because they refer to already verified
  // previous results.
  //
  // Example:
  //
  // User:
  // "What is Roberto's salary?"
  //
  // User:
  // "What is Vener's salary?"
  //
  // User:
  // "Who has the higher salary?"
  //
  // We compare the previous VERIFIED JavaScript results.
  //

  const comparisonMode =
    detectComparisonRequest(
      cleanQuestion
    );

  if (comparisonMode) {
    const recentResults =
      getRecentResults(
        sessionId
      );

    if (
      process.env.NODE_ENV !==
        "production"
    ) {
      console.log(
        "Chatbot comparison history:",
        JSON.stringify(
          recentResults,
          null,
          2
        )
      );
    }

    // ======================================================
    // REQUIRE TWO VERIFIED RESULTS
    // ======================================================

    if (
      recentResults.length <
      2
    ) {
      return {
        success: false,
        source:
          "comparison",
        operation:
          "clarify",
        answer:
          "I need two previous results before I can compare them.",
      };
    }

    /**
     * Compare the two most recent verified results.
     */
    const left =
      recentResults[
        recentResults.length -
          2
      ];

    const right =
      recentResults[
        recentResults.length -
          1
      ];

    const comparisonResult =
      compareVerifiedResults({
        left,
        right,
        mode:
          comparisonMode,
      });

    if (
      process.env.NODE_ENV !==
        "production"
    ) {
      console.log(
        "Chatbot comparison result:",
        JSON.stringify(
          comparisonResult,
          null,
          2
        )
      );
    }

    /**
     * Comparison Engine performs all arithmetic.
     *
     * Do NOT ask Groq to recalculate this result.
     */
    return comparisonResult;
  }

  // ========================================================
  // EXECUTE A RESOLVED QUERY PLAN
  // ========================================================

  const executeResolvedPlan =
    async (plan) => {
      if (
        !plan ||
        typeof plan !==
          "object"
      ) {
        throw new Error(
          "The query planner returned an invalid plan."
        );
      }

      // ====================================================
      // QUERY VALIDATOR
      // ====================================================

      const validation =
        validateQueryPlan({
          datasets,
          schema,
          plan,
        });

      if (
        !validation.valid
      ) {
        throw new Error(
          validation.message
        );
      }

      plan =
        validation.plan;

      // ====================================================
      // STEP 9 — RESOLVE REAL DATASET VALUES
      // ====================================================

      const entityResolution =
        resolvePlanEntities({
          datasets,
          plan,
        });

      plan =
        entityResolution.plan;

      if (
        process.env.NODE_ENV !==
          "production" &&
        entityResolution
          .changes?.length
      ) {
        console.log(
          "Chatbot entity corrections:",
          JSON.stringify(
            entityResolution.changes,
            null,
            2
          )
        );
      }

      let result;

      // ====================================================
      // SCHEMA QUESTION
      // ====================================================

      if (
        plan.route ===
        "schema"
      ) {
        result =
          await answerSchemaQuestion({
            datasets,
            schema,
            plan,

            question:
              cleanQuestion,
          });
      }

      // ====================================================
      // DATASET QUESTION
      // ====================================================

      else if (
        plan.route ===
        "dataset"
      ) {
        result =
          await executePlan({
            datasets,
            schema,
            plan,

            question:
              cleanQuestion,
          });
      }

      // ====================================================
      // GENERAL QUESTION
      // ====================================================

      else if (
        plan.route ===
        "general"
      ) {
        result =
          await answerGeneralQuestion({
            question:
              cleanQuestion,

            schema,
          });
      }

      // ====================================================
      // CLARIFICATION
      // ====================================================

      else if (
        plan.route ===
        "clarify"
      ) {
        result = {
          success: false,

          source:
            "router",

          operation:
            "clarify",

          answer:
            plan.question ||
            "Please clarify which worksheet, field, or calculation you want.",
        };
      }

      // ====================================================
      // UNKNOWN ROUTE
      // ====================================================

      else {
        throw new Error(
          `Unsupported query route: ${String(
            plan.route ||
              "unknown"
          )}`
        );
      }

      // ====================================================
      // STEP 6 — RESULT VALIDATOR
      // ====================================================

      const resultValidation =
        validateResult({
          plan,
          result,
        });

      if (
        !resultValidation.valid
      ) {
        console.error(
          "Chatbot result validation failed:",
          {
            code:
              resultValidation.code,

            message:
              resultValidation.message,

            details:
              resultValidation.details,

            plan,
            result,
          }
        );

        throw new Error(
          resultValidation.message
        );
      }

      result =
        resultValidation.result;

      // ====================================================
      // SAVE VERIFIED CONVERSATION STATE
      // ====================================================
      //
      // IMPORTANT:
      //
      // Save BEFORE natural-response rewriting.
      //
      // This ensures Step 10 stores and compares the
      // verified JavaScript result instead of Groq prose.
      //

      if (
        result &&
        plan.route !==
          "clarify"
      ) {
        updateConversation(
          sessionId,
          {
            question:
              cleanQuestion,

            plan,

            result,
          }
        );
      }

      // ====================================================
      // STEP 7 — NATURAL RESPONSE GENERATOR
      // ====================================================

      if (
        result &&
        result.success !==
          false &&
        plan.route !==
          "clarify"
      ) {
        const naturalAnswer =
          await generateNaturalResponse({
            question:
              cleanQuestion,

            plan,

            result,
          });

        return {
          ...result,

          /**
           * Only presentation is changed.
           *
           * Numeric and structured result properties
           * remain untouched.
           */
          answer:
            naturalAnswer,

          responseStyle:
            "natural",

          /**
           * TEMPORARY DEBUG OUTPUT
           *
           * Remove these after the multi-entity issue is fixed.
           */
          debugPlan:
            plan,

          debugEntityChanges:
            entityResolution.changes || [],
        };
      }

      return {
        ...result,

        /**
         * TEMPORARY DEBUG OUTPUT
         *
         * Remove these after the multi-entity issue is fixed.
         */
        debugPlan:
          plan,

        debugEntityChanges:
          entityResolution.changes || [],
      };
    };

  // ========================================================
  // 1. GROQ FIRST
  // ========================================================
  //
  // Groq interprets flexible language and creates only
  // a structured query plan.
  //
  // JavaScript remains responsible for:
  //
  // - filtering
  // - joining
  // - counting
  // - sums
  // - averages
  // - rankings
  // - comparisons
  //

  let groqPlan = null;

  try {
    groqPlan =
      await createSchemaAwarePlan({
        question:
          cleanQuestion,

        schema,

        context:
          conversationContext,
      });

    // ======================================================
    // APPLY FOLLOW-UP CONTEXT
    // ======================================================

    groqPlan =
      applyConversationContext(
        groqPlan,
        conversationContext
      );

    groqPlan =
      repairMultiEntityFilters({
        datasets,

        plan:
          groqPlan,

        question:
          cleanQuestion,
      });

    if (
      process.env.NODE_ENV !==
        "production"
    ) {
      console.log(
        "Chatbot Groq plan:",
        JSON.stringify(
          groqPlan,
          null,
          2
        )
      );
    }

    return await executeResolvedPlan(
      groqPlan
    );
  } catch (groqError) {
    console.error(
      "Groq planning/execution failed; using local fallback:",
      groqError
    );
  }

  // ========================================================
  // 2. LOCAL PARSER FALLBACK
  // ========================================================
  //
  // Used when:
  //
  // - GROQ_API_KEY is unavailable
  // - Groq request fails
  // - Groq returns malformed JSON
  // - Groq creates an invalid plan
  //

  try {
    let localPlan =
      await createPlan({
        question:
          cleanQuestion,

        schema,

        datasets,

        context:
          conversationContext,
      });

    // ======================================================
    // APPLY SAME FOLLOW-UP CONTEXT TO LOCAL PLAN
    // ======================================================

    localPlan =
      applyConversationContext(
        localPlan,
        conversationContext
      );

    localPlan =
      repairMultiEntityFilters({
        datasets,

        plan:
          localPlan,

        question:
          cleanQuestion,
      });

    if (
      process.env.NODE_ENV !==
        "production"
    ) {
      console.log(
        "Chatbot local fallback plan:",
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

      source:
        "system",

      operation:
        "error",

      answer:
        localError.message ||
        "The chatbot could not process the question.",
    };
  }
}

module.exports = {
  answerQuestion,
};