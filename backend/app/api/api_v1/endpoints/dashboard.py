from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.user import User
from app.models.product import Product
from app.models.combo_product import ComboProduct
from app.models.supplier import Supplier
from app.models.warehouse import Warehouse
from app.models.purchase_order import PurchaseOrder, OrderStatus

router = APIRouter()


class DashboardStats(BaseModel):
    """仪表板统计数据"""
    total_products: int  # 总商品数（商品+组合商品）
    pending_orders: int  # 待记录到货的采购订单数量
    total_suppliers: int  # 供应商数量
    total_warehouses: int  # 仓库数量


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取仪表板统计数据"""
    
    # 获取总商品数（基础商品 + 组合商品）
    products_result = await db.execute(select(func.count(Product.id)))
    total_base_products = products_result.scalar() or 0
    
    combo_products_result = await db.execute(select(func.count(ComboProduct.id)))
    total_combo_products = combo_products_result.scalar() or 0
    
    total_products = total_base_products + total_combo_products
    
    # 获取待记录到货的采购订单数量（状态为"待收货"）
    pending_orders_result = await db.execute(
        select(func.count(PurchaseOrder.id))
        .where(PurchaseOrder.status == OrderStatus.PENDING)
    )
    pending_orders = pending_orders_result.scalar() or 0
    
    # 获取供应商数量
    suppliers_result = await db.execute(select(func.count(Supplier.id)))
    total_suppliers = suppliers_result.scalar() or 0
    
    # 获取仓库数量
    warehouses_result = await db.execute(select(func.count(Warehouse.id)))
    total_warehouses = warehouses_result.scalar() or 0
    
    return DashboardStats(
        total_products=total_products,
        pending_orders=pending_orders,
        total_suppliers=total_suppliers,
        total_warehouses=total_warehouses
    )
