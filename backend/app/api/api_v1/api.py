from fastapi import APIRouter

from app.api.api_v1.endpoints import auth, users, suppliers, products, warehouses, purchase_orders, inventory, upload, supplier_products, combo_products, dashboard

api_router = APIRouter()

# 注册所有路由
api_router.include_router(auth.router, prefix="/auth", tags=["认证"])
api_router.include_router(users.router, prefix="/users", tags=["用户管理"])
api_router.include_router(suppliers.router, prefix="/suppliers", tags=["供应商管理"])
api_router.include_router(products.router, prefix="/products", tags=["商品管理"])
api_router.include_router(warehouses.router, prefix="/warehouses", tags=["仓库管理"])
api_router.include_router(purchase_orders.router, prefix="/purchase-orders", tags=["采购订单"])
api_router.include_router(inventory.router, prefix="/inventory", tags=["库存管理"])
api_router.include_router(upload.router, prefix="/upload", tags=["文件上传"])
api_router.include_router(supplier_products.router, prefix="/supplier-products", tags=["供货关系管理"])
api_router.include_router(combo_products.router, prefix="/combo-products", tags=["组合商品管理"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["仪表板"])
