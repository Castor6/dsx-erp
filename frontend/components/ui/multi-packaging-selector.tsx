"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X, Plus } from 'lucide-react'
import { PackagingRelation } from '@/types'

interface Product {
  id: number
  name: string
  sku: string
}

interface MultiPackagingSelectorProps {
  label?: string
  availablePackaging: Product[]
  selectedPackaging: PackagingRelation[]
  onChange: (packaging: PackagingRelation[]) => void
  disabled?: boolean
}

export const MultiPackagingSelector = ({
  label = "包材配置",
  availablePackaging,
  selectedPackaging,
  onChange,
  disabled = false
}: MultiPackagingSelectorProps) => {
  const [localPackaging, setLocalPackaging] = useState<PackagingRelation[]>(selectedPackaging)

  useEffect(() => {
    setLocalPackaging(selectedPackaging)
  }, [selectedPackaging])

  const handleAddPackaging = () => {
    const newPackaging: PackagingRelation = {
      packaging_id: 0,
      quantity: ''
    }
    const updated = [...localPackaging, newPackaging]
    setLocalPackaging(updated)
    onChange(updated)
  }

  const handleRemovePackaging = (index: number) => {
    const updated = localPackaging.filter((_, i) => i !== index)
    setLocalPackaging(updated)
    onChange(updated)
  }

  const handlePackagingChange = (index: number, field: keyof PackagingRelation, value: number | string) => {
    const updated = localPackaging.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    )
    setLocalPackaging(updated)
    onChange(updated)
  }

  // 获取已选择的包材ID列表，用于过滤
  const selectedPackagingIds = localPackaging.map(p => p.packaging_id)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddPackaging}
          disabled={disabled}
        >
          <Plus className="h-3 w-3 mr-1" />
          添加包材
        </Button>
      </div>

      {localPackaging.length === 0 ? (
        <div className="text-sm text-gray-500 p-3 border border-dashed rounded-md text-center">
          暂无包材配置，点击"添加包材"开始配置
        </div>
      ) : (
        <div className="space-y-2">
          {localPackaging.map((item, index) => (
            <div key={index} className="flex items-center gap-2 p-3 border rounded-md bg-gray-50">
              <div className="flex-1">
                <Label className="text-xs text-gray-600">包材</Label>
                <Select
                  value={item.packaging_id > 0 ? item.packaging_id.toString() : ''}
                  onValueChange={(value) => handlePackagingChange(index, 'packaging_id', parseInt(value))}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择包材" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePackaging
                      .filter(p => !selectedPackagingIds.includes(p.id) || p.id === item.packaging_id)
                      .map((packaging) => (
                        <SelectItem key={packaging.id} value={packaging.id.toString()}>
                          {packaging.name} ({packaging.sku})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="w-20">
                <Label className="text-xs text-gray-600">数量</Label>
                <Input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => handlePackagingChange(index, 'quantity', e.target.value || '')}
                  className="text-center"
                  disabled={disabled}
                />
              </div>
              
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleRemovePackaging(index)}
                disabled={disabled}
                className="mt-4"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {localPackaging.length > 0 && (
        <div className="text-xs text-gray-500">
          已配置 {localPackaging.length} 种包材
        </div>
      )}
    </div>
  )
}
