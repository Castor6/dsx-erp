"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import {
  Search,
  Plus,
  Trash2,
  Package,
  Layers,
  Loader2
} from 'lucide-react'
import { api } from '@/lib/api'

interface Warehouse {
  id: number
  name: string
}

interface ProductSearchItem {
  id: number
  name: string
  sku: string
  type: 'product' | 'combo'
  finished_stock: number
  available_stock: number
}

interface BatchShippingItem {
  product_id?: number
  combo_product_id?: number
  product_name: string
  product_sku: string
  product_type: 'product' | 'combo'
  quantity: number | ''
  max_quantity: number
}

interface BatchShippingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouses: Warehouse[]
  onSuccess: () => void
}

export default function BatchShippingDialog({
  open,
  onOpenChange,
  warehouses,
  onSuccess
}: BatchShippingDialogProps) {
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProductSearchItem[]>([])
  const [selectedItems, setSelectedItems] = useState<BatchShippingItem[]>([])
  const [notes, setNotes] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { toast } = useToast()

  // 重置状态
  const resetState = () => {
    setSelectedWarehouse(null)
    setSearchQuery('')
    setSearchResults([])
    setSelectedItems([])
    setNotes('')
  }

  // 搜索商品
  const searchProducts = async () => {
    if (!selectedWarehouse || !searchQuery.trim()) {
      toast({
        title: "提示",
        description: "请先选择仓库并输入搜索关键字",
        variant: "destructive",
      })
      return
    }

    setIsSearching(true)
    try {
      const response = await api.get(`/api/v1/inventory/search-products`, {
        params: {
          warehouse_id: selectedWarehouse,
          search: searchQuery.trim(),
          limit: 20
        }
      })
      setSearchResults(response.data)
    } catch (error) {
      toast({
        title: "错误",
        description: "搜索商品失败",
        variant: "destructive",
      })
    } finally {
      setIsSearching(false)
    }
  }

  // 添加商品到出库列表
  const addItem = (product: ProductSearchItem) => {
    // 检查是否已添加
    const exists = selectedItems.some(item =>
      (item.product_id === product.id && product.type === 'product') ||
      (item.combo_product_id === product.id && product.type === 'combo')
    )

    if (exists) {
      toast({
        title: "提示",
        description: "该商品已在出库列表中",
        variant: "destructive",
      })
      return
    }

    const newItem: BatchShippingItem = {
      product_name: product.name,
      product_sku: product.sku,
      product_type: product.type,
      quantity: '',
      max_quantity: product.available_stock
    }

    if (product.type === 'product') {
      newItem.product_id = product.id
    } else {
      newItem.combo_product_id = product.id
    }

    setSelectedItems([...selectedItems, newItem])

    // 清空搜索结果
    setSearchResults([])
    setSearchQuery('')
  }

  // 移除商品
  const removeItem = (index: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index))
  }

  // 更新数量
  const updateQuantity = (index: number, quantity: number | '') => {
    const updatedItems = [...selectedItems]
    updatedItems[index].quantity = quantity
    setSelectedItems(updatedItems)
  }

  // 提交批量出库
  const handleSubmit = async () => {
    if (!selectedWarehouse) {
      toast({
        title: "错误",
        description: "请选择仓库",
        variant: "destructive",
      })
      return
    }

    if (selectedItems.length === 0) {
      toast({
        title: "错误",
        description: "请至少添加一个商品",
        variant: "destructive",
      })
      return
    }

    // 验证数量
    const invalidItems = selectedItems.filter(item =>
      item.quantity === '' ||
      (typeof item.quantity === 'number' && (item.quantity <= 0 || item.quantity > item.max_quantity))
    )

    if (invalidItems.length > 0) {
      toast({
        title: "错误",
        description: "存在无效的出库数量，请检查每个商品的数量输入",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const requestData = {
        warehouse_id: selectedWarehouse,
        items: selectedItems.map((item: BatchShippingItem) => ({
          product_id: item.product_id,
          combo_product_id: item.combo_product_id,
          quantity: Number(item.quantity)
        })),
        notes: notes || undefined
      }

      const response = await api.post('/api/v1/inventory/batch-ship', requestData)

      toast({
        title: "成功",
        description: response.data.message,
      })

      // 如果有失败项目，显示详细信息
      if (response.data.failed_items && response.data.failed_items.length > 0) {
        const failedDetails = response.data.failed_items
          .map((item: any) => `${item.product_name}: ${item.error}`)
          .join('\n')

        toast({
          title: "部分失败详情",
          description: failedDetails,
          variant: "destructive",
          duration: 8000
        })
      }

      onSuccess()
      onOpenChange(false)
      resetState()
    } catch (error: any) {
      toast({
        title: "错误",
        description: error.response?.data?.detail || "批量出库失败",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // 关闭对话框时重置状态
  useEffect(() => {
    if (!open) {
      resetState()
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>批量出库</DialogTitle>
          <DialogDescription>
            选择仓库后搜索商品（无成品库存商品不会显示），设置出库数量并统一添加备注
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* 仓库选择 */}
          <div className="space-y-2">
            <Label>选择仓库 *</Label>
            <Select
              value={selectedWarehouse?.toString() || ''}
              onValueChange={(value) => {
                setSelectedWarehouse(parseInt(value))
                setSearchResults([])
                setSelectedItems([])
              }}
            >
              <SelectTrigger>
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
          </div>

          {/* 商品搜索 */}
          <div className="space-y-2">
            <Label>搜索商品</Label>
            <div className="flex gap-2">
              <Input
                placeholder="输入商品名称或SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchProducts()}
                disabled={!selectedWarehouse}
              />
              <Button
                onClick={searchProducts}
                disabled={!selectedWarehouse || !searchQuery.trim() || isSearching}
              >
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                搜索
              </Button>
            </div>
          </div>

          {/* 搜索结果 */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <Label>搜索结果</Label>
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>商品信息</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead className="text-right">可用库存</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchResults.map((product) => (
                      <TableRow key={`${product.type}-${product.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{product.name}</div>
                            <div className="text-sm text-gray-500">{product.sku}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {product.type === 'product' ? (
                              <Package className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Layers className="h-4 w-4 text-purple-500" />
                            )}
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              product.type === 'product'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}>
                              {product.type === 'product' ? '基础商品' : '组合商品'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-medium">{product.available_stock}</span>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => addItem(product)}
                            disabled={product.available_stock === 0}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            添加
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* 出库商品列表 */}
          <div className="space-y-2">
            <Label>出库商品列表 ({selectedItems.length})</Label>
            {selectedItems.length > 0 ? (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>商品信息</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead className="text-right">最大数量</TableHead>
                      <TableHead className="text-right">出库数量</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedItems.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.product_name}</div>
                            <div className="text-sm text-gray-500">{item.product_sku}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {item.product_type === 'product' ? (
                              <Package className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Layers className="h-4 w-4 text-purple-500" />
                            )}
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              item.product_type === 'product'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}>
                              {item.product_type === 'product' ? '基础商品' : '组合商品'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-medium text-green-600">{item.max_quantity}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex justify-end">
                              <Input
                                type="number"
                                min="1"
                                max={item.max_quantity}
                                value={item.quantity}
                                onChange={(e) => {
                                  const value = e.target.value
                                  if (value === '') {
                                    updateQuantity(index, '')
                                  } else {
                                    const numValue = parseInt(value) || 0
                                    updateQuantity(index, numValue)
                                  }
                                }}
                                className={`w-20 text-right ${
                                  (typeof item.quantity === 'number' && item.quantity > item.max_quantity) ||
                                  (typeof item.quantity === 'number' && item.quantity <= 0)
                                    ? 'border-red-500' : ''
                                }`}
                              />
                            </div>
                            {/* 错误提示 */}
                            {typeof item.quantity === 'number' && item.quantity > item.max_quantity && (
                              <span className="text-xs text-red-500">
                                超过最大数量 {item.max_quantity}
                              </span>
                            )}
                            {typeof item.quantity === 'number' && item.quantity <= 0 && item.quantity !== '' && (
                              <span className="text-xs text-red-500">
                                数量必须大于0
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeItem(index)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="border rounded-lg p-8 text-center text-gray-500">
                暂无出库商品，请先搜索并添加商品
              </div>
            )}
          </div>

          {/* 备注 */}
          <div className="space-y-2">
            <Label>出库备注（可选）</Label>
            <Input
              placeholder="请输入出库备注..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              selectedItems.length === 0 ||
              isSubmitting ||
              selectedItems.some(item =>
                item.quantity === '' ||
                (typeof item.quantity === 'number' && (item.quantity <= 0 || item.quantity > item.max_quantity))
              )
            }
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                出库中...
              </>
            ) : (
              `确认出库 (${selectedItems.length} 种商品)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}