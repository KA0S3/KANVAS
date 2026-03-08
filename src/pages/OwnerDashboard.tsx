import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Database, Ticket, Bug, Key, LogOut } from "lucide-react";
import UserManager from "@/components/UserManager";
import PromoCodeManager from "@/components/PromoCodeManager";
import OwnerKeyManager from "@/components/OwnerKeyManager";
import { EffectiveLimitsDebug } from "@/components/debug/EffectiveLimitsDebug";

const OwnerDashboard = () => {
  const navigate = useNavigate();
  const { user, plan, loading, planLoading, initializeAuth } = useAuthStore();

  // Initialize auth store when component mounts
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  const handleExit = () => {
    // Save user info to localStorage before exiting
    if (user) {
      const userInfo = {
        email: user.email,
        plan: plan,
        lastVisited: new Date().toISOString()
      };
      localStorage.setItem('ownerSession', JSON.stringify(userInfo));
    }
    // Navigate back to main app
    navigate("/");
  };

  useEffect(() => {
    // Redirect to home if not authenticated
    if (!loading && !user) {
      navigate("/");
      return;
    }

    // Check access permissions - only proceed if we have both user and plan data
    if (!loading && !planLoading && user && plan !== undefined) {
      const ownerEmail = import.meta.env.VITE_OWNER_EMAIL;
      const hasOwnerEmail = user.email === ownerEmail;
      const hasOwnerPlan = plan === 'owner';

      console.log('[OwnerDashboard] Access check:', {
        userEmail: user.email,
        ownerEmail,
        plan,
        hasOwnerEmail,
        hasOwnerPlan
      });

      if (!hasOwnerEmail || !hasOwnerPlan) {
        console.log('[OwnerDashboard] Access denied - redirecting home');
        navigate("/");
        return;
      }
      console.log('[OwnerDashboard] Access granted');
    }
  }, [user, plan, loading, planLoading, navigate]);

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading owner dashboard...</div>
      </div>
    );
  }

  // Show loading if user is still undefined after loading completes (auth state sync issue)
  if (!loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Authenticating...</div>
      </div>
    );
  }

  // Show loading if user is authenticated but plan data is still loading
  if (!loading && user && planLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading plan data...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-black/20"></div>
      <div className="absolute inset-0">
        <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute top-0 -right-4 w-72 h-72 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-4000"></div>
      </div>
      
      {/* Main Content */}
      <div className="relative h-full overflow-y-auto">
        <div className="p-6 pb-20">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <div className="backdrop-blur-md bg-white/10 rounded-2xl p-6 border border-white/20 shadow-2xl">
                <h1 className="text-4xl font-bold text-white mb-2">Owner Dashboard</h1>
                <p className="text-white/80 text-lg">
                  Manage users, storage, and promotional codes
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="px-3 py-1 bg-green-500/20 border border-green-400/30 rounded-full">
                      <span className="text-green-300 text-sm font-medium">● Owner Access</span>
                    </div>
                    <div className="text-white/60 text-sm">
                      Signed in as {user?.email}
                    </div>
                  </div>
                  <button
                    onClick={handleExit}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-400/30 rounded-lg hover:bg-red-500/30 transition-colors duration-200 text-red-300 hover:text-red-200"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm font-medium">Exit to App</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Debug info for development - only show if access denied */}
            {import.meta.env.DEV && (user.email !== import.meta.env.VITE_OWNER_EMAIL || plan !== 'owner') && (
              <div className="mb-8 backdrop-blur-md bg-yellow-500/10 border border-yellow-400/30 rounded-2xl p-6 shadow-2xl">
                <h2 className="font-bold mb-4 text-yellow-300 text-lg">⚠️ Owner Access Debug</h2>
                <div className="space-y-2 font-mono text-sm text-white/80">
                  <div>Your Email: {user.email}</div>
                  <div>Expected Owner Email: {import.meta.env.VITE_OWNER_EMAIL}</div>
                  <div>Your Plan: {plan}</div>
                  <div>Email Match: {user.email === import.meta.env.VITE_OWNER_EMAIL ? '✅ YES' : '❌ NO'}</div>
                  <div>Plan Match: {plan === 'owner' ? '✅ YES' : '❌ NO'}</div>
                  <div>Can Access: {(user.email === import.meta.env.VITE_OWNER_EMAIL && plan === 'owner') ? '✅ YES' : '❌ NO'}</div>
                </div>
                <div className="mt-4 text-sm text-white/60">
                  <strong>To fix owner access:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Update your email in Supabase users table to match {import.meta.env.VITE_OWNER_EMAIL}</li>
                    <li>Update your plan_type to 'owner' in Supabase users table</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Dashboard Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* User Manager Section */}
              <div className="backdrop-blur-md bg-white/10 rounded-2xl border border-white/20 shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                      <Users className="w-5 h-5 text-blue-300" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white">User Manager</h2>
                      <p className="text-white/60 text-sm">Manage user accounts and permissions</p>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <UserManager />
                </div>
              </div>

              {/* Promo Code Manager Section */}
              <div className="backdrop-blur-md bg-white/10 rounded-2xl border border-white/20 shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                      <Ticket className="w-5 h-5 text-purple-300" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white">Promo Codes</h2>
                      <p className="text-white/60 text-sm">Create and manage promotional codes</p>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <PromoCodeManager />
                </div>
              </div>

              {/* Owner Key Manager Section */}
              <div className="backdrop-blur-md bg-white/10 rounded-2xl border border-white/20 shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center">
                      <Key className="w-5 h-5 text-cyan-300" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white">Owner Keys</h2>
                      <p className="text-white/60 text-sm">Manage owner access keys</p>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <OwnerKeyManager />
                </div>
              </div>

              {/* Effective Limits Debug Section */}
              <div className="backdrop-blur-md bg-white/10 rounded-2xl border border-white/20 shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center">
                      <Bug className="w-5 h-5 text-orange-300" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white">Limits Debug</h2>
                      <p className="text-white/60 text-sm">Debug effective limits and overrides</p>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <EffectiveLimitsDebug />
                </div>
              </div>
            </div>

            {/* System Overview Section */}
            <div className="mt-8 backdrop-blur-md bg-white/10 rounded-2xl border border-white/20 shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                    <Database className="w-5 h-5 text-emerald-300" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">System Overview</h2>
                    <p className="text-white/60 text-sm">System statistics and monitoring</p>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="backdrop-blur-md bg-white/5 rounded-xl p-6 border border-white/10">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-300 mb-2">—</div>
                      <div className="text-white/60 text-sm">Active Sessions</div>
                    </div>
                  </div>
                  <div className="backdrop-blur-md bg-white/5 rounded-xl p-6 border border-white/10">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-300 mb-2">—</div>
                      <div className="text-white/60 text-sm">Storage Used</div>
                    </div>
                  </div>
                  <div className="backdrop-blur-md bg-white/5 rounded-xl p-6 border border-white/10">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-purple-300 mb-2">—</div>
                      <div className="text-white/60 text-sm">API Calls Today</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OwnerDashboard;
