const express = require("express");

const {
  Report,
  Division,
  Office,
} = require("../models/index");

const {
  loadDivisionData,
} = require("./googleSheetsService");

const {
  answerQuestion,
} = require("../chatbotEngine/chatbotService");

const router = express.Router();

/**
 * Convert a normal Google Sheets URL into a CSV export URL.
 */
function normalizeGoogleSheetsUrl(sheetUrl) {
  if (!sheetUrl || typeof sheetUrl !== "string") {
    throw new Error(
      "No Google Sheets URL is configured for this report."
    );
  }

  const trimmedUrl = sheetUrl.trim();

  if (!trimmedUrl.startsWith("https://")) {
    throw new Error(
      "The configured Google Sheets URL is invalid."
    );
  }

  // Already a CSV-compatible URL
  if (
    trimmedUrl.includes("output=csv") ||
    trimmedUrl.includes("export?format=csv")
  ) {
    return trimmedUrl;
  }

  const sheetIdMatch = trimmedUrl.match(
    /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
  );

  if (!sheetIdMatch) {
    throw new Error(
      "The configured link is not a valid Google Sheets URL."
    );
  }

  const sheetId = sheetIdMatch[1];
  let gid = "0";

  try {
    const parsedUrl = new URL(trimmedUrl);

    const queryGid =
      parsedUrl.searchParams.get("gid");

    if (queryGid) {
      gid = queryGid;
    }

    if (parsedUrl.hash) {
      const hashMatch =
        parsedUrl.hash.match(/gid=(\d+)/);

      if (hashMatch) {
        gid = hashMatch[1];
      }
    }
  } catch {
    // Use the first worksheet when no gid is found.
  }

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

/**
 * Load a report and confirm that it has a Google Sheet URL.
 */
async function getReportDataset(reportId) {
  const numericReportId = Number(reportId);

  if (!Number.isInteger(numericReportId)) {
    const error = new Error(
      "A valid report ID is required."
    );

    error.statusCode = 400;
    throw error;
  }

  const report = await Report.findByPk(
    numericReportId,
    {
      include: [
        {
          model: Division,
          as: "division",
          include: [
            {
              model: Office,
              as: "office",
            },
          ],
        },
      ],
    }
  );

  if (!report) {
    const error = new Error(
      "Report not found."
    );

    error.statusCode = 404;
    throw error;
  }

  if (!report.sheetUrl) {
    const error = new Error(
      `No Google Sheet is configured for "${report.title}".`
    );

    error.statusCode = 400;
    throw error;
  }

  const csvUrl =
    normalizeGoogleSheetsUrl(
      report.sheetUrl
    );

  return {
    report,
    csvUrl,
  };
}

/**
 * GET /api/chatbot/divisions
 *
 * Returns top-level entries from the offices table.
 *
 * In your database:
 * offices = AFD, FOD, PMED, AMAD, etc.
 *
 * The chatbot UI labels these as "Division".
 */
router.get("/divisions", async (req, res) => {
  try {
    const offices = await Office.findAll({
      order: [["name", "ASC"]],
    });

    return res.json({
      success: true,
      divisions: offices.map((office) => ({
        id: Number(office.id),
        code: office.acronym || "",
        acronym: office.acronym || "",
        name: office.name,
      })),
    });
  } catch (error) {
    console.error(
      "Unable to load chatbot divisions:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to load divisions.",
    });
  }
});

/**
 * GET /api/chatbot/offices?divisionId=1
 *
 * Returns the sections belonging to the selected
 * top-level division.
 *
 * In your database:
 * divisions = Budget Section, Accounting Section, etc.
 *
 * The chatbot UI labels these as "Office / Section".
 */
router.get("/offices", async (req, res) => {
  try {
    const divisionId = Number(
      req.query.divisionId
    );

    if (!Number.isInteger(divisionId)) {
      return res.status(400).json({
        success: false,
        message:
          "A valid division ID is required.",
      });
    }

    const parentOffice =
      await Office.findByPk(divisionId);

    if (!parentOffice) {
      return res.status(404).json({
        success: false,
        message:
          "The selected division was not found.",
      });
    }

    const sections =
      await Division.findAll({
        where: {
          officeId: divisionId,
        },
        order: [["name", "ASC"]],
      });

    return res.json({
      success: true,
      division: {
        id: Number(parentOffice.id),
        code: parentOffice.acronym || "",
        acronym:
          parentOffice.acronym || "",
        name: parentOffice.name,
      },
      offices: sections.map((section) => ({
        id: Number(section.id),
        code: section.acronym || "",
        acronym: section.acronym || "",
        name: section.name,
        divisionId: Number(
          section.officeId
        ),
      })),
    });
  } catch (error) {
    console.error(
      "Unable to load chatbot offices:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to load offices.",
    });
  }
});

/**
 * GET /api/chatbot/reports?officeId=8
 *
 * Returns reports belonging to the selected
 * office or section.
 */
