from __future__ import annotations

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class SupplierProductBase(BaseModel):
    supplier_id: int
    product_id: int


class SupplierProductCreate(SupplierProductBase):
    pass


class SupplierProductUpdate(BaseModel):
    supplier_id: Optional[int] = None
    product_id: Optional[int] = None


class SupplierProduct(SupplierProductBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class SupplierProductWithDetails(SupplierProduct):
    supplier: Optional[Supplier] = None
    product: Optional[Product] = None

    class Config:
        from_attributes = True


class SupplierProductBatchCreate(BaseModel):
    """批量创建供货关系"""
    items: List[SupplierProductCreate]


class ExcelImportRequest(BaseModel):
    """Excel导入请求"""
    file_content: str  # base64编码的文件内容


class ImportError(BaseModel):
    """导入错误详情"""
    row: int
    supplier_name: str
    product_sku: str
    error_type: str
    error_message: str


class ExcelImportResponse(BaseModel):
    """Excel导入响应"""
    success_count: int
    error_count: int
    total_rows: int
    errors: List[ImportError]
    created_items: List[SupplierProduct]
    summary: str


class SupplierProductListResponse(BaseModel):
    """供货关系列表响应"""
    items: List[SupplierProductWithDetails]
    total: int
    page: int
    size: int
    pages: int


# 延迟导入解决循环依赖
from app.schemas.supplier import Supplier
from app.schemas.product import Product
SupplierProductWithDetails.model_rebuild()
