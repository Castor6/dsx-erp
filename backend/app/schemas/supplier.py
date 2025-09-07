from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models.supplier import PaymentMethod


class SupplierBase(BaseModel):
    name: str
    payment_method: PaymentMethod
    notes: Optional[str] = None


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    payment_method: Optional[PaymentMethod] = None
    notes: Optional[str] = None


class Supplier(SupplierBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SupplierListResponse(BaseModel):
    """供应商列表响应"""
    items: List[Supplier]
    total: int
    page: int
    size: int
    pages: int
