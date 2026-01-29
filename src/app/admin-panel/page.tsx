'use client'

import { useState, useEffect } from 'react'
import { GCPLayout } from '@/components/GCPLayout'
import { RoleGuard } from '@/components/RoleGuard'
import { getAllUsers, updateUserRole, deleteUser, updateUserInfo } from '@/lib/auth'
import { usePageVisibility, PAGE_ID_MAP } from '@/contexts/PageVisibilityContext'
import { Users, Shield, Edit, Trash2, Save, X, User as UserIcon, Mail, Eye, EyeOff, Lock, ChevronDown, ChevronUp, Home, Laptop, Files, Download, Brain, Folder, Database, Code2 } from 'lucide-react'

interface UserData {
  id: string
  username: string
  email: string
  name: string | null
  role: 'admin' | 'user'
}

export default function AdminPanelPage() {
  const [users, setUsers] = useState<UserData[]>([])
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<UserData>>({})
  const [showPageControls, setShowPageControls] = useState(false)
  const { hiddenPages, fullyHiddenPages, togglePageVisibility, toggleFullyHidden } = usePageVisibility()

  // All pages that can be hidden/shown
  const allPages = [
    { id: 'Home Page', icon: <Home className="w-5 h-5" />, path: '/home' },
    { id: 'Project Overview', icon: <Laptop className="w-5 h-5" />, path: '/project-overview' },
    { id: 'Documentation', icon: <Files className="w-5 h-5" />, path: '/documentation' },
    { id: 'TQF Master 2.0 Desktop', icon: <Download className="w-5 h-5" />, path: '/tqf-desktop' },
    { id: 'Course Monitoring', icon: <Brain className="w-5 h-5" />, path: '/course-monitoring' },
    { id: 'TQF Master 2.0', icon: <Folder className="w-5 h-5" />, path: '/tqf-master' },
    { id: 'Course Planner', icon: <Brain className="w-5 h-5" />, path: '/course-planner' },
    { id: 'Registration Simulator', icon: <Database className="w-5 h-5" />, path: '/registration-simulator' },
    { id: 'APIs & Services', icon: <Code2 className="w-5 h-5" />, path: '/apis-services' },
  ]

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const userData = await getAllUsers()
      setUsers(userData.map(user => ({
        id: String(user.id),
        username: String(user.username),
        email: String(user.email),
        name: user.name ? String(user.name) : null,
        role: (user.role as 'admin' | 'user') || 'user'
      })))
    } catch (error) {
      console.error('Failed to load users:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'user') => {
    try {
      const success = await updateUserRole(userId, newRole)
      if (success) {
        setUsers(prev => prev.map(u => 
          u.id === userId ? { ...u, role: newRole } : u
        ))
      }
    } catch (error) {
      console.error('Failed to update role:', error)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return
    
    try {
      const success = await deleteUser(userId)
      if (success) {
        setUsers(prev => prev.filter(u => u.id !== userId))
      }
    } catch (error) {
      console.error('Failed to delete user:', error)
    }
  }

  const handleEditUser = (user: UserData) => {
    setEditingUser(user.id)
    setEditForm({ name: user.name, email: user.email })
  }

  const handleSaveUser = async (userId: string) => {
    try {
      const success = await updateUserInfo(userId, {
        name: editForm.name || undefined,
        email: editForm.email || undefined
      })
      if (success) {
        setUsers(prev => prev.map(u => 
          u.id === userId ? { ...u, ...editForm } : u
        ))
        setEditingUser(null)
        setEditForm({})
      }
    } catch (error) {
      console.error('Failed to update user:', error)
    }
  }

  const handleCancelEdit = () => {
    setEditingUser(null)
    setEditForm({})
  }

  return (
    <RoleGuard requiredRole="admin">
      <GCPLayout activeFeature="Admin Panel" projectName="Admin Panel">
        <div className="max-w-7xl mx-auto p-6">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
              <Shield className="w-8 h-8 text-red-600" />
              Admin Panel
            </h1>
            <p className="text-gray-600">Manage users, roles, and system settings</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Users</p>
                  <p className="text-2xl font-bold text-gray-900">{users.length}</p>
                </div>
                <Users className="w-8 h-8 text-blue-600" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Admins</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {users.filter(u => u.role === 'admin').length}
                  </p>
                </div>
                <Shield className="w-8 h-8 text-red-600" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Regular Users</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {users.filter(u => u.role === 'user').length}
                  </p>
                </div>
                <UserIcon className="w-8 h-8 text-green-600" />
              </div>
            </div>
          </div>

          {/* Page Visibility Control - Collapsible Section */}
          <div className="bg-white rounded-lg shadow mb-8 overflow-hidden">
            <button
              onClick={() => setShowPageControls(!showPageControls)}
              className="w-full px-6 py-4 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-orange-600" />
                <h2 className="text-lg font-semibold text-gray-900">Page Visibility Control</h2>
                <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-600 rounded">
                  {hiddenPages.size} Hidden
                </span>
              </div>
              {showPageControls ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>
            
            {/* Animated content */}
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
              showPageControls ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
            }`}>
              <div className="p-6">
                <p className="text-sm text-gray-600 mb-4">
                  Hide pages from regular users. Hidden pages will be removed from the sidebar and users currently viewing them will be kicked out immediately.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allPages.map((page) => {
                    const isHidden = hiddenPages.has(page.id)
                    const isFullyHidden = fullyHiddenPages.has(page.id)
                    return (
                      <div
                        key={page.id}
                        className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all duration-300 ${
                          isFullyHidden
                            ? 'border-red-300 bg-red-50'
                            : isHidden 
                            ? 'border-orange-300 bg-orange-50' 
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={isFullyHidden ? 'text-red-600' : isHidden ? 'text-orange-600' : 'text-gray-600'}>
                            {page.icon}
                          </span>
                          <div>
                            <p className={`font-medium ${isFullyHidden ? 'text-red-700' : isHidden ? 'text-orange-700' : 'text-gray-900'}`}>
                              {page.id}
                            </p>
                            <p className="text-xs text-gray-500">{page.path}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => togglePageVisibility(page.id)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium text-xs transition-all duration-200 ${
                              isHidden
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                            }`}
                          >
                            {isHidden ? (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                Show
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3.5 h-3.5" />
                                Hide
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => toggleFullyHidden(page.id)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium text-xs transition-all duration-200 ${
                              isFullyHidden
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-red-100 text-red-700 hover:bg-red-200'
                            }`}
                            title="Hide from everyone including admins"
                          >
                            {isFullyHidden ? (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                Unlock
                              </>
                            ) : (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                Lock All
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    <strong>Warning:</strong> Hiding a page will immediately kick out any users currently viewing it and redirect them to the home page.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
            </div>
            
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingUser === user.id ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={editForm.name || ''}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                className="w-full px-2 py-1 border border-gray-300 rounded"
                                placeholder="Name"
                              />
                              <input
                                type="email"
                                value={editForm.email || ''}
                                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                className="w-full px-2 py-1 border border-gray-300 rounded"
                                placeholder="Email"
                              />
                            </div>
                          ) : (
                            <div>
                              <div className="text-sm font-medium text-gray-900">{user.name || 'No name'}</div>
                              <div className="text-sm text-gray-500 flex items-center gap-1">
                                <UserIcon className="w-3 h-3" />
                                {user.username}
                              </div>
                              <div className="text-sm text-gray-500 flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {user.email}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingUser === user.id ? (
                            <select
                              value={editForm.role || user.role}
                              onChange={(e) => setEditForm({ ...editForm, role: e.target.value as 'admin' | 'user' })}
                              className="px-2 py-1 border border-gray-300 rounded"
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>
                          ) : (
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              user.role === 'admin' 
                                ? 'bg-red-100 text-red-800' 
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {user.role}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {editingUser === user.id ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveUser(user.id)}
                                className="text-green-600 hover:text-green-900"
                              >
                                <Save className="w-4 h-4" />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="text-gray-600 hover:text-gray-900"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditUser(user)}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <select
                                value={user.role}
                                onChange={(e) => handleRoleChange(user.id, e.target.value as 'admin' | 'user')}
                                className="text-xs border border-gray-300 rounded px-1 py-1"
                              >
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                              </select>
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </GCPLayout>
    </RoleGuard>
  )
}
