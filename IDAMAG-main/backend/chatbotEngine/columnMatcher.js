const {
  getColumns,
  findBestMatch,
  similarity,
} = require("./utils");

function findDatasetName(datasets, requestedName) {
  const names = Object.keys(datasets);

  if (names.length === 1 && !requestedName) {
    return names[0];
  }

  return findBestMatch(requestedName, names, 0.45);
}

function findColumn(rows, requestedColumn) {
  return findBestMatch(
    requestedColumn,
    getColumns(rows),
    0.42
  );
}

function rankColumns(rows, question) {
  return getColumns(rows)
    .map((column) => ({
      column,
      score: similarity(question, column),
    }))
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  findDatasetName,
  findColumn,
  rankColumns,
};
