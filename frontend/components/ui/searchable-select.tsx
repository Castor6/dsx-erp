"use client"

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Search, ChevronDown, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Option {
  id: number
  name: string
  sku?: string
  [key: string]: any
}

interface SearchableSelectProps {
  label?: string
  placeholder?: string
  value?: number | null
  onValueChange: (value: number | null) => void
  fetchOptions: (search: string) => Promise<Option[]>
  renderOption?: (option: Option) => React.ReactNode
  className?: string
  disabled?: boolean
  required?: boolean
  inline?: boolean
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  placeholder = "输入关键词搜索...",
  value,
  onValueChange,
  fetchOptions,
  renderOption,
  className,
  disabled = false,
  required = false,
  inline = true
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [options, setOptions] = useState<Option[]>([])
  const [initialOptions, setInitialOptions] = useState<Option[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(false)
  const [selectedOption, setSelectedOption] = useState<Option | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 加载初始选项数据 (用于判断记录总数)
  const loadInitialOptions = async () => {
    if (disabled) return

    setInitialLoading(true)
    try {
      const result = await fetchOptions('')
      setInitialOptions(result)
    } catch (error) {
      console.error('获取初始选项失败:', error)
      setInitialOptions([])
    } finally {
      setInitialLoading(false)
    }
  }

  // 获取搜索选项数据
  const loadOptions = async (search: string) => {
    if (disabled) return

    // 如果没有搜索词，不加载搜索结果
    if (!search.trim()) {
      setOptions([])
      return
    }

    setLoading(true)
    try {
      const result = await fetchOptions(search.trim())
      setOptions(result)
    } catch (error) {
      console.error('获取选项失败:', error)
      setOptions([])
    } finally {
      setLoading(false)
    }
  }

  // 打开下拉框时加载初始选项
  useEffect(() => {
    if (isOpen && initialOptions.length === 0 && !initialLoading) {
      loadInitialOptions()
    }
  }, [isOpen])

  // 防抖搜索 - 仅在有搜索词时执行
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isOpen) {
        loadOptions(searchTerm)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchTerm, isOpen])

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
        setOptions([]) // 只清空搜索结果，保留初始选项
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 根据value查找对应的选项
  useEffect(() => {
    if (value) {
      // 优先从搜索结果中查找，再从初始选项中查找
      let option = options.find(opt => opt.id === value)
      if (!option && initialOptions.length > 0) {
        option = initialOptions.find(opt => opt.id === value)
      }
      if (option) {
        setSelectedOption(option)
      }
    } else {
      setSelectedOption(null)
    }
  }, [value, options, initialOptions])

  const handleSelect = (option: Option) => {
    setSelectedOption(option)
    onValueChange(option.id)
    setIsOpen(false)
    setSearchTerm('')
    setOptions([]) // 清空搜索结果
  }

  const handleClear = () => {
    setSelectedOption(null)
    onValueChange(null)
    setSearchTerm('')
    setOptions([]) // 清空搜索结果
  }

  const handleToggle = () => {
    if (disabled) return
    setIsOpen(!isOpen)
    if (!isOpen) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }

  const defaultRenderOption = (option: Option) => (
    <div className="flex flex-col">
      <span className="font-medium">{option.name}</span>
      {option.sku && (
        <span className="text-sm text-gray-500">SKU: {option.sku}</span>
      )}
    </div>
  )

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      {label && (
        <Label className="text-sm font-medium mb-1 block">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
      )}

      <div className="relative">
        <Button
          type="button"
          variant="outline"
          onClick={handleToggle}
          disabled={disabled}
          className={cn(
            "w-full justify-between text-left font-normal",
            !selectedOption && "text-muted-foreground"
          )}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.name : placeholder}
          </span>
          <div className="flex items-center gap-1">
            {selectedOption && !disabled && (
              <button
                type="button"
                aria-label="清除"
                className="p-1 rounded hover:bg-muted/70"
                onMouseDown={(e) => {
                  // 提前拦截，避免触发外层 Button 的 click
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleClear()
                }}
              >
                <X className="h-4 w-4 opacity-50 hover:opacity-100" />
              </button>
            )}
            <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
          </div>
        </Button>

        {isOpen && (
          <Card className={cn(
            "mt-1 w-full shadow-lg",
            inline ? "relative z-0" : "absolute top-full z-50"
          )}>
            <CardContent className="p-2">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  ref={inputRef}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="输入关键词搜索..."
                  className="pl-10"
                  autoFocus
                />
              </div>

              <div className={cn(
                "overflow-y-auto",
                inline ? "max-h-[40vh]" : "max-h-60"
              )}>
                {loading ? (
                  <div className="py-4 text-center text-sm text-gray-500">
                    搜索中...
                  </div>
                ) : !searchTerm.trim() ? (
                  // 没有搜索词时的显示逻辑
                  initialLoading ? (
                    <div className="py-4 text-center text-sm text-gray-500">
                      加载中...
                    </div>
                  ) : initialOptions.length <= 5 ? (
                    // 记录数 <= 5条时直接显示
                    initialOptions.length === 0 ? (
                      <div className="py-4 text-center text-sm text-gray-500">
                        暂无数据
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {initialOptions.map((option) => (
                          <div
                            key={option.id}
                            onClick={() => handleSelect(option)}
                            className={cn(
                              "p-2 rounded cursor-pointer hover:bg-gray-100 transition-colors",
                              selectedOption?.id === option.id && "bg-blue-50 border-blue-200"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              {renderOption ? renderOption(option) : defaultRenderOption(option)}
                              {selectedOption?.id === option.id && (
                                <Check className="h-4 w-4 text-blue-600" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    // 记录数 > 5条时要求用户搜索
                    <div className="py-4 text-center text-sm text-gray-500">
                      <div className="mb-1">共 {initialOptions.length} 条记录</div>
                      <div>请输入关键词开始搜索</div>
                    </div>
                  )
                ) : options.length === 0 ? (
                  <div className="py-4 text-center text-sm text-gray-500">
                    无匹配结果
                  </div>
                ) : (
                  <div className="space-y-1">
                    {options.map((option) => (
                      <div
                        key={option.id}
                        onClick={() => handleSelect(option)}
                        className={cn(
                          "p-2 rounded cursor-pointer hover:bg-gray-100 transition-colors",
                          selectedOption?.id === option.id && "bg-blue-50 border-blue-200"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          {renderOption ? renderOption(option) : defaultRenderOption(option)}
                          {selectedOption?.id === option.id && (
                            <Check className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default SearchableSelect
