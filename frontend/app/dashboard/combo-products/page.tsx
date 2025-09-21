"use client"

import { useState, useEffect, useCallback } from 'react'
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
import { MultiPackagingSelector } from '@/components/ui/multi-packaging-selector'
import { PackagingRelation, ComboItemPackagingRelation, ProductPackagingRelation, ComboProductPackagingRelation } from '@/types'
import { handleApiError, validateRequiredFields, validateArrayFields, skuValidator, lengthValidator, numberValidator, ValidationError, hasErrors, formatErrorsForToast, apiErrorToFieldError } from '@/lib/form-validation'

interface WarehouseInfo {
  warehouse_id: number
  warehouse_name: string
  finished: number
  shipped: number
}

interface ComboProduct {
  id: number
  name: string
  sku: string
  warehouses: WarehouseInfo[]
  created_at: string
  updated_at?: string
  combo_items: ComboProductItem[]
  packaging_relations?: ComboProductPackagingRelation[]
}

interface ComboProductItem {
  id: number
  combo_product_id: number
  base_product_id: number
  quantity: number
  created_at: string
  base_product_name?: string
  base_product_sku?: string
  packaging_relations?: ComboItemPackagingRelation[]
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
  warehouse_ids: number[]
  combo_items: ComboProductItemForm[]
  packaging_relations: PackagingRelation[]
}

