import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, ChevronLeft, ChevronRight, Search, Edit } from "lucide-react";
import UserAccessEditor from "@/components/UserAccessEditor";

type PlanType = 'free' | 'basic' | 'premium' | 'enterprise';

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
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const usersPerPage = 25;

  const fetchUsers = async (page: number = 1, search: string = "") => {
    console.log('[UserManager] Starting fetchUsers...', { page, search, loading });
    setLoading(true);
    try {
      const offset = (page - 1) * usersPerPage;
      let query = supabase
        .from('users')
        .select('id, email, plan_type, storage_quota_mb, created_at', { count: 'exact' })
        .range(offset, offset + usersPerPage - 1)
        .order('created_at', { ascending: false });

      if (search) {
        query = query.ilike('email', `%${search}%`);
      }

      const { data, error, count } = await query;

      console.log('[UserManager] Supabase query result:', { data, error, count });

      if (error) {
        console.error('[UserManager] Error fetching users:', error);
        console.error('[UserManager] Full error details:', JSON.stringify(error, null, 2));
        return;
      }

      console.log('[UserManager] Successfully fetched users:', { data: data?.length, count });
      
      // Transform data to match our interface, adding default values for missing fields
      const transformedData = (data || []).map(user => ({
        ...user,
        plan_type: user.plan_type as PlanType || 'free',
        storage_used: 0, // Default value - would need to be calculated from storage_usage table
        extra_quota: 0, // Default value
        ads_enabled: user.plan_type !== 'free', // Default logic
        import_export_enabled: user.plan_type !== 'free', // Default logic
      }));

      console.log('[UserManager] Transformed data:', transformedData);
      setUsers(transformedData);
      setTotalUsers(count || 0);
    } catch (error) {
      console.error('[UserManager] Unexpected error fetching users:', error);
      console.error('[UserManager] Full unexpected error:', JSON.stringify(error, null, 2));
    } finally {
      console.log('[UserManager] fetchUsers completed, setting loading to false');
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('[UserManager] useEffect triggered - fetching users...', { currentPage, searchTerm });
    fetchUsers(currentPage, searchTerm);
  }, [currentPage, searchTerm]);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleUserUpdate = async (userId: string, updates: Partial<UserData>) => {
    try {
      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId);

      if (error) {
        console.error('Error updating user:', error);
        return;
      }

      // Refresh the user list
      fetchUsers(currentPage, searchTerm);
    } catch (error) {
      console.error('Unexpected error updating user:', error);
    }
  };

  const openUserEditor = (user: UserData) => {
    setSelectedUser(user);
    setIsEditorOpen(true);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getPlanBadgeVariant = (planType?: PlanType) => {
    switch (planType) {
      case 'free':
        return 'secondary';
      case 'basic':
        return 'default';
      case 'premium':
        return 'outline';
      case 'enterprise':
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
