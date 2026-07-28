const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const GROQ_MODEL =
  process.env.GROQ_MODEL ||
  "llama-3.3-70b-versatile";

async function callGroq(messages, options = {}) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is missing from the backend environment."
    );
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model || GROQ_MODEL,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens || 1000,
      messages,
    }),
  });

  const body = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      body?.error?.message ||
      `Groq request failed with HTTP ${response.status}.`
    );
  }

  return (
    body?.choices?.[0]?.message?.content?.trim() ||
    ""
  );
}

async function answerGeneralQuestion({
  question,
  schema,
}) {
  const safeSchema = schema.map((dataset) => ({
    name: dataset.name,
    rowCount: dataset.rowCount,
    columns: dataset.columns.map((column) => ({
      name: column.name,
      type: column.type,
    })),
  }));

  const answer = await callGroq(
    [
      {
        role: "system",
        content: `
You are a helpful assistant inside a data chatbot.

Answer general knowledge, grammar, translation, explanation,
writing, and rewriting questions.

Do not invent dataset values. You only know the supplied schema.
Exact dataset calculations must be handled by the dataset engine.
`,
      },
      {
        role: "user",
        content:
          `DATASET SCHEMA:\n${JSON.stringify(safeSchema)}\n\n` +
          `QUESTION:\n${question}`,
      },
    ],
    {
      temperature: 0.3,
      maxTokens: 1000,
    }
  );

  return {
    success: true,
    source: "groq",
    operation: "general",
    answer,
  };
}



function extractJsonObject(text) {
  const cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (
    start === -1 ||
    end === -1 ||
    end <= start
  ) {
    throw new Error("Groq did not return valid JSON.");
  }

  return JSON.parse(
    cleaned.slice(start, end + 1)
  );
}

/**
 * Uses Groq only as a language interpreter.
 *
 * Groq never calculates values and never receives full row data.
 * It only receives worksheet names, column names, types, and a few examples.
 */
async function createSchemaAwarePlan({
  question,
  schema,
}) {
  const compactSchema = schema.map((dataset) => ({
    name: dataset.name,
    rowCount: dataset.rowCount,
    columns: (dataset.columns || []).map((column) => ({
      name: column.name,
      type: column.type,
      examples: Array.isArray(column.examples)
        ? column.examples.slice(0, 5)
        : [],
    })),
  }));

  const systemPrompt = `
You are a schema-aware query planner for a data chatbot.

Your job is ONLY to interpret the user's wording and map it to the existing
worksheets and columns. You must NOT calculate, estimate, or invent any dataset
value.

Return JSON only.

Allowed routes:

1) Dataset operation:
{
  "route": "dataset",
  "dataset": "exact worksheet name",
  "operation": "sum|average|median|minimum|maximum|row_count|non_empty_count|distinct_count|list|lookup|group_count|group_sum|group_average|group_minimum|group_maximum|rank_rows|rank_groups",
  "column": "exact metric/output column name or null",
  "labelColumn": "exact label/entity column name or null",
  "groupBy": "exact grouping column name or null",
  "aggregation": "sum|average|count|null",
  "direction": "asc|desc|null",
  "filters": [
    {
      "column": "exact column name",
      "operator": "equals|not_equals|contains|starts_with|ends_with|greater_than|greater_or_equal|less_than|less_or_equal",
      "value": "value from the user's question"
    }
  ],
  "selectColumns": ["exact output column names"],
  "transform": "first_word|last_word|null",
  "limit": 10,
  "showAll": false
}

2) Schema question:
{
  "route": "schema",
  "intent": "datasets|columns|row_counts|find_column|describe",
  "dataset": "exact worksheet name or null",
  "column": "exact column name or null"
}

3) General question:
{
  "route": "general"
}

4) Clarification:
{
  "route": "clarify",
  "question": "one short clarification question"
}

Rules:
- Use only worksheet and column names that exist in the supplied schema.
- Example values are only hints and are NOT exhaustive. A filter value may come directly from the user's question even if it is not present in schema examples.
- Do not invent worksheet names or column names.
- Do not compute any answer.
- If the user asks for a value from a row, use lookup.
- If the user asks for only one field, put that field in selectColumns.
- "first name" means transform "first_word" on the appropriate name/person column.
- "last name" means transform "last_word".
- "top N X by Y" generally means rank_rows when ranking individual records.
- "top N X by total Y" generally means rank_groups with aggregation "sum".
- "top N X by average Y" generally means rank_groups with aggregation "average".
- "bottom/lowest/smallest" means direction "asc".
- "top/highest/largest/biggest/most" means direction "desc".
- "what are the X" usually means list.
- "list all X", "show all X", "every X", or requests that clearly ask for the complete set must set "showAll": true.
- If the user asks for multiple fields together, use lookup and put ALL requested fields in selectColumns.
  Example intent: "list farmers and their municipality" -> lookup with selectColumns containing the matching person/farmer column and municipality/location column, showAll true.
- Do not collapse a multi-column request into a single-column list.
- "how many rows/records/entries" means row_count.
- "how many unique/distinct X" means distinct_count.
- Grammar, translation, rewriting, explanation, and general knowledge use general.
- If the wording is ambiguous and multiple columns are equally plausible, use clarify.
`;

  const response = await callGroq(
    [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content:
          `SCHEMA:\n${JSON.stringify(compactSchema)}\n\n` +
          `QUESTION:\n${question}`,
      },
    ],
    {
      temperature: 0,
      maxTokens: 900,
    }
  );

  return extractJsonObject(response);
}

module.exports = {
  callGroq,
  answerGeneralQuestion,
  createSchemaAwarePlan,
};
