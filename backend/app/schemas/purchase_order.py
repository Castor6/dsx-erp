from __future__ import annotations

from pydantic import BaseModel, Field, computed_field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

from app.models.purchase_order import OrderStatus


class PurchaseOrderItemBase(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, description="采购数量必须大于0")
    unit_price: Decimal = Field(ge=0, description="单价不能为负数")


class PurchaseOrderItemCreate(PurchaseOrderItemBase):
    @computed_field
    @property
    def subtotal(self) -> Decimal:
        return self.quantity * self.unit_price


class PurchaseOrderItemUpdate(BaseModel):
    product_id: Optional[int] = None
    quantity: Optional[int] = Field(None, gt=0)
    unit_price: Optional[Decimal] = Field(None, ge=0)
    received_quantity: Optional[int] = Field(None, ge=0)


class PurchaseOrderItem(PurchaseOrderItemBase):
    id: int
    purchase_order_id: int
    subtotal: Decimal
    received_quantity: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PurchaseOrderItemWithProduct(PurchaseOrderItem):
    product: Optional[Product] = None

    class Config:
        from_attributes = True


class PurchaseOrderBase(BaseModel):
    supplier_id: int
    purchaser: str = Field(min_length=1, max_length=100, description="采购人员姓名")
    warehouse_id: int


class PurchaseOrderCreate(PurchaseOrderBase):
    items: List[PurchaseOrderItemCreate] = Field(min_length=1, description="采购明细不能为空")


class PurchaseOrderUpdate(BaseModel):
    supplier_id: Optional[int] = None
    purchaser: Optional[str] = Field(None, min_length=1, max_length=100)
    warehouse_id: Optional[int] = None
    status: Optional[OrderStatus] = None


class PurchaseOrder(PurchaseOrderBase):
    id: int
    order_number: str
    total_amount: Decimal
    status: OrderStatus
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PurchaseOrderWithDetails(PurchaseOrder):
    supplier: Optional[Supplier] = None
    warehouse: Optional[Warehouse] = None
    items: List[PurchaseOrderItemWithProduct] = []

    class Config:
        from_attributes = True


class ReceiveItemRequest(BaseModel):
    item_id: int
    received_quantity: int = Field(ge=0, description="到货数量不能为负数")


class ReceiveOrderRequest(BaseModel):
    items: List[ReceiveItemRequest] = Field(min_length=1, description="到货明细不能为空")


# 延迟导入解决循环依赖
from app.schemas.product import Product
from app.schemas.supplier import Supplier
from app.schemas.warehouse import Warehouse

PurchaseOrderItemWithProduct.model_rebuild()
PurchaseOrderWithDetails.model_rebuild()
