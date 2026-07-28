import React from "react";
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

function App() {
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

        {/* Catch-all 404 Route — always keep this last */}
        <Route
          path="*"
          element={<NotFound />}
        />
      </Routes>
    </div>
  );
}

export default App;