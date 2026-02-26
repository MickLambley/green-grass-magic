import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import TestModeBanner from "@/components/test-mode/TestModeBanner";
import Index from "./pages/Index";
import ProtectedRoute from "./components/auth/ProtectedRoute";

// Lazy-loaded routes for code splitting
const About = lazy(() => import("./pages/About"));
const Auth = lazy(() => import("./pages/Auth"));
const ContractorAuth = lazy(() => import("./pages/ContractorAuth"));
const ContractorOnboarding = lazy(() => import("./pages/ContractorOnboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const ContractorDashboard = lazy(() => import("./pages/ContractorDashboard"));
const ContractorJobComplete = lazy(() => import("./pages/ContractorJobComplete"));
const ContractorWebsite = lazy(() => import("./pages/ContractorWebsite"));
const ContractorSiteAuth = lazy(() => import("./pages/ContractorSiteAuth"));
const ContractorSiteDashboard = lazy(() => import("./pages/ContractorSiteDashboard"));
const CustomerVerifyJob = lazy(() => import("./pages/CustomerVerifyJob"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const Settings = lazy(() => import("./pages/Settings"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <TestModeBanner />
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/about" element={<About />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/contractor-auth" element={<ContractorAuth />} />
            <Route path="/contractor-onboarding" element={<ContractorOnboarding />} />
            <Route path="/dashboard" element={
              <ProtectedRoute redirectTo="/auth">
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute requiredRole="admin" redirectTo="/dashboard">
                <Admin />
              </ProtectedRoute>
            } />
            <Route path="/contractor" element={
              <ProtectedRoute requiredRole="contractor" redirectTo="/dashboard">
                <ContractorDashboard />
              </ProtectedRoute>
            } />
            <Route path="/contractor/jobs/:id/complete" element={
              <ProtectedRoute requiredRole="contractor" redirectTo="/dashboard">
                <ContractorJobComplete />
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute redirectTo="/auth">
                <Settings />
              </ProtectedRoute>
            } />
            <Route path="/customer/bookings/:id/verify" element={
              <ProtectedRoute redirectTo="/auth">
                <CustomerVerifyJob />
              </ProtectedRoute>
            } />
            <Route path="/site/:slug" element={<ContractorWebsite />} />
            <Route path="/site/:slug/auth" element={<ContractorSiteAuth />} />
            <Route path="/site/:slug/portal" element={<ContractorSiteDashboard />} />
            <Route path="/site/:slug/dashboard" element={<ContractorSiteDashboard />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
