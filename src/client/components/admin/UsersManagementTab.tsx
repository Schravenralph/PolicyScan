/**
 * Users Management Tab Component
 * 
 * Manages user accounts including creation, role updates, status changes, and deletion.
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { logError, parseError } from '../../utils/errorHandler';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';
import { formatFeatureFlagState } from '../../utils/featureFlagFormatters.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  lastLogin?: string;
  active?: boolean;
  showTourGuide?: boolean;
}

export function UsersManagementTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState<string>('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false);
  const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'advisor' as 'advisor' | 'developer' | 'admin' });
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const usersRes = await api.get<{ data: User[]; pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean; skip: number } }>('/admin/users?limit=1000&includePagination=true');
      const usersList = usersRes.data || [];
      setAllUsers(usersList);
    } catch (error) {
      logError(error, 'load-users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Filter users based on search term, role, and status
  useEffect(() => {
    let filtered = [...allUsers];

    // Search filter
    if (userSearchTerm) {
      const searchLower = userSearchTerm.toLowerCase();
      filtered = filtered.filter(user =>
        user.name.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower)
      );
    }

    // Role filter
    if (userRoleFilter) {
      filtered = filtered.filter(user => user.role === userRoleFilter);
    }

    // Status filter
    if (userStatusFilter) {
      if (userStatusFilter === 'active') {
        filtered = filtered.filter(user => user.active !== false);
      } else if (userStatusFilter === 'inactive') {
        filtered = filtered.filter(user => user.active === false);
      }
    }

    setUsers(filtered);
  }, [allUsers, userSearchTerm, userRoleFilter, userStatusFilter]);

  const updateUserRole = async (userId: string, newRole: string) => {
    // Optimistic update
    setUsers(prevUsers =>
      prevUsers.map(user =>
        user._id === userId ? { ...user, role: newRole } : user
      )
    );

    try {
      await api.patch(`/admin/users/${userId}/role`, { role: newRole });
      // Refresh to ensure consistency
      await loadUsers();
    } catch (error) {
      logError(error, 'update-user-role');
      // Revert optimistic update on error
      await loadUsers();
      const errorInfo = parseError(error);
      toast.error(errorInfo.title || 'Fout bij bijwerken rol', errorInfo.message || 'De gebruikersrol kon niet worden bijgewerkt. Probeer het opnieuw.');
    }
  };

  const updateUserStatus = async (userId: string, active: boolean) => {
    // Optimistic update
    setUsers(prevUsers =>
      prevUsers.map(user =>
        user._id === userId ? { ...user, active } : user
      )
    );

    try {
      await api.patch(`/admin/users/${userId}/status`, { active });
      // Refresh to ensure consistency
      await loadUsers();
    } catch (error) {
      logError(error, 'update-user-status');
      // Revert optimistic update on error
      await loadUsers();
      const errorInfo = parseError(error);
      toast.error(errorInfo.title || 'Fout bij bijwerken status', errorInfo.message || 'De gebruikersstatus kon niet worden bijgewerkt. Probeer het opnieuw.');
    }
  };

  const updateTourGuideStatus = async (userId: string, showTourGuide: boolean) => {
    // Optimistic update
    setUsers(prevUsers =>
      prevUsers.map(user =>
        user._id === userId ? { ...user, showTourGuide } : user
      )
    );

    try {
      await api.patch(`/admin/users/${userId}/tour-guide`, { showTourGuide });
      // Refresh to ensure consistency
      await loadUsers();
    } catch (error) {
      logError(error, 'update-tour-guide-status');
      // Revert optimistic update on error
      await loadUsers();
      const errorInfo = parseError(error);
      toast.error(errorInfo.title || 'Fout bij bijwerken tour guide', errorInfo.message || 'De tour guide status kon niet worden bijgewerkt. Probeer het opnieuw.');
    }
  };

  const resetUserPassword = async (userId: string) => {
    const newPassword = prompt(t('admin.enterNewPassword'));
    if (!newPassword || newPassword.length < 6) {
      toast.warning(t('admin.passwordMinLength'));
      return;
    }
    try {
      await api.post(`/admin/users/${userId}/reset-password`, { newPassword });
      toast.success(t('admin.passwordResetSuccess'));
    } catch (error) {
      logError(error, 'reset-password');
      const errorInfo = parseError(error);
      toast.error(errorInfo.title || 'Fout bij resetten wachtwoord', errorInfo.message || 'Het wachtwoord kon niet worden gereset. Probeer het opnieuw.');
    }
  };

  const createUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.warning(t('admin.fillAllFields'));
      return;
    }
    if (newUser.password.length < 6) {
      toast.warning(t('admin.passwordMinLength'));
      return;
    }
    try {
      await api.post('/admin/users', newUser);
      setShowCreateUserDialog(false);
      setNewUser({ name: '', email: '', password: '', role: 'advisor' });
      await loadUsers();
      toast.success(t('admin.userCreatedSuccess'));
    } catch (error: unknown) {
      logError(error, 'create-user');
      const errorMessage = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || t('admin.createUserFailed');
      toast.error(errorMessage);
    }
  };

  const deleteUser = async () => {
    if (!userToDelete) return;
    try {
      await api.delete(`/admin/users/${userToDelete}`);
      setShowDeleteUserDialog(false);
      setUserToDelete(null);
      await loadUsers();
      toast.success(t('admin.userDeletedSuccess'));
    } catch (error: unknown) {
      logError(error, 'delete-user');
      const errorMessage = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || t('admin.deleteUserFailed');
      toast.error(errorMessage);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading users...</div>;
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">User Management</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreateUserDialog(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
              >
                Create User
              </button>
              {selectedUserIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">{selectedUserIds.size} selected</span>
                  <button
                    onClick={async () => {
                      const promises = Array.from(selectedUserIds).map(id =>
                        updateUserStatus(id, true)
                      );
                      await Promise.all(promises);
                      setSelectedUserIds(new Set());
                    }}
                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                    data-testid="users-activate-selected-button"
                  >
                    Activate Selected
                  </button>
                  <button
                    onClick={async () => {
                      const promises = Array.from(selectedUserIds).map(id =>
                        updateUserStatus(id, false)
                      );
                      await Promise.all(promises);
                      setSelectedUserIds(new Set());
                    }}
                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                    data-testid="users-deactivate-selected-button"
                  >
                    Deactivate Selected
                  </button>
                  <button
                    onClick={() => setSelectedUserIds(new Set())}
                    className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
                  >
                    Clear Selection
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Search and Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                placeholder={t('admin.searchPlaceholder')}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">All Roles</option>
                <option value="advisor">Advisor</option>
                <option value="developer">Developer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={userStatusFilter}
                onChange={(e) => setUserStatusFilter(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.size === users.length && users.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedUserIds(new Set(users.map(u => u._id)));
                      } else {
                        setSelectedUserIds(new Set());
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="columnheader-name">{t('admin.tableName')}</th>
                <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="columnheader-email">{t('admin.tableEmail')}</th>
                <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="columnheader-role">{t('admin.tableRole')}</th>
                <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="columnheader-status">{t('admin.tableStatus')}</th>
                <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="columnheader-tour-guide">{t('admin.tableTourGuide')}</th>
                <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="columnheader-last-login">{t('admin.tableLastLogin')}</th>
                <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="columnheader-actions">{t('admin.tableActions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user._id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.has(user._id)}
                        onChange={(e) => {
                          const newSet = new Set(selectedUserIds);
                          if (e.target.checked) {
                            newSet.add(user._id);
                          } else {
                            newSet.delete(user._id);
                          }
                          setSelectedUserIds(newSet);
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{user.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <select
                        value={user.role}
                        onChange={(e) => updateUserRole(user._id, e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      >
                        <option value="advisor">Advisor</option>
                        <option value="developer">Developer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${user.active !== false
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                        }`}>
                        {user.active !== false ? t('admin.active') : t('admin.inactive')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${user.showTourGuide !== false
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                        }`}>
                        {formatFeatureFlagState(user.showTourGuide !== false)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : t('common.never')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button
                        onClick={() => updateUserStatus(user._id, user.active === false)}
                        className="text-blue-600 hover:text-blue-800"
                        data-testid={`user-${user.active === false ? 'activate' : 'deactivate'}-button-${user._id}`}
                      >
                        {user.active === false ? t('admin.activate') : t('admin.deactivate')}
                      </button>
                      <button
                        onClick={() => updateTourGuideStatus(user._id, user.showTourGuide === false)}
                        className="text-purple-600 hover:text-purple-800"
                        title={user.showTourGuide !== false ? t('admin.disableTourGuide') : t('admin.enableTourGuide')}
                        data-testid={`user-tour-guide-toggle-button-${user._id}`}
                      >
                        {user.showTourGuide !== false ? t('admin.disableTour') : t('admin.enableTour')}
                      </button>
                      <button
                        onClick={() => resetUserPassword(user._id)}
                        className="text-orange-600 hover:text-orange-800"
                        data-testid={`user-reset-password-button-${user._id}`}
                      >
                        Reset Password
                      </button>
                      <button
                        onClick={() => {
                          setUserToDelete(user._id);
                          setShowDeleteUserDialog(true);
                        }}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={showCreateUserDialog} onOpenChange={setShowCreateUserDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Create a new user account. The user will be able to log in immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                placeholder={t('admin.fullNamePlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                placeholder={t('common.userEmailPlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                placeholder={t('admin.passwordMinPlaceholder')}
              />
              <p className="text-xs text-gray-500 mt-1">Password must be at least 6 characters long</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'advisor' | 'developer' | 'admin' })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="advisor">Advisor</option>
                <option value="developer">Developer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateUserDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createUser}>
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <Dialog open={showDeleteUserDialog} onOpenChange={setShowDeleteUserDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this user? This action cannot be undone. The user will no longer be able to access the system.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDeleteUserDialog(false);
              setUserToDelete(null);
            }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteUser}>
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

