'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Eye, Calendar, Package, User, MapPin } from 'lucide-react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { api } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from '@/hooks/use-toast'

// 基础商品库存事务记录接口
interface ProductTransaction {
  id: number
  product: {
    id: number
    name: string
    sku: string
  } | null
  warehouse: {
    id: number
    name: string
  } | null
  transaction_type: string
  from_status: string | null
  to_status: string | null
  quantity: number
  reference_id: number | null
  batch_id: string | null
  notes: string | null
  created_at: string
}

// 组合商品库存事务记录接口
interface ComboTransaction {
  id: number
  combo_product: {
    id: number
    name: string
    sku: string
  } | null
  warehouse: {
    id: number
    name: string
  } | null
  transaction_type: string
  quantity: number
  reference_id: number | null
  batch_id: string | null
  notes: string | null
  created_at: string
}

// 批量出库记录接口
interface BatchShippingRecord {
  id: number
  batch_id: string
  warehouse: {
    id: number
    name: string
  } | null
  operator: {
    id: number
    username: string
    email: string
  } | null
  total_items_count: number
  total_quantity: number
  notes: string | null
  created_at: string
}

interface BatchShippingItem {
  product_id: number | null
  combo_product_id: number | null
  product_name: string
  sku: string
  quantity: number
  type: 'product' | 'combo'
}

interface BatchShippingRecordDetail {
  record: BatchShippingRecord
  items: BatchShippingItem[]
}

interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

