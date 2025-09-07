import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: number
  username: string
  email?: string
  full_name?: string
  is_admin: boolean
}

interface AuthState {
  user: User | null
  token: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  hasHydrated: boolean
  login: (token: string, refreshToken: string, user: User) => void
  logout: () => void
  setUser: (user: User) => void
  setHasHydrated: (state: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      hasHydrated: false,
      login: (token: string, refreshToken: string, user: User) => {
        // token已经在登录流程中设置到localStorage，这里只更新store状态
        set({ token, refreshToken, user, isAuthenticated: true })
      },
      logout: () => {
        // 清理所有存储
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({ token: null, refreshToken: null, user: null, isAuthenticated: false })
      },
      setUser: (user: User) => set({ user }),
      setHasHydrated: (state: boolean) => set({ hasHydrated: state }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        user: state.user, 
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated 
      }),
      onRehydrateStorage: () => (state) => {
        // 水合完成后设置标志和同步 localStorage
        if (state) {
          // 如果有认证状态但 localStorage 中没有 token，则同步
          if (state.isAuthenticated && state.token && !localStorage.getItem('access_token')) {
            localStorage.setItem('access_token', state.token)
          }
          if (state.isAuthenticated && state.refreshToken && !localStorage.getItem('refresh_token')) {
            localStorage.setItem('refresh_token', state.refreshToken)
          }
          state.setHasHydrated(true)
        }
      },
    }
  )
)
