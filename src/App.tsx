import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Index from "./pages/Index";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Internships from "./pages/Internships";
import InternshipDetail from "./pages/InternshipDetail";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";

import DashboardLayout from "./pages/dashboard/DashboardLayout";
import Overview from "./pages/dashboard/Overview";
import Profile from "./pages/dashboard/Profile";
import Applications from "./pages/dashboard/Applications";
import Saved from "./pages/dashboard/Saved";
import Notifications from "./pages/dashboard/Notifications";
import MembershipPage from "./pages/dashboard/MembershipPage";

// Operations Portal
import OpsLayout from "./pages/ops/OpsLayout";
import OpsDashboard from "./pages/ops/OpsDashboard";
import StudentManagement from "./pages/ops/StudentManagement";
import CompanyManagement from "./pages/ops/CompanyManagement";
import CollegeManagement from "./pages/ops/CollegeManagement";
import InternshipManagement from "./pages/ops/InternshipManagement";
import RegistrationsPage from "./pages/ops/RegistrationsPage";
import CertificateManagement from "./pages/ops/CertificateManagement";
import AnalyticsDashboard from "./pages/ops/AnalyticsDashboard";
import CommunicationCenter from "./pages/ops/CommunicationCenter";
import ApprovalCenter from "./pages/ops/ApprovalCenter";
import AdminSettings from "./pages/ops/AdminSettings";
import ReportsPage from "./pages/ops/ReportsPage";
import CoordinatorManagement from "./pages/ops/CoordinatorManagement";
import CompanyHRManagement from "./pages/ops/CompanyHRManagement";
import DocumentManagement from "./pages/ops/DocumentManagement";

import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Index />} />
            <Route path="/internships" element={<Internships />} />
            <Route path="/internships/:id" element={<InternshipDetail />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />

            {/* Auth */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Student dashboard */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute allow={["student"]}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Overview />} />
              <Route path="profile" element={<Profile />} />
              <Route path="applications" element={<Applications />} />
              <Route path="saved" element={<Saved />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="membership" element={<MembershipPage />} />
            </Route>

            {/* Operations Portal — accessible by admin and ops roles */}
            <Route
              path="/ops"
              element={
                <ProtectedRoute allow={["admin", "ops"]}>
                  <OpsLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<OpsDashboard />} />

              {/* Operations */}
              <Route path="students" element={<StudentManagement />} />
              {/* Internship Tracking. Both paths render the same page: the
                  separate tracking screen was removed, and /ops/tracking keeps
                  working for anyone with the old link bookmarked. */}
              <Route path="registrations" element={<RegistrationsPage />} />
              <Route path="tracking" element={<RegistrationsPage />} />
              <Route path="certificates" element={<CertificateManagement />} />

              {/* Company */}
              <Route path="companies" element={<CompanyManagement />} />
              <Route path="company-hr" element={<CompanyHRManagement />} />
              <Route path="internship-programs" element={<InternshipManagement />} />

              {/* College */}
              <Route path="colleges" element={<CollegeManagement />} />
              <Route path="coordinators" element={<CoordinatorManagement />} />

              {/* Internships */}
              <Route path="internships" element={<InternshipManagement />} />
              <Route path="internships/create" element={<InternshipManagement />} />
              <Route path="applications" element={<RegistrationsPage />} />
              <Route path="placements" element={<ReportsPage />} />

              {/* Reports & Analytics */}
              <Route path="reports/students" element={<ReportsPage />} />
              <Route path="reports/companies" element={<ReportsPage />} />
              <Route path="reports/colleges" element={<ReportsPage />} />
              <Route path="reports/internships" element={<ReportsPage />} />
              <Route path="analytics" element={<AnalyticsDashboard />} />

              {/* Communication */}
              <Route path="comm/email" element={<CommunicationCenter />} />
              <Route path="comm/whatsapp" element={<CommunicationCenter />} />
              <Route path="comm/sms" element={<CommunicationCenter />} />
              <Route path="comm/notifications" element={<CommunicationCenter />} />

              {/* Administration */}
              <Route path="admin/users" element={<AdminSettings />} />
              <Route path="admin/roles" element={<AdminSettings />} />
              <Route path="admin/master-data" element={<AdminSettings />} />
              <Route path="admin/documents" element={<DocumentManagement />} />
              <Route path="admin/audit" element={<AdminSettings />} />
              <Route path="admin/settings" element={<AdminSettings />} />

              {/* Approval Center */}
              <Route path="approvals" element={<ApprovalCenter />} />
            </Route>

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
