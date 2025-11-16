import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface User {
  id: string
  email: string
  profiles: {
    first_name: string
    last_name: string
    country: string
    onboarding_completed: boolean
  } | null
  subscriptions: {
    status: string
    plans: {
      name: string
    } | null
  }[] | null
}

function UserManagement() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [countryFilter, setCountryFilter] = useState('all')

  const { data: users, isLoading, refetch } = useQuery({
    queryKey: ['admin-users', searchTerm, statusFilter, countryFilter],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          country,
          onboarding_completed,
          auth.users!inner(email),
          subscriptions(status, plans(name))
        `)

      if (countryFilter !== 'all') {
        query = query.eq('country', countryFilter)
      }

      const { data, error } = await query
      if (error) throw error

      // Filter by subscription status
      let filteredData = data
      if (statusFilter !== 'all') {
        filteredData = data.filter((user: any) => {
          const hasSubscription = user.subscriptions?.some((sub: any) => sub.status === statusFilter)
          return statusFilter === 'no-subscription' ? !hasSubscription : hasSubscription
        })
      }

      // Filter by search term
      if (searchTerm) {
        filteredData = filteredData.filter((user: any) =>
          user.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      }

      return filteredData
    }
  })

  const { data: countries } = useQuery({
    queryKey: ['countries-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('country')
        .not('country', 'is', null)

      if (error) throw error

      const uniqueCountries = [...new Set(data.map(item => item.country))]
      return uniqueCountries
    }
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading users...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Filters */}
          <div className="bg-white shadow rounded-lg mb-6">
            <div className="px-4 py-5 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label htmlFor="search" className="block text-sm font-medium text-gray-700">
                    Search Users
                  </label>
                  <input
                    type="text"
                    id="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Name or email..."
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                    Subscription Status
                  </label>
                  <select
                    id="status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Users</option>
                    <option value="active">Active Subscription</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="no-subscription">No Subscription</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="country" className="block text-sm font-medium text-gray-700">
                    Country
                  </label>
                  <select
                    id="country"
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Countries</option>
                    {countries?.map(country => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => refetch()}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {users?.map((user: any) => (
                <li key={user.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-700">
                            {user.first_name?.[0]}{user.last_name?.[0]}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {user.first_name} {user.last_name}
                        </div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-sm text-gray-500">
                        <div>Country: {user.country}</div>
                        <div>Onboarding: {user.onboarding_completed ? 'Completed' : 'Pending'}</div>
                      </div>
                      <div className="text-sm">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.subscriptions?.[0]?.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : user.subscriptions?.[0]?.status === 'cancelled'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {user.subscriptions?.[0]?.status || 'No Subscription'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {user.subscriptions?.[0]?.plans?.name || 'No Plan'}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {users?.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">No users found matching the criteria.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default UserManagement