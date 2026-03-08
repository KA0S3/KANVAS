import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Database, Ticket, Bug, Key } from "lucide-react";
import UserManager from "@/components/UserManager";
import PromoCodeManager from "@/components/PromoCodeManager";
import OwnerKeyManager from "@/components/OwnerKeyManager";
import { EffectiveLimitsDebug } from "@/components/debug/EffectiveLimitsDebug";

const OwnerDashboard = () => {
  const navigate = useNavigate();
  const { user, plan, loading } = useAuthStore();

  useEffect(() => {
    // Redirect to home if not authenticated
    if (!loading && !user) {
      navigate("/");
      return;
    }

    // Check access permissions - only owner email and owner plan
    if (!loading && user) {
      const ownerEmail = import.meta.env.VITE_OWNER_EMAIL;
      const hasOwnerEmail = user.email === ownerEmail;
      const hasOwnerPlan = plan === 'owner';

      console.log('[OwnerDashboard] Access check:', {
        userEmail: user.email,
        ownerEmail,
        hasOwnerEmail,
        currentPlan: plan,
        hasOwnerPlan
      });

      if (!hasOwnerEmail || !hasOwnerPlan) {
        console.log('[OwnerDashboard] Access denied - redirecting to home');
        navigate("/");
        return;
      }
    }
  }, [user, plan, loading, navigate]);

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // Don't render content if user doesn't have access (redirect will happen)
  if (!user || !(user.email === import.meta.env.VITE_OWNER_EMAIL && plan === 'owner')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Owner Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Manage users, storage, and promotional codes
          </p>
        </div>

        {/* Debug info for development - only show if access denied */}
        {import.meta.env.DEV && (user.email !== import.meta.env.VITE_OWNER_EMAIL || plan !== 'owner') && (
          <div className="mb-8 bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
            <h2 className="font-bold mb-2">⚠️ Owner Access Debug</h2>
            <div className="space-y-2 font-mono text-sm">
              <div>Your Email: {user.email}</div>
              <div>Expected Owner Email: {import.meta.env.VITE_OWNER_EMAIL}</div>
              <div>Your Plan: {plan}</div>
              <div>Email Match: {user.email === import.meta.env.VITE_OWNER_EMAIL ? '✅ YES' : '❌ NO'}</div>
              <div>Plan Match: {plan === 'owner' ? '✅ YES' : '❌ NO'}</div>
              <div>Can Access: {(user.email === import.meta.env.VITE_OWNER_EMAIL && plan === 'owner') ? '✅ YES' : '❌ NO'}</div>
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <strong>To fix owner access:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Update your email in Supabase users table to match {import.meta.env.VITE_OWNER_EMAIL}</li>
                <li>Update your plan_type to 'owner' in Supabase users table</li>
              </ul>
            </div>
          </div>
        )}

        {/* User Manager Section */}
        <div className="mb-8">
          <UserManager />
        </div>

        {/* Promo Code Manager Section */}
        <div className="mb-8">
          <PromoCodeManager />
        </div>

        {/* Owner Key Manager Section */}
        <div className="mb-8">
          <OwnerKeyManager />
        </div>

        {/* Effective Limits Debug Section */}
        <div className="mb-8">
          <EffectiveLimitsDebug />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Storage Overrides Section */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">Storage Overrides</CardTitle>
              <Database className="ml-auto h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Configure storage limits and overrides for users
                </p>
                <div className="pt-2">
                  <div className="text-2xl font-bold">—</div>
                  <p className="text-xs text-muted-foreground">Active overrides</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Additional dashboard content can be added here */}
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>System Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">—</div>
                  <div className="text-sm text-muted-foreground">Active Sessions</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-green-600">—</div>
                  <div className="text-sm text-muted-foreground">Storage Used</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">—</div>
                  <div className="text-sm text-muted-foreground">API Calls Today</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default OwnerDashboard;
