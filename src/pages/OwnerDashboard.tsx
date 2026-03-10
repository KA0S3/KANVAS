import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, Database, Ticket, Bug, Key, LogOut } from "lucide-react";
import UserManager from "@/components/UserManager";
import PromoCodeManager from "@/components/PromoCodeManager";
import OwnerKeyManager from "@/components/OwnerKeyManager";
import { EffectiveLimitsDebug } from "@/components/debug/EffectiveLimitsDebug";

const OwnerDashboard = () => {
  const navigate = useNavigate();
  const { user, plan, loading, planLoading, initializeAuth } = useAuthStore();
  const [systemStats, setSystemStats] = useState({
    activeSessions: 0,
    storageUsed: 0,
    apiCallsToday: 0,
    totalUsers: 0,
    totalPromoCodes: 0,
    totalOwnerKeys: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchSystemStats = async () => {
    try {
      setStatsLoading(true);
      
      // Fetch actual statistics from Supabase
      const [
        usersResult,
        promoCodesResult,
        ownerKeysResult,
        storageResult
      ] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('promo_codes').select('id', { count: 'exact', head: true }),
        supabase.from('owner_keys').select('id', { count: 'exact', head: true }),
        supabase.from('storage_usage').select('total_bytes_used').not('total_bytes_used', 'is', null)
      ]);

      const totalStorageUsed = storageResult.data?.reduce((sum, usage) => sum + usage.total_bytes_used, 0) || 0;

      setSystemStats({
        activeSessions: 0, // Would need session tracking implementation
        storageUsed: totalStorageUsed,
        apiCallsToday: 0, // Would need API call tracking implementation
        totalUsers: usersResult.count || 0,
        totalPromoCodes: promoCodesResult.count || 0,
        totalOwnerKeys: ownerKeysResult.count || 0
      });
    } catch (error) {
      console.error('Error fetching system stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  // Initialize auth store when component mounts
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Fetch system stats when user is authenticated as owner
  useEffect(() => {
    if (user && plan === 'owner') {
      fetchSystemStats();
    }
  }, [user, plan]);

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

            {/* Tabbed Dashboard */}
            <div className="backdrop-blur-md bg-white/10 rounded-2xl border border-white/20 shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-white/10">
                <Tabs defaultValue="users" className="w-full">
                  <TabsList className="grid w-full grid-cols-5 bg-white/5 border border-white/10">
                    <TabsTrigger value="users" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/70 hover:text-white hover:bg-white/5">
                      <Users className="w-4 h-4 mr-2" />
                      Users
                    </TabsTrigger>
                    <TabsTrigger value="promo" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/70 hover:text-white hover:bg-white/5">
                      <Ticket className="w-4 h-4 mr-2" />
                      Promo Codes
                    </TabsTrigger>
                    <TabsTrigger value="keys" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/70 hover:text-white hover:bg-white/5">
                      <Key className="w-4 h-4 mr-2" />
                      Owner Keys
                    </TabsTrigger>
                    <TabsTrigger value="debug" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/70 hover:text-white hover:bg-white/5">
                      <Bug className="w-4 h-4 mr-2" />
                      Limits Debug
                    </TabsTrigger>
                    <TabsTrigger value="system" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/70 hover:text-white hover:bg-white/5">
                      <Database className="w-4 h-4 mr-2" />
                      System
                    </TabsTrigger>
                  </TabsList>

                  {/* User Manager Tab */}
                  <TabsContent value="users" className="mt-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                          <Users className="w-5 h-5 text-blue-300" />
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-white">User Manager</h3>
                          <p className="text-white/60 text-sm">Manage user accounts and permissions</p>
                        </div>
                      </div>
                      <UserManager />
                    </div>
                  </TabsContent>

                  {/* Promo Code Manager Tab */}
                  <TabsContent value="promo" className="mt-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                          <Ticket className="w-5 h-5 text-purple-300" />
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-white">Promo Codes</h3>
                          <p className="text-white/60 text-sm">Create and manage promotional codes</p>
                        </div>
                      </div>
                      <PromoCodeManager />
                    </div>
                  </TabsContent>

                  {/* Owner Key Manager Tab */}
                  <TabsContent value="keys" className="mt-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center">
                          <Key className="w-5 h-5 text-cyan-300" />
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-white">Owner Keys</h3>
                          <p className="text-white/60 text-sm">Manage owner access keys</p>
                        </div>
                      </div>
                      <OwnerKeyManager />
                    </div>
                  </TabsContent>

                  {/* Effective Limits Debug Tab */}
                  <TabsContent value="debug" className="mt-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center">
                          <Bug className="w-5 h-5 text-orange-300" />
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-white">Limits Debug</h3>
                          <p className="text-white/60 text-sm">Debug effective limits and overrides</p>
                        </div>
                      </div>
                      <EffectiveLimitsDebug />
                    </div>
                  </TabsContent>

                  {/* System Overview Tab */}
                  <TabsContent value="system" className="mt-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                          <Database className="w-5 h-5 text-emerald-300" />
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-white">System Overview</h3>
                          <p className="text-white/60 text-sm">System statistics and monitoring</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="backdrop-blur-md bg-white/5 rounded-xl p-6 border border-white/10">
                          <div className="text-center">
                            <div className="text-3xl font-bold text-blue-300 mb-2">
                              {statsLoading ? '...' : systemStats.totalUsers}
                            </div>
                            <div className="text-white/60 text-sm">Total Users</div>
                          </div>
                        </div>
                        <div className="backdrop-blur-md bg-white/5 rounded-xl p-6 border border-white/10">
                          <div className="text-center">
                            <div className="text-3xl font-bold text-green-300 mb-2">
                              {statsLoading ? '...' : `${(systemStats.storageUsed / (1024 * 1024 * 1024)).toFixed(1)}GB`}
                            </div>
                            <div className="text-white/60 text-sm">Storage Used</div>
                          </div>
                        </div>
                        <div className="backdrop-blur-md bg-white/5 rounded-xl p-6 border border-white/10">
                          <div className="text-center">
                            <div className="text-3xl font-bold text-purple-300 mb-2">
                              {statsLoading ? '...' : systemStats.totalPromoCodes}
                            </div>
                            <div className="text-white/60 text-sm">Promo Codes</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OwnerDashboard;
