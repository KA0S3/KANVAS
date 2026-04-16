import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConflictResolutionProvider } from "@/components/ConflictResolutionProvider";
import { useEffect } from "react";
import { emergencySaveService } from "@/services/emergencySaveService";
import { connectivityService } from "@/services/connectivityService";
import Index from "./pages/Index";
import AuthConfirm from "./pages/AuthConfirm";
import AuthCallback from "./pages/AuthCallback";
import AuthResetPassword from "./pages/AuthResetPassword";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import RefundPolicy from "./pages/RefundPolicy";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  // Initialize services on app mount
  useEffect(() => {
    emergencySaveService.initialize();
    connectivityService.startHeartbeat();

    return () => {
      connectivityService.stopHeartbeat();
    };
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ConflictResolutionProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth/confirm" element={<AuthConfirm />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/reset-password" element={<AuthResetPassword />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ConflictResolutionProvider>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
