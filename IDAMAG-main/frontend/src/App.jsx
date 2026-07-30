import React, { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";

import Home from "./components/public/Home";
import OfficeLayout from "./components/public/OfficeLayout";
import Feedback from "./components/public/Feedback";
import Chatbot from "./components/public/Chatbot";
import NotFound from "./components/public/NotFound";

import Login from "./pages/admin/Login";
import Register from "./pages/admin/Register";
import StaffDashboard from "./pages/admin/StaffDashboard";
import UserManagement from "./pages/admin/UserManagement";
import OfficeDivisionManagement from "./pages/admin/OfficeDivisionManagement";
import ActivityLog from "./pages/admin/ActivityLog";
import Help from "./pages/Help";

import ProtectedRoute from "./components/auth/ProtectedRoute";
import PublicRoute from "./components/auth/PublicRoute";
import FloatingChatbotButton from "./components/public/FloatingChatbotButton";
import UserGuide from "./components/public/UserGuide";

/*
 * Supports either:
 *
 * VITE_API_URL=https://i-damag-chatbot-61hx.vercel.app
 *
 * or:
 *
 * VITE_API_URL=https://i-damag-chatbot-61hx.vercel.app/api
 *
 * It always produces one final /api segment.
 */
const RAW_API_URL = (
  import.meta.env.VITE_API_URL ||
  "https://i-damag-chatbot-61hx.vercel.app"
).replace(/\/+$/, "");

const API_URL = RAW_API_URL.endsWith("/api")
  ? RAW_API_URL
  : `${RAW_API_URL}/api`;

async function readJsonResponse(response) {
  const contentType =
    response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const responseText = await response.text();

    console.error(
      "Server returned a non-JSON response:",
      responseText
    );

    throw new Error(
      `The server did not return valid JSON. HTTP ${response.status}.`
    );
  }

  return response.json();
}

