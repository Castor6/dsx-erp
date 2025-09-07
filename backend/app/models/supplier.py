from sqlalchemy import Column, Integer, String, DateTime, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from app.core.database import Base


class PaymentMethod(str, enum.Enum):
    PREPAID = "款到发货"
    COD = "货到付款"


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    payment_method = Column(Enum(PaymentMethod), nullable=False)
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关系
    purchase_orders = relationship("PurchaseOrder", back_populates="supplier")
    supplier_products = relationship("SupplierProduct", back_populates="supplier")
