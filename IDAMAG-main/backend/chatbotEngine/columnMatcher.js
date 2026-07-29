const {
  getColumns,
  findBestMatch,
  similarity,
  normalizeText,
  normalizeMatchTokens,
} = require("./utils");

const QUESTION_WORDS = new Set([
  "a", "an", "are", "available", "can", "could", "display", "do", "does",
  "for", "from", "give", "how", "i", "in", "is", "list", "me", "of",
  "on", "please", "show", "tell", "the", "there", "to", "value", "values",
  "what", "which", "who", "with", "you",
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

  if (!cleanTarget || !cleanColumn) return 0;
  if (cleanTarget === cleanColumn) return 2;

  const targetTokens = new Set(cleanTarget.split(/\s+/).filter(Boolean));
  const columnTokens = new Set(cleanColumn.split(/\s+/).filter(Boolean));

  let exactMatches = 0;
  for (const token of columnTokens) {
    if (targetTokens.has(token)) exactMatches += 1;
  }

  const coverage =
    columnTokens.size > 0 ? exactMatches / columnTokens.size : 0;

  const directSimilarity = similarity(cleanTarget, cleanColumn);

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

  if (names.length === 1 && !requestedName) return names[0];

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

function findDatasetsContainingColumn(datasets, requestedColumn) {
  const results = [];

  for (const [datasetName, rows] of Object.entries(datasets || {})) {
    if (!Array.isArray(rows) || !rows.length) continue;

    const ranked = rankColumns(rows, requestedColumn);
    const best = ranked[0];

    if (best && best.score >= 0.75) {
      results.push({
        dataset: datasetName,
        column: best.column,
        score: best.score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

function normalizedColumnMap(rows) {
  const map = new Map();

  for (const column of getColumns(rows)) {
    const key = normalizeText(column);
    if (key && !map.has(key)) map.set(key, column);
  }

  return map;
}

/**
 * Finds exact normalized column-name intersections between two worksheets.
 * It does not assume names such as Farm ID, Registration No., etc.
 */
function findSharedColumns(leftRows, rightRows) {
  const left = normalizedColumnMap(leftRows);
  const right = normalizedColumnMap(rightRows);
  const shared = [];

  for (const [key, leftColumn] of left.entries()) {
    const rightColumn = right.get(key);
    if (!rightColumn) continue;

    shared.push({
      leftColumn,
      rightColumn,
      normalizedName: key,
    });
  }

  return shared;
}

module.exports = {
  cleanTargetText,
  scoreColumnTarget,
  findDatasetName,
  findColumn,
  rankColumns,
  findDatasetsContainingColumn,
  findSharedColumns,
};
