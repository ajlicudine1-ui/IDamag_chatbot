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
 * Dataset questions stay local.
 * Groq is only allowed for clearly general-language questions.
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

  try {
    const plan = await createPlan({
      question: cleanQuestion,
      schema,
      datasets,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("Chatbot local plan:", plan);
    }

    const executeResolvedPlan = async (resolvedPlan) => {
      if (resolvedPlan.route === "schema") {
        return answerSchemaQuestion({
          datasets,
          schema,
          plan: resolvedPlan,
          question: cleanQuestion,
        });
      }

      if (resolvedPlan.route === "dataset") {
        return executePlan({
          datasets,
          schema,
          plan: resolvedPlan,
          question: cleanQuestion,
        });
      }

      if (resolvedPlan.route === "general") {
        return await answerGeneralQuestion({
          question: cleanQuestion,
          schema,
        });
      }

      if (resolvedPlan.route === "clarify") {
        return {
          success: false,
          source: "router",
          operation: "clarify",
          answer:
            resolvedPlan.question ||
            "Please specify the worksheet, column, or calculation you want.",
        };
      }

      return null;
    };

    // Strong local plans run immediately.
    if (
      ["dataset", "schema"].includes(plan.route) &&
      (plan.confidence ?? 1) >= 0.7
    ) {
      return await executeResolvedPlan(plan);
    }

    // Clearly general requests do not need another planning round.
    if (
      plan.route === "general" &&
      (plan.confidence ?? 0) >= 0.9
    ) {
      return await executeResolvedPlan(plan);
    }

    // For uncertain local plans, ask Groq to interpret only the schema and wording.
    // Groq does not receive all rows and does not calculate any dataset answer.
    const fallbackPlan = await createSchemaAwarePlan({
      question: cleanQuestion,
      schema,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("Chatbot Groq fallback plan:", fallbackPlan);
    }

    const fallbackResult =
      await executeResolvedPlan(fallbackPlan);

    if (fallbackResult) {
      return fallbackResult;
    }

    return {
      success: false,
      source: "router",
      operation: "unknown",
      answer: "I could not determine how to answer that question.",
    };
  } catch (error) {
    console.error("Chatbot error:", error);

    return {
      success: false,
      source: "system",
      operation: "error",
      answer:
        error.message ||
        "The chatbot could not process the question.",
    };
  }
}

module.exports = {
  answerQuestion,
};
