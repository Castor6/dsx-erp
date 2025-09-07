from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from app.core.database import Base


class OrderStatus(str, enum.Enum):
    PENDING = "待收货"
    PARTIAL = "部分到货"
    COMPLETED = "已完成"
    CANCELLED = "已取消"


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(50), unique=True, index=True, nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    purchaser = Column(String(100), nullable=False)  # 采购人员
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    total_amount = Column(Numeric(10, 2), default=0)
    status = Column(Enum(OrderStatus), default=OrderStatus.PENDING)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关系
    supplier = relationship("Supplier", back_populates="purchase_orders")
    warehouse = relationship("Warehouse", back_populates="purchase_orders")
    items = relationship("PurchaseOrderItem", back_populates="purchase_order")


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)  # 采购数量
    unit_price = Column(Numeric(10, 2), nullable=False)  # 单价
    subtotal = Column(Numeric(10, 2), nullable=False)  # 小计
    received_quantity = Column(Integer, default=0)  # 实际到货数量
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关系
    purchase_order = relationship("PurchaseOrder", back_populates="items")
    product = relationship("Product", back_populates="purchase_order_items")
