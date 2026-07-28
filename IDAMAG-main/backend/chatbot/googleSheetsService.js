const { parse } = require("csv-parse/sync");

/**
 * Downloads and converts one public Google Sheets CSV link
 * into an array of JavaScript objects.
 */
async function loadPublishedWorksheet(csvUrl) {
  if (!csvUrl || typeof csvUrl !== "string") {
    throw new Error("A valid Google Sheets CSV URL is required.");
  }

  if (!csvUrl.startsWith("https://")) {
    throw new Error("The Google Sheets CSV URL must start with https://");
  }

  const response = await fetch(csvUrl);

  if (!response.ok) {
    throw new Error(
      `Unable to download Google Sheet. HTTP status: ${response.status}`
    );
  }

  const csvText = await response.text();

  // This usually means Google returned a login page or normal webpage.
  if (
    csvText.toLowerCase().includes("<!doctype html") ||
    csvText.toLowerCase().includes("<html")
  ) {
    throw new Error(
      "Google returned a webpage instead of CSV data. Make sure the sheet is set to 'Anyone with the link can view'."
    );
  }

  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });

  return rows.map((row) => {
    const cleanedRow = {};

    for (const [columnName, value] of Object.entries(row)) {
      const cleanedColumnName = String(columnName || "").trim();

      if (!cleanedColumnName) {
        continue;
      }

      cleanedRow[cleanedColumnName] =
        typeof value === "string" ? value.trim() : value;
    }

    return cleanedRow;
  });
}

/**
 * Loads every worksheet configured for one division.
 */
async function loadDivisionData(divisionConfig) {
  if (!divisionConfig) {
    throw new Error("Division configuration is missing.");
  }

  if (!Array.isArray(divisionConfig.sheets)) {
    throw new Error("The selected division has no configured sheets.");
  }

  const divisionData = {};

  for (const sheet of divisionConfig.sheets) {
    if (!sheet.name || !sheet.csvUrl) {
      console.warn("Skipping an invalid sheet configuration.");
      continue;
    }

    try {
      const rows = await loadPublishedWorksheet(sheet.csvUrl);
      divisionData[sheet.name] = rows;
    } catch (error) {
      console.error(`Failed to load sheet "${sheet.name}":`, error.message);

      divisionData[sheet.name] = {
        error: error.message,
        rows: [],
      };
    }
  }

  return divisionData;
}

module.exports = {
  loadPublishedWorksheet,
  loadDivisionData,
};