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
import { Checkbox } from '@/components/ui/checkbox'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { User } from '@/types'

const userSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  email: z.string().min(1, '请输入邮箱').email('请输入有效的邮箱地址'),
  full_name: z.string().min(1, '请输入姓名'),
  password: z.string().min(6, '密码至少6位'),
  is_admin: z.boolean().default(false),
})

const editUserSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  email: z.string().min(1, '请输入邮箱').email('请输入有效的邮箱地址'),
  full_name: z.string().min(1, '请输入姓名'),
  password: z.string().optional(),
  is_admin: z.boolean().optional().default(false),
})

type UserForm = z.infer<typeof userSchema>
type EditUserForm = z.infer<typeof editUserSchema>

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  const form = useForm<UserForm | EditUserForm>({
    resolver: zodResolver(editingUser ? editUserSchema : userSchema) as any,
    defaultValues: {
      username: '',
      email: '',
      full_name: '',
      password: '',
      is_admin: false,
    },
  })

  const fetchUsers = async () => {
    try {
      const response = await api.get('/api/v1/users/')
      setUsers(response.data || [])
    } catch (error) {
      console.error('获取用户列表失败:', error)
      setUsers([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleSubmitUser = async (data: UserForm | EditUserForm) => {
    try {
      if (editingUser) {
        // 编辑用户
        const updateData = { ...data }
        if (!updateData.password) {
          delete updateData.password // 如果密码为空，不更新密码
        }
        await api.put(`/api/v1/users/${editingUser.id}`, updateData)
      } else {
        // 创建用户
        await api.post('/api/v1/users/', data)
      }
      
      setIsDialogOpen(false)
      form.reset()
      setEditingUser(null)
      fetchUsers()
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || (editingUser ? '更新用户失败' : '创建用户失败')
      form.setError('root', {
        message: typeof errorMessage === 'string' ? errorMessage : (editingUser ? '更新用户失败' : '创建用户失败'),
      })
    }
  }

  const handleDeleteUser = async (userId: number) => {
    if (confirm('确定要删除这个用户吗？')) {
      try {
        await api.delete(`/api/v1/users/${userId}`)
        fetchUsers()
      } catch (error) {
        console.error('删除用户失败:', error)
      }
    }
  }

  const openCreateDialog = () => {
    setEditingUser(null)
    form.reset({
      username: '',
      email: '',
      full_name: '',
      password: '',
      is_admin: false,
    })
    setIsDialogOpen(true)
  }

  const openEditDialog = (user: User) => {
    setEditingUser(user)
    form.reset({
      username: user.username,
      email: user.email || '',
      full_name: user.full_name || '',
      password: '', // 编辑时密码为空，表示不修改
      is_admin: user.is_admin,
    })
    setIsDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
          <p className="text-gray-600">管理系统用户和权限</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              添加用户
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingUser ? '编辑用户' : '创建新用户'}
              </DialogTitle>
              <DialogDescription>
                {editingUser ? '修改用户信息' : '填写用户信息以创建新的系统用户'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmitUser)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>用户名</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入用户名" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>邮箱</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入邮箱" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>姓名</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入姓名" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        密码 {editingUser && <span className="text-sm text-gray-500">(留空表示不修改)</span>}
                      </FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder={editingUser ? "留空表示不修改密码" : "请输入密码"} 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="is_admin"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          管理员权限
                        </FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
                {form.formState.errors.root && (
                  <div className="text-sm text-red-500">
                    {String(form.formState.errors.root.message)}
                  </div>
                )}
                <DialogFooter>
                  <Button type="submit">
                    {editingUser ? '更新用户' : '创建用户'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
          <CardDescription>
            系统中的所有用户
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4">加载中...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-4">暂无用户数据</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户名</TableHead>
                  <TableHead>邮箱</TableHead>
                  <TableHead>姓名</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.username || '-'}
                    </TableCell>
                    <TableCell>{user.email || '-'}</TableCell>
                    <TableCell>{user.full_name || '-'}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          user.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {user.is_active ? '活跃' : '禁用'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          user.is_admin
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {user.is_admin ? '管理员' : '普通用户'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {user.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(user)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteUser(user.id)}
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