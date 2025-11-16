import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '../store/auth'
import { supabase } from '../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'

const dependentSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  relationship: z.string().min(1, 'Relationship is required'),
  phone_number: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  date_of_birth: z.string().min(1, 'Date of birth is required')
})

type DependentForm = z.infer<typeof dependentSchema>

function DependentDetails() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [fullName, setFullName] = useState('')
  const [fullNameError, setFullNameError] = useState<string | null>(null)

  // Fetch dependent details
  const { data: dependent, isLoading } = useQuery({
    queryKey: ['dependent', id],
    queryFn: async () => {
      if (!user || !id) return null
      const { data, error } = await supabase
        .from('dependents')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!user && !!id
  })

  // Update dependent mutation
  const updateDependentMutation = useMutation({
    mutationFn: async (data: DependentForm) => {
      if (!user || !id) throw new Error('Not authenticated or missing dependent ID')

      const { error } = await supabase
        .from('dependents')
        .update({
          ...data,
          date_of_birth: new Date(data.date_of_birth).toISOString()
        })
        .eq('id', id)
        .eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependents'] })
      queryClient.invalidateQueries({ queryKey: ['dependent', id] })
      setMessage('Dependent updated successfully!')
      setIsEditing(false)
      setTimeout(() => setMessage(null), 3000)
    },
    onError: (error: any) => {
      setMessage(error.message || 'Failed to update dependent')
    }
  })

  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm<DependentForm>({
    resolver: zodResolver(dependentSchema)
  })

  // Populate form when dependent data loads
  useEffect(() => {
    if (dependent) {
      const fullNameValue = `${dependent.first_name || ''} ${dependent.last_name || ''}`.trim()
      setFullName(fullNameValue)
      setValue('first_name', dependent.first_name || '')
      setValue('last_name', dependent.last_name || '')
      setValue('relationship', dependent.relationship || '')
      setValue('phone_number', dependent.phone_number || '')
      setValue('email', dependent.email || '')
      setValue('date_of_birth', dependent.date_of_birth ? new Date(dependent.date_of_birth).toISOString().split('T')[0] : '')
    }
  }, [dependent, setValue])

  const onSubmit = (data: DependentForm) => {
    // Parse full name into first and last
    const name = (fullName || '').trim().replace(/\s+/g, ' ')
    const parts = name.split(' ')
    if (parts.length < 2) {
      setFullNameError('Please enter full name (first and last).')
      return
    }
    const first = parts.shift() as string
    const last = parts.join(' ')

    setValue('first_name', first, { shouldValidate: true })
    setValue('last_name', last, { shouldValidate: true })
    setFullNameError(null)

    updateDependentMutation.mutate({ ...data, first_name: first, last_name: last })
  }

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleCancel = () => {
    setIsEditing(false)
    // Reset form to original values
    if (dependent) {
      const fullNameValue = `${dependent.first_name || ''} ${dependent.last_name || ''}`.trim()
      setFullName(fullNameValue)
      reset({
        first_name: dependent.first_name || '',
        last_name: dependent.last_name || '',
        relationship: dependent.relationship || '',
        phone_number: dependent.phone_number || '',
        email: dependent.email || '',
        date_of_birth: dependent.date_of_birth ? new Date(dependent.date_of_birth).toISOString().split('T')[0] : ''
      })
    }
    setFullNameError(null)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dependent details...</p>
        </div>
      </div>
    )
  }

  if (!dependent) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Dependent not found.</p>
          <button
            onClick={() => navigate('/dependents')}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Back to Dependents
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/dependents')}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back to Dependents
              </button>
              <h1 className="text-3xl font-bold text-gray-900">Dependent Details</h1>
            </div>
            {!isEditing && (
              <button
                onClick={handleEdit}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Edit Details
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {message && (
            <div className={`mb-6 p-4 rounded-md ${message.includes('successfully') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {message}
            </div>
          )}

          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center mb-6">
                <div className="flex-shrink-0 h-16 w-16">
                  <div className="h-16 w-16 rounded-full bg-gray-300 flex items-center justify-center">
                    <span className="text-lg font-medium text-gray-700">
                      {dependent.first_name?.[0]}{dependent.last_name?.[0]}
                    </span>
                  </div>
                </div>
                <div className="ml-6">
                  <h2 className="text-2xl font-bold text-gray-900">
                    {dependent.first_name} {dependent.last_name}
                  </h2>
                  <p className="text-gray-600">
                    {dependent.relationship} • Born {new Date(dependent.date_of_birth).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {isEditing ? (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">
                        Full Name
                      </label>
                      <input
                        id="full_name"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Jane Doe"
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                      {fullNameError && (
                        <p className="mt-1 text-sm text-red-600">{fullNameError}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="relationship" className="block text-sm font-medium text-gray-700">
                        Relationship
                      </label>
                      <select
                        {...register('relationship')}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select relationship</option>
                        <option value="spouse">Spouse</option>
                        <option value="child">Child</option>
                        <option value="parent">Parent</option>
                        <option value="sibling">Sibling</option>
                        <option value="other">Other</option>
                      </select>
                      {errors.relationship && (
                        <p className="mt-1 text-sm text-red-600">{errors.relationship.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700">
                        Date of Birth
                      </label>
                      <input
                        {...register('date_of_birth')}
                        type="date"
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                      {errors.date_of_birth && (
                        <p className="mt-1 text-sm text-red-600">{errors.date_of_birth.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700">
                        Phone Number
                      </label>
                      <input
                        {...register('phone_number')}
                        type="tel"
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                        Email (Optional)
                      </label>
                      <input
                        {...register('email')}
                        type="email"
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                      {errors.email && (
                        <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end space-x-4">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updateDependentMutation.isPending}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                    >
                      {updateDependentMutation.isPending ? 'Updating...' : 'Update Dependent'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Personal Information</h3>
                    <dl className="space-y-3">
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Full Name</dt>
                        <dd className="text-sm text-gray-900">{dependent.first_name} {dependent.last_name}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Relationship</dt>
                        <dd className="text-sm text-gray-900 capitalize">{dependent.relationship}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Date of Birth</dt>
                        <dd className="text-sm text-gray-900">{new Date(dependent.date_of_birth).toLocaleDateString()}</dd>
                      </div>
                    </dl>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Contact Information</h3>
                    <dl className="space-y-3">
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Phone Number</dt>
                        <dd className="text-sm text-gray-900">{dependent.phone_number || 'Not provided'}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Email</dt>
                        <dd className="text-sm text-gray-900">{dependent.email || 'Not provided'}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default DependentDetails