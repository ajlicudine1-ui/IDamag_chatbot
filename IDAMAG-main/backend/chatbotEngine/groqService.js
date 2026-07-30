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

Answer:
- general knowledge questions
- grammar questions
- translation questions
- explanation questions
- writing questions
- rewriting questions

Do NOT invent dataset values.

You only know the supplied dataset schema.

Exact dataset calculations, lookups, filtering, joining,
ranking, counting, and aggregation must be handled by
the dataset engine.

If the user is asking about actual dataset values,
do not guess them.
`,
      },

      {
        role: "user",
        content:
          `DATASET SCHEMA:\n${JSON.stringify(
            safeSchema
          )}\n\n` +
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

// ============================================================
// EXTRACT JSON
// ============================================================

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
    throw new Error(
      "Groq did not return valid JSON."
    );
  }

  return JSON.parse(
    cleaned.slice(start, end + 1)
  );
}

/**
 * Uses Groq only as a language interpreter.
 *
 * Groq NEVER receives the full dataset rows.
 *
 * Groq only receives:
 * - worksheet names
 * - column names
 * - column types
 * - a few example values
 *
 * JavaScript performs the real lookup/calculation.
 */
async function createSchemaAwarePlan({
  question,
  schema,
}) {
  const compactSchema = schema.map((dataset) => ({
    name: dataset.name,
    rowCount: dataset.rowCount,

    columns: (dataset.columns || []).map(
      (column) => ({
        name: column.name,
        type: column.type,

        examples: Array.isArray(
          column.examples
        )
          ? column.examples.slice(0, 5)
          : [],
      })
    ),
  }));

  const systemPrompt = `
You are a schema-aware query planner for a data chatbot.

Your ONLY job is to understand the user's natural-language
question and convert it into a structured query plan.

You must NOT:
- calculate dataset values
- estimate values
- invent values
- invent worksheet names
- invent column names
- fabricate filters
- answer the dataset question yourself

The JavaScript dataset engine will perform all calculations,
filtering, lookups, joins, and rankings.

Return VALID JSON ONLY.

Do not include markdown.
Do not include explanations before or after the JSON.

============================================================
AVAILABLE ROUTES
============================================================

1) DATASET OPERATION

{
  "route": "dataset",

  "dataset": "exact worksheet name",

  "operation":
    "sum|average|median|minimum|maximum|row_count|non_empty_count|distinct_count|list|lookup|group_count|group_sum|group_average|group_minimum|group_maximum|rank_rows|rank_groups",

  "column":
    "exact metric/output column name or null",

  "labelColumn":
    "exact label/entity column name or null",

  "groupBy":
    "exact grouping column name or null",

  "aggregation":
    "sum|average|count|null",

  "direction":
    "asc|desc|null",

  "filters": [
    {
      "column": "exact column name",
      "operator":
        "equals|not_equals|contains|starts_with|ends_with|greater_than|greater_or_equal|less_than|less_or_equal",
      "value":
        "value taken directly from the user's question"
    }
  ],

  "selectColumns": [
    "exact requested output column names"
  ],

  "outputRequested": true,

  "transform":
    "first_word|last_word|null",

  "limit": 10,

  "showAll": false
}

============================================================
2) SCHEMA QUESTION
============================================================

{
  "route": "schema",

  "intent":
    "datasets|columns|row_counts|find_column|describe",

  "dataset":
    "exact worksheet name or null",

  "column":
    "exact column name or null"
}

============================================================
3) GENERAL QUESTION
============================================================

{
  "route": "general"
}

============================================================
4) CLARIFICATION
============================================================

{
  "route": "clarify",

  "question":
    "one short clarification question"
}

============================================================
GENERAL RULES
============================================================

- Use ONLY worksheet names that exist in the supplied schema.

- Use ONLY column names that exist in the supplied schema.

- Do NOT invent worksheet names.

- Do NOT invent column names.

- Example values are hints only.

- Example values are NOT exhaustive.

- A filter value may come directly from the user's question
  even if it does not appear in the example values.

- Do NOT calculate the answer.

- Do NOT estimate the answer.

- Do NOT return actual dataset values.

- If the user asks for a value from a record or row,
  use operation "lookup".

- If the user asks for only one output field,
  put that field in selectColumns.

- If the user asks for multiple output fields,
  put ALL requested fields in selectColumns.

- Do NOT collapse a multiple-field request into one field.

- Do NOT remove requested output fields just because they are
  stored in different worksheets.

- outputRequested should normally be true for lookup questions
  where the user explicitly asks for one or more fields.

============================================================
CROSS-WORKSHEET RULES
============================================================

IMPORTANT:

A user's requested fields may exist in DIFFERENT worksheets.

The dataset engine supports dynamic cross-worksheet lookup.

Therefore:

- Preserve ALL requested fields in selectColumns even when those
  fields come from different worksheets.

- Do NOT restrict selectColumns to the selected dataset.

- Do NOT remove a requested column just because it is not in the
  primary worksheet.

- The dataset engine will dynamically discover a shared column
  between worksheets.

- Do NOT invent the join/shared column.

- Do NOT invent relationships.

- Do NOT manually specify a join unless the user explicitly asks
  about a column that exists in the schema.

- Choose as "dataset" the worksheet that best represents the
  main entity or identifying part of the user's question.

Example schema:

Worksheet A:
- Record ID
- Person
- Province

Worksheet B:
- Record ID
- Status
- Month

Question:
"person with record id 1011 and its month"

Correct planning behavior:

