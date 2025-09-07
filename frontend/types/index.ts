// 用户相关类型
export interface User {
  id: number
  username: string
  email?: string
  full_name?: string
  is_active: boolean
  is_admin: boolean
  created_at: string
  updated_at?: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
}

// 供应商相关类型
export interface Supplier {
  id: number
  name: string
  payment_method: '款到发货' | '货到付款'
  notes?: string
  created_at: string
  updated_at?: string
}

export interface SupplierListResponse {
  items: Supplier[]
  total: number
  page: number
  size: number
  pages: number
}

// 仓库相关类型
export interface Warehouse {
  id: number
  name: string
  manager?: string
  notes?: string
  created_at: string
  updated_at?: string
}

// 商品相关类型
export interface Product {
  id: number
  name: string
  sku: string
  sale_type: '商品' | '包材'
  image_url?: string
  warehouse_id: number
  packaging_id?: number
  created_at: string
  updated_at?: string
}

// 采购订单相关类型
export interface PurchaseOrder {
  id: number
  order_number: string
  supplier_id: number
  purchaser: string
  warehouse_id: number
  total_amount: number
  status: '待收货' | '部分到货' | '已完成' | '已取消'
  created_at: string
  updated_at?: string
}

export interface PurchaseOrderItem {
  id: number
  purchase_order_id: number
  product_id: number
  quantity: number
  unit_price: number
  subtotal: number
  received_quantity: number
  created_at: string
  updated_at?: string
}

// 库存相关类型
export interface InventoryRecord {
  id: number
  product_id: number
  warehouse_id: number
  in_transit: number      // 在途
  semi_finished: number   // 半成品
  finished: number        // 成品
  shipped: number         // 出库
  created_at: string
  updated_at?: string
}

// 供货关系相关类型
export interface SupplierProduct {
  id: number
  supplier_id: number
  product_id: number
  created_at: string
}

export interface SupplierProductWithDetails {
  id: number
  supplier_id: number
  product_id: number
  created_at: string
  supplier?: Supplier
  product?: Product
}

export interface SupplierProductListResponse {
  items: SupplierProductWithDetails[]
  total: number
  page: number
  size: number
  pages: number
}

export interface SupplierProductCreate {
  supplier_id: number
  product_id: number
}

export interface ImportError {
  row: number
  supplier_name: string
  product_sku: string
  error_type: string
  error_message: string
}

export interface ExcelImportResponse {
  success_count: number
  error_count: number
  total_rows: number
  errors: ImportError[]
  created_items: SupplierProduct[]
  summary: string
}

// 组合商品相关类型
export interface ComboProduct {
  id: number
  name: string
  sku: string
  warehouse_id: number
  warehouse_name?: string
  image_url?: string
  notes?: string
  created_at: string
  updated_at?: string
  combo_items: ComboProductItem[]
}

export interface ComboProductItem {
  id: number
  combo_product_id: number
  base_product_id: number
  quantity: number
  created_at: string
  base_product_name?: string
  base_product_sku?: string
}

export interface ComboInventoryRecord {
  id: number
  combo_product_id: number
  warehouse_id: number
  finished: number
  shipped: number
  available_to_assemble: number
  combo_product_name?: string
  combo_product_sku?: string
  warehouse_name?: string
  created_at: string
  updated_at?: string
}

export interface ComboProductCreateForm {
  name: string
  sku: string
  warehouse_id: number | null
  image_url?: string
  notes?: string
  combo_items: ComboProductItemForm[]
}

export interface ComboProductItemForm {
  base_product_id: number | null
  quantity: number
}