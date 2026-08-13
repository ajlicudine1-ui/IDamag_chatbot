const {
  callGroq,
} = require("./groqService");

/**
 * Returns the original verified answer if
 * natural-response generation fails.
 */
function fallbackAnswer(result) {
  return String(
    result?.answer || ""
  ).trim();
}

/**
 * Determines whether a result should be
 * rewritten naturally.
 */
function shouldNaturalize(
  plan,
  result
) {
  if (!result) {
    return false;
  }

  if (
    result.success === false
  ) {
    return false;
  }

  if (
    !result.answer ||
    typeof result.answer !== "string"
  ) {
    return false;
  }

  /**
   * Clarification messages should remain
   * deterministic.
   */
  if (
    plan?.route === "clarify"
  ) {
    return false;
  }

  return true;
}

/**
 * Produce a human-friendly answer using ONLY
 * the already verified result.
 *
 * IMPORTANT:
 * Groq is NOT given the complete dataset.
 * It receives only:
 *
 * - original question
 * - verified result
 * - operation metadata
 *
 * Therefore it is being used as a language
 * formatter, not as the calculation engine.
 */
async function generateNaturalResponse({
  question,
  plan,
  result,
}) {
  const fallback =
    fallbackAnswer(result);

  if (
    !shouldNaturalize(
      plan,
      result
    )
  ) {
    return fallback;
  }

  const systemPrompt = `
You are the final response writer for the I-DAMAG chatbot.

Your ONLY job is to rewrite an already VERIFIED answer into
clear, concise, natural language.

============================================================
ABSOLUTE DATA SAFETY RULES
============================================================

The VERIFIED RESULT was calculated by JavaScript from the
current dataset.

You MUST trust the VERIFIED RESULT.

You MUST NOT:

- recalculate anything
- estimate anything
- change numeric values
- change names
- change dates
- change percentages
- change counts
- change rankings
- add dataset facts
- remove important requested values
- invent explanations
- invent context
- infer facts that are not present
- answer from your own knowledge
- answer from general knowledge

You are a LANGUAGE FORMATTER only.

============================================================
NUMBERS
============================================================

Every factual number in the final answer must come directly
from the VERIFIED RESULT.

Never perform arithmetic.

If the verified result says:

167129

you may format it as:

167,129

but you must not change its value.

If the verified result already includes a currency symbol,
preserve it.

Do not add a currency symbol unless the verified result or
field meaning clearly provides one.

============================================================
LOOKUPS
============================================================

For a simple lookup, answer naturally and directly.

Example:

Question:
"What is the actual salary of Roberto Perales?"

Verified result:
"ACTUAL SALARY: 167,129.00"

Good:
"Roberto Perales' actual salary is 167,129.00."

Bad:
"According to the data provided, the actual salary recorded
for Roberto Perales appears to be approximately 167,129."

Do not use unnecessary phrases such as:

- according to the provided data
- based on the information
- it appears that
- approximately

unless uncertainty is actually present in the verified result.

============================================================
FOLLOW-UP QUESTIONS
============================================================

Follow-up answers should sound conversational.

Example:

Question:
"What is his position title?"

Verified result:
"POSITION TITLE: DIRECTOR IV"

Good:
"His position title is Director IV."

Do not repeat unnecessary information unless it improves
clarity.

============================================================
COUNTS
============================================================

Example:

Question:
"How many employees are in PMED?"

Verified result:
"25"

Good:
"There are 25 employees in PMED."

Never change the count.

============================================================
LISTS
============================================================

If the verified result contains a list:

- preserve every returned item
- preserve the order when meaningful
- do not invent additional items
- do not silently remove items
- use a readable numbered or bulleted list when appropriate

If the list is long, it is acceptable to introduce it with
one short sentence.

============================================================
RANKINGS
============================================================

Preserve:

- ranking order
- labels
- values
- requested limit

Never reorder a verified ranking.

============================================================
STYLE
============================================================

Use natural conversational English.

Be concise.

Avoid robotic database language when possible.

Do not say:
"The value of POSITION TITLE where NAME equals Roberto is..."

Prefer:
"Roberto's position title is Director IV."

Do not over-explain simple answers.

Return ONLY the final user-facing answer.
`;

  try {
    const response =
      await callGroq({
        messages: [
          {
            role: "system",
            content:
              systemPrompt,
          },
          {
            role: "user",
            content:
              `QUESTION:\n${question}\n\n` +
              `OPERATION:\n${String(
                plan?.operation || ""
              )}\n\n` +
              `VERIFIED RESULT:\n${JSON.stringify(
                result
              )}`,
          },
        ],

        temperature: 0.1,
        maxTokens: 1200,
      });

    const naturalAnswer =
      String(
        response || ""
      ).trim();

    if (!naturalAnswer) {
      return fallback;
    }

    return naturalAnswer;
  } catch (error) {
    console.error(
      "Natural response generation failed:",
      error
    );

    /**
     * Very important:
     *
     * If Groq fails, the verified JavaScript
     * answer is still returned.
     */
    return fallback;
  }
}

module.exports = {
  generateNaturalResponse,
};