router.get("/reports", async (req, res) => {
  try {
    const officeId = Number(
      req.query.officeId
    );

    if (!Number.isInteger(officeId)) {
      return res.status(400).json({
        success: false,
        message:
          "A valid office ID is required.",
      });
    }

    const selectedDivision =
      await Division.findByPk(officeId);

    if (!selectedDivision) {
      return res.status(404).json({
        success: false,
        message:
          "The selected office or section was not found.",
      });
    }

    const reports =
      await Report.findAll({
        where: {
          divisionId: officeId,
        },
        order: [["title", "ASC"]],
      });

    return res.json({
      success: true,
      office: {
        id: Number(
          selectedDivision.id
        ),
        code:
          selectedDivision.acronym || "",
        acronym:
          selectedDivision.acronym || "",
        name: selectedDivision.name,
        divisionId: Number(
          selectedDivision.officeId
        ),
      },
      reports: reports.map((report) => ({
        id: Number(report.id),
        title: report.title,
        description:
          report.description || "",
        hasSheet: Boolean(
          report.sheetUrl
        ),
      })),
    });
  } catch (error) {
    console.error(
      "Unable to load chatbot reports:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to load reports.",
    });
  }
});

/**
 * GET /api/chatbot/reports/:reportId/inspect
 *
 * Inspect the Google Sheet connected to a report.
 */
router.get(
  "/reports/:reportId/inspect",
  async (req, res) => {
    try {
      const { report, csvUrl } =
        await getReportDataset(
          req.params.reportId
        );

      const reportConfig = {
        name: report.title,
        sheets: [
          {
            name: "Sheet1",
            csvUrl,
          },
        ],
      };

      const reportData =
        await loadDivisionData(
          reportConfig
        );

      const worksheets =
        Object.entries(reportData).map(
          ([
            worksheetName,
            sheetData,
          ]) => {
            let rows = [];
            let error = null;

            if (
              Array.isArray(sheetData)
            ) {
              rows = sheetData;
            } else {
              rows =
                sheetData?.rows || [];
              error =
                sheetData?.error || null;
            }

            const columnNames =
              new Set();

            for (
              const row of rows.slice(
                0,
                20
              )
            ) {
              Object.keys(row).forEach(
                (columnName) => {
                  columnNames.add(
                    columnName
                  );
                }
              );
            }

            return {
              worksheetName,
              rowCount: rows.length,
              columns:
                Array.from(columnNames),
              error,
            };
          }
        );

      return res.json({
        success: true,
        report: {
          id: Number(report.id),
          title: report.title,
          divisionId: Number(
            report.divisionId
          ),
          office:
            report.division?.name ||
            null,
          division:
            report.division?.office
              ?.name || null,
        },
        worksheets,
      });
    } catch (error) {
      console.error(
        "Chatbot inspection error:",
        error
      );

      return res
        .status(
          error.statusCode || 500
        )
        .json({
          success: false,
          message:
            error.message ||
            "Unable to inspect the Google Sheet.",
        });
    }
  }
);

/**
 * POST /api/chatbot/chat
 *
 * Request:
 * {
 *   "reportId": 17,
 *   "question": "What is the total number of respondents?"
 * }
 */
router.post("/chat", async (req, res) => {
  try {
    const question = String(
      req.body.question || ""
    ).trim();

    const reportId = Number(
      req.body.reportId
    );

    if (!question) {
      return res.status(400).json({
        success: false,
        message:
          "Question is required.",
      });
    }

    if (!Number.isInteger(reportId)) {
      return res.status(400).json({
        success: false,
        message:
          "A valid report ID is required.",
      });
    }

    const { report, csvUrl } =
      await getReportDataset(reportId);

    const reportConfig = {
      name: report.title,
      sheets: [
        {
          name: "Sheet1",
          csvUrl,
        },
      ],
    };

    const reportData =
      await loadDivisionData(
        reportConfig
      );

    const availableSheets =
      Object.keys(reportData);

    if (
      availableSheets.length === 0
    ) {
      return res.status(500).json({
        success: false,
        message:
          "The selected report did not return any Google Sheets data.",
      });
    }

    const totalRows =
      Object.values(reportData).reduce(
        (total, sheet) => {
          if (Array.isArray(sheet)) {
            return (
              total + sheet.length
            );
          }

          return (
            total +
            (sheet?.rows?.length || 0)
          );
        },
        0
      );

    if (totalRows === 0) {
      return res.status(400).json({
        success: false,
        message:
          "The connected Google Sheet contains no readable rows.",
      });
    }

    const result =
      await answerQuestion(
        reportData,
        question
      );

    return res.json({
      ...result,
      success:
        typeof result?.success ===
        "boolean"
          ? result.success
          : true,
      question,
      report: {
        id: Number(report.id),
        title: report.title,
        divisionId: Number(
          report.divisionId
        ),
        office:
          report.division?.name ||
          null,
        division:
          report.division?.office
            ?.name || null,
      },
      worksheetCount:
        availableSheets.length,
      totalRows,
    });
  } catch (error) {
    console.error(
      "Chatbot question error:",
      error
    );

    return res
      .status(error.statusCode || 500)
      .json({
        success: false,
        message:
          error.message ||
          "The chatbot was unable to answer the question.",
      });
  }
});

module.exports = router;