interface ComboProductItemForm {
  base_product_id: number | null
  quantity: number
  packaging_relations: PackagingRelation[]
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
    warehouse_ids: [],
    combo_items: [{ base_product_id: null, quantity: 1, packaging_relations: [] }],
    packaging_relations: []
  })
  
  // 分页和搜索状态
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(5)
  const [total, setTotal] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])

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

  // 可搜索的基础商品获取函数
  const fetchSearchableBaseProducts = useCallback(async (search: string) => {
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
      const apiItems = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : [])
      
      // 合并API结果和当前状态中的基础商品，确保已选中的商品能被找到
      const allProducts = [...baseProducts]
      
      // 添加API返回的商品，避免重复
      apiItems.forEach(apiProduct => {
        if (!allProducts.some(existing => existing.id === apiProduct.id)) {
          allProducts.push(apiProduct)
        }
      })
      
      // 如果有搜索词，过滤结果
      if (search.trim()) {
        const searchLower = search.toLowerCase()
        return allProducts.filter(product => 
          product.name.toLowerCase().includes(searchLower) || 
          product.sku.toLowerCase().includes(searchLower)
        )
      }
      
      return allProducts
    } catch (error) {
      console.error('获取基础商品失败:', error)
      // 即使API失败，也返回当前状态中的基础商品
      return baseProducts
    }
  }, [baseProducts])

  const fetchPackagingProducts = async () => {
    try {
      const response = await api.get('/api/v1/products/?sale_type=包材&limit=100')
      // 处理新的分页响应格式
      const data = response.data
      const items = data.items || data
      setPackagingProducts(Array.isArray(items) ? items : [])
    } catch (error: any) {
      const apiError = handleApiError(error)
      toast({
        title: "错误",
        description: apiError.message,
        variant: "destructive",
      })
    }
  }

  // 获取商品的默认包材配置
  const fetchProductDefaultPackaging = async (productId: number): Promise<PackagingRelation[]> => {
    try {
      const response = await api.get(`/api/v1/products/${productId}/packaging-relations`)
      const data: ProductPackagingRelation[] = response.data
      return data.map(pr => ({
        packaging_id: pr.packaging_id,
        quantity: pr.quantity
      }))
    } catch (error) {
      console.error('获取商品默认包材配置失败:', error)
      return []
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
    // 清空所有验证错误
    setValidationErrors([])

    if (product) {
      setEditingProduct(product)

      // 预先添加已选择的基础商品到可搜索列表中
      const selectedBaseProducts: Product[] = product.combo_items
        .filter(item => item.base_product_name && item.base_product_sku)
        .map(item => ({
          id: item.base_product_id,
          name: item.base_product_name!,
          sku: item.base_product_sku!,
          sale_type: '商品'
        }))

      // 先同步更新基础商品列表
      setBaseProducts(prev => {
        const newProducts = selectedBaseProducts.filter(
          newProduct => !prev.some(existing => existing.id === newProduct.id)
        )
        const updatedProducts = [...prev, ...newProducts]

        // 立即设置表单数据，此时使用更新后的商品列表
        setTimeout(() => {
          setFormData({
            name: product.name,
            sku: product.sku,
            warehouse_ids: product.warehouses.map(w => w.warehouse_id),
            combo_items: product.combo_items.map(item => ({
              base_product_id: item.base_product_id,
              quantity: item.quantity,
              packaging_relations: item.packaging_relations?.map(pr => ({
                packaging_id: pr.packaging_id,
                quantity: pr.quantity
              })) || []
            })),
            packaging_relations: product.packaging_relations?.map(pr => ({
              packaging_id: pr.packaging_id,
              quantity: pr.quantity
            })) || []
          })
        }, 0)

        return updatedProducts
      })
    } else {
      setEditingProduct(null)
      setFormData({
        name: '',
        sku: '',
        warehouse_ids: [],
        combo_items: [{ base_product_id: null, quantity: 1, packaging_relations: [] }],
        packaging_relations: []
      })
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingProduct(null)
    setValidationErrors([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 清除之前的验证错误
    setValidationErrors([])

    // 验证基本必填字段
    const basicFieldsErrors = validateRequiredFields(formData, [
      { field: 'name', label: '组合商品名称', validator: lengthValidator(1, 100) },
      { field: 'sku', label: '组合商品SKU', validator: skuValidator }
    ])

    // 验证仓库选择
    if (!formData.warehouse_ids || formData.warehouse_ids.length === 0) {
      basicFieldsErrors.push({
        field: 'warehouse_ids',
        message: '请选择至少一个仓库'
      })
    }

    // 验证包材配置
    if (!formData.packaging_relations || formData.packaging_relations.length === 0) {
      basicFieldsErrors.push({
        field: 'packaging_relations',
        message: '请配置组合商品的包材'
      })
    } else {
      formData.packaging_relations.forEach((packaging, index) => {
        if (!packaging.packaging_id || packaging.quantity <= 0) {
          basicFieldsErrors.push({
            field: `packaging_relations[${index}]`,
            message: `包材配置 ${index + 1} 不完整，请检查包材选择和数量`
          })
        }
      })
    }

    // 验证组合明细
    const comboItemsErrors = validateArrayFields(formData.combo_items, '基础商品', (item, index) => {
      const errors: ValidationError[] = []

      if (!item.base_product_id) {
        errors.push({ field: 'base_product_id', message: `请选择基础商品` })
      }

      if (!numberValidator(1)(item.quantity)) {
        errors.push({ field: 'quantity', message: `数量必须大于0` })
      }

      return errors
    })

    const allErrors = [...basicFieldsErrors, ...comboItemsErrors]

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
      // 构建提交数据
      const submitData = {
        name: formData.name,
        sku: formData.sku,
        warehouse_ids: formData.warehouse_ids,
        combo_items: formData.combo_items.map(item => ({
          base_product_id: item.base_product_id,
          quantity: item.quantity,
          packaging_relations: item.packaging_relations || []
        })),
        packaging_relations: formData.packaging_relations || []
      }

      console.log('提交数据:', JSON.stringify(submitData, null, 2)) // 调试用

      if (editingProduct) {
        await api.put(`/api/v1/combo-products/${editingProduct.id}`, submitData)
        toast({
          title: "成功",
          description: "组合商品更新成功",
        })
      } else {
        await api.post('/api/v1/combo-products/', submitData)
        toast({
          title: "成功",
          description: "组合商品创建成功",
        })
      }
      
      await fetchComboProducts(currentPage, searchTerm, '')
      handleCloseDialog()
    } catch (error: any) {
      console.error('组合商品提交错误:', error)
      console.error('错误详情:', error.response?.data)

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
      const apiError = handleApiError(error)
      toast({
        title: "错误",
        description: apiError.message,
        variant: "destructive",
      })
    }
  }

  const handleAddComboItem = () => {
    setFormData(prev => ({
      ...prev,
      combo_items: [...prev.combo_items, { base_product_id: null, quantity: 1, packaging_relations: [] }]
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

  const handleComboItemChange = async (index: number, field: keyof ComboProductItemForm, value: any) => {
    if (field === 'base_product_id' && value) {
      // 当选择基础商品时，自动获取并预填充其默认包材配置
      const defaultPackaging = await fetchProductDefaultPackaging(value)
      setFormData(prev => ({
        ...prev,
        combo_items: prev.combo_items.map((item, i) => 
          i === index ? { 
            ...item, 
            [field]: value, 
            packaging_relations: defaultPackaging 
          } : item
        )
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        combo_items: prev.combo_items.map((item, i) => 
          i === index ? { ...item, [field]: value } : item
        )
      }))
    }
  }

  // 处理基础商品包材配置变化
  const handleComboItemPackagingChange = (index: number, packaging: PackagingRelation[]) => {
    setFormData(prev => ({
      ...prev,
      combo_items: prev.combo_items.map((item, i) => 
        i === index ? { ...item, packaging_relations: packaging } : item
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
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, name: e.target.value }))
                        setValidationErrors(prev => prev.filter(error => error.field !== 'name'))
                      }}
                      placeholder="输入组合商品名称"
                      className={validationErrors.some(e => e.field === 'name') ? 'border-red-500' : ''}
                    />
                    {validationErrors.filter(e => e.field === 'name').map((error, index) => (
                      <p key={index} className="text-sm text-red-500 mt-1">{error.message}</p>
                    ))}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="sku" className="text-sm font-medium">
                      商品SKU*
                    </Label>
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, sku: e.target.value }))
                        setValidationErrors(prev => prev.filter(error => error.field !== 'sku'))
                      }}
                      placeholder="输入组合商品SKU（字母、数字、连字符）"
                      className={validationErrors.some(e => e.field === 'sku') ? 'border-red-500' : ''}
                    />
                    {validationErrors.filter(e => e.field === 'sku').map((error, index) => (
                      <p key={index} className="text-sm text-red-500 mt-1">{error.message}</p>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="warehouse_ids" className="text-sm font-medium">
                      所属仓库*
                    </Label>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {warehouses.map(warehouse => {
                          const isSelected = formData.warehouse_ids.includes(warehouse.id)
                          const hasInventory = editingProduct?.warehouses.find(w => w.warehouse_id === warehouse.id)
                          const cannotUnselect = editingProduct && hasInventory &&
                            (hasInventory.finished > 0 || hasInventory.shipped > 0)

                          return (
                            <button
                              key={warehouse.id}
                              type="button"
                              disabled={cannotUnselect && isSelected}
                              onClick={() => {
                                if (isSelected) {
                                  setFormData(prev => ({
                                    ...prev,
                                    warehouse_ids: prev.warehouse_ids.filter(id => id !== warehouse.id)
                                  }))
                                } else {
                                  setFormData(prev => ({
                                    ...prev,
                                    warehouse_ids: [...prev.warehouse_ids, warehouse.id]
                                  }))
                                }
                                setValidationErrors(prev => prev.filter(error => error.field !== 'warehouse_ids'))
                              }}
                              title={cannotUnselect && isSelected ?
                                `${warehouse.name} (成品: ${hasInventory?.finished}, 出库: ${hasInventory?.shipped}) - 有库存，无法移除` :
                                warehouse.name
                              }
                              className={`
                                inline-flex items-center gap-1 px-3 py-2 rounded-md border text-sm font-medium transition-all
                                ${isSelected
                                  ? cannotUnselect
                                    ? 'bg-orange-100 border-orange-300 text-orange-800 cursor-not-allowed'
                                    : 'bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200'
                                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'
                                }
                                ${cannotUnselect && isSelected ? 'opacity-75' : ''}
                              `}
                            >
                              {warehouse.name}
                              {isSelected && (
                                cannotUnselect ? (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                )
                              )}
                            </button>
                          )
                        })}
                      </div>
                      {formData.warehouse_ids.length > 0 && (
                        <div className="text-sm text-gray-600">
                          已选择 {formData.warehouse_ids.length} 个仓库
                        </div>
                      )}
                    </div>
                    {validationErrors.filter(e => e.field === 'warehouse_ids').map((error, index) => (
                      <p key={index} className="text-sm text-red-500 mt-1">{error.message}</p>
                    ))}
                  </div>

                  <div className="space-y-2 col-span-4">
                    <MultiPackagingSelector
                      label="组合商品包材配置*"
                      availablePackaging={packagingProducts}
                      selectedPackaging={formData.packaging_relations}
                      onChange={(packaging) => setFormData(prev => ({ ...prev, packaging_relations: packaging }))}
                    />
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
                      <div key={index} className="space-y-3 p-4 border rounded-md bg-gray-50">
                        <div className="flex items-center gap-3">
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
                        
                        {/* 基础商品包材配置 */}
                        {item.base_product_id && (
                          <div className="mt-3 p-3 border border-dashed rounded bg-white">
                            <MultiPackagingSelector
                              label={`基础商品包材配置（可自定义）`}
                              availablePackaging={packagingProducts}
                              selectedPackaging={item.packaging_relations}
                              onChange={(packaging) => handleComboItemPackagingChange(index, packaging)}
                            />
                            <div className="text-xs text-gray-500 mt-2">
                              💡 已自动预填充该商品的默认包材配置，您可以根据需要进行修改
                            </div>
                          </div>
                        )}
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
                  <TableCell>
                    <div className="space-y-1">
                      {product.warehouses.map((warehouse) => (
                        <div key={warehouse.warehouse_id} className="text-sm">
                          <span className="font-medium">{warehouse.warehouse_name}</span>
                          <div className="text-xs text-gray-500">
                            成品: {warehouse.finished} | 出库: {warehouse.shipped}
                          </div>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {product.packaging_relations && product.packaging_relations.length > 0 ? (
                      <div className="space-y-1">
                        {product.packaging_relations.map((pr, index) => (
                          <div key={index} className="text-sm">
                            {pr.packaging_name} ×{pr.quantity}
                            <div className="text-xs text-muted-foreground">
                              {pr.packaging_sku}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">-</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      {product.combo_items.map((item) => (
                        <div key={item.id} className="p-2 border rounded bg-gray-50">
                          <div className="text-sm font-medium text-gray-800">
                            {item.base_product_name} × {item.quantity}
                          </div>
                          {item.packaging_relations && item.packaging_relations.length > 0 && (
                            <div className="text-xs text-gray-500 mt-1">
                              包材: {item.packaging_relations.map(pr => 
                                `${pr.packaging_name} ×${pr.quantity}`
                              ).join(', ')}
                            </div>
                          )}
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
