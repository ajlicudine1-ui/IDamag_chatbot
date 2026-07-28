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

module.exports = {
  callGroq,
  answerGeneralQuestion,
};
