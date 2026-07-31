const { buildSchema } = require("./schemaBuilder");
const { createPlan } = require("./intentParser");
const { executePlan } = require("./calculationEngine");
const { answerSchemaQuestion } = require("./schemaEngine");
const {
  answerGeneralQuestion,
  createSchemaAwarePlan,
} = require("./groqService");
const { normalizeDatasets } = require("./utils");

/**
 * Main chatbot entry point.
 *
 * LOCAL-FIRST ARCHITECTURE
 * ------------------------
 * 1. Local parser handles dataset/schema questions first.
 * 2. JavaScript reads CURRENT worksheet rows and executes the plan.
 * 3. Groq is used only when the local parser cannot confidently
 *    resolve the request, or for general-language questions.
 * 4. Exact dataset values are always calculated/read by JavaScript.
 */
async function answerQuestion(input, question) {
  const cleanQuestion = String(question || "").trim();

  if (!cleanQuestion) {
    return {
      success: false,
      source: "system",
      answer: "Please enter a question.",
    };
  }

  const datasets = normalizeDatasets(input);

  if (!Object.keys(datasets).length) {
    return {
      success: false,
      source: "system",
      answer:
        "No usable worksheet data is currently available.",
    };
  }

  const schema = buildSchema(datasets);

  // ============================================================
  // EXECUTE A RESOLVED PLAN
  // ============================================================

  const executeResolvedPlan = async (plan) => {
    if (!plan || typeof plan !== "object") {
      throw new Error(
        "The query planner returned an invalid plan."
      );
    }

    if (plan.route === "schema") {
      return answerSchemaQuestion({
        datasets,
        schema,
        plan,
        question: cleanQuestion,
      });
    }

    if (plan.route === "dataset") {
      return executePlan({
        datasets,
        schema,
        plan,
        question: cleanQuestion,
      });
    }

    if (plan.route === "general") {
      return await answerGeneralQuestion({
        question: cleanQuestion,
        schema,
      });
    }

    if (plan.route === "clarify") {
      return {
        success: false,
        source: "router",
        operation: "clarify",
        answer:
          plan.question ||
          "Please clarify which worksheet, field, or calculation you want.",
      };
    }

    throw new Error(
      `Unsupported query route: ${String(
        plan.route || "unknown"
      )}`
    );
  };

  // ============================================================
  // 1. LOCAL PARSER FIRST
  // ============================================================

  let localPlan = null;

  try {
    localPlan = await createPlan({
      question: cleanQuestion,
      schema,
      datasets,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log(
        "Chatbot local plan:",
        JSON.stringify(
          localPlan,
          null,
          2
        )
      );
    }

    // ----------------------------------------------------------
    // DATASET QUESTIONS
    // ----------------------------------------------------------
    //
    // IMPORTANT:
    // Execute dataset requests immediately.
    //
    // Examples:
    //
    // "planting month of 1001"
    //
    // "fertilizer used by Maria Santos"
    //
    // "municipality with registration number CN201708932
    //  and commodities"
    //
    // These should NOT go through Groq first.
    //
    if (
      localPlan?.route ===
      "dataset"
    ) {
      return await executeResolvedPlan(
        localPlan
      );
    }

    // ----------------------------------------------------------
    // SCHEMA QUESTIONS
    // ----------------------------------------------------------

    if (
      localPlan?.route ===
      "schema"
    ) {
      return await executeResolvedPlan(
        localPlan
      );
    }

    // ----------------------------------------------------------
    // CLEAR CLARIFICATION
    // ----------------------------------------------------------

    if (
      localPlan?.route ===
        "clarify" &&
      Number(
        localPlan?.confidence ||
          0
      ) >= 0.7
    ) {
      return await executeResolvedPlan(
        localPlan
      );
    }
  } catch (localError) {
    console.error(
      "Local chatbot planning failed:",
      localError
    );
  }

  // ============================================================
  // 2. GROQ FALLBACK
  // ============================================================
  //
  // Groq is now used only when the local parser did not
  // confidently resolve the question.
  //
  // Examples:
  //
  // - grammar
  // - translation
  // - narrative writing
  // - explanations
  // - general knowledge
  //
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
        "Chatbot Groq fallback plan:",
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
      "Groq fallback failed:",
      groqError
    );

    // ==========================================================
    // 3. FINAL LOCAL RETRY
    // ==========================================================
    //
    // This allows exact dataset questions to keep working
    // even if Groq has:
    //
    // - invalid API key
    // - temporary outage
    // - malformed response
    //
    try {
      const retryPlan =
        localPlan ||
        (await createPlan({
          question:
            cleanQuestion,
          schema,
          datasets,
        }));

      if (
        retryPlan?.route ===
          "dataset" ||
        retryPlan?.route ===
          "schema" ||
        retryPlan?.route ===
          "clarify"
      ) {
        return await executeResolvedPlan(
          retryPlan
        );
      }

      return {
        success: false,
        source: "system",
        operation: "error",
        answer:
          "I could not confidently interpret that request using the local dataset engine.",
      };
    } catch (localError) {
      console.error(
        "Final local chatbot fallback failed:",
        localError
      );

      return {
        success: false,
        source: "system",
        operation: "error",
        answer:
          localError.message ||
          groqError.message ||
          "The chatbot could not process the question.",
      };
    }
  }
}

module.exports = {
  answerQuestion,
};