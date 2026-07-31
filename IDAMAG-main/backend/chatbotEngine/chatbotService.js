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
 * GROQ-FIRST ARCHITECTURE
 * -----------------------
 * 1. Groq interprets the user's natural-language question using only schema.
 * 2. JavaScript reads CURRENT worksheet rows and executes the plan.
 * 3. Groq never calculates dataset totals, rankings, counts, or row answers.
 * 4. If Groq is unavailable or returns an invalid plan, the local parser is
 *    used as a fallback.
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
      answer: "No usable worksheet data is currently available.",
    };
  }

  const schema = buildSchema(datasets);

  const executeResolvedPlan = async (plan) => {
    if (!plan || typeof plan !== "object") {
      throw new Error("The query planner returned an invalid plan.");
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
      `Unsupported query route: ${String(plan.route || "unknown")}`
    );
  };

  try {
    // PRIMARY: Groq understands the wording and maps it to the live schema.
    const groqPlan = await createSchemaAwarePlan({
      question: cleanQuestion,
      schema,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("Chatbot Groq plan:", groqPlan);
    }

    return await executeResolvedPlan(groqPlan);
  } catch (groqError) {
    console.error(
      "Groq planning failed; using local parser fallback:",
      groqError
    );

    try {
      // FALLBACK ONLY: keep the local parser for resilience.
      const localPlan = await createPlan({
        question: cleanQuestion,
        schema,
        datasets,
      });

      if (process.env.NODE_ENV !== "production") {
        console.log("Chatbot local fallback plan:", localPlan);
      }

      return await executeResolvedPlan(localPlan);
    } catch (localError) {
      console.error("Local chatbot fallback failed:", localError);

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
