"use client"

import { useState } from 'react'
import { API_BASE_URL } from '@/config/api-config'

export default function SimpleLoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [result, setResult] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async () => {
    setIsLoading(true)
    setResult('')
    
    try {
      const formData = new URLSearchParams()
      formData.append('username', username)
      formData.append('password', password)

      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        setResult(`登录成功: ${JSON.stringify(data, null, 2)}`)
      } else {
        const errorText = await response.text()
        setResult(`登录失败 (${response.status}): ${errorText}`)
      }
    } catch (error) {
      setResult(`请求失败: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-center mb-6">简单登录测试</h1>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="admin"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="admin123"
            />
          </div>
          
          <button
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:opacity-50"
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
        </div>

        {result && (
          <div className="mt-4 p-3 bg-gray-100 rounded-md">
            <pre className="text-xs whitespace-pre-wrap">{result}</pre>
          </div>
        )}
        
        <div className="mt-4 text-center text-sm text-gray-500">
          <p>测试账户: admin / admin123</p>
          <p>API地址: {API_BASE_URL}</p>
        </div>
      </div>
    </div>
  )
}
