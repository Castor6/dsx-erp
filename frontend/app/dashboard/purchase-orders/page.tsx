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
import { Plus, ShoppingCart, Package, Trash2, Eye, Download, Upload } from 'lucide-react'
import { api } from '@/lib/api'
import SearchableSelect from '@/components/ui/searchable-select'
import { handleApiError, validateRequiredFields, validateArrayFields, lengthValidator, numberValidator, ValidationError, hasErrors, formatErrorsForToast, apiErrorToFieldError } from '@/lib/form-validation'

interface PurchaseOrder {
  id: number
  order_number: string
  supplier_id: number
  purchaser: string
  warehouse_id: number
  total_amount: string
  status: string
  created_at: string
  supplier?: {
    id: number
    name: string
  }
  warehouse?: {
    id: number
    name: string
  }
  items?: PurchaseOrderItem[]
}

interface PurchaseOrderItem {
  id: number
  product_id: number
  quantity: number
  unit_price: string
  subtotal: string
  received_quantity: number
  product?: {
    id: number
    name: string
    sku: string
  }
}

interface Supplier {
  id: number
  name: string
}

interface Warehouse {
  id: number
  name: string
}


interface OrderItem {
  product_id: number
  quantity: number | string
  unit_price: number | string
}

interface OrderForm {
  supplier_id: number | null
  purchaser: string
  warehouse_id: number | null
  items: OrderItem[]
}

const STATUS_COLORS = {
  '待收货': 'bg-yellow-100 text-yellow-800',
  '部分到货': 'bg-blue-100 text-blue-800',
  '已完成': 'bg-green-100 text-green-800',
  '已取消': 'bg-red-100 text-red-800'
}

interface PaginationInfo {
  total: number
  page: number
  size: number
  total_pages: number
  has_next: boolean
  has_prev: boolean
}

interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
  total_pages: number
  has_next: boolean
  has_prev: boolean
}

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({
    total: 0,
    page: 1,
    size: 5,
    total_pages: 1,
    has_next: false,
    has_prev: false
  })
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
  const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)
  const [formData, setFormData] = useState<OrderForm>({
    supplier_id: null,
    purchaser: '',
    warehouse_id: null,
    items: []
  })
  const [receiveItems, setReceiveItems] = useState<{ item_id: number, received_quantity: number | string }[]>([])
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [selectedSupplierName, setSelectedSupplierName] = useState<string>('')
  const { toast } = useToast()

  const fetchOrders = async (page: number = 1, size: number = 5) => {
    try {
      const response = await api.get(`/api/v1/purchase-orders/?page=${page}&size=${size}`)
      const data: PaginatedResponse<PurchaseOrder> = response.data
      setOrders(data.items)
      setPagination({
        total: data.total,
        page: data.page,
        size: data.size,
        total_pages: data.total_pages,
        has_next: data.has_next,
        has_prev: data.has_prev
      })
    } catch (error: any) {
      const apiError = handleApiError(error)
      toast({
        title: "错误",
        description: apiError.message,
        variant: "destructive",
      })
    }
  }

  // 可搜索的供应商获取函数
  const fetchSearchableSuppliers = async (search: string) => {
    try {
      const params = new URLSearchParams({
        size: '50'
      })
      
      if (search.trim()) {
        params.append('search', search.trim())
      }
      
      const response = await api.get(`/api/v1/suppliers/?${params.toString()}`)
      const data = response.data
      const items = data.items || data
      return Array.isArray(items) ? items : []
    } catch (error) {
      console.error('获取供应商失败:', error)
      return []
    }
  }

  const fetchWarehouses = async () => {
    try {
      const response = await api.get('/api/v1/warehouses/')
      setWarehouses(response.data)
    } catch (error: any) {
      const apiError = handleApiError(error)
      toast({
        title: "错误",
        description: apiError.message,
        variant: "destructive",
      })
    }
  }


  // 可搜索的商品获取函数（基于供货关系过滤）
  const fetchAvailableProductsSearch = async (search: string) => {
    // 如果没有选择供应商，返回空数组
    if (!formData.supplier_id) {
      return []
    }
    
    try {
      // 调用带搜索参数的供货关系API
      const params = new URLSearchParams({
        limit: '50'
      })
      
      if (search.trim()) {
        params.append('search', search.trim())
      }
      
      const response = await api.get(`/api/v1/supplier-products/suppliers/${formData.supplier_id}/products?${params.toString()}`)
      const supplierProducts = response.data
      
      // 直接返回商品信息
      return supplierProducts.map((sp: any) => sp.product)
    } catch (error) {
      console.error('搜索可供应商品失败:', error)
      return []
    }
  }



  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      await Promise.all([
        fetchOrders(),
        fetchWarehouses()
      ])
      setIsLoading(false)
    }
    loadData()
  }, [])

  const handleOpenCreateDialog = () => {
    // 清空所有验证错误
    setValidationErrors([])

    setFormData({
      supplier_id: null,
      purchaser: '',
      warehouse_id: null,
      items: []
    })
    setIsCreateDialogOpen(true)
  }

  const handleCloseCreateDialog = () => {
    setIsCreateDialogOpen(false)
    setValidationErrors([])
    setSelectedSupplierName('')
    setFormData({
      supplier_id: null,
      purchaser: '',
      warehouse_id: null,
      items: []
    })
  }

  // 处理供应商选择
  const handleSupplierChange = async (supplierId: string) => {
    if (!supplierId) {
      setFormData(prev => ({ 
        ...prev, 
        supplier_id: null,
        items: []
      }))
      setSelectedSupplierName('')
      return
    }
    
    const id = parseInt(supplierId)
    setFormData(prev => ({ 
      ...prev, 
      supplier_id: id,
      items: [] // 清空已选择的商品
    }))
    
    // 通过供应商列表API获取供应商名称
    try {
      const response = await api.get(`/api/v1/suppliers/?size=100`)
      const data = response.data
      const items = data.items || data
      const supplier = items.find((s: Supplier) => s.id === id)
      setSelectedSupplierName(supplier?.name || '')
    } catch (error) {
      setSelectedSupplierName('')
    }
  }

  // 下载采购模板
  const handleDownloadTemplate = async () => {
    if (!formData.supplier_id) {
      toast({
        title: "提示",
        description: "请先选择供应商",
        variant: "destructive",
      })
      return
    }

    try {
      const response = await api.get(`/api/v1/purchase-orders/template/${formData.supplier_id}/download`, {
        responseType: 'blob'
      })
      
      // 创建下载链接
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      // 从响应头获取文件名，如果没有则使用默认名称
      let filename = selectedSupplierName ? `采购模板_${selectedSupplierName}.xlsx` : '采购模板.xlsx'
      const contentDisposition = response.headers['content-disposition']
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/)
        if (filenameMatch) {
          try {
            filename = decodeURIComponent(filenameMatch[1])
          } catch (e) {
            // 解码失败时使用默认文件名
          }
        }
      }
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      toast({
        title: "成功",
        description: "采购模板下载成功",
      })
    } catch (error: any) {
      const apiError = handleApiError(error)
      toast({
        title: "下载失败",
        description: apiError.message,
        variant: "destructive",
      })
    }
  }

  // 导入采购明细
  const handleImportItems = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!formData.supplier_id) {
      toast({
        title: "提示",
        description: "请先选择供应商",
        variant: "destructive",
      })
      event.target.value = ''
      return
    }

    setIsImporting(true)
    
    try {
      const formDataUpload = new FormData()
      formDataUpload.append('file', file)
      
      const response = await api.post(
        `/api/v1/purchase-orders/template/import?supplier_id=${formData.supplier_id}`,
        formDataUpload,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      )
      
      const result = response.data
      
      if (result.imported_items && result.imported_items.length > 0) {
        // 将导入的商品添加到表单中
        const newItems = result.imported_items.map((item: any) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price || ''
        }))
        
        setFormData(prev => ({
          ...prev,
          items: [...prev.items, ...newItems]
        }))
        
        toast({
          title: "导入成功",
          description: result.summary,
        })
      } else {
        toast({
          title: "提示",
          description: "没有找到数量大于0的商品",
          variant: "destructive",
        })
      }
      
      if (result.errors && result.errors.length > 0) {
        console.warn('导入错误:', result.errors)
      }
    } catch (error: any) {
      const apiError = handleApiError(error)
      toast({
        title: "导入失败",
        description: apiError.message,
        variant: "destructive",
      })
    } finally {
      setIsImporting(false)
      event.target.value = ''
    }
  }

  const handleAddItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { product_id: 0, quantity: '', unit_price: '' }]
    }))
  }

  const handleRemoveItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }))
  }

  const handleItemChange = (index: number, field: keyof OrderItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }))
  }

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault()

    // 清除之前的验证错误
    setValidationErrors([])

    // 验证基本必填字段
    const basicFieldsErrors = validateRequiredFields(formData, [
      { field: 'supplier_id', label: '供应商' },
      { field: 'purchaser', label: '采购人员', validator: lengthValidator(1, 50) },
      { field: 'warehouse_id', label: '收货仓库' }
    ])

    // 验证采购明细
    const itemsErrors = validateArrayFields(formData.items, '采购明细', (item, index) => {
      const errors: ValidationError[] = []

      if (!item.product_id) {
        errors.push({ field: 'product_id', message: `请选择商品` })
      }

      if (!numberValidator(1)(Number(item.quantity))) {
        errors.push({ field: 'quantity', message: `数量必须大于0` })
      }

      if (!numberValidator(0.01)(Number(item.unit_price))) {
        errors.push({ field: 'unit_price', message: `单价必须大于0` })
      }

      return errors
    })

    const allErrors = [...basicFieldsErrors, ...itemsErrors]

    if (hasErrors(allErrors)) {
      setValidationErrors(allErrors)
      toast({
        title: "表单验证失败",
        description: formatErrorsForToast(allErrors),
        variant: "destructive",
      })
      return
    }

    try {
      await api.post('/api/v1/purchase-orders/', formData)
      toast({
        title: "成功",
        description: "采购订单创建成功",
      })
      
      handleCloseCreateDialog()
      fetchOrders(1) // 创建成功后回到第一页
    } catch (error: any) {
      const apiError = handleApiError(error)

      // 尝试将API错误映射到具体字段
      const fieldError = apiErrorToFieldError(apiError)
      if (fieldError) {
        setValidationErrors([fieldError])
      }

      toast({
        title: "错误",
        description: apiError.message,
        variant: "destructive",
      })
    }
  }

  const handleViewOrder = async (orderId: number) => {
    try {
      const response = await api.get(`/api/v1/purchase-orders/${orderId}`)
      setSelectedOrder(response.data)
      setIsDetailDialogOpen(true)
    } catch (error: any) {
      const apiError = handleApiError(error)
      toast({
        title: "错误",
        description: apiError.message,
        variant: "destructive",
      })
    }
  }

  const handleOpenReceiveDialog = (order: PurchaseOrder) => {
    setSelectedOrder(order)
    // 初始化到货数量
    const initialReceiveItems = order.items?.map(item => ({
      item_id: item.id,
      received_quantity: ''
    })) || []
    setReceiveItems(initialReceiveItems)
    setIsReceiveDialogOpen(true)
  }

  const handleReceiveSubmit = async () => {
    if (!selectedOrder) return

    // 过滤出有到货数量的项目
    const validItems = receiveItems.filter(item => Number(item.received_quantity) > 0)
    
    if (validItems.length === 0) {
      toast({
        title: "错误",
        description: "请输入到货数量",
        variant: "destructive",
      })
      return
    }

    try {
      await api.post(`/api/v1/purchase-orders/${selectedOrder.id}/receive`, {
        items: validItems.map(item => ({
          ...item,
          received_quantity: Number(item.received_quantity)
        }))
      })
      
      toast({
        title: "成功",
        description: "到货记录提交成功",
      })
      
      setIsReceiveDialogOpen(false)
        fetchOrders(pagination.page, pagination.size) // 保持当前页
    } catch (error: any) {
      const apiError = handleApiError(error)
      toast({
        title: "错误",
        description: apiError.message,
        variant: "destructive",
      })
    }
  }

  const handleDeleteOrder = async (orderId: number) => {
    if (window.confirm('确定要删除这个采购订单吗？')) {
      try {
        await api.delete(`/api/v1/purchase-orders/${orderId}`)
        toast({
          title: "成功",
          description: "采购订单删除成功",
        })
        // 如果当前页没有数据了，回到上一页
        const newTotal = pagination.total - 1
        const maxPage = Math.max(1, Math.ceil(newTotal / pagination.size))
        const targetPage = pagination.page > maxPage ? maxPage : pagination.page
        fetchOrders(targetPage, pagination.size)
      } catch (error: any) {
        const apiError = handleApiError(error)
        toast({
          title: "错误",
          description: apiError.message,
          variant: "destructive",
        })
      }
    }
  }

  // 分页处理函数
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.total_pages) {
      fetchOrders(newPage, pagination.size)
    }
  }

  const handlePrevPage = () => {
    if (pagination.has_prev) {
      handlePageChange(pagination.page - 1)
    }
  }

  const handleNextPage = () => {
    if (pagination.has_next) {
      handlePageChange(pagination.page + 1)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">加载中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">采购订单管理</h1>
          <p className="text-gray-600">管理采购订单和到货记录</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              创建采购订单
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>创建采购订单</DialogTitle>
              <DialogDescription>
                创建新的采购订单记录
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmitOrder} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <SearchableSelect
                    label="供应商"
                    placeholder="搜索供应商..."
                    value={formData.supplier_id}
                    onValueChange={(value) => {
                      if (value) {
                        handleSupplierChange(value.toString())
                      } else {
                        handleSupplierChange('')
                      }
                    }}
                    fetchOptions={fetchSearchableSuppliers}
                    renderOption={(option) => (
                      <span className="font-medium">{option.name}</span>
                    )}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="purchaser">采购人员 *</Label>
                  <Input
                    id="purchaser"
                    value={formData.purchaser}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, purchaser: e.target.value }))
                      setValidationErrors(prev => prev.filter(error => error.field !== 'purchaser'))
                    }}
                    placeholder="请输入采购人员姓名"
                    className={validationErrors.some(e => e.field === 'purchaser') ? 'border-red-500' : ''}
                    required
                  />
                  {validationErrors.filter(e => e.field === 'purchaser').map((error, index) => (
                    <p key={index} className="text-sm text-red-500 mt-1">{error.message}</p>
                  ))}
                </div>
              </div>
              
              <div>
                <Label htmlFor="warehouse_id">收货仓库 *</Label>
                <Select
                  value={formData.warehouse_id?.toString() || ''}
                  onValueChange={(value) => {
                    setFormData(prev => ({ ...prev, warehouse_id: parseInt(value) }))
                    setValidationErrors(prev => prev.filter(error => error.field !== 'warehouse_id'))
                  }}
                >
                  <SelectTrigger className={validationErrors.some(e => e.field === 'warehouse_id') ? 'border-red-500' : ''}>
                    <SelectValue placeholder="请选择收货仓库" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                        {warehouse.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {validationErrors.filter(e => e.field === 'warehouse_id').map((error, index) => (
                  <p key={index} className="text-sm text-red-500 mt-1">{error.message}</p>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>采购明细 *</Label>
                  <div className="flex items-center gap-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={handleDownloadTemplate}
                      disabled={!formData.supplier_id}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      下载采购模板
                    </Button>
                    <label className={!formData.supplier_id || isImporting ? 'pointer-events-none' : 'cursor-pointer'}>
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleImportItems}
                        className="hidden"
                        disabled={!formData.supplier_id || isImporting}
                      />
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        disabled={!formData.supplier_id || isImporting}
                        asChild
                      >
                        <span>
                          <Upload className="h-3 w-3 mr-1" />
                          {isImporting ? '导入中...' : '导入采购明细'}
                        </span>
                      </Button>
                    </label>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={handleAddItem}
                      disabled={!formData.supplier_id}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      添加商品
                    </Button>
                  </div>
                </div>
                
                {formData.items.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 border rounded-md">
                    {!formData.supplier_id 
                      ? '请先选择供应商，然后添加采购明细'
                      : '暂无采购明细，请点击"添加商品"'
                    }
                  </div>
                ) : (
                  <div className="space-y-2 max-h-70 overflow-y-auto">
                    {formData.items.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-end p-2 border rounded">
                        <div className="col-span-4">
                          <SearchableSelect
                            label="商品"
                            placeholder={
                              !formData.supplier_id 
                                ? "请先选择供应商"
                                : "搜索商品名称或SKU..."
                            }
                            value={item.product_id || null}
                            onValueChange={(value) => handleItemChange(index, 'product_id', value || 0)}
                            fetchOptions={fetchAvailableProductsSearch}
                            renderOption={(option) => (
                              <div className="flex flex-col">
                                <span className="font-medium">{option.name}</span>
                                <span className="text-sm text-gray-500">SKU: {option.sku}</span>
                              </div>
                            )}
                            disabled={!formData.supplier_id}
                            required
                          />
                        </div>
                        
                        <div className="col-span-2">
                          <Label className="text-xs">数量</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(index, 'quantity', e.target.value || '')}
                            placeholder="数量"
                          />
                        </div>
                        
                        <div className="col-span-3">
                          <Label className="text-xs">单价</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unit_price}
                            onChange={(e) => handleItemChange(index, 'unit_price', e.target.value || '')}
                            placeholder="单价"
                          />
                        </div>
                        
                        <div className="col-span-2">
                          <Label className="text-xs">小计</Label>
                          <div className="text-sm font-medium py-2">
                            ¥{(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}
                          </div>
                        </div>
                        
                        <div className="col-span-1">
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {formData.items.length > 0 && (
                  <div className="text-right pt-2 border-t">
                    <span className="text-lg font-semibold">
                      总计: ¥{formData.items.reduce((total, item) => total + (Number(item.quantity) * Number(item.unit_price)), 0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCloseCreateDialog}>
                  取消
                </Button>
                <Button type="submit">
                  创建订单
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            采购订单列表
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单号</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>采购人员</TableHead>
                  <TableHead>收货仓库</TableHead>
                  <TableHead>总金额</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.order_number}</TableCell>
                    <TableCell>{order.supplier?.name}</TableCell>
                    <TableCell>{order.purchaser}</TableCell>
                    <TableCell>{order.warehouse?.name}</TableCell>
                    <TableCell>¥{parseFloat(order.total_amount).toFixed(2)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_COLORS[order.status as keyof typeof STATUS_COLORS]
                      }`}>
                        {order.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {new Date(order.created_at).toLocaleDateString('zh-CN')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewOrder(order.id)}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        {(order.status === '待收货' || order.status === '部分到货') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenReceiveDialog(order)}
                          >
                            <Package className="h-3 w-3" />
                          </Button>
                        )}
                        {order.status === '待收货' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteOrder(order.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    暂无采购订单数据
                  </TableCell>
                </TableRow>
              )}
              </TableBody>
            </Table>

            {/* 分页组件 */}
            {pagination.total > 0 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-600">
                  显示第 {((pagination.page - 1) * pagination.size) + 1} - {Math.min(pagination.page * pagination.size, pagination.total)} 条，共 {pagination.total} 条记录
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevPage}
                    disabled={!pagination.has_prev}
                  >
                    上一页
                  </Button>
                  
                  {/* 页码按钮 */}
                  {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                    const startPage = Math.max(1, pagination.page - 2)
                    const pageNum = startPage + i
                    if (pageNum > pagination.total_pages) return null
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={pageNum === pagination.page ? "default" : "outline"}
                        size="sm"
                        className="w-10"
                        onClick={() => handlePageChange(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={!pagination.has_next}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
        </CardContent>
      </Card>

      {/* 订单详情对话框 */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>采购订单详情</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">订单号</Label>
                  <div>{selectedOrder.order_number}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium">状态</Label>
                  <div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      STATUS_COLORS[selectedOrder.status as keyof typeof STATUS_COLORS]
                    }`}>
                      {selectedOrder.status}
                    </span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">供应商</Label>
                  <div>{selectedOrder.supplier?.name}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium">采购人员</Label>
                  <div>{selectedOrder.purchaser}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium">收货仓库</Label>
                  <div>{selectedOrder.warehouse?.name}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium">总金额</Label>
                  <div>¥{parseFloat(selectedOrder.total_amount).toFixed(2)}</div>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium">采购明细</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>商品</TableHead>
                      <TableHead>数量</TableHead>
                      <TableHead>单价</TableHead>
                      <TableHead>已到货</TableHead>
                      <TableHead>小计</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.product?.name}<br/>
                          <span className="text-sm text-gray-500">({item.product?.sku})</span>
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>¥{parseFloat(item.unit_price).toFixed(2)}</TableCell>
                        <TableCell>{item.received_quantity}</TableCell>
                        <TableCell>¥{parseFloat(item.subtotal).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 到货记录对话框 */}
      <Dialog open={isReceiveDialogOpen} onOpenChange={setIsReceiveDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>记录到货</DialogTitle>
            <DialogDescription>
              记录订单 {selectedOrder?.order_number} 的到货情况
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品</TableHead>
                    <TableHead>采购数量</TableHead>
                    <TableHead>已到货</TableHead>
                    <TableHead>本次到货</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedOrder.items?.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.product?.name}<br/>
                        <span className="text-sm text-gray-500">({item.product?.sku})</span>
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.received_quantity}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={item.quantity - item.received_quantity}
                          value={receiveItems[index]?.received_quantity || ''}
                          onChange={(e) => {
                            const value = e.target.value
                            setReceiveItems(prev =>
                              prev.map((ri, i) =>
                                i === index ? { ...ri, received_quantity: value } : ri
                              )
                            )
                          }}
                          placeholder="到货数量"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsReceiveDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleReceiveSubmit}>
                  确认到货
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
