'use client'

import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { SupplierProductWithDetails, SupplierProductListResponse, Supplier, Product, ExcelImportResponse, ImportError, SupplierListResponse } from '@/types'
import { Upload, Download, Trash2, FileSpreadsheet, AlertCircle, CheckCircle, XCircle, Search, ChevronLeft, ChevronRight } from 'lucide-react'

export default function SupplierProductsPage() {
  const [supplierProducts, setSupplierProducts] = useState<SupplierProductWithDetails[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ExcelImportResponse | null>(null)
  const [showImportResult, setShowImportResult] = useState(false)
  
  // 搜索和分页状态
  const [supplierNameSearch, setSupplierNameSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  
  const { toast } = useToast()

  // 获取供货关系数据
  const fetchSupplierProducts = async (page: number = 1, supplierName: string = '', productSearch: string = '') => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        size: pageSize.toString(),
      })
      
      if (supplierName.trim()) {
        params.append('supplier_name', supplierName.trim())
      }
      if (productSearch.trim()) {
        params.append('product_search', productSearch.trim())
      }
      
      const response = await api.get<SupplierProductListResponse>(`/api/v1/supplier-products/?${params.toString()}`)
      const { items, total: totalCount, pages } = response.data
      
      setSupplierProducts(items)
      setTotal(totalCount)
      setTotalPages(pages)
      setCurrentPage(page)
    } catch (error) {
      toast({
        title: '错误',
        description: '获取供货关系数据失败',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSupplierProducts(1, supplierNameSearch, productSearch)
  }, [])

  const handleSearch = () => {
    setCurrentPage(1)
    fetchSupplierProducts(1, supplierNameSearch, productSearch)
  }

  const handlePageChange = (page: number) => {
    fetchSupplierProducts(page, supplierNameSearch, productSearch)
  }

  const clearSearch = () => {
    setSupplierNameSearch('')
    setProductSearch('')
    setCurrentPage(1)
    fetchSupplierProducts(1, '', '')
  }



  // 删除供货关系
  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个供货关系吗？')) return

    try {
      await api.delete(`/api/v1/supplier-products/${id}`)
      toast({
        title: '成功',
        description: '供货关系删除成功'
      })
      fetchSupplierProducts(currentPage, supplierNameSearch, productSearch)
    } catch (error: any) {
      toast({
        title: '错误',
        description: error.response?.data?.detail || '删除失败',
        variant: 'destructive'
      })
    }
  }

  // Excel导入
  const handleImport = async () => {
    if (!selectedFile) {
      toast({
        title: '错误',
        description: '请选择Excel文件',
        variant: 'destructive'
      })
      return
    }

    try {
      setImporting(true)
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await api.post('/api/v1/supplier-products/import/excel', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      const result: ExcelImportResponse = response.data
      
      // 保存导入结果
      setImportResult(result)
      setShowImportResult(true)
      
      // 根据结果显示不同的提示
      if (result.success_count > 0 && result.error_count === 0) {
        toast({
          title: '导入成功',
          description: result.summary
        })
      } else if (result.success_count > 0 && result.error_count > 0) {
        toast({
          title: '部分导入成功',
          description: result.summary,
          variant: 'default'
        })
      } else {
        toast({
          title: '导入失败',
          description: result.summary,
          variant: 'destructive'
        })
      }

      setImportDialogOpen(false)
      setSelectedFile(null)
      if (result.success_count > 0) {
        fetchSupplierProducts(currentPage, supplierNameSearch, productSearch)
      }
    } catch (error: any) {
      toast({
        title: '错误',
        description: error.response?.data?.detail || '导入失败',
        variant: 'destructive'
      })
    } finally {
      setImporting(false)
    }
  }

  // 下载Excel模板
  const downloadTemplate = () => {
    try {
      // 创建模板数据
      const templateData = [
        ['供应商名称', '商品SKU'],
        ['示例供应商', 'EXAMPLE001'],
        ['', '']  // 空行方便用户填写
      ]
      
      // 创建工作表
      const ws = XLSX.utils.aoa_to_sheet(templateData)
      
      // 设置列宽
      ws['!cols'] = [
        { wch: 20 }, // 供应商名称列宽度
        { wch: 20 }  // 商品SKU列宽度
      ]
      
      // 创建工作簿
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '供货关系')
      
      // 下载文件
      XLSX.writeFile(wb, '供货关系导入模板.xlsx')
      
      toast({
        title: '成功',
        description: '模板下载成功'
      })
    } catch (error) {
      console.error('下载模板失败:', error)
      toast({
        title: '错误',
        description: '模板下载失败，请重试',
        variant: 'destructive'
      })
    }
  }

  // 获取供应商名称
  const getSupplierName = (supplierId: number) => {
    const supplier = suppliers.find(s => s.id === supplierId)
    return supplier?.name || `供应商ID: ${supplierId}`
  }

  // 获取商品信息
  const getProductInfo = (productId: number) => {
    const product = products.find(p => p.id === productId)
    return product ? `${product.name} (${product.sku})` : `商品ID: ${productId}`
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">供货关系管理</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">加载中...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">供货关系管理</h1>
        <div className="flex gap-2">
          <Button onClick={downloadTemplate} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            下载模板
          </Button>
          
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                Excel导入
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Excel导入供货关系</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="file">选择Excel文件</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="text-sm text-gray-600">
                  <p>Excel文件应包含以下列：</p>
                  <ul className="list-disc list-inside mt-1">
                    <li>供应商名称</li>
                    <li>商品SKU</li>
                  </ul>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setImportDialogOpen(false)}
                  >
                    取消
                  </Button>
                  <Button onClick={handleImport} disabled={importing}>
                    {importing ? '导入中...' : '导入'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 导入结果对话框 */}
      <Dialog open={showImportResult} onOpenChange={setShowImportResult}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {importResult?.success_count === importResult?.total_rows ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : importResult?.error_count === importResult?.total_rows ? (
                <XCircle className="w-5 h-5 text-red-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-orange-500" />
              )}
              导入结果
            </DialogTitle>
          </DialogHeader>
          
          {importResult && (
            <div className="space-y-4">
              {/* 导入摘要 */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-lg font-medium mb-2">{importResult.summary}</div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{importResult.total_rows}</div>
                    <div className="text-gray-600">总行数</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{importResult.success_count}</div>
                    <div className="text-gray-600">成功</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{importResult.error_count}</div>
                    <div className="text-gray-600">失败</div>
                  </div>
                </div>
              </div>

              {/* 错误详情 */}
              {importResult.errors.length > 0 && (
                <div>
                  <h4 className="text-lg font-medium mb-3 text-red-600">
                    错误详情 ({importResult.errors.length} 条)
                  </h4>
                  <div className="max-h-80 overflow-y-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">行号</TableHead>
                          <TableHead>供应商名称</TableHead>
                          <TableHead>商品SKU</TableHead>
                          <TableHead>错误类型</TableHead>
                          <TableHead>错误原因</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importResult.errors.map((error, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-mono">{error.row}</TableCell>
                            <TableCell>{error.supplier_name || '-'}</TableCell>
                            <TableCell>{error.product_sku || '-'}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                error.error_type === '供应商不存在' ? 'bg-red-100 text-red-800' :
                                error.error_type === '商品不存在' ? 'bg-orange-100 text-orange-800' :
                                error.error_type === '重复关系' ? 'bg-yellow-100 text-yellow-800' :
                                error.error_type === '数据缺失' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {error.error_type}
                              </span>
                            </TableCell>
                            <TableCell>{error.error_message}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* 成功信息 */}
              {importResult.success_count > 0 && (
                <div>
                  <h4 className="text-lg font-medium mb-2 text-green-600">
                    成功导入 {importResult.success_count} 条供货关系
                  </h4>
                  <div className="text-sm text-gray-600">
                    这些供货关系已成功添加到系统中，您可以在供货关系列表中查看。
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowImportResult(false)}
                >
                  关闭
                </Button>
                {importResult.errors.length > 0 && (
                  <Button
                    onClick={() => {
                      // 下载错误报告
                      const errorData = importResult.errors.map(error => [
                        error.row,
                        error.supplier_name,
                        error.product_sku,
                        error.error_type,
                        error.error_message
                      ])
                      const ws = XLSX.utils.aoa_to_sheet([
                        ['行号', '供应商名称', '商品SKU', '错误类型', '错误原因'],
                        ...errorData
                      ])
                      const wb = XLSX.utils.book_new()
                      XLSX.utils.book_append_sheet(wb, ws, '导入错误')
                      XLSX.writeFile(wb, `供货关系导入错误报告_${new Date().toISOString().slice(0, 10)}.xlsx`)
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    下载错误报告
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <CardTitle>供货关系列表</CardTitle>
            
            {/* 搜索区域 */}
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="搜索供应商名称..."
                  value={supplierNameSearch}
                  onChange={(e) => setSupplierNameSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="搜索商品名称或SKU..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
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
          {loading ? (
            <div className="text-center py-8">
              <div className="text-gray-500">加载中...</div>
            </div>
          ) : supplierProducts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileSpreadsheet className="mx-auto h-12 w-12 mb-4" />
              <p>{supplierNameSearch || productSearch ? '没有找到匹配的供货关系' : '暂无供货关系'}</p>
              <p className="text-sm">{supplierNameSearch || productSearch ? '请尝试其他搜索条件' : '点击"Excel导入"开始添加供货关系'}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>供应商</TableHead>
                    <TableHead>商品</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierProducts.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.supplier?.name || getSupplierName(item.supplier_id)}
                      </TableCell>
                      <TableCell>
                        {item.product 
                          ? `${item.product.name} (${item.product.sku})`
                          : getProductInfo(item.product_id)
                        }
                      </TableCell>
                      <TableCell>
                        {new Date(item.created_at).toLocaleDateString('zh-CN')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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
