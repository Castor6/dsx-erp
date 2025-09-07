"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import {
  Package,
  ShoppingCart,
  Warehouse,
  Users,
  BarChart3,
  Box,
  Truck,
  Link2,
  Layers,
} from 'lucide-react'

const navigation = [
  {
    name: '仪表板',
    href: '/dashboard',
    icon: BarChart3,
  },
  {
    name: '用户管理',
    href: '/dashboard/users',
    icon: Users,
    adminOnly: true,
  },
  {
    name: '供应商管理',
    href: '/dashboard/suppliers',
    icon: Truck,
  },
  {
    name: '供货关系管理',
    href: '/dashboard/supplier-products',
    icon: Link2,
  },
  {
    name: '商品管理',
    href: '/dashboard/products',
    icon: Package,
  },
  {
    name: '组合商品管理',
    href: '/dashboard/combo-products',
    icon: Layers,
  },
  {
    name: '仓库管理',
    href: '/dashboard/warehouses',
    icon: Warehouse,
  },
  {
    name: '采购订单',
    href: '/dashboard/purchase-orders',
    icon: ShoppingCart,
  },
  {
    name: '库存管理',
    href: '/dashboard/inventory',
    icon: Box,
  },
]

export const DashboardSidebar = () => {
  const pathname = usePathname()
  const { user } = useAuthStore()

  // 根据用户权限过滤导航菜单
  const filteredNavigation = navigation.filter((item) => {
    // 如果菜单项需要管理员权限，但用户不是管理员，则过滤掉
    if (item.adminOnly && !user?.is_admin) {
      return false
    }
    return true
  })

  return (
    <div className="w-64 bg-white shadow-sm border-r">
      <div className="p-6">
        <h1 className="text-xl font-bold text-gray-900">DSX ERP</h1>
        <p className="text-sm text-gray-500">采购仓库管理系统</p>
      </div>
      <nav className="mt-6">
        <div className="px-3">
          {filteredNavigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center px-3 py-2 text-sm font-medium rounded-md mb-1 transition-colors',
                  isActive
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.name}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
