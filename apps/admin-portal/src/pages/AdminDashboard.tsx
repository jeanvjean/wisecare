import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAdminAuthStore } from '../store/auth'

function AdminDashboard() {
  const { signOut, adminRole } = useAdminAuthStore()

  // Fetch dashboard metrics
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: async () => {
      const [
        { count: totalUsers },
        { count: activeSubscriptions },
        { data: revenueData }
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('subscriptions').select('plans(price)').eq('status', 'active')
      ])

      const monthlyRevenue = revenueData?.reduce((sum, sub) => sum + (sub.plans?.price || 0), 0) || 0

      return {
        totalUsers: totalUsers || 0,
        activeSubscriptions: activeSubscriptions || 0,
        monthlyRevenue: monthlyRevenue / 100, // Convert cents to dollars
        churnRate: 2.3 // Placeholder - would calculate from historical data
      }
    }
  })

  const handleSignOut = async () => {
    await signOut()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">HealthGuard Admin Portal</h1>
              <p className="text-sm text-gray-600">Role: {adminRole?.name || 'Admin'}</p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => window.location.href = '/users'}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
              >
                User Management
              </button>
              <button
                onClick={handleSignOut}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-500 rounded"></div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Users</dt>
                      <dd className="text-lg font-medium text-gray-900">{metrics?.totalUsers || 0}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-500 rounded"></div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Active Subscriptions</dt>
                      <dd className="text-lg font-medium text-gray-900">{metrics?.activeSubscriptions || 0}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-yellow-500 rounded"></div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Monthly Revenue</dt>
                      <dd className="text-lg font-medium text-gray-900">${metrics?.monthlyRevenue?.toFixed(2) || '0.00'}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-red-500 rounded"></div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Churn Rate</dt>
                      <dd className="text-lg font-medium text-gray-900">{metrics?.churnRate || 0}%</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Recent Activity</h3>
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">New user registration</p>
                      <p className="text-xs text-gray-500">2 minutes ago</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">Subscription activated</p>
                      <p className="text-xs text-gray-500">5 minutes ago</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">Payment processed</p>
                      <p className="text-xs text-gray-500">10 minutes ago</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-4">
                  <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm">
                    View Reports
                  </button>
                  <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm">
                    Manage Plans
                  </button>
                  <button className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 text-sm">
                    Support Tickets
                  </button>
                  <button className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm">
                    System Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default AdminDashboard