const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

async function askGroq(messages) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is missing. Add it to the backend .env file."
    );
  }

  const completion = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages,
    temperature: 0.1,
  });

  const answer = completion.choices?.[0]?.message?.content;

  if (!answer) {
    throw new Error("Groq did not return an answer.");
  }

  return answer;
}

module.exports = {
  askGroq,
};