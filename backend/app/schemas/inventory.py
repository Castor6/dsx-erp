from __future__ import annotations

from pydantic import BaseModel, Field, computed_field
from typing import Optional
from datetime import datetime

from app.models.inventory import InventoryStatus


class InventoryRecordBase(BaseModel):
    product_id: int
    warehouse_id: int
    in_transit: int = Field(ge=0, default=0)
    semi_finished: int = Field(ge=0, default=0)
    finished: int = Field(ge=0, default=0)
    shipped: int = Field(ge=0, default=0)


class InventoryRecord(InventoryRecordBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    @computed_field
    @property
    def total_stock(self) -> int:
        """总库存 = 半成品 + 成品"""
        return self.semi_finished + self.finished
    
    @computed_field
    @property
    def available_stock(self) -> int:
        """可用库存 = 成品数量"""
        return self.finished

    class Config:
        from_attributes = True


class InventoryRecordWithDetails(InventoryRecord):
    product: Optional[Product] = None
    warehouse: Optional[Warehouse] = None

    class Config:
        from_attributes = True


class InventoryTransactionBase(BaseModel):
    product_id: int
    warehouse_id: int
    transaction_type: str
    from_status: Optional[InventoryStatus] = None
    to_status: Optional[InventoryStatus] = None
    quantity: int = Field(description="变动数量")
    reference_id: Optional[int] = None
    notes: Optional[str] = None


class InventoryTransactionCreate(InventoryTransactionBase):
    pass


class InventoryTransaction(InventoryTransactionBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class InventoryTransactionWithDetails(InventoryTransaction):
    product: Optional[Product] = None
    warehouse: Optional[Warehouse] = None

    class Config:
        from_attributes = True


class PackagingRequest(BaseModel):
    """商品打包请求"""
    product_id: int = Field(description="商品ID")
    warehouse_id: int = Field(description="仓库ID")
    quantity: int = Field(gt=0, description="打包数量必须大于0")


class ShippingRequest(BaseModel):
    """商品出库请求"""
    product_id: int = Field(description="商品ID")
    warehouse_id: int = Field(description="仓库ID")
    quantity: int = Field(gt=0, description="出库数量必须大于0")
    notes: Optional[str] = Field(None, max_length=500, description="出库备注")


class InventorySummary(BaseModel):
    """库存汇总信息"""
    warehouse_id: int
    warehouse_name: str
    total_products: int = Field(description="商品种类总数")
    total_in_transit: int = Field(description="总在途数量")
    total_semi_finished: int = Field(description="总半成品数量")
    total_finished: int = Field(description="总成品数量")
    total_shipped: int = Field(description="总出库数量")


# 延迟导入解决循环依赖
from app.schemas.product import Product
from app.schemas.warehouse import Warehouse

InventoryRecordWithDetails.model_rebuild()
InventoryTransactionWithDetails.model_rebuild()
