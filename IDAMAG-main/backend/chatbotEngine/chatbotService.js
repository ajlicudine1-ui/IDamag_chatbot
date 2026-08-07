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
 * GROQ-FIRST, DATA-SAFE ARCHITECTURE
 * ----------------------------------
 * 1. Groq interprets flexible natural-language wording using the live schema
 *    and the currently selected dashboard context.
 * 2. JavaScript validates and executes the structured plan using CURRENT rows.
 * 3. Groq never calculates, filters, joins, ranks, or invents dataset answers.
 * 4. If Groq is unavailable or returns a bad plan, the local parser is used.
 */
async function answerQuestion(
  input,
  question,
  context = {}
) {
  const cleanQuestion = String(
    question || ""
  ).trim();

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

  // ==========================================================
  // EXECUTE A RESOLVED PLAN
  // ==========================================================

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
        context,
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

  // ==========================================================
  // 1. GROQ FIRST — UNDERSTAND FLEXIBLE WORDING
  // ==========================================================

  try {
    const groqPlan = await createSchemaAwarePlan({
      question: cleanQuestion,
      schema,
      context,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log(
        "Chatbot dashboard context:",
        JSON.stringify(context, null, 2)
      );

      console.log(
        "Chatbot Groq plan:",
        JSON.stringify(groqPlan, null, 2)
      );
    }

    return await executeResolvedPlan(groqPlan);
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
    const localPlan = await createPlan({
      question: cleanQuestion,
      schema,
      datasets,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log(
        "Chatbot local fallback plan:",
        JSON.stringify(localPlan, null, 2)
      );
    }

    return await executeResolvedPlan(localPlan);
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
