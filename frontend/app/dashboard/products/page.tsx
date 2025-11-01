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
import { Plus, Pencil, Trash2, Package, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { MultiPackagingSelector } from '@/components/ui/multi-packaging-selector'
import { PackagingRelation, ProductPackagingRelation } from '@/types'
import { handleApiError, validateRequiredFields, skuValidator, lengthValidator, ValidationError, hasErrors, formatErrorsForToast, apiErrorToFieldError } from '@/lib/form-validation'
import { API_BASE_URL } from '@/config/api-config'

interface Product {
  id: number
  name: string
  sku: string
  sale_type: string
  image_url?: string
  warehouse_id: number
  created_at: string
  warehouse?: {
    id: number
    name: string
  }
  packaging_relations?: ProductPackagingRelation[]
}

interface ProductListResponse {
  items: Product[]
  total: number
  skip: number
  limit: number
  has_more: boolean
}

interface Warehouse {
  id: number
  name: string
}

interface ProductForm {
  name: string
  sku: string
  sale_type: string
  image_url?: string
  warehouse_id: number | null
  packaging_relations: PackagingRelation[]
}

const SALE_TYPES = [
  { value: '商品', label: '商品' },
  { value: '包材', label: '包材' }
]

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [packagingProducts, setPackagingProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState<ProductForm>({
    name: '',
    sku: '',
    sale_type: '',
    image_url: '',
    warehouse_id: null,
    packaging_relations: []
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  
  // 分页和搜索状态
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(5)
  const [total, setTotal] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSaleType, setSelectedSaleType] = useState<string>('')
  
  const { toast } = useToast()

  const fetchProducts = async (page = 1, search = '', warehouseId = '', saleType = '') => {
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
      if (saleType) {
        params.append('sale_type', saleType)
      }
      
      const response = await api.get(`/api/v1/products/?${params.toString()}`)
      const data: ProductListResponse = response.data
      
      setProducts(data.items)
      setTotal(data.total)
      setCurrentPage(page)
    } catch (error: any) {
      const apiError = handleApiError(error)
      toast({
        title: "错误",
        description: apiError.message,
        variant: "destructive",
      })
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

  const fetchPackagingProducts = async () => {
    try {
      const response = await api.get('/api/v1/products/?sale_type=包材&limit=100')
      const data: ProductListResponse = response.data
      setPackagingProducts(data.items)
    } catch (error) {
      console.error('获取包材列表失败:', error)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      await Promise.all([
        fetchProducts(1, '', '', ''),
        fetchWarehouses(),
        fetchPackagingProducts()
      ])
      setIsLoading(false)
    }
    loadData()
  }, [])

  const handleOpenDialog = (product?: Product) => {
    // 清空所有验证错误
    setValidationErrors([])

    if (product) {
      setEditingProduct(product)
      setFormData({
        name: product.name,
        sku: product.sku,
        sale_type: product.sale_type,
        image_url: product.image_url || '',
        warehouse_id: product.warehouse_id,
        packaging_relations: product.packaging_relations?.map(pr => ({
          packaging_id: pr.packaging_id,
          quantity: pr.quantity
        })) || []
      })
    } else {
      setEditingProduct(null)
      setFormData({
        name: '',
        sku: '',
        sale_type: '',
        image_url: '',
        warehouse_id: null,
        packaging_relations: []
      })
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingProduct(null)
    setSelectedFile(null)
    setValidationErrors([])
    setFormData({
      name: '',
      sku: '',
      sale_type: '',
      image_url: '',
      warehouse_id: null,
      packaging_relations: []
    })
  }

  const uploadImage = async (file: File): Promise<string | null> => {
    const formData = new FormData()
    formData.append('file', file)

    try {
      setIsUploading(true)
      const response = await api.post('/api/v1/upload/image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data.file_path
    } catch (error: any) {
      toast({
        title: "错误",
        description: error.response?.data?.detail || "图片上传失败",
        variant: "destructive",
      })
      return null
    } finally {
      setIsUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 清除之前的验证错误
    setValidationErrors([])

    // 验证必填字段
    const requiredFieldsErrors = validateRequiredFields(formData, [
      { field: 'name', label: '商品名称', validator: lengthValidator(1, 100) },
      { field: 'sku', label: '商品SKU', validator: skuValidator },
      { field: 'sale_type', label: '销售方式' },
      { field: 'warehouse_id', label: '所属仓库' }
    ])

    if (hasErrors(requiredFieldsErrors)) {
      setValidationErrors(requiredFieldsErrors)
      toast({
        title: "表单验证失败",
        description: formatErrorsForToast(requiredFieldsErrors),
        variant: "destructive",
      })
      return
    }

    // 包材选择为可选项，不再进行强制验证

    try {
      let imageUrl = formData.image_url

      // 如果选择了新文件，先上传图片
      if (selectedFile) {
        const uploadedPath = await uploadImage(selectedFile)
        if (uploadedPath) {
          imageUrl = uploadedPath
        }
      }

      const submitData = {
        ...formData,
        image_url: imageUrl,
        // 只有商品类型才发送包材关系
        packaging_relations: formData.sale_type === '商品' ? formData.packaging_relations : []
      }

      if (editingProduct) {
        await api.put(`/api/v1/products/${editingProduct.id}`, submitData)
        toast({
          title: "成功",
          description: "商品更新成功",
        })
      } else {
        await api.post('/api/v1/products/', submitData)
        toast({
          title: "成功",
          description: "商品创建成功",
        })
      }
      
      handleCloseDialog()
      fetchProducts(currentPage, searchTerm, '', selectedSaleType)
      // 如果是包材，也需要重新获取包材列表
      if (formData.sale_type === '包材') {
        fetchPackagingProducts()
      }
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // 验证文件类型
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "错误",
          description: "请选择有效的图片文件（JPG, PNG, GIF, WebP）",
          variant: "destructive",
        })
        return
      }

      // 验证文件大小（5MB）
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "错误",
          description: "图片文件大小不能超过5MB",
          variant: "destructive",
        })
        return
      }

      setSelectedFile(file)
    }
  }

  const handleDelete = async (productId: number) => {
    if (window.confirm('确定要删除这个商品吗？')) {
      try {
        await api.delete(`/api/v1/products/${productId}`)
        toast({
          title: "成功",
          description: "商品删除成功",
        })
        fetchProducts(currentPage, searchTerm, '', selectedSaleType)
        fetchPackagingProducts()
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">加载中...</div>
      </div>
    )
  }

  // 分页处理函数
  const handlePageChange = (page: number) => {
    fetchProducts(page, searchTerm, '', selectedSaleType)
  }

  const handleSearch = () => {
    setCurrentPage(1)
    fetchProducts(1, searchTerm, '', selectedSaleType)
  }

  const clearSearch = () => {
    setSearchTerm('')
    setSelectedSaleType('')
    setCurrentPage(1)
    fetchProducts(1, '', '', '')
  }

  const handleSaleTypeChange = (value: string) => {
    setSelectedSaleType(value === 'all' ? '' : value)
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">商品管理</h1>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              添加商品
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] max-h-[90vh]" style={{overflowY: 'auto'}}>
            <DialogHeader>
              <DialogTitle>
                {editingProduct ? '编辑商品' : '添加商品'}
              </DialogTitle>
              <DialogDescription>
                {editingProduct ? '修改商品信息' : '创建新的商品记录'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">商品名称 *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, name: e.target.value }))
                    // 清除该字段的验证错误
                    setValidationErrors(prev => prev.filter(error => error.field !== 'name'))
                  }}
                  placeholder="请输入商品名称"
                  className={validationErrors.some(e => e.field === 'name') ? 'border-red-500' : ''}
                  required
                />
                {validationErrors.filter(e => e.field === 'name').map((error, index) => (
                  <p key={index} className="text-sm text-red-500 mt-1">{error.message}</p>
                ))}
              </div>
              
              <div>
                <Label htmlFor="sku">商品SKU *</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, sku: e.target.value }))
                    // 清除该字段的验证错误
                    setValidationErrors(prev => prev.filter(error => error.field !== 'sku'))
                  }}
                  placeholder="请输入商品SKU（字母、数字、连字符）"
                  className={validationErrors.some(e => e.field === 'sku') ? 'border-red-500' : ''}
                  required
                />
                {validationErrors.filter(e => e.field === 'sku').map((error, index) => (
                  <p key={index} className="text-sm text-red-500 mt-1">{error.message}</p>
                ))}
              </div>
              
              <div>
                <Label htmlFor="sale_type">销售方式 *</Label>
                <Select
                  value={formData.sale_type}
                  onValueChange={(value) => {
                    setFormData(prev => ({ ...prev, sale_type: value, packaging_id: null }))
                    // 清除该字段的验证错误
                    setValidationErrors(prev => prev.filter(error => error.field !== 'sale_type'))
                  }}
                >
                  <SelectTrigger className={validationErrors.some(e => e.field === 'sale_type') ? 'border-red-500' : ''}>
                    <SelectValue placeholder="请选择销售方式" />
                  </SelectTrigger>
                  <SelectContent>
                    {SALE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {validationErrors.filter(e => e.field === 'sale_type').map((error, index) => (
                  <p key={index} className="text-sm text-red-500 mt-1">{error.message}</p>
                ))}
              </div>
              
              <div>
                <Label htmlFor="warehouse_id">所属仓库 *</Label>
                <Select
                  value={formData.warehouse_id?.toString() || ''}
                  onValueChange={(value) => {
                    setFormData(prev => ({ ...prev, warehouse_id: parseInt(value) }))
                    // 清除该字段的验证错误
                    setValidationErrors(prev => prev.filter(error => error.field !== 'warehouse_id'))
                  }}
                >
                  <SelectTrigger className={validationErrors.some(e => e.field === 'warehouse_id') ? 'border-red-500' : ''}>
                    <SelectValue placeholder="请选择仓库" />
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
              
              {formData.sale_type === '商品' && (
                <div>
                  <MultiPackagingSelector
                    label="包材配置（可选）"
                    availablePackaging={packagingProducts}
                    selectedPackaging={formData.packaging_relations}
                    onChange={(packaging) => setFormData(prev => ({ ...prev, packaging_relations: packaging }))}
                  />
                </div>
              )}
              
              <div>
                <Label htmlFor="image_upload">商品图片</Label>
                <div className="space-y-2">
                  <Input
                    id="image_upload"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="file:mr-2 file:px-4 file:py-2 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {selectedFile && (
                    <p className="text-sm text-gray-600">
                      已选择: {selectedFile.name}
                    </p>
                  )}
                  {formData.image_url && !selectedFile && (
                    <div className="flex items-center gap-2">
                      <img 
                        src={`${API_BASE_URL}${formData.image_url}`} 
                        alt="预览" 
                        className="w-16 h-16 object-cover rounded"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                      <p className="text-sm text-gray-600">
                        当前图片
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    支持 JPG, PNG, GIF, WebP 格式，文件大小不超过 5MB
                  </p>
                </div>
              </div>
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  取消
                </Button>
                <Button type="submit" disabled={isUploading}>
                  {isUploading 
                    ? '上传中...' 
                    : editingProduct ? '更新' : '创建'
                  }
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              商品列表
            </CardTitle>
            
            {/* 搜索区域 */}
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="搜索商品名称或SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
              
              <Select value={selectedSaleType || 'all'} onValueChange={handleSaleTypeChange}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="选择销售类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {SALE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <div className="flex items-center space-x-2 shrink-0">
                <Button onClick={handleSearch} size="sm">
                  搜索
                </Button>
                <Button onClick={clearSearch} variant="outline" size="sm">
                  清空
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              暂无商品数据
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>图片</TableHead>
                  <TableHead>商品名称</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>销售方式</TableHead>
                  <TableHead>所属仓库</TableHead>
                  <TableHead>包材</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      {product.image_url ? (
                        <img 
                          src={`${API_BASE_URL}${product.image_url}`} 
                          alt={product.name}
                          className="w-12 h-12 object-cover rounded"
                          onError={(e) => {
                            e.currentTarget.src = '/placeholder-image.png'
                          }}
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                          <Package className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.sku}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        product.sale_type === '商品' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {product.sale_type}
                      </span>
                    </TableCell>
                    <TableCell>{product.warehouse?.name}</TableCell>
                    <TableCell>
                      {product.packaging_relations && product.packaging_relations.length > 0 ? (
                        <div className="space-y-1">
                          {product.packaging_relations.map((pr, index) => (
                            <div key={index} className="text-sm">
                              {pr.packaging_name && pr.packaging_sku ? (
                                `${pr.packaging_name} (${pr.packaging_sku}) ×${pr.quantity}`
                              ) : (
                                `包材ID: ${pr.packaging_id} ×${pr.quantity}`
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(product.created_at).toLocaleDateString('zh-CN')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDialog(product)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(product.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          
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
