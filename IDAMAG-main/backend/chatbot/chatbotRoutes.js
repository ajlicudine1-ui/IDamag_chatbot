const express = require("express");
const divisions = require("./divisions");
const { loadDivisionData } = require("./googleSheetsService");
const {
  answerQuestion,
} = require("../chatbotEngine/chatbotService");

const router = express.Router();

/**
 * GET /api/chatbot/divisions
 */
router.get("/divisions", (req, res) => {
  const divisionList = Object.entries(divisions).map(
    ([code, division]) => ({
      code,
      name: division.name,
      sheetCount: Array.isArray(division.sheets)
        ? division.sheets.length
        : 0,
    })
  );

  return res.json({
    success: true,
    divisions: divisionList,
  });
});

/**
 * GET /api/chatbot/inspect/:division
 */
router.get("/inspect/:division", async (req, res) => {
  try {
    const divisionCode = String(req.params.division || "")
      .trim()
      .toUpperCase();

    const divisionConfig = divisions[divisionCode];

    if (!divisionConfig) {
      return res.status(404).json({
        success: false,
        message: `Division "${divisionCode}" was not found.`,
      });
    }

    const divisionData = await loadDivisionData(
      divisionConfig
    );

    const worksheets = Object.entries(divisionData).map(
      ([worksheetName, sheetData]) => {
        let rows = [];
        let error = null;

        if (Array.isArray(sheetData)) {
          rows = sheetData;
        } else {
          rows = sheetData.rows || [];
          error = sheetData.error || null;
        }

        const columnNames = new Set();

        for (const row of rows.slice(0, 20)) {
          Object.keys(row).forEach((columnName) => {
            columnNames.add(columnName);
          });
        }

        return {
          worksheetName,
          rowCount: rows.length,
          columns: Array.from(columnNames),
          error,
        };
      }
    );

    return res.json({
      success: true,
      division: divisionCode,
      divisionName: divisionConfig.name,
      worksheets,
    });
  } catch (error) {
    console.error("Chatbot inspection error:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to inspect the Google Sheet.",
    });
  }
});

/**
 * POST /api/chatbot/chat
 *
 * Example request:
 * {
 *   "division": "FOD",
 *   "sheet": "Sheet1",
 *   "question": "What is the total Area (ha)?"
 * }
 */
router.post("/chat", async (req, res) => {
  try {
    const divisionCode = String(
      req.body.division || ""
    )
      .trim()
      .toUpperCase();

    const requestedSheet = String(
      req.body.sheet || ""
    ).trim();

    const question = String(
      req.body.question || ""
    ).trim();

    if (!divisionCode) {
      return res.status(400).json({
        success: false,
        message: "Division is required.",
      });
    }

    if (!question) {
      return res.status(400).json({
        success: false,
        message: "Question is required.",
      });
    }

    const divisionConfig = divisions[divisionCode];

    if (!divisionConfig) {
      return res.status(404).json({
        success: false,
        message: `Division "${divisionCode}" was not found.`,
      });
    }

    const divisionData = await loadDivisionData(
      divisionConfig
    );

    const availableSheets = Object.keys(divisionData);

    if (availableSheets.length === 0) {
      return res.status(500).json({
        success: false,
        message:
          "No Google Sheets are configured for this division.",
      });
    }

    const result = await answerQuestion(divisionData, question);

    const totalRows = Object.values(divisionData).reduce(
    (total, sheet) => {
      if (Array.isArray(sheet)) {
        return total + sheet.length;
      }

      return total + (sheet.rows?.length || 0);
    },
    0
  );

  return res.json({
    ...result,
    division: divisionCode,
    divisionName: divisionConfig.name,
    question,
    worksheetCount: availableSheets.length,
    totalRows,
  });
  } catch (error) {
    console.error("Chatbot question error:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "The chatbot was unable to answer the question.",
    });
  }
});

module.exports = router;