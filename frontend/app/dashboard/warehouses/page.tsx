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
import { Input } from '@/components/ui/input'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Edit, Trash2, Package } from 'lucide-react'
import { api } from '@/lib/api'
import { Warehouse } from '@/types'

const warehouseSchema = z.object({
  name: z.string().min(1, '请输入仓库名称'),
  manager: z.string().optional(),
  notes: z.string().optional(),
})

type WarehouseForm = z.infer<typeof warehouseSchema>

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null)

  const form = useForm<WarehouseForm>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      name: '',
      manager: '',
      notes: '',
    },
  })

  const fetchWarehouses = async () => {
    try {
      const response = await api.get('/api/v1/warehouses/')
      setWarehouses(response.data)
    } catch (error) {
      console.error('获取仓库列表失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchWarehouses()
  }, [])

  const handleSubmitWarehouse = async (data: WarehouseForm) => {
    try {
      if (editingWarehouse) {
        // 编辑仓库
        await api.put(`/api/v1/warehouses/${editingWarehouse.id}`, data)
      } else {
        // 创建仓库
        await api.post('/api/v1/warehouses/', data)
      }
      
      setIsDialogOpen(false)
      form.reset()
      setEditingWarehouse(null)
      fetchWarehouses()
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || (editingWarehouse ? '更新仓库失败' : '创建仓库失败')
      form.setError('root', {
        message: typeof errorMessage === 'string' ? errorMessage : (editingWarehouse ? '更新仓库失败' : '创建仓库失败'),
      })
    }
  }

  const openCreateDialog = () => {
    setEditingWarehouse(null)
    form.reset({
      name: '',
      manager: '',
      notes: '',
    })
    setIsDialogOpen(true)
  }

  const openEditDialog = (warehouse: Warehouse) => {
    setEditingWarehouse(warehouse)
    form.reset({
      name: warehouse.name,
      manager: warehouse.manager || '',
      notes: warehouse.notes || '',
    })
    setIsDialogOpen(true)
  }

  const handleDeleteWarehouse = async (warehouseId: number) => {
    if (confirm('确定要删除这个仓库吗？')) {
      try {
        await api.delete(`/api/v1/warehouses/${warehouseId}`)
        fetchWarehouses()
      } catch (error) {
        console.error('删除仓库失败:', error)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">仓库管理</h1>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              添加仓库
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingWarehouse ? '编辑仓库' : '创建新仓库'}
              </DialogTitle>
              <DialogDescription>
                {editingWarehouse ? '修改仓库信息' : '填写仓库基本信息'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmitWarehouse)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>仓库名称</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入仓库名称" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="manager"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>负责人</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入负责人姓名（可选）" {...field} />
                      </FormControl>
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
                    {editingWarehouse ? '更新仓库' : '创建仓库'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>仓库列表</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4">加载中...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>仓库名称</TableHead>
                  <TableHead>负责人</TableHead>
                  <TableHead>备注</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouses.map((warehouse) => (
                  <TableRow key={warehouse.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center">
                        <Package className="mr-2 h-4 w-4 text-gray-500" />
                        {warehouse.name}
                      </div>
                    </TableCell>
                    <TableCell>{warehouse.manager || '-'}</TableCell>
                    <TableCell>{warehouse.notes || '-'}</TableCell>
                    <TableCell>
                      {new Date(warehouse.created_at).toLocaleDateString('zh-CN')}
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(warehouse)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteWarehouse(warehouse.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
