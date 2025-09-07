"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function TestApiPage() {
  const [result, setResult] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  const testHealthCheck = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('http://localhost:8000/health')
      const data = await response.json()
      setResult(`Health Check成功: ${JSON.stringify(data)}`)
    } catch (error) {
      setResult(`Health Check失败: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  const testLogin = async () => {
    setIsLoading(true)
    try {
      const formData = new URLSearchParams()
      formData.append('username', 'admin')
      formData.append('password', 'admin123')

      const response = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        setResult(`登录成功: ${JSON.stringify(data)}`)
      } else {
        const errorData = await response.text()
        setResult(`登录失败: ${response.status} - ${errorData}`)
      }
    } catch (error) {
      setResult(`登录请求失败: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>API测试页面</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-4">
            <Button onClick={testHealthCheck} disabled={isLoading}>
              测试Health Check
            </Button>
            <Button onClick={testLogin} disabled={isLoading}>
              测试登录API
            </Button>
          </div>
          
          {result && (
            <div className="p-4 bg-gray-100 rounded-md">
              <pre className="text-sm whitespace-pre-wrap">{result}</pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
