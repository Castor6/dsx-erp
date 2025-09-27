from __future__ import annotations

from pydantic import BaseModel, Field, computed_field, model_validator
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
    total_products: int = Field(description="基础商品种类总数")
    total_in_transit: int = Field(description="总在途数量")
    total_semi_finished: int = Field(description="总半成品数量")
    total_finished: int = Field(description="总成品数量")
    total_shipped: int = Field(description="总出库数量")
    # 组合商品统计
    total_combo_products: int = Field(description="组合商品种类总数", default=0)
    total_combo_finished: int = Field(description="组合商品成品总数", default=0)
    total_combo_shipped: int = Field(description="组合商品出库总数", default=0)


class BatchShippingItemRequest(BaseModel):
    """批量出库单项请求"""
    product_id: Optional[int] = Field(None, description="基础商品ID")
    combo_product_id: Optional[int] = Field(None, description="组合商品ID")
    quantity: int = Field(gt=0, description="出库数量必须大于0")

    @model_validator(mode='after')
    def validate_product_ids(self):
        """验证必须提供product_id或combo_product_id中的一个"""
        if not self.product_id and not self.combo_product_id:
            raise ValueError('必须提供product_id或combo_product_id')
        if self.product_id and self.combo_product_id:
            raise ValueError('product_id和combo_product_id不能同时提供')
        return self


class BatchShippingRequest(BaseModel):
    """批量出库请求"""
    warehouse_id: int = Field(description="仓库ID")
    items: list[BatchShippingItemRequest] = Field(min_items=1, description="出库商品列表")
    notes: Optional[str] = Field(None, max_length=500, description="批量出库备注")


class ProductSearchItem(BaseModel):
    """商品搜索结果项"""
    id: int
    name: str
    sku: str
    type: str = Field(description="商品类型：product|combo")
    finished_stock: int = Field(description="成品库存数量")
    available_stock: int = Field(description="可用库存数量")


class BatchShippingResponse(BaseModel):
    """批量出库响应"""
    success_count: int = Field(description="成功出库的商品数量")
    total_count: int = Field(description="总商品数量")
    failed_items: list[dict] = Field(description="失败的商品列表")
    message: str = Field(description="响应消息")
    batch_id: Optional[str] = Field(None, description="批次ID")


class BatchShippingRecordBase(BaseModel):
    """批量出库记录基础模型"""
    batch_id: str = Field(description="批次唯一标识")
    warehouse_id: int = Field(description="仓库ID")
    total_items_count: int = Field(description="总商品种类数")
    total_quantity: int = Field(description="总出库数量")
    operator_id: int = Field(description="操作人ID")
    notes: Optional[str] = Field(None, description="批量出库备注")


class BatchShippingRecord(BatchShippingRecordBase):
    """批量出库记录"""
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class BatchShippingRecordWithDetails(BatchShippingRecord):
    """带详情的批量出库记录"""
    warehouse: Optional[Warehouse] = None
    operator: Optional[User] = None

    class Config:
        from_attributes = True


class BatchShippingItemDetail(BaseModel):
    """批量出库商品明细"""
    product_id: Optional[int] = None
    combo_product_id: Optional[int] = None
    product_name: str = Field(description="商品名称")
    sku: str = Field(description="商品SKU")
    quantity: int = Field(description="出库数量")
    type: str = Field(description="商品类型：product|combo")


class BatchShippingRecordDetail(BaseModel):
    """批量出库记录详情"""
    record: BatchShippingRecordWithDetails
    items: list[BatchShippingItemDetail] = Field(description="出库商品明细列表")


# 延迟导入解决循环依赖
from app.schemas.product import Product
from app.schemas.warehouse import Warehouse
from app.schemas.user import User

InventoryRecordWithDetails.model_rebuild()
InventoryTransactionWithDetails.model_rebuild()
