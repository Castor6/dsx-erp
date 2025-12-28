"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import {
  Warehouse,
  Package,
  TrendingUp,
  BarChart3,
  Layers,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Truck
} from 'lucide-react'
import { api } from '@/lib/api'
import BatchShippingDialog from '@/components/dashboard/BatchShippingDialog'

interface InventoryRecord {
  id: number
  product_id: number
  warehouse_id: number
  in_transit: number
  semi_finished: number
  finished: number
  shipped: number
  total_stock: number
  available_stock: number
  product?: {
    id: number
    name: string
    sku: string
    sale_type: string
  }
  warehouse?: {
    id: number
    name: string
  }
}

interface PaginatedInventoryResponse {
  items: InventoryRecord[]
  total: number
  page: number
  size: number
  pages: number
}

interface ComboInventoryRecord {
  id: number
  combo_product_id: number
  warehouse_id: number
  finished: number
  shipped: number
  available_to_assemble: number
  combo_product_name?: string
  combo_product_sku?: string
  warehouse_name?: string
}

interface PaginatedComboInventoryResponse {
  items: ComboInventoryRecord[]
  total: number
  page: number
  size: number
  pages: number
}

interface InventorySummary {
  warehouse_id: number
  warehouse_name: string
  total_products: number
  total_in_transit: number
  total_semi_finished: number
  total_finished: number
  total_shipped: number
  // 组合商品统计
  total_combo_products: number
  total_combo_finished: number
  total_combo_shipped: number
}

interface WarehouseData {
  id: number
  name: string
}

interface ActionForm {
  product_id?: number
  combo_product_id?: number
  warehouse_id: number
  quantity: number | string
  notes?: string
  maxQuantity?: number
  limitingFactor?: string
}

interface ComboProductDetails {
  id: number
  name: string
  sku: string
  warehouse_name: string
  combo_items: Array<{
    id: number
    base_product_id: number
    quantity: number
    base_product_name?: string
    base_product_sku?: string
  }>
}

interface PackagingInventoryItem {
  packaging_id: number
  packaging_name: string
  packaging_sku: string
  required_quantity: number
  warehouse_id: number
  warehouse_name: string
  semi_finished: number
  total_stock: number
  available_stock: number
  status: string
}

interface ComboPackagingDetails {
  combo_product_packaging: PackagingInventoryItem[]
  base_products_packaging: Array<{
    base_product_id: number
    base_product_name: string
    base_product_sku: string
    required_quantity: number
    packaging_list: PackagingInventoryItem[]
  }>
  base_products_inventory?: Array<{
    base_product_id: number
    base_product_name: string
    base_product_sku: string
    required_quantity: number
    current_stock: number
    available_stock: number
    stock_status: string
  }>
}

