import { useState, useEffect } from "react";
import { fetchAdminUsers } from '@/services/adminApi';
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, ChevronLeft, ChevronRight, Search, Edit, AlertTriangle } from "lucide-react";
import UserAccessEditor from "@/components/UserAccessEditor";
import { formatBytes } from "@/lib/utils";

type PlanType = 'guest' | 'free' | 'pro' | 'lifetime' | 'owner';

const PLAN_FEATURES: Record<PlanType, { ads: boolean; importExport: boolean }> = {
  guest: { ads: true, importExport: false },
  free: { ads: true, importExport: false },
  pro: { ads: false, importExport: true },
  lifetime: { ads: false, importExport: true },
  owner: { ads: false, importExport: true },
};

interface UserData {
  id: string;
  email: string;
  plan_type?: PlanType;
  storage_quota_mb?: number;
  storage_used?: number;
  extra_quota?: number;
  ads_enabled?: boolean;
  import_export_enabled?: boolean;
  created_at: string;
}

const UserManager: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const usersPerPage = 25;
  
  console.log('🚀 [UserManager] Component initialized');

  const fetchUsers = async (page: number = 1, search: string = "") => {
    console.log(`🔍 [UserManager] Starting fetchUsers - Page: ${page}, Search: "${search}"`);
    setLoading(true);
    setError(null);
    
    try {
      // Log authentication state
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError) {
        console.error('❌ [UserManager] Auth error:', authError);
        setError('Authentication error');
        return;
      }
      console.log('🔑 [UserManager] Auth session:', { 
        userId: session?.user?.id, 
        email: session?.user?.email,
        hasSession: !!session 
      });
      
      const offset = (page - 1) * usersPerPage;
      let query = supabase
        .from('users')
        .select('id, email, plan_type, storage_quota_mb, created_at', { count: 'exact' })
        .range(offset, offset + usersPerPage - 1)
        .order('created_at', { ascending: false });

      if (search) {
        query = query.ilike('email', `%${search}%`);
      }

      console.log('📡 [UserManager] Executing API call:', { 
        endpoint: '/api/admin/users',
        search: search || 'none'
      });
      
      const response = await fetchAdminUsers();
      
      if (response.error) {
        console.error('❌ [UserManager] API call failed:', response.error);
        setError(`Failed to load users: ${response.error}`);
        return;
      }
      
      const data = response.data || [];
      const count = data.length;

      console.log(`✅ [UserManager] Query successful:`, {
        userCount: data?.length || 0,
        totalCount: count,
        page,
        hasMore: (data?.length || 0) === usersPerPage
      });
      
      // Transform data to match our interface, adding default values for missing fields
      const transformedData = (data || []).map(user => ({
        ...user,
        plan_type: user.plan_type as PlanType || 'free',
        storage_used: 0, // Default value - would need to be calculated from storage_usage table
        extra_quota: 0, // Default value
        ads_enabled: PLAN_FEATURES[user.plan_type as PlanType || 'free'].ads,
        import_export_enabled: PLAN_FEATURES[user.plan_type as PlanType || 'free'].importExport,
      }));

      console.log('🔄 [UserManager] Data transformed:', {
        originalCount: data?.length || 0,
        transformedCount: transformedData.length,
        sampleUser: transformedData[0] ? {
          id: transformedData[0].id,
          email: transformedData[0].email,
          plan: transformedData[0].plan_type
        } : null
      });
      
      setUsers(transformedData);
      setTotalUsers(count || 0);
    } catch (err) {
      console.error('💥 [UserManager] Unexpected error:', {
        error: err,
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
        context: { page, search }
      });
      setError('An unexpected error occurred while loading users');
    } finally {
      console.log('🏁 [UserManager] fetchUsers completed');
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('🔄 [UserManager] useEffect triggered:', {
      currentPage,
      searchTerm,
      loading,
      usersCount: users.length
    });
    fetchUsers(currentPage, searchTerm);
  }, [currentPage, searchTerm]);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleUserUpdate = async (userId: string, updates: Partial<UserData>) => {
    console.log(`💾 [UserManager] Starting user update:`, {
      userId,
      updates,
      updateKeys: Object.keys(updates)
    });
    
    try {
      // Verify authentication before update
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) {
        console.error('❌ [UserManager] Auth error during update:', authError);
        setError('Authentication required for updates');
        return;
      }
      
      console.log('🔑 [UserManager] Update auth verified:', {
        updaterEmail: session.user.email,
        updaterId: session.user.id
      });
      
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.error('❌ [UserManager] Update failed:', {
          error,
          details: {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          },
          context: { userId, updates }
        });
        setError(`Failed to update user: ${error.message}`);
        return;
      }

      console.log('✅ [UserManager] Update successful:', {
        updatedUser: data,
        userId,
        appliedUpdates: updates
      });

      // Refresh the user list
      await fetchUsers(currentPage, searchTerm);
    } catch (error) {
      console.error('💥 [UserManager] Unexpected update error:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        context: { userId, updates }
      });
      setError('An unexpected error occurred while updating user');
    }
  };

  const openUserEditor = (user: UserData) => {
    setSelectedUser(user);
    setIsEditorOpen(true);
  };


  const getPlanBadgeVariant = (planType?: PlanType) => {
    switch (planType) {
      case 'guest':
        return 'secondary';
      case 'free':
        return 'default';
      case 'pro':
        return 'outline';
      case 'lifetime':
        return 'default';
      case 'owner':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const totalPages = Math.ceil(totalUsers / usersPerPage);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          User Manager
        </CardTitle>
        <div className="flex items-center space-x-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p><strong>Error:</strong> {error}</p>
                <p className="text-xs opacity-75">Check browser console for detailed logs</p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">Loading users...</div>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Storage Used</TableHead>
                  <TableHead>Extra Quota</TableHead>
                  <TableHead>Ads</TableHead>
                  <TableHead>Import/Export</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="text-sm text-muted-foreground">
                        {searchTerm ? 'No users found matching your search.' : 'No users found.'}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow
                      key={user.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openUserEditor(user)}
                    >
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={getPlanBadgeVariant(user.plan_type)}>
                          {user.plan_type ? user.plan_type.charAt(0).toUpperCase() + user.plan_type.slice(1) : 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatBytes(user.storage_used || 0)}</TableCell>
                      <TableCell>{formatBytes(user.extra_quota || 0)}</TableCell>
                      <TableCell>
                        <Badge variant={user.ads_enabled ? 'default' : 'secondary'}>
                          {user.ads_enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.import_export_enabled ? 'default' : 'secondary'}>
                          {user.import_export_enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openUserEditor(user);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between space-x-2 py-4">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * usersPerPage) + 1} to {Math.min(currentPage * usersPerPage, totalUsers)} of {totalUsers} users
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {selectedUser && (
          <UserAccessEditor
            user={selectedUser}
            isOpen={isEditorOpen}
            onClose={() => setIsEditorOpen(false)}
            onSave={handleUserUpdate}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default UserManager;
