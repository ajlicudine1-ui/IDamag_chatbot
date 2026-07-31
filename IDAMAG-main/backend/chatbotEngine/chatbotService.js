const { buildSchema } = require("./schemaBuilder");
const { createPlan } = require("./intentParser");
const { executePlan } = require("./calculationEngine");
const { answerSchemaQuestion } = require("./schemaEngine");
const {
  answerGeneralQuestion,
  createSchemaAwarePlan,
} = require("./groqService");
const { normalizeDatasets, parseNumber } = require("./utils");

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-12).map((item) => ({
    role: item?.role === "assistant" || item?.role === "bot" ? "assistant" : "user",
    content: String(item?.content ?? item?.text ?? "").trim(),
  })).filter((item) => item.content);
}

// Creates a compact, computed profile of the live data. Groq receives this
// only for explanations/narratives/recommendations; exact Q&A still runs
// through calculationEngine.js.
function buildDataProfile(datasets) {
  const profile = {};

  for (const [name, rows] of Object.entries(datasets)) {
    if (!Array.isArray(rows) || !rows.length) continue;

    const columns = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
    const info = { rowCount: rows.length, columns: {} };

    for (const column of columns) {
      const raw = rows.map((row) => row?.[column]).filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
      if (!raw.length) continue;

      const nums = raw.map(parseNumber).filter((v) => v !== null);
      if (nums.length >= Math.max(2, Math.ceil(raw.length * 0.7))) {
        const sum = nums.reduce((a, b) => a + b, 0);
        info.columns[column] = {
          type: "numeric",
          populated: raw.length,
          sum,
          average: sum / nums.length,
          minimum: Math.min(...nums),
          maximum: Math.max(...nums),
        };
      } else {
        const counts = new Map();
        for (const value of raw) {
          const text = String(value).trim();
          counts.set(text, (counts.get(text) || 0) + 1);
        }
        info.columns[column] = {
          type: "text",
          populated: raw.length,
          uniqueCount: counts.size,
          topValues: [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([value, count]) => ({ value, count })),
        };
      }
    }
    profile[name] = info;
  }

  return profile;
}

async function answerQuestion(input, question, history = []) {
  const cleanQuestion = String(question || "").trim();

  if (!cleanQuestion) {
    return { success: false, source: "system", answer: "Please enter a question." };
  }

  const datasets = normalizeDatasets(input);
  if (!Object.keys(datasets).length) {
    return { success: false, source: "system", answer: "No usable worksheet data is currently available." };
  }

  const schema = buildSchema(datasets);
  const safeHistory = normalizeHistory(history);

  const executeResolvedPlan = async (plan) => {
    if (!plan || typeof plan !== "object") {
      throw new Error("The query planner returned an invalid plan.");
    }

    if (plan.route === "schema") {
      return answerSchemaQuestion({ datasets, schema, plan, question: cleanQuestion });
    }

    if (plan.route === "dataset") {
      return executePlan({ datasets, schema, plan, question: cleanQuestion });
    }

    if (plan.route === "general") {
      return answerGeneralQuestion({
        question: cleanQuestion,
        schema,
        history: safeHistory,
        dataProfile: buildDataProfile(datasets),
      });
    }

    if (plan.route === "clarify") {
      return {
        success: false,
        source: "router",
        operation: "clarify",
        answer: plan.question || "Please clarify which worksheet, field, or calculation you want.",
      };
    }

    throw new Error(`Unsupported query route: ${String(plan.route || "unknown")}`);
  };

  try {
    const groqPlan = await createSchemaAwarePlan({
      question: cleanQuestion,
      schema,
      history: safeHistory,
    });

    if (process.env.NODE_ENV !== "production") console.log("Chatbot Groq plan:", groqPlan);
    return await executeResolvedPlan(groqPlan);
  } catch (groqError) {
    console.error("Groq planning failed; using local parser fallback:", groqError);

    try {
      const localPlan = await createPlan({ question: cleanQuestion, schema, datasets });
      if (process.env.NODE_ENV !== "production") console.log("Chatbot local fallback plan:", localPlan);
      return await executeResolvedPlan(localPlan);
    } catch (localError) {
      console.error("Local chatbot fallback failed:", localError);
      return {
        success: false,
        source: "system",
        operation: "error",
        answer: localError.message || groqError.message || "The chatbot could not process the question.",
      };
    }
  }
}

module.exports = { answerQuestion };
