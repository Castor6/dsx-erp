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
import { Plus, Pencil, Trash2, Package, Minus, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import SearchableSelect from '@/components/ui/searchable-select'

interface ComboProduct {
  id: number
  name: string
  sku: string
  warehouse_id: number
  warehouse_name?: string
  packaging_id: number
  packaging_name?: string
  packaging_sku?: string
  created_at: string
  updated_at?: string
  combo_items: ComboProductItem[]
}

interface ComboProductItem {
  id: number
  combo_product_id: number
  base_product_id: number
  quantity: number
  created_at: string
  base_product_name?: string
  base_product_sku?: string
}

interface Product {
  id: number
  name: string
  sku: string
  sale_type: string
}

interface Warehouse {
  id: number
  name: string
}

interface ComboProductForm {
  name: string
  sku: string
  warehouse_id: number | null
  packaging_id: number | null
  combo_items: ComboProductItemForm[]
}

interface ComboProductItemForm {
  base_product_id: number | null
  quantity: number
}

interface ComboProductListResponse {
  items: ComboProduct[]
  total: number
  skip: number
  limit: number
  has_more: boolean
}

export default function ComboProductsPage() {
  const [comboProducts, setComboProducts] = useState<ComboProduct[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [baseProducts, setBaseProducts] = useState<Product[]>([])
  const [packagingProducts, setPackagingProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ComboProduct | null>(null)
  const [formData, setFormData] = useState<ComboProductForm>({
    name: '',
    sku: '',
    warehouse_id: null,
    packaging_id: null,
    combo_items: [{ base_product_id: null, quantity: 1 }]
  })
  
  // 分页和搜索状态
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(5)
  const [total, setTotal] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  
  const { toast } = useToast()

  const fetchComboProducts = async (page = 1, search = '', warehouseId = '') => {
    try {
      const skip = (page - 1) * pageSize
      const params = new URLSearchParams({
        skip: skip.toString(),
        limit: pageSize.toString(),
      })
      
      if (search.trim()) {
        params.append('search', search.trim())
      }
      if (warehouseId) {
        params.append('warehouse_id', warehouseId)
      }
      
      const response = await api.get(`/api/v1/combo-products/?${params.toString()}`)
      const data: ComboProductListResponse = response.data
      
      setComboProducts(data.items)
      setTotal(data.total)
      setCurrentPage(page)
    } catch (error) {
      toast({
        title: "错误",
        description: "获取组合商品列表失败",
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

  // 可搜索的基础商品获取函数
  const fetchSearchableBaseProducts = async (search: string) => {
    try {
      const params = new URLSearchParams({
        sale_type: '商品',
        limit: '50'
      })
      
      if (search.trim()) {
        params.append('search', search.trim())
      }
      
      const response = await api.get(`/api/v1/products/?${params.toString()}`)
      const data = response.data
      const items = data.items || data
      return Array.isArray(items) ? items : []
    } catch (error) {
      console.error('获取基础商品失败:', error)
      return []
    }
  }

  const fetchPackagingProducts = async () => {
    try {
      const response = await api.get('/api/v1/products/?sale_type=包材&limit=100')
      // 处理新的分页响应格式
      const data = response.data
      const items = data.items || data
      setPackagingProducts(Array.isArray(items) ? items : [])
    } catch (error) {
      toast({
        title: "错误",
        description: "获取包材列表失败",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      await Promise.all([
        fetchComboProducts(1, '', ''),
        fetchWarehouses(),
        fetchPackagingProducts()
      ])
      setIsLoading(false)
    }
    loadData()
  }, [])

  const handleOpenDialog = (product?: ComboProduct) => {
    if (product) {
      setEditingProduct(product)
      setFormData({
        name: product.name,
        sku: product.sku,
        warehouse_id: product.warehouse_id,
        packaging_id: product.packaging_id,
        combo_items: product.combo_items.map(item => ({
          base_product_id: item.base_product_id,
          quantity: item.quantity
        }))
      })
    } else {
      setEditingProduct(null)
      setFormData({
        name: '',
        sku: '',
        warehouse_id: null,
        packaging_id: null,
        combo_items: [{ base_product_id: null, quantity: 1 }]
      })
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingProduct(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name || !formData.sku || !formData.warehouse_id || !formData.packaging_id) {
      toast({
        title: "错误",
        description: "请填写所有必填字段",
        variant: "destructive",
      })
      return
    }

    // 验证组合明细
    if (formData.combo_items.length === 0) {
      toast({
        title: "错误",
        description: "至少需要一个基础商品",
        variant: "destructive",
      })
      return
    }

    for (const item of formData.combo_items) {
      if (!item.base_product_id || item.quantity <= 0) {
        toast({
          title: "错误",
          description: "请为所有组合明细选择商品并输入有效数量",
          variant: "destructive",
        })
        return
      }
    }

    try {
      if (editingProduct) {
        await api.put(`/api/v1/combo-products/${editingProduct.id}`, formData)
        toast({
          title: "成功",
          description: "组合商品更新成功",
        })
      } else {
        await api.post('/api/v1/combo-products/', formData)
        toast({
          title: "成功",
          description: "组合商品创建成功",
        })
      }
      
      await fetchComboProducts(currentPage, searchTerm, '')
      handleCloseDialog()
    } catch (error: any) {
      toast({
        title: "错误",
        description: error.response?.data?.detail || "操作失败",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async (productId: number) => {
    if (!confirm('确定要删除这个组合商品吗？')) return

    try {
      await api.delete(`/api/v1/combo-products/${productId}`)
      toast({
        title: "成功",
        description: "组合商品删除成功",
      })
      await fetchComboProducts(currentPage, searchTerm, '')
    } catch (error: any) {
      toast({
        title: "错误",
        description: error.response?.data?.detail || "删除失败",
        variant: "destructive",
      })
    }
  }

  const handleAddComboItem = () => {
    setFormData(prev => ({
      ...prev,
      combo_items: [...prev.combo_items, { base_product_id: null, quantity: 1 }]
    }))
  }

  const handleRemoveComboItem = (index: number) => {
    if (formData.combo_items.length <= 1) {
      toast({
        title: "提示",
        description: "至少需要保留一个基础商品",
        variant: "destructive",
      })
      return
    }
    
    setFormData(prev => ({
      ...prev,
      combo_items: prev.combo_items.filter((_, i) => i !== index)
    }))
  }

  const handleComboItemChange = (index: number, field: keyof ComboProductItemForm, value: any) => {
    setFormData(prev => ({
      ...prev,
      combo_items: prev.combo_items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }))
  }

  if (isLoading) {
    return <div className="p-6">加载中...</div>
  }

  // 分页处理函数
  const handlePageChange = (page: number) => {
    fetchComboProducts(page, searchTerm, '')
  }

  const handleSearch = () => {
    setCurrentPage(1)
    fetchComboProducts(1, searchTerm, '')
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">组合商品管理</h1>
          <p className="text-muted-foreground">
            管理多件装商品，设置基础商品组合关系
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              新建组合商品
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh]" style={{overflowY: 'auto'}}>
            <DialogHeader>
              <DialogTitle>
                {editingProduct ? '编辑组合商品' : '新建组合商品'}
              </DialogTitle>
              <DialogDescription>
                设置组合商品的基本信息和包含的基础商品
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-6 py-4">
                {/* 基本信息区域 */}
                <div className="grid grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">
                      商品名称*
                    </Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="输入组合商品名称"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="sku" className="text-sm font-medium">
                      商品SKU*
                    </Label>
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                      placeholder="输入组合商品SKU"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="warehouse_id" className="text-sm font-medium">
                      所属仓库*
                    </Label>
                    <Select 
                      value={formData.warehouse_id?.toString() || ''} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, warehouse_id: parseInt(value) }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择仓库" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                            {warehouse.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="packaging_id" className="text-sm font-medium">
                      包材选择*
                    </Label>
                    <Select 
                      value={formData.packaging_id?.toString() || ''} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, packaging_id: parseInt(value) }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择包材" />
                      </SelectTrigger>
                      <SelectContent>
                        {packagingProducts.map((packaging) => (
                          <SelectItem key={packaging.id} value={packaging.id.toString()}>
                            {packaging.name} ({packaging.sku})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 组合明细部分 */}
                <div className="col-span-4">
                  <div className="flex justify-between items-center mb-3">
                    <Label className="text-sm font-medium">组合明细*</Label>
                    <Button 
                      type="button" 
                      onClick={handleAddComboItem}
                      size="sm" 
                      variant="outline"
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      添加商品
                    </Button>
                  </div>
                  
                  <div className="space-y-3 max-h-[70vh] border rounded p-3">
                    {formData.combo_items.map((item, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 border rounded-md bg-gray-50">
                        <div className="flex-1">
                          <SearchableSelect
                            label="基础商品"
                            placeholder="搜索基础商品名称或SKU..."
                            value={item.base_product_id}
                            onValueChange={(value) => handleComboItemChange(index, 'base_product_id', value)}
                            fetchOptions={fetchSearchableBaseProducts}
                            renderOption={(option) => (
                              <div className="flex flex-col">
                                <span className="font-medium">{option.name}</span>
                                <span className="text-sm text-gray-500">SKU: {option.sku}</span>
                              </div>
                            )}
                            required
                          />
                        </div>
                        
                        <div className="w-24">
                          <Label className="text-xs text-gray-600">数量</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleComboItemChange(index, 'quantity', parseInt(e.target.value) || 1)}
                            className="text-center"
                          />
                        </div>
                        
                        <Button
                          type="button"
                          onClick={() => handleRemoveComboItem(index)}
                          size="sm"
                          variant="outline"
                          className="mt-4"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  取消
                </Button>
                <Button type="submit">
                  {editingProduct ? '更新' : '创建'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <CardTitle>组合商品列表</CardTitle>
            
            {/* 搜索区域 */}
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="搜索组合商品名称或SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
              
              <div className="flex items-center space-x-2 shrink-0">
                <Button onClick={handleSearch} size="sm">
                  搜索
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>商品名称</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>所属仓库</TableHead>
                <TableHead>包材</TableHead>
                <TableHead>包含商品</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comboProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">
                    {product.name}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                  <TableCell>{product.warehouse_name}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {product.packaging_name}
                      <div className="text-xs text-muted-foreground">
                        {product.packaging_sku}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {product.combo_items.map((item) => (
                        <div key={item.id} className="text-sm text-gray-600">
                          {item.base_product_name} × {item.quantity}
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(product.created_at).toLocaleDateString('zh-CN')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDialog(product)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(product.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {comboProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    暂无组合商品数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          
          {/* 分页组件 */}
          {total > 0 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-600">
                显示第 {(currentPage - 1) * pageSize + 1} 到 {Math.min(currentPage * pageSize, total)} 项，共 {total} 项
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一页
                </Button>
                
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePageChange(pageNum)}
                        className="w-10"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  下一页
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
