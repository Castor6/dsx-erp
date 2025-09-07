"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth'

export default function Home() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard')
    } else {
      router.push('/login')
    }
  }, [isAuthenticated, router])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">
          DSX ERP 系统
        </h1>
        <p className="text-center text-muted-foreground">
          采购和仓库管理系统
        </p>
        <div className="text-center mt-4">
          <p className="text-sm text-gray-500">正在跳转...</p>
        </div>
      </div>
    </main>
  )
}
