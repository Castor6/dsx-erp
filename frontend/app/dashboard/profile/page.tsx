"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'
import { User, Settings, Key } from 'lucide-react'

interface UpdateProfileRequest {
  full_name?: string
  email?: string
}

interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

export default function ProfilePage() {
  const { user, setUser } = useAuthStore()
  const { toast } = useToast()
  
  const [profileForm, setProfileForm] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
  })
  
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })
  
  const [isProfileLoading, setIsProfileLoading] = useState(false)
  const [isPasswordLoading, setIsPasswordLoading] = useState(false)
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)

  useEffect(() => {
    if (user) {
      setProfileForm({
        full_name: user.full_name || '',
        email: user.email || '',
      })
    }
  }, [user])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!profileForm.full_name.trim()) {
      toast({
        title: "错误",
        description: "姓名不能为空",
        variant: "destructive",
      })
      return
    }

    try {
      setIsProfileLoading(true)
      const updateData: UpdateProfileRequest = {}
      
      if (profileForm.full_name !== user?.full_name) {
        updateData.full_name = profileForm.full_name
      }
      
      if (profileForm.email !== user?.email) {
        updateData.email = profileForm.email || undefined
      }
      
      if (Object.keys(updateData).length > 0) {
        const response = await api.put('/api/v1/users/me/profile', updateData)
        setUser(response.data)
        
        toast({
          title: "成功",
          description: "个人资料更新成功",
        })
      }
    } catch (error: any) {
      console.error('更新个人资料失败:', error)
      toast({
        title: "错误",
        description: error.response?.data?.detail || "更新个人资料失败",
        variant: "destructive",
      })
    } finally {
      setIsProfileLoading(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!passwordForm.current_password || !passwordForm.new_password) {
      toast({
        title: "错误",
        description: "请填写所有密码字段",
        variant: "destructive",
      })
      return
    }

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast({
        title: "错误",
        description: "新密码和确认密码不一致",
        variant: "destructive",
      })
      return
    }

    if (passwordForm.new_password.length < 6) {
      toast({
        title: "错误",
        description: "新密码长度至少为6位",
        variant: "destructive",
      })
      return
    }

    try {
      setIsPasswordLoading(true)
      const changePasswordData: ChangePasswordRequest = {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      }
      
      await api.put('/api/v1/users/me/change-password', changePasswordData)
      
      setPasswordForm({
        current_password: '',
        new_password: '',
        confirm_password: '',
      })
      setIsPasswordDialogOpen(false)
      
      toast({
        title: "成功",
        description: "密码修改成功",
      })
    } catch (error: any) {
      console.error('修改密码失败:', error)
      toast({
        title: "错误",
        description: error.response?.data?.detail || "修改密码失败",
        variant: "destructive",
      })
    } finally {
      setIsPasswordLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">个人设置</h1>
        <p className="text-gray-600">管理您的账户信息和安全设置</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 基本信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="mr-2 h-5 w-5" />
              基本信息
            </CardTitle>
            <CardDescription>
              更新您的个人基本信息
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <Label htmlFor="username">用户名</Label>
                <Input
                  id="username"
                  value={user?.username || ''}
                  disabled
                  className="bg-gray-50"
                />
                <p className="text-sm text-gray-500 mt-1">用户名不可修改</p>
              </div>
              
              <div>
                <Label htmlFor="full_name">姓名 *</Label>
                <Input
                  id="full_name"
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, full_name: e.target.value }))}
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              
              <Button 
                type="submit" 
                disabled={isProfileLoading}
                className="w-full"
              >
                {isProfileLoading ? "更新中..." : "更新资料"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 安全设置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Settings className="mr-2 h-5 w-5" />
              安全设置
            </CardTitle>
            <CardDescription>
              管理您的账户安全设置
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-medium">密码</h3>
                <p className="text-sm text-gray-500">定期更新您的密码以保护账户安全</p>
              </div>
              <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Key className="mr-2 h-4 w-4" />
                    修改密码
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>修改密码</DialogTitle>
                    <DialogDescription>
                      请输入您的当前密码和新密码
                    </DialogDescription>
                  </DialogHeader>
                  
                  <form onSubmit={handleChangePassword}>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="current_password">当前密码</Label>
                        <Input
                          id="current_password"
                          type="password"
                          value={passwordForm.current_password}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, current_password: e.target.value }))}
                          required
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="new_password">新密码</Label>
                        <Input
                          id="new_password"
                          type="password"
                          value={passwordForm.new_password}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, new_password: e.target.value }))}
                          required
                          minLength={6}
                        />
                        <p className="text-sm text-gray-500 mt-1">密码长度至少6位</p>
                      </div>
                      
                      <div>
                        <Label htmlFor="confirm_password">确认新密码</Label>
                        <Input
                          id="confirm_password"
                          type="password"
                          value={passwordForm.confirm_password}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, confirm_password: e.target.value }))}
                          required
                        />
                      </div>
                    </div>
                    
                    <DialogFooter className="mt-6">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setIsPasswordDialogOpen(false)}
                      >
                        取消
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={isPasswordLoading}
                      >
                        {isPasswordLoading ? "修改中..." : "确认修改"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-medium">账户类型</h3>
                <p className="text-sm text-gray-500">
                  {user?.is_admin ? '管理员账户' : '普通用户'}
                </p>
              </div>
              <div className="px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                {user?.is_active ? '已激活' : '未激活'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
