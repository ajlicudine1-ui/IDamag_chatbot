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

function singularizeToken(token) {
  const word = String(token || "").toLowerCase();

  if (word.endsWith("ies") && word.length > 4) {
    return `${word.slice(0, -3)}y`;
  }

  if (
    word.endsWith("ches") ||
    word.endsWith("shes") ||
    word.endsWith("xes") ||
    word.endsWith("zes")
  ) {
    return word.slice(0, -2);
  }

  if (word.endsWith("ses") && word.length > 4) {
    return word.slice(0, -2);
  }

  if (
    word.endsWith("s") &&
    !word.endsWith("ss") &&
    word.length > 3
  ) {
    return word.slice(0, -1);
  }

  return word;
}

function normalizeMatchTokens(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map(singularizeToken);
}

function similarity(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);

  if (!a || !b) return 0;
  if (a === b) return 1;

  const aTokens = normalizeMatchTokens(a);
  const bTokens = normalizeMatchTokens(b);
  const normalizedA = aTokens.join(" ");
  const normalizedB = bTokens.join(" ");

  if (normalizedA === normalizedB) {
    return 1;
  }

  if (
    normalizedA.includes(normalizedB) ||
    normalizedB.includes(normalizedA)
  ) {
    return Math.min(normalizedA.length, normalizedB.length) /
      Math.max(normalizedA.length, normalizedB.length);
  }

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);

  let matched = 0;

  for (const token of aSet) {
    if (bSet.has(token)) {
      matched += 1;
    }
  }

  const union = new Set([...aSet, ...bSet]).size;
  const tokenScore = union ? matched / union : 0;

  // Reward a strong single-token match such as
  // "municipalities" -> "Municipality".
  let bestTokenScore = 0;

  for (const leftToken of aTokens) {
    for (const rightToken of bTokens) {
      if (leftToken === rightToken) {
        bestTokenScore = 1;
      } else if (
        leftToken.includes(rightToken) ||
        rightToken.includes(leftToken)
      ) {
        bestTokenScore = Math.max(
          bestTokenScore,
          Math.min(leftToken.length, rightToken.length) /
            Math.max(leftToken.length, rightToken.length)
        );
      }
    }
  }

  return Math.max(tokenScore, bestTokenScore * 0.9);
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
  singularizeToken,
  normalizeMatchTokens,
  findBestMatch,
};
