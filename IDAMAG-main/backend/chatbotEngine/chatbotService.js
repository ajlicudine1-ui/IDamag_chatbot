const { buildSchema } = require("./schemaBuilder");
const { createPlan } = require("./intentParser");
const { executePlan } = require("./calculationEngine");
const { answerSchemaQuestion } = require("./schemaEngine");
const { answerGeneralQuestion } = require("./groqService");
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
          "Please specify the worksheet, column, or calculation you want.",
      };
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
