"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, ShoppingCart, Warehouse, Building2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

interface DashboardStats {
  total_products: number
  pending_orders: number
  total_suppliers: number
  total_warehouses: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  const fetchDashboardStats = async () => {
    try {
      setIsLoading(true)
      const response = await api.get('/api/v1/dashboard/stats')
      setStats(response.data)
    } catch (error) {
      console.error('获取仪表板数据失败:', error)
      toast({
        title: "错误",
        description: "获取仪表板数据失败",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardStats()
  }, [])

  const statItems = stats ? [
    {
      name: '总商品数',
      value: stats.total_products.toString(),
      icon: Package,
      description: '商品和组合商品总数',
    },
    {
      name: '待记录到货订单',
      value: stats.pending_orders.toString(),
      icon: ShoppingCart,
      description: '待记录到货的采购订单',
    },
    {
      name: '供应商数量',
      value: stats.total_suppliers.toString(),
      icon: Building2,
      description: '系统中的供应商总数',
    },
    {
      name: '仓库数量',
      value: stats.total_warehouses.toString(),
      icon: Warehouse,
      description: '当前管理的仓库数量',
    },
  ] : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">仪表板</h1>
        <p className="text-gray-600">系统概览和关键指标</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                </CardTitle>
                <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded animate-pulse mb-2"></div>
                <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statItems.map((stat) => (
            <Card key={stat.name}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.name}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <CardDescription className="text-xs text-muted-foreground">
                  {stat.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

    </div>
  )
}
