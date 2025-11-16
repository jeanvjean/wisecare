import { create } from 'zustand'
import { supabase } from '../lib/supabase'

interface AdminAuthState {
  user: any
  adminRole: any
  loading: boolean
  setUser: (user: any) => void
  setAdminRole: (role: any) => void
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  checkAdminRole: () => Promise<boolean>
}

export const useAdminAuthStore = create<AdminAuthState>((set, get) => ({
  user: null,
  adminRole: null,
  loading: false,
  setUser: (user) => set({ user }),
  setAdminRole: (role) => set({ adminRole: role }),
  signIn: async (email, password) => {
    set({ loading: true })
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      if (error) throw error

      // Check if user is admin
      const isAdmin = await get().checkAdminRole()
      if (!isAdmin) {
        await supabase.auth.signOut()
        throw new Error('Access denied. Admin privileges required.')
      }
    } finally {
      set({ loading: false })
    }
  },
  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, adminRole: null })
  },
  checkAdminRole: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data, error } = await supabase
      .from('admin_users')
      .select('*, admin_roles(*)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (error || !data) return false

    set({ adminRole: data.admin_roles })
    return true
  }
}))