function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s._%()/+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return null;
  }

  let text = String(value).trim();
  const negative =
    text.startsWith("(") && text.endsWith(")");

  text = text
    .replace(/,/g, "")
    .replace(/%/g, "")
    .replace(/[^\d.+-]/g, "")
    .trim();

  if (!text || ["-", "+", "."].includes(text)) {
    return null;
  }

  const number = Number(text);

  if (!Number.isFinite(number)) {
    return null;
  }

  return negative ? -Math.abs(number) : number;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function normalizeRows(value) {
  if (Array.isArray(value)) {
    return value.filter(
      (row) => row && typeof row === "object" && !Array.isArray(row)
    );
  }

  if (
    value &&
    typeof value === "object" &&
    Array.isArray(value.rows)
  ) {
    return value.rows.filter(
      (row) => row && typeof row === "object" && !Array.isArray(row)
    );
  }

  return [];
}

function normalizeDatasets(input) {
  if (Array.isArray(input)) {
    return {
      Dataset: normalizeRows(input),
    };
  }

  if (!input || typeof input !== "object") {
    return {};
  }

  const result = {};

  for (const [name, value] of Object.entries(input)) {
    const rows = normalizeRows(value);

    if (rows.length) {
      result[String(name)] = rows;
    }
  }

  return result;
}

function getColumns(rows) {
  const columns = new Set();

  for (const row of rows) {
    for (const column of Object.keys(row || {})) {
      if (String(column).trim()) {
        columns.add(column);
      }
    }
  }

  return [...columns];
}

function similarity(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);

  if (!a || !b) return 0;
  if (a === b) return 1;

  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) /
      Math.max(a.length, b.length);
  }

  const aTokens = new Set(a.split(/\s+/));
  const bTokens = new Set(b.split(/\s+/));

  let matched = 0;

  for (const token of aTokens) {
    if (bTokens.has(token)) {
      matched += 1;
    }
  }

  const union = new Set([...aTokens, ...bTokens]).size;

  return union ? matched / union : 0;
}

function findBestMatch(requested, available, minimum = 0.4) {
  if (!requested) return null;

  const ranked = available
    .map((item) => ({
      item,
      score: similarity(requested, item),
    }))
    .sort((a, b) => b.score - a.score);

  return ranked[0] && ranked[0].score >= minimum
    ? ranked[0].item
    : null;
}

module.exports = {
  normalizeText,
  parseNumber,
  formatNumber,
  normalizeRows,
  normalizeDatasets,
  getColumns,
  similarity,
  findBestMatch,
};
