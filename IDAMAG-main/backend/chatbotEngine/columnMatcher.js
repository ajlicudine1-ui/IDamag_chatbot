const {
  getColumns,
  findBestMatch,
  similarity,
  normalizeText,
  normalizeMatchTokens,
} = require("./utils");

const QUESTION_WORDS = new Set([
  "a",
  "an",
  "are",
  "available",
  "can",
  "could",
  "display",
  "do",
  "does",
  "for",
  "from",
  "give",
  "how",
  "i",
  "in",
  "is",
  "list",
  "me",
  "of",
  "on",
  "please",
  "show",
  "tell",
  "the",
  "there",
  "to",
  "value",
  "values",
  "what",
  "which",
  "who",
  "with",
  "you",
]);

function cleanTargetText(value) {
  return normalizeMatchTokens(value)
    .filter((token) => !QUESTION_WORDS.has(token))
    .join(" ")
    .trim();
}

function scoreColumnTarget(target, column) {
  const cleanTarget = cleanTargetText(target);
  const cleanColumn = cleanTargetText(column);

  if (!cleanTarget || !cleanColumn) {
    return 0;
  }

  if (cleanTarget === cleanColumn) {
    return 2;
  }

  const targetTokens = new Set(
    cleanTarget.split(/\s+/).filter(Boolean)
  );
  const columnTokens = new Set(
    cleanColumn.split(/\s+/).filter(Boolean)
  );

  let exactMatches = 0;

  for (const token of columnTokens) {
    if (targetTokens.has(token)) {
      exactMatches += 1;
    }
  }

  const coverage =
    columnTokens.size > 0
      ? exactMatches / columnTokens.size
      : 0;

  const directSimilarity = similarity(
    cleanTarget,
    cleanColumn
  );

  let phraseBonus = 0;

  if (
    cleanTarget.includes(cleanColumn) ||
    cleanColumn.includes(cleanTarget)
  ) {
    phraseBonus = 0.75;
  }

  return directSimilarity + coverage + phraseBonus;
}

function findDatasetName(datasets, requestedName) {
  const names = Object.keys(datasets);

  if (names.length === 1 && !requestedName) {
    return names[0];
  }

  return findBestMatch(requestedName, names, 0.45);
}

function findColumn(rows, requestedColumn) {
  const ranked = rankColumns(rows, requestedColumn);

  return ranked[0] && ranked[0].score >= 0.75
    ? ranked[0].column
    : null;
}

function rankColumns(rows, target) {
  return getColumns(rows)
    .map((column) => ({
      column,
      score: scoreColumnTarget(target, column),
    }))
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  cleanTargetText,
  scoreColumnTarget,
  findDatasetName,
  findColumn,
  rankColumns,
};
