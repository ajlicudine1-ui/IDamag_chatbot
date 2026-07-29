import React, { useEffect, useState } from "react";

const API_URL = (
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api"
).replace(/\/$/, "");

async function readJsonResponse(response) {
  const contentType =
    response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const responseText = await response.text();

    console.error("Non-JSON server response:", responseText);

    throw new Error(
      `The server did not return valid JSON. HTTP ${response.status}.`
    );
  }

  return response.json();
}

const Chatbot = () => {
  const [divisions, setDivisions] = useState([]);
  const [offices, setOffices] = useState([]);
  const [reports, setReports] = useState([]);

  const [selectedDivision, setSelectedDivision] =
    useState("");
  const [selectedOffice, setSelectedOffice] =
    useState("");
  const [selectedReport, setSelectedReport] =
    useState("");

  const [selectionLoading, setSelectionLoading] =
    useState(false);
  const [selectionError, setSelectionError] =
    useState("");

  const [question, setQuestion] = useState("");

  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "Hello! Select a division, office or section, and report before asking a question.",
    },
  ]);

  const [loading, setLoading] = useState(false);

  // Step 1: Load top-level divisions
  useEffect(() => {
    let isMounted = true;

    const loadDivisions = async () => {
      try {
        setSelectionLoading(true);
        setSelectionError("");

        const response = await fetch(
          `${API_URL}/chatbot/divisions`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
          }
        );

        const data = await readJsonResponse(response);

        if (!response.ok) {
          throw new Error(
            data.message ||
              data.error ||
              "Unable to load divisions."
          );
        }

        if (isMounted) {
          setDivisions(
            Array.isArray(data.divisions)
              ? data.divisions
              : []
          );
        }
      } catch (error) {
        console.error(
          "Error loading divisions:",
          error
        );

        if (isMounted) {
          setDivisions([]);
          setSelectionError(
            error.message ||
              "Unable to load divisions."
          );
        }
      } finally {
        if (isMounted) {
          setSelectionLoading(false);
        }
      }
    };

    loadDivisions();

    return () => {
      isMounted = false;
    };
  }, []);

  // Step 2: Load offices/sections
  useEffect(() => {
    let isMounted = true;

    const loadOffices = async () => {
      setOffices([]);
      setReports([]);
      setSelectedOffice("");
      setSelectedReport("");

      if (!selectedDivision) {
        return;
      }

      try {
        setSelectionLoading(true);
        setSelectionError("");

        const response = await fetch(
          `${API_URL}/chatbot/offices?divisionId=${encodeURIComponent(
            selectedDivision
          )}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
          }
        );

        const data = await readJsonResponse(response);

        if (!response.ok) {
          throw new Error(
            data.message ||
              data.error ||
              "Unable to load offices."
          );
        }

        if (isMounted) {
          setOffices(
            Array.isArray(data.offices)
              ? data.offices
              : []
          );
        }
      } catch (error) {
        console.error(
          "Error loading offices:",
          error
        );

        if (isMounted) {
          setOffices([]);
          setSelectionError(
            error.message ||
              "Unable to load offices."
          );
        }
      } finally {
        if (isMounted) {
          setSelectionLoading(false);
        }
      }
    };

    loadOffices();

    return () => {
      isMounted = false;
    };
  }, [selectedDivision]);

  // Step 3: Load reports
  useEffect(() => {
    let isMounted = true;

    const loadReports = async () => {
      setReports([]);
      setSelectedReport("");

      if (!selectedOffice) {
        return;
      }

      try {
        setSelectionLoading(true);
        setSelectionError("");

        const response = await fetch(
          `${API_URL}/chatbot/reports?officeId=${encodeURIComponent(
            selectedOffice
          )}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
          }
        );

        const data = await readJsonResponse(response);

        if (!response.ok) {
          throw new Error(
            data.message ||
              data.error ||
              "Unable to load reports."
          );
        }

        if (isMounted) {
          setReports(
            Array.isArray(data.reports)
              ? data.reports
              : []
          );
        }
      } catch (error) {
        console.error(
          "Error loading reports:",
          error
        );

        if (isMounted) {
          setReports([]);
          setSelectionError(
            error.message ||
              "Unable to load reports."
          );
        }
      } finally {
        if (isMounted) {
          setSelectionLoading(false);
        }
      }
    };

    loadReports();

    return () => {
      isMounted = false;
    };
  }, [selectedOffice]);

  const handleDivisionChange = (event) => {
    setSelectedDivision(event.target.value);
    setSelectedOffice("");
    setSelectedReport("");
    setSelectionError("");

    setMessages([
      {
        role: "bot",
        text: "Now select an office or section.",
      },
    ]);
  };

  const handleOfficeChange = (event) => {
    setSelectedOffice(event.target.value);
    setSelectedReport("");
    setSelectionError("");

    setMessages([
      {
        role: "bot",
        text: "Now select the report you want to ask questions about.",
      },
    ]);
  };

  const handleReportChange = (event) => {
    const reportId = event.target.value;

    setSelectedReport(reportId);
    setSelectionError("");

    const report = reports.find(
      (item) =>
        Number(item.id) === Number(reportId)
    );

    if (!report) {
      return;
    }

    if (!report.hasSheet) {
      setMessages([
        {
          role: "bot",
          text: `"${report.title}" does not have a Google Sheet connected yet.`,
        },
      ]);

      return;
    }

    setMessages([
      {
        role: "bot",
        text: `You selected "${report.title}". You can now ask questions about its Google Sheet data.`,
      },
    ]);
  };

  const sendQuestion = async () => {
    const trimmedQuestion = question.trim();

    const report = reports.find(
      (item) =>
        Number(item.id) ===
        Number(selectedReport)
    );

    if (
      !trimmedQuestion ||
      loading ||
      !selectedReport
    ) {
      return;
    }

    if (!report?.hasSheet) {
      setMessages((current) => [
        ...current,
        {
          role: "bot",
          text: "The selected report does not have a Google Sheet connected.",
        },
      ]);

      return;
    }

    setMessages((current) => [
      ...current,
      {
        role: "user",
        text: trimmedQuestion,
      },
    ]);

    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/chatbot/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            question: trimmedQuestion,
            reportId: Number(selectedReport),
          }),
        }
      );

      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(
          data.message ||
            data.error ||
            "Unable to get an answer."
        );
      }

      setMessages((current) => [
        ...current,
        {
          role: "bot",
          text:
            data.answer ||
            "The chatbot did not return an answer.",
        },
      ]);
    } catch (error) {
      console.error("Chatbot error:", error);

      setMessages((current) => [
        ...current,
        {
          role: "bot",
          text:
            error.message ||
            "Unable to connect to the chatbot server.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendQuestion();
    }
  };

  const selectedReportData = reports.find(
    (report) =>
      Number(report.id) ===
      Number(selectedReport)
  );

  const canChat =
    Boolean(selectedDivision) &&
    Boolean(selectedOffice) &&
    Boolean(selectedReport) &&
    Boolean(selectedReportData?.hasSheet);

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto flex h-[85vh] max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="bg-green-800 px-6 py-5 text-white">
          <h1 className="text-2xl font-bold">
            iDamag Chatbot
          </h1>

          <p className="mt-1 text-sm text-green-100">
            Select a division, office or section,
            and report before asking about its data.
          </p>
        </div>

        <div className="border-b border-slate-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label
                htmlFor="division"
                className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500"
              >
                1. Division
              </label>

              <select
                id="division"
                value={selectedDivision}
                onChange={handleDivisionChange}
                disabled={selectionLoading}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-green-700 focus:ring-2 focus:ring-green-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="">
                  Select Division
                </option>

                {divisions.map((division) => (
                  <option
                    key={division.id}
                    value={division.id}
                  >
                    {division.acronym
                      ? `${division.acronym} - ${division.name}`
                      : division.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="office"
                className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500"
              >
                2. Office / Section
              </label>

              <select
                id="office"
                value={selectedOffice}
                onChange={handleOfficeChange}
                disabled={
                  !selectedDivision ||
                  selectionLoading
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-green-700 focus:ring-2 focus:ring-green-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="">
                  {selectedDivision
                    ? "Select Office or Section"
                    : "Select Division First"}
                </option>

                {offices.map((office) => (
                  <option
                    key={office.id}
                    value={office.id}
                  >
                    {office.acronym
                      ? `${office.acronym} - ${office.name}`
                      : office.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="report"
                className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500"
              >
                3. Report
              </label>

              <select
                id="report"
                value={selectedReport}
                onChange={handleReportChange}
                disabled={
                  !selectedOffice ||
                  selectionLoading
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-green-700 focus:ring-2 focus:ring-green-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="">
                  {selectedOffice
                    ? "Select Report"
                    : "Select Office First"}
                </option>

                {reports.map((report) => (
                  <option
                    key={report.id}
                    value={report.id}
                  >
                    {report.title}
                    {!report.hasSheet
                      ? " — No Google Sheet"
                      : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectionLoading && (
            <p className="mt-3 text-sm text-slate-500">
              Loading available options...
            </p>
          )}

          {selectionError && (
            <p className="mt-3 text-sm font-semibold text-red-600">
              {selectionError}
            </p>
          )}

          {selectedReportData && (
            <div
              className={`mt-4 rounded-xl border px-4 py-3 ${
                selectedReportData.hasSheet
                  ? "border-green-100 bg-green-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <p
                className={`text-sm font-semibold ${
                  selectedReportData.hasSheet
                    ? "text-green-800"
                    : "text-amber-800"
                }`}
              >
                Selected report:{" "}
                {selectedReportData.title}
              </p>

              <p
                className={`mt-1 text-xs ${
                  selectedReportData.hasSheet
                    ? "text-green-700"
                    : "text-amber-700"
                }`}
              >
                {selectedReportData.hasSheet
                  ? "The chatbot will use the Google Sheet connected to this report."
                  : "This report has no Google Sheet URL configured."}
              </p>
            </div>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-6">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`flex ${
                message.role === "user"
                  ? "justify-end"
                  : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "bg-green-700 text-white"
                    : "border border-slate-200 bg-white text-slate-700"
                }`}
              >
                {message.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                Checking the selected report&apos;s
                Google Sheet...
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-white p-4">
          {!canChat && (
            <p className="mb-3 text-center text-sm font-medium text-amber-600">
              Select a report with a connected Google
              Sheet to enable the chatbot.
            </p>
          )}

          <div className="flex items-end gap-3">
            <textarea
              value={question}
              onChange={(event) =>
                setQuestion(event.target.value)
              }
              onKeyDown={handleKeyDown}
              placeholder={
                canChat
                  ? "Ask a question about the selected report..."
                  : "Complete the selections above first..."
              }
              rows={2}
              disabled={!canChat || loading}
              className="flex-1 resize-none rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-green-700 focus:ring-2 focus:ring-green-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            />

            <button
              type="button"
              onClick={sendQuestion}
              disabled={
                loading ||
                !question.trim() ||
                !canChat
              }
              className="rounded-2xl bg-green-700 px-6 py-3 font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? "Sending..." : "Ask"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;