export default function InventoryPage() {
  // 状态管理
  const [inventorySummary, setInventorySummary] = useState<InventorySummary[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'base' | 'combo'>('base')
  const [isLoading, setIsLoading] = useState(false)
  
  // 基础商品库存
  const [baseInventory, setBaseInventory] = useState<PaginatedInventoryResponse>({
    items: [],
    total: 0,
    page: 1,
    size: 10,
    pages: 0
  })
  const [baseSearch, setBaseSearch] = useState('')
  const [baseSaleType, setBaseSaleType] = useState<string>('all')
  
  // 组合商品库存
  const [comboInventory, setComboInventory] = useState<PaginatedComboInventoryResponse>({
    items: [],
    total: 0,
    page: 1,
    size: 10,
    pages: 0
  })
  const [comboSearch, setComboSearch] = useState('')
  
  // 对话框状态
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false)
  const [actionType, setActionType] = useState<'package' | 'ship' | 'unpack' | 'assemble' | 'combo-ship' | 'disassemble'>('package')
  const [actionForm, setActionForm] = useState<ActionForm>({
    warehouse_id: 0,
    quantity: '',
    notes: ''
  })
  const [isComboDetailsDialogOpen, setIsComboDetailsDialogOpen] = useState(false)
  const [selectedComboDetails, setSelectedComboDetails] = useState<ComboProductDetails | null>(null)
  const [isPackagingDialogOpen, setIsPackagingDialogOpen] = useState(false)
  const [packagingInventory, setPackagingInventory] = useState<PackagingInventoryItem[]>([])
  const [packagingProductInfo, setPackagingProductInfo] = useState<{name: string, sku: string} | null>(null)
  const [comboPackagingDetails, setComboPackagingDetails] = useState<ComboPackagingDetails | null>(null)
  const [isBatchShippingDialogOpen, setIsBatchShippingDialogOpen] = useState(false)

  const { toast } = useToast()

  // API 调用函数
  const fetchInventorySummary = async () => {
    try {
      const response = await api.get('/api/v1/inventory/summary')
      setInventorySummary(response.data)
    } catch (error) {
      toast({
        title: "错误",
        description: "获取库存汇总失败",
        variant: "destructive",
      })
    }
  }

  const fetchWarehouses = async () => {
    try {
      const response = await api.get('/api/v1/warehouses/')
      setWarehouses(response.data)
    } catch (error) {
      toast({
        title: "错误",
        description: "获取仓库列表失败",
        variant: "destructive",
      })
    }
  }

  const fetchBaseInventory = async (page: number = 1) => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedWarehouse) params.append('warehouse_id', selectedWarehouse.toString())
      if (baseSearch.trim()) params.append('search', baseSearch.trim())
      if (baseSaleType && baseSaleType !== 'all') params.append('sale_type', baseSaleType)
      params.append('page', page.toString())
      params.append('size', baseInventory.size.toString())

      const response = await api.get(`/api/v1/inventory/records?${params}`)
      setBaseInventory(response.data)
    } catch (error) {
      toast({
        title: "错误",
        description: "获取基础商品库存失败",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const fetchComboInventory = async (page: number = 1) => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedWarehouse) params.append('warehouse_id', selectedWarehouse.toString())
      if (comboSearch.trim()) params.append('search', comboSearch.trim())
      params.append('page', page.toString())
      params.append('size', comboInventory.size.toString())

      const response = await api.get(`/api/v1/inventory/combo/records?${params}`)
      setComboInventory(response.data)
    } catch (error) {
      toast({
        title: "错误",
        description: "获取组合商品库存失败",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const fetchComboProductDetails = async (comboProductId: number, warehouseId?: number) => {
    try {
      const response = await api.get(`/api/v1/combo-products/${comboProductId}`)
      const comboProduct = response.data

      // 确保获取到最新的基础商品库存数据
      await fetchBaseInventory(baseInventory.page)

      // 确定要使用的仓库ID：优先使用传入的仓库ID，其次使用当前选中的仓库，最后使用组合商品的第一个仓库
      let targetWarehouseId = warehouseId || selectedWarehouse
      let warehouseName = '未知仓库'

      if (!targetWarehouseId && comboProduct.warehouses && comboProduct.warehouses.length > 0) {
        targetWarehouseId = comboProduct.warehouses[0].warehouse_id
        warehouseName = comboProduct.warehouses[0].warehouse_name
      } else if (targetWarehouseId) {
        // 优先从组合商品的仓库列表中查找
        const warehouseInfo = comboProduct.warehouses?.find((w: any) => w.warehouse_id === targetWarehouseId)
        if (warehouseInfo) {
          warehouseName = warehouseInfo.warehouse_name
        } else {
          const warehouse = warehouses.find((w: any) => w.id === targetWarehouseId)
          warehouseName = warehouse?.name || '未知仓库'
        }
      }

      if (!targetWarehouseId) {
        toast({
          title: "错误",
          description: "无法确定仓库信息，请先选择仓库",
          variant: "destructive",
        })
        return
      }

      const details: ComboProductDetails = {
        id: comboProduct.id,
        name: comboProduct.name,
        sku: comboProduct.sku,
        warehouse_name: warehouseName,
        combo_items: comboProduct.combo_items
      }

      // 获取组合商品的包材库存信息
      const packagingResponse = await api.get(`/api/v1/inventory/combo-product/${comboProductId}/packaging?warehouse_id=${targetWarehouseId}`)
      setComboPackagingDetails(packagingResponse.data)

      setSelectedComboDetails(details)
      setIsComboDetailsDialogOpen(true)
    } catch (error) {
      console.error('获取组合商品明细失败:', error)
      toast({
        title: "错误",
        description: "获取组合商品明细失败",
        variant: "destructive",
      })
    }
  }

  const fetchProductPackaging = async (productId: number, productName: string, productSku: string, warehouseId?: number) => {
    try {
      const params = warehouseId ? `?warehouse_id=${warehouseId}` : ''
      const response = await api.get(`/api/v1/inventory/product/${productId}/packaging${params}`)
      
      setPackagingInventory(response.data)
      setPackagingProductInfo({ name: productName, sku: productSku })
      setIsPackagingDialogOpen(true)
    } catch (error) {
      console.error('获取包材库存失败:', error)
      toast({
        title: "错误",
        description: "获取包材库存失败",
        variant: "destructive",
      })
    }
  }

  // 初始化加载
  useEffect(() => {
    const loadInitialData = async () => {
      await Promise.all([
        fetchInventorySummary(),
        fetchWarehouses()
      ])
      // 初始加载第一页数据
      await fetchBaseInventory()
    }
    loadInitialData()
  }, [])

  // 监听仓库变化 - 同时刷新两个标签页的数据
  useEffect(() => {
    // 避免在初始化时重复加载（初始化时 warehouses 还是空数组）
    if (warehouses.length > 0) {
      // 同时刷新基础商品和组合商品库存数据
      fetchBaseInventory(1)
      fetchComboInventory(1)
    }
  }, [selectedWarehouse])

  // 监听商品类型变化 - 基础商品
  useEffect(() => {
    if (activeTab === 'base') {
      fetchBaseInventory(1)
    }
  }, [baseSaleType])

  // 切换标签页时加载数据 - 优化版本，避免闪烁
  useEffect(() => {
    // 避免在初始化时触发切换状态
    if (activeTab === 'base' && baseInventory.items.length === 0) {
      // 基础商品数据已在初始化时加载，这里不需要重新加载
      return
    }
    
    if (activeTab === 'combo' && comboInventory.items.length === 0) {
      fetchComboInventory(1)
    }
  }, [activeTab])

  // 优化的标签页切换处理函数 - 简化版本
  const handleTabSwitch = (newTab: 'base' | 'combo') => {
    if (newTab === activeTab) return
    
    setActiveTab(newTab)
  }

  // 事件处理函数
  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!actionForm.warehouse_id || !actionForm.quantity || Number(actionForm.quantity) <= 0) {
      toast({
        title: "错误",
        description: "请填写所有必填字段",
        variant: "destructive",
      })
      return
    }

    try {
      let endpoint = ''
      let payload: any = actionForm
      let successMessage = ''

      switch (actionType) {
        case 'package':
          endpoint = '/api/v1/inventory/package'
          payload = {
            product_id: actionForm.product_id,
            warehouse_id: actionForm.warehouse_id,
            quantity: Number(actionForm.quantity)
          }
          successMessage = '商品打包成功'
          break
        case 'ship':
          endpoint = '/api/v1/inventory/ship'
          payload = {
            product_id: actionForm.product_id,
            warehouse_id: actionForm.warehouse_id,
            quantity: Number(actionForm.quantity),
            notes: actionForm.notes || ''
          }
          successMessage = '商品出库成功'
          break
        case 'unpack':
          endpoint = '/api/v1/inventory/unpack'
          payload = {
            product_id: actionForm.product_id,
            warehouse_id: actionForm.warehouse_id,
            quantity: Number(actionForm.quantity)
          }
          successMessage = '商品拆包成功'
          break
        case 'assemble':
          endpoint = '/api/v1/combo-products/assemble'
          payload = {
            combo_product_id: actionForm.combo_product_id,
            warehouse_id: actionForm.warehouse_id,
            quantity: Number(actionForm.quantity),
            notes: actionForm.notes || ''
          }
          successMessage = '组合商品打包成功'
          break
        case 'combo-ship':
          endpoint = '/api/v1/combo-products/ship'
          payload = {
            combo_product_id: actionForm.combo_product_id,
            warehouse_id: actionForm.warehouse_id,
            quantity: Number(actionForm.quantity),
            notes: actionForm.notes || ''
          }
          successMessage = '组合商品出库成功'
          break
        case 'disassemble':
          endpoint = '/api/v1/combo-products/disassemble'
          payload = {
            combo_product_id: actionForm.combo_product_id,
            warehouse_id: actionForm.warehouse_id,
            quantity: Number(actionForm.quantity),
            notes: actionForm.notes || ''
          }
          successMessage = '组合商品拆包成功'
          break
      }

      await api.post(endpoint, payload)
      toast({
        title: "成功",
        description: successMessage,
      })
      
      setIsActionDialogOpen(false)
      setActionForm({
        warehouse_id: 0,
        quantity: '',
        notes: '',
        maxQuantity: 0,
        limitingFactor: ''
      })
      
      // 刷新数据
      await fetchInventorySummary()
      if (activeTab === 'base') {
        await fetchBaseInventory(baseInventory.page)
      } else {
        await fetchComboInventory(comboInventory.page)
      }
    } catch (error: any) {
      toast({
        title: "错误",
        description: error.response?.data?.detail || "操作失败",
        variant: "destructive",
      })
    }
  }

  const openActionDialog = async (
    type: 'package' | 'ship' | 'unpack' | 'assemble' | 'combo-ship' | 'disassemble',
    productId?: number,
    comboProductId?: number,
    warehouseId?: number
  ) => {
    setActionType(type)

    const baseForm = {
      product_id: productId,
      combo_product_id: comboProductId,
      warehouse_id: warehouseId || selectedWarehouse || 0,
      quantity: '',
      notes: '',
      maxQuantity: 0,
      limitingFactor: ''
    }

    // 获取最大可操作数量
    try {
      let endpoint = ''
      let params = ''

      const targetWarehouseId = warehouseId || selectedWarehouse
      if (!targetWarehouseId) {
        toast({
          title: "错误",
          description: "请先选择仓库",
          variant: "destructive",
        })
        return
      }

      switch (type) {
        case 'package':
          endpoint = `/api/v1/inventory/product/${productId}/max-package-quantity`
          params = `?warehouse_id=${targetWarehouseId}`
          break
        case 'ship':
          endpoint = `/api/v1/inventory/product/${productId}/max-ship-quantity`
          params = `?warehouse_id=${targetWarehouseId}`
          break
        case 'unpack':
          endpoint = `/api/v1/inventory/product/${productId}/max-unpack-quantity`
          params = `?warehouse_id=${targetWarehouseId}`
          break
        case 'assemble':
          endpoint = `/api/v1/combo-products/${comboProductId}/max-assemble-quantity`
          params = `?warehouse_id=${targetWarehouseId}`
          break
        case 'combo-ship':
          endpoint = `/api/v1/combo-products/${comboProductId}/max-ship-quantity`
          params = `?warehouse_id=${targetWarehouseId}`
          break
        case 'disassemble':
          endpoint = `/api/v1/combo-products/${comboProductId}/max-disassemble-quantity`
          params = `?warehouse_id=${targetWarehouseId}`
          break
      }

      const response = await api.get(`${endpoint}${params}`)

      setActionForm({
        ...baseForm,
        maxQuantity: response.data.max_quantity || 0,
        limitingFactor: response.data.limiting_factor || '未知限制'
      })
    } catch (error) {
      console.error('获取最大数量失败:', error)
      setActionForm({
        ...baseForm,
        maxQuantity: 0,
        limitingFactor: '获取最大数量失败'
      })
    }

    setIsActionDialogOpen(true)
  }

  // 搜索处理函数
  const handleBaseSearch = () => {
    fetchBaseInventory(1)
  }

  const handleBaseClearSearch = () => {
    setBaseSearch('')
    setBaseSaleType('all')
    // 重置后重新搜索
    setTimeout(() => {
      fetchBaseInventory(1)
    }, 0)
  }

  const handleComboSearch = () => {
    fetchComboInventory(1)
  }

  // 工具函数
  const getStockStatusColor = (record: InventoryRecord) => {
    const availableStock = record.product?.sale_type === '包材' ? record.semi_finished : record.available_stock
    if (availableStock === 0) return 'text-red-600'
    if (availableStock < 10) return 'text-orange-600'
    return 'text-green-600'
  }

  const getActionTitle = () => {
    switch (actionType) {
      case 'package': return '商品打包'
      case 'ship': return '商品出库'
      case 'unpack': return '商品拆包'
      case 'assemble': return '组合商品打包'
      case 'combo-ship': return '组合商品出库'
      case 'disassemble': return '组合商品拆包'
      default: return '操作'
    }
  }

  const handlePageChange = (page: number) => {
    if (activeTab === 'base') {
      setBaseInventory(prev => ({ ...prev, page }))
      fetchBaseInventory(page)
    } else {
      setComboInventory(prev => ({ ...prev, page }))
      fetchComboInventory(page)
    }
  }

  const renderEmptyState = (type: 'base' | 'combo') => {
    const isBase = type === 'base'
    const hasSearch = isBase ? baseSearch.trim() : comboSearch.trim()
    
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 mb-4">
          {hasSearch ? '未找到相关库存记录' : '暂无库存数据'}
        </div>
        {hasSearch && (
          <Button
            onClick={() => {
              if (isBase) {
                window.open('/dashboard/purchase-orders', '_blank')
              } else {
                window.open('/dashboard/combo-products', '_blank')
              }
            }}
            className="mt-2"
          >
            <Plus className="h-4 w-4 mr-2" />
            {isBase ? '创建采购订单' : '新建组合商品'}
          </Button>
        )}
      </div>
    )
  }

  // 渲染基础商品库存表格
  const renderBaseInventoryTable = () => {
    if (baseInventory.items.length === 0) {
      return renderEmptyState('base')
    }

    return (
      <div className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>商品信息</TableHead>
              <TableHead>仓库</TableHead>
              <TableHead className="text-right">在途</TableHead>
              <TableHead className="text-right">半成品</TableHead>
              <TableHead className="text-right">成品</TableHead>
              <TableHead className="text-right">出库</TableHead>
              <TableHead className="text-right">可用库存</TableHead>
              <TableHead>库存状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {baseInventory.items.map((record) => (
              <TableRow key={record.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{record.product?.name}</div>
                    <div className="text-sm text-gray-500">
                      {record.product?.sku} 
                      <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                        record.product?.sale_type === '商品' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {record.product?.sale_type}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{record.warehouse?.name}</TableCell>
                <TableCell className="text-right">
                  <span className={record.in_transit > 0 ? 'text-blue-600 font-medium' : 'text-gray-400'}>
                    {record.in_transit}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className={record.semi_finished > 0 ? 'text-orange-600 font-medium' : 'text-gray-400'}>
                    {record.semi_finished}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {record.product?.sale_type === '包材' ? (
                    <span className="text-gray-400">-</span>
                  ) : (
                    <span className={record.finished > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>
                      {record.finished}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {record.product?.sale_type === '包材' ? (
                    <span className="text-gray-400">-</span>
                  ) : (
                    <span className={record.shipped > 0 ? 'text-purple-600 font-medium' : 'text-gray-400'}>
                      {record.shipped}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <span className={`font-medium ${getStockStatusColor(record)}`}>
                    {record.product?.sale_type === '包材' ? record.semi_finished : record.available_stock}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {(() => {
                      const availableStock = record.product?.sale_type === '包材' ? record.semi_finished : record.available_stock
                      if (availableStock === 0) {
                        return (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            缺货
                          </span>
                        )
                      }
                      if (availableStock < 10) {
                        return (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            库存偏低
                          </span>
                        )
                      }
                      return (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          库存充足
                        </span>
                      )
                    })()}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 flex-wrap">
                    {record.product?.sale_type === '商品' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchProductPackaging(
                          record.product_id, 
                          record.product?.name || '未知商品', 
                          record.product?.sku || '',
                          record.warehouse_id
                        )}
                        className="text-blue-600 hover:text-blue-800 p-1 h-auto"
                      >
                        查看包材
                      </Button>
                    )}
                    {record.product?.sale_type === '商品' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openActionDialog('package', record.product_id, undefined, record.warehouse_id)}
                      >
                        打包
                      </Button>
                    )}
                    {record.product?.sale_type === '商品' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openActionDialog('unpack', record.product_id, undefined, record.warehouse_id)}
                      >
                        拆包
                      </Button>
                    )}
                    {record.product?.sale_type === '商品' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openActionDialog('ship', record.product_id, undefined, record.warehouse_id)}
                      >
                        出库
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* 分页 */}
        {renderPagination('base')}
      </div>
    )
  }

  // 渲染组合商品库存表格
  const renderComboInventoryTable = () => {
    if (comboInventory.items.length === 0) {
      return renderEmptyState('combo')
    }

    return (
      <div className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>组合商品信息</TableHead>
              <TableHead>仓库</TableHead>
              <TableHead className="text-right">成品</TableHead>
              <TableHead className="text-right">出库</TableHead>
              <TableHead className="text-right">可用库存</TableHead>
              <TableHead>库存状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comboInventory.items.map((record) => (
              <TableRow key={record.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{record.combo_product_name}</div>
                    <div className="text-sm text-gray-500">
                      {record.combo_product_sku}
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        组合商品
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{record.warehouse_name}</TableCell>
                <TableCell className="text-right">
                  <span className={record.finished > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>
                    {record.finished}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className={record.shipped > 0 ? 'text-purple-600 font-medium' : 'text-gray-400'}>
                    {record.shipped}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className={`font-medium ${
                    record.finished === 0 ? 'text-red-600' :
                    record.finished < 10 ? 'text-orange-600' : 'text-green-600'
                  }`}>
                    {record.finished}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {(() => {
                      if (record.finished === 0) {
                        return (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            缺货
                          </span>
                        )
                      }
                      if (record.finished < 10) {
                        return (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            库存偏低
                          </span>
                        )
                      }
                      return (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          库存充足
                        </span>
                      )
                    })()}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fetchComboProductDetails(record.combo_product_id, record.warehouse_id)}
                      className="text-blue-600 hover:text-blue-800 p-1 h-auto"
                    >
                      查看组合明细
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openActionDialog('assemble', undefined, record.combo_product_id, record.warehouse_id)}
                    >
                      打包
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openActionDialog('disassemble', undefined, record.combo_product_id, record.warehouse_id)}
                    >
                      拆包
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openActionDialog('combo-ship', undefined, record.combo_product_id, record.warehouse_id)}
                    >
                      出库
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* 分页 */}
        {renderPagination('combo')}
      </div>
    )
  }

  // 渲染分页组件
  const renderPagination = (type: 'base' | 'combo') => {
    const currentInventory = type === 'base' ? baseInventory : comboInventory

    return (
      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-gray-700">
          共 {currentInventory.total} 条记录
          {currentInventory.total > 0 && (
            <>
              ，显示第 {(currentInventory.page - 1) * currentInventory.size + 1} 到{' '}
              {Math.min(currentInventory.page * currentInventory.size, currentInventory.total)} 条
            </>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentInventory.page - 1)}
            disabled={currentInventory.page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            上一页
          </Button>
          
          {/* 页码按钮 */}
          {currentInventory.pages > 0 && Array.from({ length: Math.min(5, currentInventory.pages) }, (_, i) => {
            let pageNum
            if (currentInventory.pages <= 5) {
              pageNum = i + 1
            } else if (currentInventory.page <= 3) {
              pageNum = i + 1
            } else if (currentInventory.page >= currentInventory.pages - 2) {
              pageNum = currentInventory.pages - 4 + i
            } else {
              pageNum = currentInventory.page - 2 + i
            }

            return (
              <Button
                key={pageNum}
                variant={pageNum === currentInventory.page ? "default" : "outline"}
                size="sm"
                onClick={() => handlePageChange(pageNum)}
                className="w-10"
              >
                {pageNum}
              </Button>
            )
          })}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentInventory.page + 1)}
            disabled={currentInventory.page >= currentInventory.pages}
          >
            下一页
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">库存管理</h1>
          <p className="text-gray-600">查看和管理各仓库的库存状况，若未查询到商品库存记录请先创建采购单</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setIsBatchShippingDialogOpen(true)}
            className="flex items-center gap-2"
          >
            <Truck className="h-4 w-4" />
            批量出库
          </Button>
        </div>
      </div>

      {/* 库存汇总卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {inventorySummary.map((summary) => (
          <Card key={summary.warehouse_id} className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedWarehouse(summary.warehouse_id)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {summary.warehouse_name}
              </CardTitle>
              <Warehouse className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="text-2xl font-bold">{summary.total_products + summary.total_combo_products}</div>
                <p className="text-xs text-muted-foreground">商品种类总数</p>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div>在途: {summary.total_in_transit}</div>
                  <div>半成品: {summary.total_semi_finished}</div>
                  <div>成品: {summary.total_finished + summary.total_combo_finished}</div>
                  <div>出库: {summary.total_shipped + summary.total_combo_shipped}</div>
                </div>
                <div className="pt-1 border-t border-gray-100">
                  <div className="text-xs text-purple-600">
                    组合商品: {summary.total_combo_products} 种
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 仓库选择器 */}
      <div className="flex items-center gap-4">
        <Label htmlFor="warehouse-select">查看仓库:</Label>
        <Select
          value={selectedWarehouse?.toString() || 'all'}
          onValueChange={(value) => setSelectedWarehouse(value === 'all' ? null : parseInt(value))}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有仓库</SelectItem>
            {warehouses.map((warehouse) => (
              <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                {warehouse.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 标签页导航 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => handleTabSwitch('base')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
              activeTab === 'base'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Package className="h-4 w-4 inline mr-2" />
            基础商品库存
          </button>
          <button
            onClick={() => handleTabSwitch('combo')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
              activeTab === 'combo'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Layers className="h-4 w-4 inline mr-2" />
            组合商品库存
          </button>
        </nav>
      </div>

      {/* 库存明细表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            库存明细
            {selectedWarehouse && (
              <span className="text-sm font-normal text-gray-500">
                - {warehouses.find(w => w.id === selectedWarehouse)?.name}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* 搜索栏 */}
          <div className="mb-6">
            {activeTab === 'base' ? (
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="搜索商品名称或SKU..."
                      value={baseSearch}
                      onChange={(e) => setBaseSearch(e.target.value)}
                      className="pl-10"
                      onKeyDown={(e) => e.key === 'Enter' && handleBaseSearch()}
                    />
                  </div>
                </div>
                <div className="w-40">
                  <Select value={baseSaleType} onValueChange={setBaseSaleType}>
                    <SelectTrigger>
                      <SelectValue placeholder="商品类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部类型</SelectItem>
                      <SelectItem value="商品">商品</SelectItem>
                      <SelectItem value="包材">包材</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleBaseSearch}
                    className="flex items-center gap-2"
                  >
                    <Search className="h-4 w-4" />
                    搜索
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleBaseClearSearch}
                    className="flex items-center gap-2"
                  >
                    清空
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-4 items-start">
                <div className="w-80">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="搜索组合商品名称或SKU..."
                      value={comboSearch}
                      onChange={(e) => setComboSearch(e.target.value)}
                      className="pl-10"
                      onKeyDown={(e) => e.key === 'Enter' && handleComboSearch()}
                    />
                  </div>
                </div>
                <Button
                  onClick={handleComboSearch}
                  className="flex items-center gap-2"
                >
                  <Search className="h-4 w-4" />
                  搜索
                </Button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">加载中...</span>
            </div>
          ) : (
            <div className="transition-opacity duration-200">
              {activeTab === 'base' ? (
                renderBaseInventoryTable()
              ) : (
                renderComboInventoryTable()
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 操作对话框 */}
      <Dialog open={isActionDialogOpen} onOpenChange={setIsActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{getActionTitle()}</DialogTitle>
            <DialogDescription>
              {actionType === 'package' && '将半成品打包成成品（商品类型会消耗对应包材）'}
              {actionType === 'ship' && '将成品出库'}
              {actionType === 'unpack' && '将成品拆回半成品（商品类型会恢复对应包材）'}
              {actionType === 'assemble' && '将基础商品打包成组合商品'}
              {actionType === 'combo-ship' && '将组合商品成品出库'}
              {actionType === 'disassemble' && '将组合商品拆回基础商品半成品（恢复包材）'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAction} className="space-y-4">
            {/* 最大数量提示 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-blue-700">
                <TrendingUp className="h-4 w-4" />
                <span className="font-medium">数量限制信息</span>
              </div>
              <div className="mt-1 text-sm text-blue-600">
                最大可操作数量：<span className="font-semibold">{actionForm.maxQuantity || 0}</span>
                {actionForm.limitingFactor && (
                  <div className="text-xs mt-1 text-blue-500">
                    限制因素：{actionForm.limitingFactor}
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label>数量 *</Label>
              <Input
                type="number"
                min="1"
                max={actionForm.maxQuantity || undefined}
                value={actionForm.quantity}
                onChange={(e) => {
                  const value = e.target.value
                  const numValue = Number(value)

                  // 实时验证并显示错误提示
                  if (value && actionForm.maxQuantity && numValue > actionForm.maxQuantity) {
                    toast({
                      title: "数量超限",
                      description: `输入数量超过最大可操作数量 ${actionForm.maxQuantity}`,
                      variant: "destructive",
                      duration: 2000
                    })
                  }

                  setActionForm(prev => ({
                    ...prev,
                    quantity: value || ''
                  }))
                }}
                placeholder={`请输入数量（最大：${actionForm.maxQuantity || 0}）`}
                className={`${
                  actionForm.quantity &&
                  actionForm.maxQuantity &&
                  Number(actionForm.quantity) > actionForm.maxQuantity
                    ? 'border-red-500 focus:ring-red-500'
                    : ''
                }`}
                required
              />
              {actionForm.quantity &&
               actionForm.maxQuantity &&
               Number(actionForm.quantity) > actionForm.maxQuantity && (
                <p className="text-sm text-red-500 mt-1">
                  数量不能超过 {actionForm.maxQuantity}
                </p>
              )}
            </div>
            {(actionType === 'ship' || actionType === 'assemble' || actionType === 'combo-ship' || actionType === 'disassemble') && (
              <div>
                <Label>备注</Label>
                <Input
                  value={actionForm.notes || ''}
                  onChange={(e) => setActionForm(prev => ({
                    ...prev,
                    notes: e.target.value
                  }))}
                  placeholder="请输入备注（可选）"
                />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsActionDialogOpen(false)}>
                取消
              </Button>
              <Button
                type="submit"
                disabled={
                  !actionForm.quantity ||
                  Number(actionForm.quantity) <= 0 ||
                  (!!actionForm.maxQuantity && Number(actionForm.quantity) > actionForm.maxQuantity)
                }
              >
                确认操作
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 包材库存查看对话框 */}
      <Dialog open={isPackagingDialogOpen} onOpenChange={setIsPackagingDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>包材库存详情</DialogTitle>
            <DialogDescription>
              查看商品所需包材的库存情况
            </DialogDescription>
          </DialogHeader>
          
          {packagingProductInfo && (
            <div className="space-y-4">
              {/* 商品基本信息 */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <h3 className="font-semibold text-lg mb-2">商品信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-600">商品名称：</span>
                    <span className="font-medium">{packagingProductInfo.name}</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">商品SKU：</span>
                    <span className="font-medium">{packagingProductInfo.sku}</span>
                  </div>
                </div>
              </div>
              
              {/* 包材库存列表 */}
              <div>
                <h3 className="font-semibold text-lg mb-3">所需包材库存</h3>
                {packagingInventory.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>包材名称</TableHead>
                        <TableHead>包材SKU</TableHead>
                        <TableHead>仓库</TableHead>
                        <TableHead className="text-right">所需数量</TableHead>
                        <TableHead className="text-right">可用库存</TableHead>
                        <TableHead className="text-right">总库存</TableHead>
                        <TableHead>库存状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packagingInventory.map((item, index) => (
                        <TableRow key={`${item.packaging_id}-${item.warehouse_id}`}>
                          <TableCell>
                            <div className="font-medium">{item.packaging_name}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-500">{item.packaging_sku}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{item.warehouse_name}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-medium">{item.required_quantity}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-medium ${
                              item.available_stock === 0 ? 'text-red-600' :
                              item.available_stock < item.required_quantity ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              {item.available_stock}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-gray-600">{item.total_stock}</span>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              item.status === '库存充足' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {item.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>该商品无需包材或未配置包材关系</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setIsPackagingDialogOpen(false)
                setPackagingInventory([])
                setPackagingProductInfo(null)
              }}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 组合商品明细对话框 */}
      <Dialog open={isComboDetailsDialogOpen} onOpenChange={setIsComboDetailsDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>组合商品明细</DialogTitle>
            <DialogDescription>
              查看组合商品包含的基础商品详情和包材库存
            </DialogDescription>
          </DialogHeader>
          
          {selectedComboDetails && (
            <div className="space-y-6">
              {/* 组合商品基本信息 */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <h3 className="font-semibold text-lg mb-2">组合商品信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-600">商品名称：</span>
                    <span className="font-medium">{selectedComboDetails.name}</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">商品SKU：</span>
                    <span className="font-medium">{selectedComboDetails.sku}</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">所属仓库：</span>
                    <span className="font-medium">{selectedComboDetails.warehouse_name}</span>
                  </div>
                </div>
              </div>

              {/* 组合商品本身的包材 */}
              {comboPackagingDetails && comboPackagingDetails.combo_product_packaging.length > 0 && (
                <div>
                  <h3 className="font-semibold text-lg mb-3 text-purple-700">组合商品所需包材</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>包材名称</TableHead>
                        <TableHead>包材SKU</TableHead>
                        <TableHead>仓库</TableHead>
                        <TableHead className="text-right">所需数量</TableHead>
                        <TableHead className="text-right">可用库存</TableHead>
                        <TableHead>库存状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comboPackagingDetails.combo_product_packaging.map((item, index) => (
                        <TableRow key={`combo-${item.packaging_id}-${item.warehouse_id}`}>
                          <TableCell>
                            <div className="font-medium">{item.packaging_name}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-500">{item.packaging_sku}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{item.warehouse_name}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-medium">{item.required_quantity}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-medium ${
                              item.available_stock === 0 ? 'text-red-600' :
                              item.available_stock < item.required_quantity ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              {item.available_stock}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              item.status === '库存充足' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {item.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              
              {/* 基础商品列表 */}
              <div>
                <h3 className="font-semibold text-lg mb-3 text-blue-700">包含的基础商品</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>基础商品</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">所需数量</TableHead>
                      <TableHead className="text-right">当前库存</TableHead>
                      <TableHead>库存状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comboPackagingDetails?.base_products_inventory?.map((item) => {
                      return (
                        <TableRow key={item.base_product_id}>
                          <TableCell>
                            <div className="font-medium">{item.base_product_name}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-500">{item.base_product_sku}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-medium">{item.required_quantity}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-medium ${
                              item.available_stock === 0 ? 'text-red-600' :
                              item.available_stock < item.required_quantity ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              {item.available_stock}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              item.stock_status === '库存充足' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {item.stock_status}
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    }) || selectedComboDetails.combo_items.map((item) => {
                      // 回退逻辑：如果新API没有返回base_products_inventory，使用原来的逻辑
                      const inventoryRecord = baseInventory.items.find(
                        record => record.product_id === item.base_product_id
                      )
                      const availableStock = inventoryRecord?.semi_finished || 0
                      const canFulfill = availableStock >= item.quantity

                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.base_product_name}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-500">{item.base_product_sku}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-medium">{item.quantity}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-medium ${
                              availableStock === 0 ? 'text-red-600' :
                              availableStock < item.quantity ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              {availableStock}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              !canFulfill ? 'bg-red-100 text-red-800' :
                              availableStock < item.quantity * 2 ? 'bg-orange-100 text-orange-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {!canFulfill ? '库存不足' :
                               availableStock < item.quantity * 2 ? '库存偏低' : '库存充足'}
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* 基础商品的包材需求 */}
              {comboPackagingDetails && comboPackagingDetails.base_products_packaging.some(bp => bp.packaging_list.length > 0) && (
                <div>
                  <h3 className="font-semibold text-lg mb-3 text-green-700">基础商品所需包材</h3>
                  <div className="space-y-4">
                    {comboPackagingDetails.base_products_packaging.map((baseProduct) => {
                      if (baseProduct.packaging_list.length === 0) return null
                      
                      return (
                        <div key={baseProduct.base_product_id} className="border rounded-lg p-4">
                          <h4 className="font-medium mb-3 text-gray-800">
                            {baseProduct.base_product_name} ({baseProduct.base_product_sku}) - 需要 {baseProduct.required_quantity} 个
                          </h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>包材名称</TableHead>
                                <TableHead>包材SKU</TableHead>
                                <TableHead>仓库</TableHead>
                                <TableHead className="text-right">单品所需</TableHead>
                                <TableHead className="text-right">可用库存</TableHead>
                                <TableHead>库存状态</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {baseProduct.packaging_list.map((packaging, index) => (
                                <TableRow key={`${baseProduct.base_product_id}-${packaging.packaging_id}-${packaging.warehouse_id}`}>
                                  <TableCell>
                                    <div className="font-medium">{packaging.packaging_name}</div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="text-sm text-gray-500">{packaging.packaging_sku}</div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="text-sm">{packaging.warehouse_name}</div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className="font-medium">{packaging.required_quantity}</span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className={`font-medium ${
                                      packaging.available_stock === 0 ? 'text-red-600' :
                                      packaging.available_stock < packaging.required_quantity ? 'text-orange-600' : 'text-green-600'
                                    }`}>
                                      {packaging.available_stock}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                      packaging.status === '库存充足' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                    }`}>
                                      {packaging.status}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setIsComboDetailsDialogOpen(false)
                setSelectedComboDetails(null)
                setComboPackagingDetails(null)
              }}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量出库对话框 */}
      <BatchShippingDialog
        open={isBatchShippingDialogOpen}
        onOpenChange={setIsBatchShippingDialogOpen}
        warehouses={warehouses}
        onSuccess={async () => {
          // 刷新库存数据 - 批量出库可能涉及基础商品和组合商品，所以都需要刷新
          await fetchInventorySummary()
          await fetchBaseInventory(baseInventory.page)
          await fetchComboInventory(comboInventory.page)
        }}
      />
    </div>
  )
}