function App() {
  const [isChatbotOpen, setIsChatbotOpen] =
    useState(false);

  // Selection data
  const [divisions, setDivisions] = useState([]);
  const [offices, setOffices] = useState([]);
  const [reports, setReports] = useState([]);

  // Selected items
  const [selectedDivision, setSelectedDivision] =
    useState(null);
  const [selectedOffice, setSelectedOffice] =
    useState(null);
  const [selectedReport, setSelectedReport] =
    useState(null);

  // Selection loading and errors
  const [selectionLoading, setSelectionLoading] =
    useState(false);
  const [selectionError, setSelectionError] =
    useState("");

  // Chat states
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] =
    useState(false);

  const resetChatbot = () => {
    setSelectedDivision(null);
    setSelectedOffice(null);
    setSelectedReport(null);

    setOffices([]);
    setReports([]);

    setQuestion("");
    setMessages([]);

    setSelectionError("");
    setChatLoading(false);
  };

  /*
   * Step 1:
   * Load top-level divisions from the offices table.
   */
  useEffect(() => {
    if (!isChatbotOpen || divisions.length > 0) {
      return;
    }

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

        const divisionList = Array.isArray(
          data.divisions
        )
          ? data.divisions
          : [];

        const normalizedDivisions =
          divisionList.map((division, index) => ({
            id: Number(division.id),

            code:
              division.code ||
              division.acronym ||
              `division-${index + 1}`,

            acronym:
              division.acronym ||
              division.code ||
              "",

            name:
              division.name ||
              "Unnamed Division",

            description:
              division.description ||
              `Ask questions about ${
                division.name ||
                division.code ||
                "this division"
              } data.`,
          }));

        if (isMounted) {
          setDivisions(normalizedDivisions);
        }
      } catch (error) {
        console.error(
          "Unable to load chatbot divisions:",
          error
        );

        if (isMounted) {
          setDivisions([]);

          setSelectionError(
            error.message ||
              "Unable to connect to the chatbot server."
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
  }, [isChatbotOpen, divisions.length]);

  /*
   * Step 2:
   * Load offices/sections after selecting a division.
   */
  useEffect(() => {
    if (!selectedDivision?.id) {
      return;
    }

    let isMounted = true;

    const loadOffices = async () => {
      try {
        setSelectionLoading(true);
        setSelectionError("");

        setOffices([]);
        setReports([]);

        setSelectedOffice(null);
        setSelectedReport(null);

        const response = await fetch(
          `${API_URL}/chatbot/offices?divisionId=${encodeURIComponent(
            selectedDivision.id
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
              "Unable to load offices or sections."
          );
        }

        const officeList = Array.isArray(
          data.offices
        )
          ? data.offices
          : [];

        if (isMounted) {
          setOffices(
            officeList.map((office) => ({
              id: Number(office.id),

              code:
                office.code ||
                office.acronym ||
                "",

              acronym:
                office.acronym ||
                office.code ||
                "",

              name:
                office.name ||
                "Unnamed Office or Section",

              divisionId: Number(
                office.divisionId
              ),
            }))
          );
        }
      } catch (error) {
        console.error(
          "Unable to load chatbot offices:",
          error
        );

        if (isMounted) {
          setOffices([]);

          setSelectionError(
            error.message ||
              "Unable to load offices or sections."
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

  /*
   * Step 3:
   * Load reports after selecting an office/section.
   */
  useEffect(() => {
    if (!selectedOffice?.id) {
      return;
    }

    let isMounted = true;

    const loadReports = async () => {
      try {
        setSelectionLoading(true);
        setSelectionError("");

        setReports([]);
        setSelectedReport(null);

        const response = await fetch(
          `${API_URL}/chatbot/reports?officeId=${encodeURIComponent(
            selectedOffice.id
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

        const reportList = Array.isArray(
          data.reports
        )
          ? data.reports
          : [];

        if (isMounted) {
          setReports(
            reportList.map((report) => ({
              id: Number(report.id),
              title:
                report.title ||
                "Untitled Report",
              description:
                report.description || "",
              hasSheet: Boolean(
                report.hasSheet
              ),
            }))
          );
        }
      } catch (error) {
        console.error(
          "Unable to load chatbot reports:",
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

  const handleToggleChatbot = () => {
    setIsChatbotOpen((current) => !current);
  };

  const handleCloseChatbot = () => {
    setIsChatbotOpen(false);
    resetChatbot();
  };

  const handleSelectDivision = (division) => {
    setSelectedDivision(division);
    setSelectedOffice(null);
    setSelectedReport(null);

    setOffices([]);
    setReports([]);

    setMessages([]);
    setQuestion("");
    setSelectionError("");
  };

  const handleSelectOffice = (office) => {
    setSelectedOffice(office);
    setSelectedReport(null);

    setReports([]);

    setMessages([]);
    setQuestion("");
    setSelectionError("");
  };

  const handleSelectReport = (report) => {
    setSelectedReport(report);
    setSelectionError("");
    setQuestion("");

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
        text: `Hello! You selected "${report.title}". Ask me a question about its connected Google Sheet data.`,
      },
    ]);
  };

  const handleBack = () => {
    if (selectedReport) {
      setSelectedReport(null);
      setMessages([]);
      setQuestion("");
      return;
    }

    if (selectedOffice) {
      setSelectedOffice(null);
      setSelectedReport(null);
      setReports([]);
      setMessages([]);
      setQuestion("");
      return;
    }

    if (selectedDivision) {
      setSelectedDivision(null);
      setSelectedOffice(null);
      setSelectedReport(null);

      setOffices([]);
      setReports([]);

      setMessages([]);
      setQuestion("");
    }
  };

  const handleRetry = () => {
    setSelectionError("");

    if (!selectedDivision) {
      setDivisions([]);
      return;
    }

    if (!selectedOffice) {
      const savedDivision =
        selectedDivision;

      setSelectedDivision(null);

      setTimeout(() => {
        setSelectedDivision(
          savedDivision
        );
      }, 0);

      return;
    }

    const savedOffice = selectedOffice;

    setSelectedOffice(null);

    setTimeout(() => {
      setSelectedOffice(savedOffice);
    }, 0);
  };

  const sendQuestion = async () => {
    const trimmedQuestion = question.trim();

    if (
      !trimmedQuestion ||
      chatLoading ||
      !selectedReport?.id ||
      !selectedReport.hasSheet
    ) {
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
    setChatLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/chatbot/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            question: trimmedQuestion,

            // Database reports.id
            reportId: Number(
              selectedReport.id
            ),
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
      console.error(
        "Chatbot question error:",
        error
      );

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
      setChatLoading(false);
    }
  };

  const handleQuestionKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendQuestion();
    }
  };

  const showBackButton =
    selectedDivision ||
    selectedOffice ||
    selectedReport;

  let chatbotSubtitle = "Choose a dashboard";

  if (selectedReport) {
    chatbotSubtitle =
      selectedReport.title;
  } else if (selectedOffice) {
    chatbotSubtitle =
      selectedOffice.name;
  } else if (selectedDivision) {
    chatbotSubtitle =
      selectedDivision.name;
  }

  return (
    <div className="min-h-screen font-sans selection:bg-moss-200 selection:text-moss-900 scroll-smooth text-slate-900">
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home />} />

        <Route
          path="/office/:officeId"
          element={<OfficeLayout />}
        />

        <Route
          path="/feedback"
          element={<Feedback />}
        />

        <Route
          path="/chatbot"
          element={<Chatbot />}
        />

        {/* Authentication Routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        <Route
          path="/register"
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          }
        />

        {/* Protected Routes */}
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <StaffDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/users"
          element={
            <ProtectedRoute
              requiresAdmin={true}
            >
              <UserManagement />
            </ProtectedRoute>
          }
        />

        <Route
          path="/office-division-management"
          element={
            <ProtectedRoute
              requiresAdmin={true}
            >
              <OfficeDivisionManagement />
            </ProtectedRoute>
          }
        />

        <Route
          path="/activity-logs"
          element={
            <ProtectedRoute
              requiresAdmin={true}
            >
              <ActivityLog />
            </ProtectedRoute>
          }
        />

        <Route
          path="/help"
          element={
            <ProtectedRoute>
              <Help />
            </ProtectedRoute>
          }
        />
        <Route path="/user-guide" element={<UserGuide />} />

        <Route
          path="*"
          element={<NotFound />}
        />
      </Routes>

      {/* Floating Chatbot Popup */}
      {isChatbotOpen && (
        <div className="fixed bottom-32 right-6 z-[9998] flex h-[620px] w-[420px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex min-h-[82px] items-center justify-between bg-[#1F2A7A] px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              {showBackButton && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-white transition hover:bg-white/10"
                  aria-label="Go back"
                >
                  ←
                </button>
              )}

              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-white">
                  iDamag Assistant
                </h2>

                <p className="truncate text-sm text-blue-100">
                  {chatbotSubtitle}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCloseChatbot}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-white transition hover:bg-white/10"
              aria-label="Close chatbot"
            >
              ×
            </button>
          </div>

          {/* Loading */}
          {selectionLoading && (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#1F2A7A]" />

              <p className="mt-4 text-sm text-slate-500">
                Loading available options...
              </p>
            </div>
          )}

          {/* Error */}
          {!selectionLoading &&
            selectionError && (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl text-red-600">
                  !
                </div>

                <p className="font-bold text-slate-800">
                  Unable to load data
                </p>

                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  {selectionError}
                </p>

                <button
                  type="button"
                  onClick={handleRetry}
                  className="mt-5 rounded-xl bg-[#1F2A7A] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Try again
                </button>
              </div>
            )}

          {/* Step 1: Division */}
          {!selectionLoading &&
            !selectionError &&
            !selectedDivision && (
              <div className="flex-1 overflow-y-auto p-5">
                <div className="mb-5">
                  <h3 className="text-lg font-bold text-slate-800">
                    Select a division
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Choose the division whose
                    data you want to ask about.
                  </p>
                </div>

                {divisions.length > 0 ? (
                  <div className="space-y-3">
                    {divisions.map(
                      (division) => (
                        <button
                          key={division.id}
                          type="button"
                          onClick={() =>
                            handleSelectDivision(
                              division
                            )
                          }
                          className="group w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-[#1F2A7A] hover:bg-blue-50 hover:shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold text-[#1F2A7A]">
                                {division.acronym ||
                                  division.code}
                              </p>

                              <p className="mt-1 text-sm font-semibold text-slate-700">
                                {division.name}
                              </p>

                              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                                {
                                  division.description
                                }
                              </p>
                            </div>

                            <span className="shrink-0 text-2xl text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#1F2A7A]">
                              ›
                            </span>
                          </div>
                        </button>
                      )
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
                    <p className="font-semibold text-slate-800">
                      No divisions available
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      No divisions were returned
                      from the database.
                    </p>
                  </div>
                )}
              </div>
            )}

          {/* Step 2: Office / Section */}
          {!selectionLoading &&
            !selectionError &&
            selectedDivision &&
            !selectedOffice && (
              <div className="flex-1 overflow-y-auto p-5">
                <div className="mb-5">
                  <h3 className="text-lg font-bold text-slate-800">
                    Select an office or section
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Choose an office or section
                    under{" "}
                    <strong>
                      {selectedDivision.name}
                    </strong>
                    .
                  </p>
                </div>

                {offices.length > 0 ? (
                  <div className="space-y-3">
                    {offices.map((office) => (
                      <button
                        key={office.id}
                        type="button"
                        onClick={() =>
                          handleSelectOffice(
                            office
                          )
                        }
                        className="group w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-[#1F2A7A] hover:bg-blue-50 hover:shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            {office.acronym && (
                              <p className="font-bold text-[#1F2A7A]">
                                {
                                  office.acronym
                                }
                              </p>
                            )}

                            <p className="mt-1 text-sm font-semibold text-slate-700">
                              {office.name}
                            </p>
                          </div>

                          <span className="shrink-0 text-2xl text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#1F2A7A]">
                            ›
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
                    <p className="font-semibold text-slate-800">
                      No offices or sections
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      This division currently has
                      no offices or sections.
                    </p>
                  </div>
                )}
              </div>
            )}

          {/* Step 3: Report */}
          {!selectionLoading &&
            !selectionError &&
            selectedOffice &&
            !selectedReport && (
              <div className="flex-1 overflow-y-auto p-5">
                <div className="mb-5">
                  <h3 className="text-lg font-bold text-slate-800">
                    Select a report
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Choose a report under{" "}
                    <strong>
                      {selectedOffice.name}
                    </strong>
                    .
                  </p>
                </div>

                {reports.length > 0 ? (
                  <div className="space-y-3">
                    {reports.map((report) => (
                      <button
                        key={report.id}
                        type="button"
                        onClick={() =>
                          handleSelectReport(
                            report
                          )
                        }
                        className={`group w-full rounded-2xl border px-4 py-4 text-left transition ${
                          report.hasSheet
                            ? "border-slate-200 bg-white hover:border-[#1F2A7A] hover:bg-blue-50 hover:shadow-sm"
                            : "border-amber-200 bg-amber-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800">
                              {report.title}
                            </p>

                            {report.description && (
                              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                                {
                                  report.description
                                }
                              </p>
                            )}

                            <p
                              className={`mt-2 text-xs font-semibold ${
                                report.hasSheet
                                  ? "text-green-600"
                                  : "text-amber-600"
                              }`}
                            >
                              {report.hasSheet
                                ? "Google Sheet connected"
                                : "No Google Sheet connected"}
                            </p>
                          </div>

                          <span className="shrink-0 text-2xl text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#1F2A7A]">
                            ›
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
                    <p className="font-semibold text-slate-800">
                      No reports available
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      This office or section
                      currently has no reports.
                    </p>
                  </div>
                )}
              </div>
            )}

          {/* Step 4: Chat */}
          {!selectionLoading &&
            !selectionError &&
            selectedReport && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {selectedReport.title}
                  </p>

                  <p
                    className={`mt-1 text-xs ${
                      selectedReport.hasSheet
                        ? "text-green-600"
                        : "text-amber-600"
                    }`}
                  >
                    {selectedReport.hasSheet
                      ? "Using the connected Google Sheet"
                      : "No Google Sheet is connected"}
                  </p>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
                  {messages.map(
                    (message, index) => (
                      <div
                        key={`${message.role}-${index}`}
                        className={`flex ${
                          message.role ===
                          "user"
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                            message.role ===
                            "user"
                              ? "rounded-br-md bg-[#1F2A7A] text-white"
                              : "rounded-tl-md bg-white text-slate-700 shadow-sm"
                          }`}
                        >
                          {message.text}
                        </div>
                      </div>
                    )
                  )}

                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                        Checking the Google
                        Sheet...
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 bg-white p-4">
                  <div className="flex items-end gap-2">
                    <textarea
                      rows={1}
                      value={question}
                      onChange={(event) =>
                        setQuestion(
                          event.target.value
                        )
                      }
                      onKeyDown={
                        handleQuestionKeyDown
                      }
                      disabled={
                        chatLoading ||
                        !selectedReport.hasSheet
                      }
                      placeholder={
                        selectedReport.hasSheet
                          ? "Ask a question about the report..."
                          : "This report has no Google Sheet..."
                      }
                      className="max-h-28 min-h-[46px] flex-1 resize-none rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-[#1F2A7A] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                    />

                    <button
                      type="button"
                      onClick={sendQuestion}
                      disabled={
                        chatLoading ||
                        !question.trim() ||
                        !selectedReport.hasSheet
                      }
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1F2A7A] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-300"
                      aria-label="Send message"
                    >
                      ➤
                    </button>
                  </div>
                </div>
              </div>
            )}
        </div>
      )}

      <FloatingChatbotButton
        onClick={handleToggleChatbot}
      />
    </div>
  );
}

export default App;