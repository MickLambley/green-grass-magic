import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import TestModeBanner from "@/components/test-mode/TestModeBanner";
import Index from "./pages/Index";
import ContractorWebsite from "./pages/ContractorWebsite";
import ContractorSiteAuth from "./pages/ContractorSiteAuth";
import ContractorSiteDashboard from "./pages/ContractorSiteDashboard";
import CustomerVerifyJob from "./pages/CustomerVerifyJob";
import About from "./pages/About";
import Contractors from "./pages/Contractors";
import Auth from "./pages/Auth";
import ContractorAuth from "./pages/ContractorAuth";
import ContractorOnboarding from "./pages/ContractorOnboarding";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import ContractorDashboard from "./pages/ContractorDashboard";
import ContractorJobComplete from "./pages/ContractorJobComplete";
import PaymentSuccess from "./pages/PaymentSuccess";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import ProtectedRoute from "./components/auth/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <TestModeBanner />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/about" element={<About />} />
          <Route path="/contractors" element={<Contractors />} />
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
          {/* Legacy route redirect */}
          <Route path="/site/:slug/dashboard" element={<ContractorSiteDashboard />} />
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
