from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
import uuid
from app.core.database import Base


class InventoryStatus(str, enum.Enum):
    IN_TRANSIT = "在途"
    SEMI_FINISHED = "半成品"
    FINISHED = "成品"
    SHIPPED = "出库"


class InventoryRecord(Base):
    __tablename__ = "inventory_records"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    in_transit = Column(Integer, default=0)      # 在途数量
    semi_finished = Column(Integer, default=0)   # 半成品数量
    finished = Column(Integer, default=0)        # 成品数量
    shipped = Column(Integer, default=0)         # 出库数量
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关系
    product = relationship("Product", back_populates="inventory_records")
    warehouse = relationship("Warehouse")


class InventoryTransaction(Base):
    """库存变动记录表"""
    __tablename__ = "inventory_transactions"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    transaction_type = Column(String(50), nullable=False)  # 变动类型：采购、到货、打包、出库
    from_status = Column(Enum(InventoryStatus), nullable=True)  # 源状态
    to_status = Column(Enum(InventoryStatus), nullable=True)    # 目标状态
    quantity = Column(Integer, nullable=False)  # 变动数量
    reference_id = Column(Integer, nullable=True)  # 关联单据ID
    batch_id = Column(String(36), nullable=True)  # 批次ID，用于批量操作
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 关系
    product = relationship("Product")
    warehouse = relationship("Warehouse")


class BatchShippingRecord(Base):
    """批量出库记录主表"""
    __tablename__ = "batch_shipping_records"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(36), unique=True, nullable=False, index=True)  # 批次唯一标识
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    total_items_count = Column(Integer, nullable=False)  # 总商品种类数
    total_quantity = Column(Integer, nullable=False)  # 总出库数量
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # 操作人ID
    notes = Column(String(500), nullable=True)  # 批量出库备注
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系
    warehouse = relationship("Warehouse")
    operator = relationship("User")
