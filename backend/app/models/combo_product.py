from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class ComboProduct(Base):
    """组合商品表"""
    __tablename__ = "combo_products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)  # 组合商品名称
    sku = Column(String(100), unique=True, index=True, nullable=False)  # 组合商品SKU
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # 关系
    combo_items = relationship("ComboProductItem", back_populates="combo_product", cascade="all, delete-orphan")
    # 库存记录
    inventory_records = relationship("ComboInventoryRecord", back_populates="combo_product", cascade="all, delete-orphan")
    # 库存变动记录
    inventory_transactions = relationship("ComboInventoryTransaction", cascade="all, delete-orphan")
    # 包材关系 (多对多)
    packaging_relations = relationship("ComboProductPackagingRelation", back_populates="combo_product", cascade="all, delete-orphan")


class ComboProductItem(Base):
    """组合商品明细表 - 记录组合中包含的基础商品及数量"""
    __tablename__ = "combo_product_items"

    id = Column(Integer, primary_key=True, index=True)
    combo_product_id = Column(Integer, ForeignKey("combo_products.id"), nullable=False)
    base_product_id = Column(Integer, ForeignKey("products.id"), nullable=False)  # 基础商品ID
    quantity = Column(Integer, nullable=False)  # 组合中需要的基础商品数量
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 关系
    combo_product = relationship("ComboProduct", back_populates="combo_items")
    base_product = relationship("Product")
    packaging_relations = relationship("ComboItemPackagingRelation", back_populates="combo_product_item", cascade="all, delete-orphan")


class ComboInventoryRecord(Base):
    """组合商品库存记录表"""
    __tablename__ = "combo_inventory_records"

    id = Column(Integer, primary_key=True, index=True)
    combo_product_id = Column(Integer, ForeignKey("combo_products.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    finished = Column(Integer, default=0)        # 已组合的成品数量
    shipped = Column(Integer, default=0)         # 出库数量
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关系
    combo_product = relationship("ComboProduct", back_populates="inventory_records")
    warehouse = relationship("Warehouse")


class ComboInventoryTransaction(Base):
    """组合商品库存变动记录表"""
    __tablename__ = "combo_inventory_transactions"

    id = Column(Integer, primary_key=True, index=True)
    combo_product_id = Column(Integer, ForeignKey("combo_products.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    transaction_type = Column(String(50), nullable=False)  # 变动类型：组装、出库
    quantity = Column(Integer, nullable=False)  # 变动数量
    reference_id = Column(Integer, nullable=True)  # 关联单据ID
    batch_id = Column(String(36), nullable=True)  # 批次ID，用于批量操作
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 关系
    combo_product = relationship("ComboProduct")
    warehouse = relationship("Warehouse")
