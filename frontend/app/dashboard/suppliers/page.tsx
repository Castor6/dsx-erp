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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Edit, Trash2, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { Supplier, SupplierListResponse } from '@/types'

const supplierSchema = z.object({
  name: z.string().min(1, '请输入供应商名称'),
  payment_method: z.enum(['款到发货', '货到付款'], {
    required_error: '请选择结算方式',
  }),
  notes: z.string().optional(),
})

type SupplierForm = z.infer<typeof supplierSchema>

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(5)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const form = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      payment_method: '款到发货',
      notes: '',
    },
  })

  const fetchSuppliers = async (page: number = 1, search: string = '') => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        size: pageSize.toString(),
      })
      
      if (search.trim()) {
        params.append('search', search.trim())
      }
      
      const response = await api.get<SupplierListResponse>(`/api/v1/suppliers/?${params.toString()}`)
      const { items, total: totalCount, pages } = response.data
      
      setSuppliers(items)
      setTotal(totalCount)
      setTotalPages(pages)
      setCurrentPage(page)
    } catch (error) {
      console.error('获取供应商列表失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSuppliers(1, searchTerm)
  }, [])

  const handleSearch = () => {
    setCurrentPage(1)
    fetchSuppliers(1, searchTerm)
  }

  const handlePageChange = (page: number) => {
    fetchSuppliers(page, searchTerm)
  }

  const handleSubmitSupplier = async (data: SupplierForm) => {
    try {
      if (editingSupplier) {
        // 编辑供应商
        await api.put(`/api/v1/suppliers/${editingSupplier.id}`, data)
      } else {
        // 创建供应商
        await api.post('/api/v1/suppliers/', data)
      }
      
      setIsDialogOpen(false)
      form.reset()
      setEditingSupplier(null)
      fetchSuppliers(currentPage, searchTerm)
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || (editingSupplier ? '更新供应商失败' : '创建供应商失败')
      form.setError('root', {
        message: typeof errorMessage === 'string' ? errorMessage : (editingSupplier ? '更新供应商失败' : '创建供应商失败'),
      })
    }
  }

  const handleDeleteSupplier = async (supplierId: number) => {
    if (confirm('确定要删除这个供应商吗？')) {
      try {
        await api.delete(`/api/v1/suppliers/${supplierId}`)
        fetchSuppliers(currentPage, searchTerm)
      } catch (error) {
        console.error('删除供应商失败:', error)
      }
    }
  }

  const openCreateDialog = () => {
    setEditingSupplier(null)
    form.reset({
      name: '',
      payment_method: '款到发货',
      notes: '',
    })
    setIsDialogOpen(true)
  }

  const openEditDialog = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    form.reset({
      name: supplier.name,
      payment_method: supplier.payment_method,
      notes: supplier.notes || '',
    })
    setIsDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">供应商管理</h1>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              添加供应商
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingSupplier ? '编辑供应商' : '创建新供应商'}
              </DialogTitle>
              <DialogDescription>
                {editingSupplier ? '修改供应商信息' : '填写供应商信息'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmitSupplier)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>供应商名称</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入供应商名称" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="payment_method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>结算方式</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="请选择结算方式" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="款到发货">款到发货</SelectItem>
                          <SelectItem value="货到付款">货到付款</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>备注信息</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入备注信息（可选）" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.formState.errors.root && (
                  <div className="text-sm text-red-500">
                    {form.formState.errors.root.message}
                  </div>
                )}
                <DialogFooter>
                  <Button type="submit">
                    {editingSupplier ? '更新供应商' : '创建供应商'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>供应商列表</CardTitle>
              {/* <CardDescription>
                管理所有供应商信息
              </CardDescription> */}
            </div>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="搜索供应商名称..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10 w-64"
                />
              </div>
              <Button onClick={handleSearch} size="sm">
                搜索
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4">加载中...</div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>供应商名称</TableHead>
                    <TableHead>结算方式</TableHead>
                    <TableHead>备注</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                        {searchTerm ? '没有找到匹配的供应商' : '暂无供应商数据'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    suppliers.map((supplier) => (
                      <TableRow key={supplier.id}>
                        <TableCell className="font-medium">{supplier.name}</TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-1 rounded-full text-xs ${
                              supplier.payment_method === '款到发货'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {supplier.payment_method}
                          </span>
                        </TableCell>
                        <TableCell>{supplier.notes || '-'}</TableCell>
                        <TableCell>
                          {new Date(supplier.created_at).toLocaleDateString('zh-CN')}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(supplier)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteSupplier(supplier.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* 分页组件 */}
              {total > 0 && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    显示第 {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, total)} 条，共 {total} 条记录
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
                        let pageNumber
                        if (totalPages <= 5) {
                          pageNumber = i + 1
                        } else if (currentPage <= 3) {
                          pageNumber = i + 1
                        } else if (currentPage >= totalPages - 2) {
                          pageNumber = totalPages - 4 + i
                        } else {
                          pageNumber = currentPage - 2 + i
                        }
                        
                        return (
                          <Button
                            key={pageNumber}
                            variant={currentPage === pageNumber ? "default" : "outline"}
                            size="sm"
                            onClick={() => handlePageChange(pageNumber)}
                            className="w-8 h-8 p-0"
                          >
                            {pageNumber}
                          </Button>
                        )
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