export default function InventoryLogsPage() {
  const [activeTab, setActiveTab] = useState('product-transactions')

  // 基础商品库存事务状态
  const [productTransactions, setProductTransactions] = useState<ProductTransaction[]>([])
  const [productLoading, setProductLoading] = useState(false)
  const [productPagination, setProductPagination] = useState({
    page: 1,
    size: 10,
    total: 0,
    pages: 0
  })
  const [productFilters, setProductFilters] = useState({
    warehouse_name: '',
    product_search: '',
    start_date: '',
    end_date: ''
  })

  // 组合商品库存事务状态
  const [comboTransactions, setComboTransactions] = useState<ComboTransaction[]>([])
  const [comboLoading, setComboLoading] = useState(false)
  const [comboPagination, setComboPagination] = useState({
    page: 1,
    size: 10,
    total: 0,
    pages: 0
  })
  const [comboFilters, setComboFilters] = useState({
    warehouse_name: '',
    product_search: '',
    start_date: '',
    end_date: ''
  })

  // 批量出库记录状态
  const [batchRecords, setBatchRecords] = useState<BatchShippingRecord[]>([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchPagination, setBatchPagination] = useState({
    page: 1,
    size: 10,
    total: 0,
    pages: 0
  })
  const [batchFilters, setBatchFilters] = useState({
    warehouse_name: '',
    start_date: '',
    end_date: ''
  })

  // 详情对话框状态
  const [selectedRecord, setSelectedRecord] = useState<BatchShippingRecordDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // 获取基础商品库存事务记录（带筛选器）
  const fetchProductTransactionsWithFilters = async (filters: typeof productFilters, page = 1) => {
    try {
      setProductLoading(true)

      const params = new URLSearchParams({
        page: page.toString(),
        size: productPagination.size.toString(),
        ...(filters.warehouse_name && { warehouse_name: filters.warehouse_name }),
        ...(filters.product_search && { product_search: filters.product_search }),
        ...(filters.start_date && { start_date: filters.start_date }),
        ...(filters.end_date && { end_date: filters.end_date })
      })

      const response = await api.get(`/api/v1/inventory/product-transactions?${params}`)
      const data: PaginatedResponse<ProductTransaction> = response.data
      setProductTransactions(data.items)
      setProductPagination({
        page: data.page,
        size: data.size,
        total: data.total,
        pages: data.pages
      })
    } catch (error) {
      console.error('获取基础商品库存事务失败:', error)
      toast({
        title: "错误",
        description: "获取基础商品库存事务失败",
        variant: "destructive",
      })
    } finally {
      setProductLoading(false)
    }
  }

  // 获取基础商品库存事务记录
  const fetchProductTransactions = async (page = 1, resetPage = false) => {
    if (resetPage) {
      setProductPagination(prev => ({ ...prev, page: 1 }))
      page = 1
    }
    await fetchProductTransactionsWithFilters(productFilters, page)
  }

  // 获取组合商品库存事务记录（带筛选器）
  const fetchComboTransactionsWithFilters = async (filters: typeof comboFilters, page = 1) => {
    try {
      setComboLoading(true)

      const params = new URLSearchParams({
        page: page.toString(),
        size: comboPagination.size.toString(),
        ...(filters.warehouse_name && { warehouse_name: filters.warehouse_name }),
        ...(filters.product_search && { product_search: filters.product_search }),
        ...(filters.start_date && { start_date: filters.start_date }),
        ...(filters.end_date && { end_date: filters.end_date })
      })

      const response = await api.get(`/api/v1/inventory/combo-transactions?${params}`)
      const data: PaginatedResponse<ComboTransaction> = response.data
      setComboTransactions(data.items)
      setComboPagination({
        page: data.page,
        size: data.size,
        total: data.total,
        pages: data.pages
      })
    } catch (error) {
      console.error('获取组合商品库存事务失败:', error)
      toast({
        title: "错误",
        description: "获取组合商品库存事务失败",
        variant: "destructive",
      })
    } finally {
      setComboLoading(false)
    }
  }

  // 获取组合商品库存事务记录
  const fetchComboTransactions = async (page = 1, resetPage = false) => {
    if (resetPage) {
      setComboPagination(prev => ({ ...prev, page: 1 }))
      page = 1
    }
    await fetchComboTransactionsWithFilters(comboFilters, page)
  }

  // 获取批量出库记录（带筛选器）
  const fetchBatchRecordsWithFilters = async (filters: typeof batchFilters, page = 1) => {
    try {
      setBatchLoading(true)

      const params = new URLSearchParams({
        page: page.toString(),
        size: batchPagination.size.toString(),
        ...(filters.warehouse_name && { warehouse_name: filters.warehouse_name }),
        ...(filters.start_date && { start_date: filters.start_date }),
        ...(filters.end_date && { end_date: filters.end_date })
      })

      const response = await api.get(`/api/v1/inventory/batch-shipping-records?${params}`)
      const data: PaginatedResponse<BatchShippingRecord> = response.data
      setBatchRecords(data.items)
      setBatchPagination({
        page: data.page,
        size: data.size,
        total: data.total,
        pages: data.pages
      })
    } catch (error) {
      console.error('获取批量出库记录失败:', error)
      toast({
        title: "错误",
        description: "获取批量出库记录失败",
        variant: "destructive",
      })
    } finally {
      setBatchLoading(false)
    }
  }

  // 获取批量出库记录
  const fetchBatchRecords = async (page = 1, resetPage = false) => {
    if (resetPage) {
      setBatchPagination(prev => ({ ...prev, page: 1 }))
      page = 1
    }
    await fetchBatchRecordsWithFilters(batchFilters, page)
  }

  // 获取批量出库记录详情
  const fetchRecordDetails = async (batchId: string) => {
    try {
      setDetailLoading(true)

      const response = await api.get(`/api/v1/inventory/batch-shipping-records/${batchId}/details`)
      const data: BatchShippingRecordDetail = response.data
      setSelectedRecord(data)
    } catch (error) {
      console.error('获取批量出库记录详情失败:', error)
      toast({
        title: "错误",
        description: "获取批量出库记录详情失败",
        variant: "destructive",
      })
    } finally {
      setDetailLoading(false)
    }
  }

  // 增强版分页组件 - 支持页码点击
  const EnhancedPaginationComponent = ({
    pagination,
    onPageChange
  }: {
    pagination: typeof productPagination,
    onPageChange: (page: number) => void
  }) => {
    const { page, pages, total } = pagination
    const maxPages = Math.max(pages, 1)

    // 计算显示的页码范围
    const getPageNumbers = () => {
      const delta = 2 // 当前页前后显示的页数
      const range = []
      const rangeWithDots = []

      for (let i = Math.max(2, page - delta); i <= Math.min(maxPages - 1, page + delta); i++) {
        range.push(i)
      }

      if (page - delta > 2) {
        rangeWithDots.push(1, '...')
      } else {
        rangeWithDots.push(1)
      }

      rangeWithDots.push(...range)

      if (page + delta < maxPages - 1) {
        rangeWithDots.push('...', maxPages)
      } else if (maxPages > 1) {
        rangeWithDots.push(maxPages)
      }

      return rangeWithDots.filter((item, index, arr) => item !== arr[index - 1])
    }

    const pageNumbers = getPageNumbers()

    return (
      <div className="flex flex-col items-center gap-4 mt-6">
        {/* 页码按钮 */}
        <div className="flex items-center gap-1">
          {/* 上一页 */}
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-3"
          >
            上一页
          </Button>

          {/* 页码 */}
          {pageNumbers.map((pageNum, index) => (
            <div key={index}>
              {pageNum === '...' ? (
                <span className="px-3 py-2 text-muted-foreground">...</span>
              ) : (
                <Button
                  variant={pageNum === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange(pageNum as number)}
                  className="min-w-[40px]"
                >
                  {pageNum}
                </Button>
              )}
            </div>
          ))}

          {/* 下一页 */}
          <Button
            variant="outline"
            size="sm"
            disabled={page >= maxPages}
            onClick={() => onPageChange(page + 1)}
            className="px-3"
          >
            下一页
          </Button>
        </div>

        {/* 分页信息 */}
        <div className="text-sm text-muted-foreground">
          第 {page} / {maxPages} 页，共 {total} 条记录
        </div>
      </div>
    )
  }

  // 初始化数据
  useEffect(() => {
    if (activeTab === 'product-transactions') {
      fetchProductTransactions()
    } else if (activeTab === 'combo-transactions') {
      fetchComboTransactions()
    } else if (activeTab === 'batch-records') {
      fetchBatchRecords()
    }
  }, [activeTab])

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">库存操作日志</h1>
          <p className="text-muted-foreground">
            查看商品库存操作记录和批量出库记录
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="product-transactions">基础商品</TabsTrigger>
          <TabsTrigger value="combo-transactions">组合商品</TabsTrigger>
          <TabsTrigger value="batch-records">批量出库记录</TabsTrigger>
        </TabsList>

        {/* 基础商品库存操作 */}
        <TabsContent value="product-transactions" className="space-y-6">
          {/* 筛选条件 */}
          <Card>
            <CardHeader>
              <CardTitle>筛选条件</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium">仓库名称</label>
                  <Input
                    placeholder="请输入仓库名称"
                    value={productFilters.warehouse_name}
                    onChange={(e) => setProductFilters(prev => ({ ...prev, warehouse_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">商品名称或SKU</label>
                  <Input
                    placeholder="请输入商品名称或SKU"
                    value={productFilters.product_search}
                    onChange={(e) => setProductFilters(prev => ({ ...prev, product_search: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">开始日期</label>
                  <Input
                    type="date"
                    value={productFilters.start_date}
                    onChange={(e) => setProductFilters(prev => ({ ...prev, start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">结束日期</label>
                  <Input
                    type="date"
                    value={productFilters.end_date}
                    onChange={(e) => setProductFilters(prev => ({ ...prev, end_date: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={() => fetchProductTransactions(1, true)} disabled={productLoading}>
                  {productLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  搜索
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    // 直接调用 API 并重置筛选器，不依赖状态更新
                    const resetFilters = {
                      warehouse_name: '',
                      product_search: '',
                      start_date: '',
                      end_date: ''
                    }
                    setProductFilters(resetFilters)

                    // 直接使用重置后的筛选器调用 API
                    fetchProductTransactionsWithFilters(resetFilters, 1)
                  }}
                >
                  重置
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 事务记录列表 */}
          <Card>
            <CardHeader>
              <CardTitle>基础商品库存操作记录</CardTitle>
              <CardDescription>
                共 {productPagination.total} 条记录，第 {productPagination.page} / {Math.max(productPagination.pages, 1)} 页
              </CardDescription>
            </CardHeader>
            <CardContent>
              {productLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {productTransactions.map((transaction) => (
                    <Card key={transaction.id} className="border">
                      <CardContent className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="font-medium">商品信息</div>
                            <div>{transaction.product?.name || '未知商品'}</div>
                            <div className="text-muted-foreground font-mono">{transaction.product?.sku || '未知SKU'}</div>
                          </div>
                          <div>
                            <div className="font-medium">仓库</div>
                            <div>{transaction.warehouse?.name || '未知仓库'}</div>
                          </div>
                          <div>
                            <div className="font-medium">操作信息</div>
                            <div className="flex items-center gap-2">
                              <Badge variant="default">{transaction.transaction_type}</Badge>
                              <Badge variant="secondary">{transaction.quantity}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {transaction.from_status && transaction.to_status
                                ? `${transaction.from_status} → ${transaction.to_status}`
                                : transaction.from_status || transaction.to_status || ''}
                            </div>
                          </div>
                          <div>
                            <div className="font-medium">时间</div>
                            <div>
                              {format(new Date(transaction.created_at), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                            </div>
                            {transaction.notes && (
                              <div className="text-xs text-muted-foreground mt-1">
                                备注: {transaction.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {productTransactions.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      暂无基础商品库存操作记录
                    </div>
                  )}
                </div>
              )}

              <EnhancedPaginationComponent
                pagination={productPagination}
                onPageChange={(page) => fetchProductTransactions(page)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 组合商品库存操作 */}
        <TabsContent value="combo-transactions" className="space-y-6">
          {/* 筛选条件 */}
          <Card>
            <CardHeader>
              <CardTitle>筛选条件</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium">仓库名称</label>
                  <Input
                    placeholder="请输入仓库名称"
                    value={comboFilters.warehouse_name}
                    onChange={(e) => setComboFilters(prev => ({ ...prev, warehouse_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">组合商品名称或SKU</label>
                  <Input
                    placeholder="请输入组合商品名称或SKU"
                    value={comboFilters.product_search}
                    onChange={(e) => setComboFilters(prev => ({ ...prev, product_search: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">开始日期</label>
                  <Input
                    type="date"
                    value={comboFilters.start_date}
                    onChange={(e) => setComboFilters(prev => ({ ...prev, start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">结束日期</label>
                  <Input
                    type="date"
                    value={comboFilters.end_date}
                    onChange={(e) => setComboFilters(prev => ({ ...prev, end_date: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={() => fetchComboTransactions(1, true)} disabled={comboLoading}>
                  {comboLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  搜索
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    // 直接调用 API 并重置筛选器，不依赖状态更新
                    const resetFilters = {
                      warehouse_name: '',
                      product_search: '',
                      start_date: '',
                      end_date: ''
                    }
                    setComboFilters(resetFilters)

                    // 直接使用重置后的筛选器调用 API
                    fetchComboTransactionsWithFilters(resetFilters, 1)
                  }}
                >
                  重置
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 事务记录列表 */}
          <Card>
            <CardHeader>
              <CardTitle>组合商品库存操作记录</CardTitle>
              <CardDescription>
                共 {comboPagination.total} 条记录，第 {comboPagination.page} / {Math.max(comboPagination.pages, 1)} 页
              </CardDescription>
            </CardHeader>
            <CardContent>
              {comboLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {comboTransactions.map((transaction) => (
                    <Card key={transaction.id} className="border">
                      <CardContent className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="font-medium">组合商品信息</div>
                            <div>{transaction.combo_product?.name || '未知组合商品'}</div>
                            <div className="text-muted-foreground font-mono">{transaction.combo_product?.sku || '未知SKU'}</div>
                          </div>
                          <div>
                            <div className="font-medium">仓库</div>
                            <div>{transaction.warehouse?.name || '未知仓库'}</div>
                          </div>
                          <div>
                            <div className="font-medium">操作信息</div>
                            <div className="flex items-center gap-2">
                              <Badge variant="default">{transaction.transaction_type}</Badge>
                              <Badge variant="secondary">{transaction.quantity}</Badge>
                            </div>
                          </div>
                          <div>
                            <div className="font-medium">时间</div>
                            <div>
                              {format(new Date(transaction.created_at), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                            </div>
                            {transaction.notes && (
                              <div className="text-xs text-muted-foreground mt-1">
                                备注: {transaction.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {comboTransactions.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      暂无组合商品库存操作记录
                    </div>
                  )}
                </div>
              )}

              <EnhancedPaginationComponent
                pagination={comboPagination}
                onPageChange={(page) => fetchComboTransactions(page)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 批量出库记录 */}
        <TabsContent value="batch-records" className="space-y-6">
          {/* 筛选条件 */}
          <Card>
            <CardHeader>
              <CardTitle>筛选条件</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">仓库名称</label>
                  <Input
                    placeholder="请输入仓库名称"
                    value={batchFilters.warehouse_name}
                    onChange={(e) => setBatchFilters(prev => ({ ...prev, warehouse_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">开始日期</label>
                  <Input
                    type="date"
                    value={batchFilters.start_date}
                    onChange={(e) => setBatchFilters(prev => ({ ...prev, start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">结束日期</label>
                  <Input
                    type="date"
                    value={batchFilters.end_date}
                    onChange={(e) => setBatchFilters(prev => ({ ...prev, end_date: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={() => fetchBatchRecords(1, true)} disabled={batchLoading}>
                  {batchLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  搜索
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    // 直接调用 API 并重置筛选器，不依赖状态更新
                    const resetFilters = {
                      warehouse_name: '',
                      start_date: '',
                      end_date: ''
                    }
                    setBatchFilters(resetFilters)

                    // 直接使用重置后的筛选器调用 API
                    fetchBatchRecordsWithFilters(resetFilters, 1)
                  }}
                >
                  重置
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 批量出库记录列表 */}
          <Card>
            <CardHeader>
              <CardTitle>批量出库记录</CardTitle>
              <CardDescription>
                共 {batchPagination.total} 条记录，第 {batchPagination.page} / {Math.max(batchPagination.pages, 1)} 页
              </CardDescription>
            </CardHeader>
            <CardContent>
              {batchLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {batchRecords.map((record) => (
                    <Card key={record.id} className="border">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-xs">
                                {record.batch_id}
                              </Badge>
                              <Badge variant="secondary">
                                {record.total_items_count} 种商品
                              </Badge>
                              <Badge variant="secondary">
                                总计 {record.total_quantity} 件
                              </Badge>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <span>仓库: {record.warehouse?.name || '未知'}</span>
                              </div>

                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span>操作人: {record.operator?.username || '未知'}</span>
                              </div>

                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span>
                                  {format(new Date(record.created_at), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                                </span>
                              </div>
                            </div>

                            {record.notes && (
                              <div className="text-sm text-muted-foreground">
                                备注: {record.notes}
                              </div>
                            )}
                          </div>

                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fetchRecordDetails(record.batch_id)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                查看详情
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl max-h-[80vh]">
                              <DialogHeader>
                                <DialogTitle>批量出库详情</DialogTitle>
                              </DialogHeader>
                              {detailLoading ? (
                                <div className="flex items-center justify-center h-64">
                                  <Loader2 className="h-8 w-8 animate-spin" />
                                </div>
                              ) : selectedRecord ? (
                                <ScrollArea className="max-h-[60vh]">
                                  <div className="space-y-4">
                                    {/* 基本信息 */}
                                    <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                                      <div>
                                        <label className="text-sm font-medium">批次ID</label>
                                        <p className="font-mono text-sm">{selectedRecord.record.batch_id}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">操作时间</label>
                                        <p className="text-sm">
                                          {format(new Date(selectedRecord.record.created_at), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                                        </p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">仓库</label>
                                        <p className="text-sm">{selectedRecord.record.warehouse?.name}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">操作人</label>
                                        <p className="text-sm">{selectedRecord.record.operator?.username}</p>
                                      </div>
                                    </div>

                                    {/* 商品明细 */}
                                    <div>
                                      <h3 className="text-lg font-semibold mb-2">出库商品明细</h3>
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>商品名称</TableHead>
                                            <TableHead>SKU</TableHead>
                                            <TableHead>类型</TableHead>
                                            <TableHead>出库数量</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {selectedRecord.items.map((item, index) => (
                                            <TableRow key={index}>
                                              <TableCell>{item.product_name}</TableCell>
                                              <TableCell className="font-mono">{item.sku}</TableCell>
                                              <TableCell>
                                                <Badge variant={item.type === 'product' ? 'default' : 'secondary'}>
                                                  {item.type === 'product' ? '基础商品' : '组合商品'}
                                                </Badge>
                                              </TableCell>
                                              <TableCell>{item.quantity}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                </ScrollArea>
                              ) : null}
                            </DialogContent>
                          </Dialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {batchRecords.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      暂无批量出库记录
                    </div>
                  )}
                </div>
              )}

              <EnhancedPaginationComponent
                pagination={batchPagination}
                onPageChange={(page) => fetchBatchRecords(page)}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}