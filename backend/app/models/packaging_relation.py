from sqlalchemy import Column, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class ProductPackagingRelation(Base):
    """商品包材关联表"""
    __tablename__ = "product_packaging_relations"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    packaging_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)  # 每个商品需要的包材数量
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 关系
    product = relationship("Product", foreign_keys=[product_id], back_populates="packaging_relations")
    packaging = relationship("Product", foreign_keys=[packaging_id])
    
    # 唯一约束
    __table_args__ = (
        UniqueConstraint('product_id', 'packaging_id', name='uq_product_packaging'),
    )


class ComboProductPackagingRelation(Base):
    """组合商品包材关联表"""
    __tablename__ = "combo_product_packaging_relations"

    id = Column(Integer, primary_key=True, index=True)
    combo_product_id = Column(Integer, ForeignKey("combo_products.id", ondelete="CASCADE"), nullable=False)
    packaging_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)  # 每个组合商品需要的包材数量
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 关系
    combo_product = relationship("ComboProduct", back_populates="packaging_relations")
    packaging = relationship("Product")
    
    # 唯一约束
    __table_args__ = (
        UniqueConstraint('combo_product_id', 'packaging_id', name='uq_combo_product_packaging'),
    )


class ComboItemPackagingRelation(Base):
    """组合商品项目包材关联表 - 记录组合商品中每个基础商品的包材配置"""
    __tablename__ = "combo_item_packaging_relations"

    id = Column(Integer, primary_key=True, index=True)
    combo_product_item_id = Column(Integer, ForeignKey("combo_product_items.id", ondelete="CASCADE"), nullable=False)
    packaging_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)  # 每个基础商品需要的包材数量
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 关系
    combo_product_item = relationship("ComboProductItem", back_populates="packaging_relations")
    packaging = relationship("Product")
    
    # 唯一约束
    __table_args__ = (
        UniqueConstraint('combo_product_item_id', 'packaging_id', name='uq_combo_item_packaging'),
    )
