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

function App() {
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [divisions, setDivisions] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState(null);
  const [isLoadingDivisions, setIsLoadingDivisions] = useState(false);
  const [divisionError, setDivisionError] = useState("");

  useEffect(() => {
    if (!isChatbotOpen || divisions.length > 0) {
      return;
    }

    const loadDivisions = async () => {
      setIsLoadingDivisions(true);
      setDivisionError("");

      try {
        const response = await fetch("/api/chatbot/divisions");

        const contentType =
          response.headers.get("content-type") || "";

        if (!contentType.includes("application/json")) {
          throw new Error(
            "The server did not return valid JSON. Make sure the backend is running."
          );
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
              data.error ||
              "Unable to load chatbot divisions."
          );
        }

        /*
         * This supports several possible backend response formats:
         *
         * { success: true, divisions: [...] }
         * { divisions: [...] }
         * [...]
         * { success: true, data: [...] }
         */
        const divisionList = Array.isArray(data)
          ? data
          : Array.isArray(data.divisions)
          ? data.divisions
          : Array.isArray(data.data)
          ? data.data
          : [];

        const normalizedDivisions = divisionList.map(
          (division, index) => {
            if (typeof division === "string") {
              return {
                code: division,
                name: division,
                description: `Ask questions about ${division} data`,
              };
            }

            return {
              code:
                division.code ||
                division.id ||
                division.key ||
                division.acronym ||
                `division-${index + 1}`,

              name:
                division.name ||
                division.title ||
                division.label ||
                division.code ||
                division.acronym ||
                "Unnamed Division",

              description:
                division.description ||
                division.subtitle ||
                `Ask questions about ${
                  division.name ||
                  division.code ||
                  division.acronym ||
                  "this division"
                } data`,

              sheetCount:
                division.sheetCount ??
                division.sheets?.length ??
                null,
            };
          }
        );

        setDivisions(normalizedDivisions);
      } catch (error) {
        console.error(
          "Unable to load chatbot divisions:",
          error
        );

        setDivisionError(
          error.message ||
            "Unable to connect to the chatbot server."
        );
      } finally {
        setIsLoadingDivisions(false);
      }
    };

    loadDivisions();
  }, [isChatbotOpen, divisions.length]);

  const handleToggleChatbot = () => {
    setIsChatbotOpen((current) => !current);
  };

  const handleCloseChatbot = () => {
    setIsChatbotOpen(false);
    setSelectedDivision(null);
  };

  const handleSelectDivision = (division) => {
    setSelectedDivision(division);
  };

  const handleBackToDivisions = () => {
    setSelectedDivision(null);
  };

  const handleRetryDivisions = () => {
    setDivisions([]);
    setDivisionError("");
  };

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

        {/* Protected Staff/Admin Routes */}
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
            <ProtectedRoute requiresAdmin={true}>
              <UserManagement />
            </ProtectedRoute>
          }
        />

        <Route
          path="/office-division-management"
          element={
            <ProtectedRoute requiresAdmin={true}>
              <OfficeDivisionManagement />
            </ProtectedRoute>
          }
        />

        <Route
          path="/activity-logs"
          element={
            <ProtectedRoute requiresAdmin={true}>
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

        {/* Catch-all route must stay last */}
        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Floating Chatbot Popup */}
      {isChatbotOpen && (
        <div className="fixed bottom-32 right-6 z-[9998] flex h-[540px] w-[390px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex min-h-[82px] items-center justify-between bg-[#1F2A7A] px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              {selectedDivision && (
                <button
                  type="button"
                  onClick={handleBackToDivisions}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-white transition hover:bg-white/10"
                  aria-label="Back to division selection"
                >
                  ←
                </button>
              )}

              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-white">
                  iDamag Assistant
                </h2>

                <p className="truncate text-sm text-blue-100">
                  {selectedDivision
                    ? selectedDivision.name
                    : "Choose a dashboard"}
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

          {/* Division Selector */}
          {!selectedDivision && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-4">
                <h3 className="font-bold text-slate-800">
                  Select a division
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Choose the division whose data you want
                  to ask about.
                </p>
              </div>

              {isLoadingDivisions && (
                <div className="flex min-h-[280px] flex-col items-center justify-center">
                  <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-[#1F2A7A]" />

                  <p className="mt-4 text-sm text-slate-500">
                    Loading divisions...
                  </p>
                </div>
              )}

              {!isLoadingDivisions && divisionError && (
                <div className="flex min-h-[280px] flex-col items-center justify-center px-4 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-xl">
                    !
                  </div>

                  <p className="font-semibold text-slate-800">
                    Unable to load divisions
                  </p>

                  <p className="mt-2 text-sm text-slate-500">
                    {divisionError}
                  </p>

                  <button
                    type="button"
                    onClick={handleRetryDivisions}
                    className="mt-5 rounded-xl bg-[#1F2A7A] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    Try again
                  </button>
                </div>
              )}

              {!isLoadingDivisions &&
                !divisionError &&
                divisions.length > 0 && (
                  <div className="space-y-3">
                    {divisions.map((division) => (
                      <button
                        key={division.code}
                        type="button"
                        onClick={() =>
                          handleSelectDivision(division)
                        }
                        className="group w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-[#1F2A7A] hover:bg-blue-50 hover:shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-800 group-hover:text-[#1F2A7A]">
                              {division.code}
                            </p>

                            <p className="mt-1 text-sm font-medium text-slate-600">
                              {division.name}
                            </p>

                            <p className="mt-1 text-xs leading-relaxed text-slate-500">
                              {division.description}
                            </p>

                            {division.sheetCount !==
                              null && (
                              <p className="mt-2 text-xs text-slate-400">
                                {division.sheetCount}{" "}
                                worksheet
                                {division.sheetCount === 1
                                  ? ""
                                  : "s"}
                              </p>
                            )}
                          </div>

                          <span className="shrink-0 text-xl text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#1F2A7A]">
                            ›
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

              {!isLoadingDivisions &&
                !divisionError &&
                divisions.length === 0 && (
                  <div className="flex min-h-[280px] flex-col items-center justify-center px-4 text-center">
                    <p className="font-semibold text-slate-800">
                      No divisions available
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      Add division configurations in your
                      backend chatbot divisions file.
                    </p>
                  </div>
                )}
            </div>
          )}

          {/* Temporary Selected Division Screen */}
          {selectedDivision && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-white px-4 py-3 shadow-sm">
                    <p className="text-sm leading-relaxed text-slate-700">
                      Hello! You selected{" "}
                      <strong>
                        {selectedDivision.name}
                      </strong>
                      .
                    </p>

                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                      I will only use data connected to the{" "}
                      <strong>
                        {selectedDivision.code}
                      </strong>{" "}
                      division.
                    </p>
                  </div>
                </div>
              </div>

              {/* Temporary Input */}
              <div className="border-t border-slate-200 bg-white p-4">
                <div className="flex items-end gap-2">
                  <textarea
                    rows={1}
                    disabled
                    placeholder="Chat input will be connected next..."
                    className="max-h-28 min-h-[46px] flex-1 resize-none rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-500 outline-none"
                  />

                  <button
                    type="button"
                    disabled
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-300 text-white"
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

      {/* Floating Chatbot Icon */}
      <FloatingChatbotButton
        onClick={handleToggleChatbot}
      />
    </div>
  );
}

export default App;