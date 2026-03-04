import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Database, Ticket } from "lucide-react";
import UserManager from "@/components/UserManager";
import PromoCodeManager from "@/components/PromoCodeManager";

const OwnerDashboard = () => {
  const navigate = useNavigate();
  const { user, ownerKeyInfo, loading } = useAuthStore();

  useEffect(() => {
    // Redirect to home if not authenticated
    if (!loading && !user) {
      navigate("/");
      return;
    }

    // Check access permissions
    if (!loading && user) {
      const ownerEmail = import.meta.env.VITE_OWNER_EMAIL;
      const hasOwnerEmail = user.email === ownerEmail;
      const hasOwnerScope = ownerKeyInfo?.isValid && ownerKeyInfo?.scopes;

      if (!hasOwnerEmail && !hasOwnerScope) {
        navigate("/");
        return;
      }
    }
  }, [user, ownerKeyInfo, loading, navigate]);

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // Don't render content if user doesn't have access (redirect will happen)
  if (!user || (!(user.email === import.meta.env.VITE_OWNER_EMAIL) && !ownerKeyInfo?.isValid)) {
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

        {/* User Manager Section */}
        <div className="mb-8">
          <UserManager />
        </div>

        {/* Promo Code Manager Section */}
        <div className="mb-8">
          <PromoCodeManager />
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
