from __future__ import annotations

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models.product import SaleType
from app.schemas.packaging_relation import ProductPackagingRelationCreate, ProductPackagingRelation


class ProductBase(BaseModel):
    name: str
    sku: str
    sale_type: SaleType
    image_url: Optional[str] = None
    warehouse_id: int


class ProductCreate(ProductBase):
    packaging_relations: Optional[List[ProductPackagingRelationCreate]] = []


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    sale_type: Optional[SaleType] = None
    image_url: Optional[str] = None
    warehouse_id: Optional[int] = None
    packaging_relations: Optional[List[ProductPackagingRelationCreate]] = None


class Product(ProductBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProductWithWarehouse(Product):
    warehouse: Optional[Warehouse] = None
    packaging: Optional[Product] = None  # 保留用于向后兼容
    packaging_relations: List[ProductPackagingRelation] = []

    class Config:
        from_attributes = True


class ProductListResponse(BaseModel):
    """商品列表响应，包含分页信息"""
    items: List[ProductWithWarehouse]
    total: int
    skip: int
    limit: int
    has_more: bool

    class Config:
        from_attributes = True


# 延迟导入解决循环依赖
from app.schemas.warehouse import Warehouse
ProductWithWarehouse.model_rebuild()