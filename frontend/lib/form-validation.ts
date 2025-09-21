/**
 * 表单验证和错误处理工具函数
 */

export interface ValidationError {
  field: string
  message: string
}

export interface ApiError {
  status: number
  message: string
  details?: any
}

/**
 * 处理API错误，根据状态码返回友好的错误消息
 */
export const handleApiError = (error: any): ApiError => {
  // 如果是网络错误
  if (!error.response) {
    return {
      status: 0,
      message: "网络连接异常，请检查网络后重试"
    }
  }

  const status = error.response.status
  const responseData = error.response.data

  // 优先使用后端返回的具体错误信息
  if (responseData?.message) {
    return {
      status,
      message: responseData.message,
      details: responseData
    }
  }

  if (responseData?.detail) {
    return {
      status,
      message: responseData.detail,
      details: responseData
    }
  }

  // 根据状态码返回相应错误信息
  switch (status) {
    case 400:
      // 验证错误或业务逻辑错误
      return {
        status,
        message: "请求参数错误，请检查输入内容",
        details: responseData
      }

    case 401:
      return {
        status,
        message: "登录已过期，请重新登录"
      }

    case 403:
      return {
        status,
        message: "没有权限执行此操作"
      }

    case 404:
      return {
        status,
        message: "请求的资源不存在"
      }

    case 409:
      return {
        status,
        message: "数据冲突，请刷新页面后重试"
      }

    case 422:
      // 数据验证错误
      return {
        status,
        message: "数据格式错误，请检查输入内容",
        details: responseData
      }

    case 500:
      return {
        status,
        message: "系统异常，请联系网站管理员"
      }

    case 502:
    case 503:
    case 504:
      return {
        status,
        message: "服务暂时不可用，请稍后重试"
      }

    default:
      return {
        status,
        message: "操作失败，请稍后重试"
      }
  }
}

/**
 * 验证必填字段
 */
export const validateRequiredFields = (
  data: Record<string, any>,
  requiredFields: Array<{ field: string; label: string; validator?: (value: any) => boolean }>
): ValidationError[] => {
  const errors: ValidationError[] = []

  requiredFields.forEach(({ field, label, validator }) => {
    const value = data[field]

    // 检查是否为空
    if (value === null || value === undefined || value === '') {
      errors.push({
        field,
        message: `${label}不能为空`
      })
      return
    }

    // 如果有自定义验证器，执行验证
    if (validator && !validator(value)) {
      errors.push({
        field,
        message: `${label}格式不正确`
      })
    }
  })

  return errors
}

/**
 * 验证数组字段（如组合商品的明细项）
 */
export const validateArrayFields = <T>(
  items: T[],
  itemName: string,
  validator: (item: T, index: number) => ValidationError[]
): ValidationError[] => {
  if (!items || items.length === 0) {
    return [{
      field: 'items',
      message: `至少需要一个${itemName}`
    }]
  }

  const errors: ValidationError[] = []

  items.forEach((item, index) => {
    const itemErrors = validator(item, index)
    errors.push(...itemErrors.map(error => ({
      ...error,
      field: `${itemName}[${index}].${error.field}`
    })))
  })

  return errors
}

/**
 * 数字验证器
 */
export const numberValidator = (min?: number, max?: number) => (value: any): boolean => {
  const num = Number(value)
  if (isNaN(num)) return false
  if (min !== undefined && num < min) return false
  if (max !== undefined && num > max) return false
  return true
}

/**
 * 字符串长度验证器
 */
export const lengthValidator = (min?: number, max?: number) => (value: string): boolean => {
  if (typeof value !== 'string') return false
  if (min !== undefined && value.length < min) return false
  if (max !== undefined && value.length > max) return false
  return true
}

/**
 * SKU格式验证器（字母数字和连字符）
 */
export const skuValidator = (value: string): boolean => {
  if (typeof value !== 'string') return false
  return /^[a-zA-Z0-9-_]+$/.test(value)
}

/**
 * 显示字段错误
 */
export const getFieldErrors = (errors: ValidationError[], fieldName: string): string[] => {
  return errors
    .filter(error => error.field === fieldName || error.field.startsWith(`${fieldName}.`))
    .map(error => error.message)
}

/**
 * 检查是否有错误
 */
export const hasErrors = (errors: ValidationError[]): boolean => {
  return errors.length > 0
}

/**
 * 格式化错误消息用于toast显示
 */
export const formatErrorsForToast = (errors: ValidationError[]): string => {
  if (errors.length === 0) return ''
  if (errors.length === 1) return errors[0].message

  return `发现 ${errors.length} 个错误：\n${errors.map(e => `• ${e.message}`).join('\n')}`
}

/**
 * 根据API错误信息推断受影响的字段
 */
export const inferErrorField = (errorMessage: string): string | null => {
  const message = errorMessage.toLowerCase()

  if (message.includes('sku')) {
    return 'sku'
  }
  if (message.includes('名称') || message.includes('name')) {
    return 'name'
  }
  if (message.includes('供应商') || message.includes('supplier')) {
    return 'supplier_id'
  }
  if (message.includes('仓库') || message.includes('warehouse')) {
    return 'warehouse_id'
  }

  return null
}

/**
 * 将API错误转换为字段验证错误
 */
export const apiErrorToFieldError = (apiError: ApiError): ValidationError | null => {
  const field = inferErrorField(apiError.message)
  if (field) {
    return {
      field,
      message: apiError.message
    }
  }
  return null
}