{
  "route": "dataset",
  "dataset": "Worksheet A",
  "operation": "lookup",
  "column": null,
  "labelColumn": null,
  "groupBy": null,
  "aggregation": null,
  "direction": null,
  "filters": [
    {
      "column": "Record ID",
      "operator": "equals",
      "value": "1011"
    }
  ],
  "selectColumns": [
    "Person",
    "Month"
  ],
  "outputRequested": true,
  "transform": null,
  "limit": 10,
  "showAll": false
}

Notice:

"Person" exists in Worksheet A.

"Month" exists in Worksheet B.

Both MUST still remain in selectColumns.

The dataset engine will determine how to connect them.

Another example:

Question:
"show the crop and fertilizer used for farm id 1011"

If:
- Crop exists in one worksheet
- Fertilizer Used exists in another worksheet
- Farm ID exists in both

Then selectColumns MUST contain:

[
  "Crop",
  "Fertilizer Used"
]

Do NOT return only one of them.

============================================================
LOOKUP RULES
============================================================

- If the user asks for information about a specific record,
  use "lookup".

Examples:

"farmer with farm id 1011"

"what is the planting month of farm 1011"

"show the farmer and planting month for farm id 1011"

"what is the municipality and irrigation for farm 1011"

These are lookup operations.

- The identifying value belongs in filters.

Example:

{
  "column": "Farm ID",
  "operator": "equals",
  "value": "1011"
}

- Requested result fields belong in selectColumns.

- Do NOT place the identifying key in selectColumns unless the
  user also explicitly asks to return it.

============================================================
MULTIPLE FIELD RULES
============================================================

If the user asks for multiple pieces of information,
ALWAYS preserve all of them.

Examples:

"farmer and municipality"
→ selectColumns contains both matching columns.

"farmer and planting month"
→ selectColumns contains both.

"province, crop and expected yield"
→ selectColumns contains all three.

"farmer, municipality, planting month and irrigation"
→ selectColumns contains all four.

Even if these fields occur in different worksheets,
keep ALL of them.

============================================================
LIST RULES
============================================================

- "what are the X" usually means operation "list".

- "list X" usually means "list".

- "list all X"
- "show all X"
- "every X"
- "all X"

must set:

"showAll": true

If the user asks to list multiple related fields together,
use lookup rather than list.

Example:

"list farmers"

→ list

But:

"list farmers and their municipality"

→ lookup

with:

"showAll": true

and selectColumns containing both fields.

============================================================
COUNT RULES
============================================================

"how many rows"
"how many records"
"how many entries"

→ row_count

"how many unique X"
"how many distinct X"

→ distinct_count

"how many populated X"
"how many non-empty X"

→ non_empty_count

============================================================
AGGREGATION RULES
============================================================

"total X"
"sum of X"
"what is the total X"

→ sum

"average X"
"mean X"

→ average

"median X"

→ median

"highest X"
"maximum X"
"largest X"

→ maximum

"lowest X"
"minimum X"
"smallest X"

→ minimum

============================================================
GROUPING RULES
============================================================

"count by X"

→ group_count

"total Y by X"

→ group_sum

"average Y by X"

→ group_average

"highest Y by X"

→ group_maximum

"lowest Y by X"

→ group_minimum

============================================================
RANKING RULES
============================================================

"top N X by Y"

usually means:

operation:
"rank_rows"

direction:
"desc"

"bottom N X by Y"

usually means:

operation:
"rank_rows"

direction:
"asc"

"top N X by total Y"

means:

operation:
"rank_groups"

aggregation:
"sum"

direction:
"desc"

"top N X by average Y"

means:

operation:
"rank_groups"

aggregation:
"average"

direction:
"desc"

"bottom N X by total Y"

means:

operation:
"rank_groups"

aggregation:
"sum"

direction:
"asc"

============================================================
NAME TRANSFORM RULES
============================================================

"first name"

means:

"transform": "first_word"

on the appropriate person/name column.

"last name"

means:

"transform": "last_word"

============================================================
GENERAL / NON-DATA QUESTIONS
============================================================

Grammar questions use:

{
  "route": "general"
}

Translation uses:

{
  "route": "general"
}

Writing and rewriting use:

{
  "route": "general"
}

General knowledge uses:

{
  "route": "general"
}

============================================================
AMBIGUITY
============================================================

If multiple columns are equally plausible
and the user's meaning cannot be safely determined,
use:

{
  "route": "clarify",
  "question": "..."
}

Do not guess when the schema genuinely makes the request
ambiguous.

============================================================
FINAL REQUIREMENT
============================================================

Return ONE valid JSON object only.

No Markdown.

No explanation.

No code block.
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
          `SCHEMA:\n${JSON.stringify(
            compactSchema
          )}\n\n` +
          `QUESTION:\n${question}`,
      },
    ],
    {
      temperature: 0,
      maxTokens: 1200,
    }
  );

  const plan =
    extractJsonObject(response);

  // ==========================================================
  // NORMALIZE PLAN
  // ==========================================================

  if (
    plan.route === "dataset"
  ) {
    if (
      !Array.isArray(
        plan.filters
      )
    ) {
      plan.filters = [];
    }

    if (
      !Array.isArray(
        plan.selectColumns
      )
    ) {
      plan.selectColumns = [];
    }

    if (
      typeof plan.showAll !==
      "boolean"
    ) {
      plan.showAll = false;
    }

    if (
      typeof plan.outputRequested !==
      "boolean"
    ) {
      plan.outputRequested =
        plan.operation === "lookup" &&
        plan.selectColumns.length > 0;
    }

    const parsedLimit =
      Number(plan.limit);

    if (
      !Number.isInteger(
        parsedLimit
      ) ||
      parsedLimit <= 0
    ) {
      plan.limit = 10;
    }
  }

  return plan;
}

module.exports = {
  callGroq,
  answerGeneralQuestion,
  createSchemaAwarePlan,
};