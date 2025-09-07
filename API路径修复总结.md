# API路径修复总结

## 🐛 问题描述

用户反馈的三个核心问题：
1. **商品管理页面**：创建商品时选择仓库的下拉框为空
2. **采购订单页面**：创建订单时供应商和收货仓库下拉框为空  
3. **预期问题**：采购订单中的商品选择也可能存在同样问题

## 🔍 根本原因

前端页面中的API调用路径不正确，缺少 `/api/v1/` 前缀：

**错误路径示例**：
- ❌ `/products/`
- ❌ `/suppliers/`
- ❌ `/warehouses/`
- ❌ `/purchase-orders/`
- ❌ `/inventory/summary`

**正确路径示例**：
- ✅ `/api/v1/products/`
- ✅ `/api/v1/suppliers/`
- ✅ `/api/v1/warehouses/`
- ✅ `/api/v1/purchase-orders/`
- ✅ `/api/v1/inventory/summary`

## 🔧 修复内容

### 1. 商品管理页面 (`frontend/app/dashboard/products/page.tsx`)

修复了以下API调用：
- `fetchProducts()` - 获取商品列表
- `fetchWarehouses()` - 获取仓库列表 ✅ **解决问题1**
- `fetchPackagingProducts()` - 获取包材列表
- `handleSubmit()` - 创建/更新商品
- `handleDelete()` - 删除商品

### 2. 采购订单管理页面 (`frontend/app/dashboard/purchase-orders/page.tsx`)

修复了以下API调用：
- `fetchOrders()` - 获取采购订单列表
- `fetchSuppliers()` - 获取供应商列表 ✅ **解决问题2**
- `fetchWarehouses()` - 获取仓库列表 ✅ **解决问题2**
- `fetchProducts()` - 获取商品列表 ✅ **解决问题3**
- `handleSubmitOrder()` - 创建采购订单
- `handleViewOrder()` - 查看订单详情
- `handleReceiveSubmit()` - 提交到货记录
- `handleDeleteOrder()` - 删除采购订单

### 3. 库存管理页面 (`frontend/app/dashboard/inventory/page.tsx`)

修复了以下API调用：
- `fetchInventorySummary()` - 获取库存汇总
- `fetchInventoryRecords()` - 获取库存记录
- `fetchWarehouses()` - 获取仓库列表
- `handlePackage()` - 商品打包操作
- `handleShip()` - 商品出库操作

## ✅ 验证状态

### 已确认正确的页面
- ✅ **用户管理页面** - API路径正确
- ✅ **供应商管理页面** - API路径正确
- ✅ **仓库管理页面** - API路径正确

### 已修复的页面
- ✅ **商品管理页面** - 所有API路径已修复
- ✅ **采购订单管理页面** - 所有API路径已修复
- ✅ **库存管理页面** - 所有API路径已修复

## 🎯 预期结果

修复后，用户应该能够：

1. **在商品管理页面**：
   - 正常看到仓库下拉选项
   - 正常看到包材下拉选项（商品类型时）
   - 成功创建和编辑商品

2. **在采购订单页面**：
   - 正常看到供应商下拉选项
   - 正常看到收货仓库下拉选项
   - 正常看到商品下拉选项
   - 成功创建采购订单

3. **在库存管理页面**：
   - 正常显示库存汇总数据
   - 正常显示库存明细
   - 成功执行打包和出库操作

## 🔄 测试建议

1. **清空浏览器缓存**：确保加载最新的JavaScript代码
2. **检查Network标签页**：确认API请求返回200状态码
3. **逐一测试功能**：
   - 创建仓库 → 在商品管理中能看到仓库选项
   - 创建供应商 → 在采购订单中能看到供应商选项
   - 创建商品 → 在采购订单中能看到商品选项

## 📝 技术说明

这个问题的根本原因是前端API客户端配置与后端路由配置的不匹配：

- **后端配置** (`backend/main.py`): `app.include_router(api_router, prefix="/api/v1")`
- **前端配置** (`frontend/lib/api.ts`): `baseURL: 'http://localhost:8000'`

因此所有API调用都需要完整的路径：`/api/v1/{endpoint}/`

这个修复确保了前后端API通信的正确性，解决了所有下拉选择框为空的问题。
