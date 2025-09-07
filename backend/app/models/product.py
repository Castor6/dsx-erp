from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from app.core.database import Base


class SaleType(str, enum.Enum):
    PRODUCT = "商品"
    PACKAGING = "包材"


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    sku = Column(String(100), unique=True, index=True, nullable=False)
    sale_type = Column(Enum(SaleType), nullable=False)
    image_url = Column(String(500), nullable=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    packaging_id = Column(Integer, ForeignKey("products.id"), nullable=True)  # 自关联包材
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关系
    warehouse = relationship("Warehouse", back_populates="products")
    packaging = relationship("Product", remote_side=[id])  # 自关联包材
    
    # 库存记录
    inventory_records = relationship("InventoryRecord", back_populates="product")
    
    # 采购明细
    purchase_order_items = relationship("PurchaseOrderItem", back_populates="product")
    
    # 供货关系
    supplier_products = relationship("SupplierProduct", back_populates="product")
