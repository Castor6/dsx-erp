"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { login } = useAuthStore()

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  })

  const handleLogin = async (data: LoginForm) => {
    setIsLoading(true)
    try {
      // 使用URLSearchParams格式发送登录请求（FastAPI OAuth2PasswordRequestForm要求）
      const formData = new URLSearchParams()
      formData.append('username', data.username)
      formData.append('password', data.password)

      const response = await api.post('/api/v1/auth/login', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      const { access_token, refresh_token } = response.data
      
      // 先设置token到localStorage，让拦截器能自动处理后续请求
      localStorage.setItem('access_token', access_token)
      localStorage.setItem('refresh_token', refresh_token)
      
      // 获取用户信息（此时拦截器会自动添加Authorization header）
      const userResponse = await api.get('/api/v1/users/me')

      // 保存登录状态
      login(access_token, refresh_token, userResponse.data)
      
      // 跳转到仪表板
      router.push('/dashboard')
    } catch (error: any) {
      // 如果获取用户信息失败，清除已设置的token
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      form.setError('root', {
        message: error.response?.data?.detail || '登录失败，请检查用户名和密码',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">登录</CardTitle>
          <CardDescription className="text-center">
            DSX ERP 系统
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4">
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
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="请输入密码" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.formState.errors.root && (
                <div className="text-sm text-red-500 text-center">
                  {form.formState.errors.root.message}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? '登录中...' : '登录'}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="text-center text-sm text-gray-500">
          默认管理员账户：admin / admin123
        </CardFooter>
      </Card>
    </div>
  )
}
