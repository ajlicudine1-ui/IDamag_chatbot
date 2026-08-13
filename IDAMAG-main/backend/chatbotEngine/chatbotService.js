const { buildSchema } = require("./schemaBuilder");
const { createPlan } = require("./intentParser");
const { executePlan } = require("./calculationEngine");
const { answerSchemaQuestion } = require("./schemaEngine");

const {
  answerGeneralQuestion,
  createSchemaAwarePlan,
} = require("./groqService");

const { normalizeDatasets } = require("./utils");

const {
  getRelevantContext,
  updateConversation,
} = require("./conversationManager");

const {
  normalizeQuestion,
} = require("./questionNormalizer");

const {
  validateQueryPlan,
} = require("./queryValidator");

/**
 * Main chatbot entry point.
 *
 * GROQ-FIRST, DATA-SAFE ARCHITECTURE
 * ----------------------------------
 * 1. Groq interprets flexible natural-language wording using the live schema.
 * 2. Conversation context is supplied for follow-up questions.
 * 3. JavaScript validates and executes the structured plan using CURRENT rows.
 * 4. Groq never calculates, filters, joins, ranks, or invents dataset answers.
 * 5. If Groq is unavailable or returns a bad plan, the local parser is used.
 */
async function answerQuestion(
  input,
  question,
  sessionId = "default"
) {
  const originalQuestion = String(
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
      answer: "Please enter a question.",
    };
  }

  const datasets =
    normalizeDatasets(input);

  if (!Object.keys(datasets).length) {
    return {
      success: false,
      source: "system",
      answer:
        "No usable worksheet data is currently available.",
    };
  }

  const schema =
    buildSchema(datasets);

  /**
   * Previous conversation information.
   *
   * Example:
   *
   * User:
   * "What is the planting month of Aaron?"
   *
   * Next question:
   * "How about his expected yield?"
   *
   * Context may contain:
   *
   * {
   *   lastEntity: {
   *     column: "Farmer",
   *     value: "Aaron"
   *   },
   *   lastDataset: "farmer_details",
   *   lastMetric: "Planting Month"
   * }
   */
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

  // ==========================================================
  // EXECUTE A RESOLVED PLAN
  // ==========================================================

  const executeResolvedPlan =
    async (plan) => {
      if (
        !plan ||
        typeof plan !== "object"
      ) {
        throw new Error(
          "The query planner returned an invalid plan."
        );
      }
      const validation =
        validateQueryPlan({
          datasets,
          schema,
          plan,
        });

      if (!validation.valid) {
        throw new Error(
          validation.message
        );
      }

      plan = validation.plan;
      
      let result;

      // --------------------------------------------------------
      // SCHEMA QUESTION
      // --------------------------------------------------------

      if (
        plan.route === "schema"
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

      // --------------------------------------------------------
      // DATASET QUESTION
      // --------------------------------------------------------

      else if (
        plan.route === "dataset"
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

      // --------------------------------------------------------
      // GENERAL QUESTION
      // --------------------------------------------------------

      else if (
        plan.route === "general"
      ) {
        result =
          await answerGeneralQuestion({
            question:
              cleanQuestion,
            schema,
          });
      }

      // --------------------------------------------------------
      // CLARIFICATION
      // --------------------------------------------------------

      else if (
        plan.route === "clarify"
      ) {
        result = {
          success: false,
          source: "router",
          operation:
            "clarify",
          answer:
            plan.question ||
            "Please clarify which worksheet, field, or calculation you want.",
        };
      }

      // --------------------------------------------------------
      // UNKNOWN ROUTE
      // --------------------------------------------------------

      else {
        throw new Error(
          `Unsupported query route: ${String(
            plan.route ||
              "unknown"
          )}`
        );
      }

      /**
       * Save conversation state only when
       * we received a usable result.
       *
       * We intentionally do not overwrite
       * context after a clarification question.
       */
      if (
        result &&
        plan.route !== "clarify"
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

      return result;
    };

  // ==========================================================
  // 1. GROQ FIRST
  // ==========================================================

  let groqPlan = null;

  try {
    groqPlan =
      await createSchemaAwarePlan({
        question:
          cleanQuestion,

        schema,

        /**
         * NEW:
         * Groq now receives previous
         * conversational context.
         *
         * groqService.js will be updated
         * in the next small change to
         * actually use this property.
         */
        context:
          conversationContext,
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

        /**
         * Pass conversation context here
         * as well.
         *
         * Your current intentParser may
         * ignore it for now. That is fine.
         */
        context:
          conversationContext,
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
      source: "system",
      operation: "error",
      answer:
        localError.message ||
        "The chatbot could not process the question.",
    };
  }
}

module.exports = {
  answerQuestion,
};