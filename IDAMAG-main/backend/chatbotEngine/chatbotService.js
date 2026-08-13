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