from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime


# 组合商品明细相关Schema
class ComboProductItemBase(BaseModel):
    base_product_id: int
    quantity: int  # 组合中需要的基础商品数量


class ComboProductItemCreate(ComboProductItemBase):
    pass


class ComboProductItemUpdate(ComboProductItemBase):
    pass


class ComboProductItem(ComboProductItemBase):
    id: int
    combo_product_id: int
    created_at: datetime
    
    # 关联的基础商品信息
    base_product_name: Optional[str] = None
    base_product_sku: Optional[str] = None

    class Config:
        from_attributes = True


# 组合商品相关Schema
class ComboProductBase(BaseModel):
    name: str
    sku: str
    warehouse_id: int
    packaging_id: int


class ComboProductCreate(ComboProductBase):
    combo_items: List[ComboProductItemCreate]  # 组合明细


class ComboProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    warehouse_id: Optional[int] = None
    packaging_id: Optional[int] = None
    combo_items: Optional[List[ComboProductItemCreate]] = None


class ComboProduct(ComboProductBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    # 关联信息
    warehouse_name: Optional[str] = None
    packaging_name: Optional[str] = None
    packaging_sku: Optional[str] = None
    combo_items: List[ComboProductItem] = []

    class Config:
        from_attributes = True


# 组合商品库存相关Schema
class ComboInventoryRecordBase(BaseModel):
    finished: int = 0
    shipped: int = 0


class ComboInventoryRecord(ComboInventoryRecordBase):
    id: int
    combo_product_id: int
    warehouse_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    # 关联信息
    combo_product_name: Optional[str] = None
    combo_product_sku: Optional[str] = None
    warehouse_name: Optional[str] = None
    
    # 计算字段
    available_to_assemble: Optional[int] = None  # 可组合数量（基于基础商品库存计算）

    class Config:
        from_attributes = True


# 组合商品库存变动记录Schema
class ComboInventoryTransactionBase(BaseModel):
    transaction_type: str  # 变动类型：组装、出库
    quantity: int
    reference_id: Optional[int] = None
    notes: Optional[str] = None


class ComboInventoryTransactionCreate(ComboInventoryTransactionBase):
    combo_product_id: int
    warehouse_id: int


class ComboInventoryTransaction(ComboInventoryTransactionBase):
    id: int
    combo_product_id: int
    warehouse_id: int
    created_at: datetime
    
    # 关联信息
    combo_product_name: Optional[str] = None
    combo_product_sku: Optional[str] = None
    warehouse_name: Optional[str] = None

    class Config:
        from_attributes = True


# 组合商品操作相关Schema
class ComboProductAssembleRequest(BaseModel):
    """组合商品组装请求"""
    combo_product_id: int
    quantity: int
    notes: Optional[str] = None


class ComboProductShipRequest(BaseModel):
    """组合商品出库请求"""
    combo_product_id: int
    quantity: int
    notes: Optional[str] = None


# 库存计算相关Schema
class ComboInventorySummary(BaseModel):
    """组合商品库存汇总"""
    combo_product_id: int
    combo_product_name: str
    combo_product_sku: str
    warehouse_id: int
    warehouse_name: str
    finished: int  # 已组合的成品数量
    shipped: int   # 出库数量
    available_to_assemble: int  # 可组合数量（基于基础商品库存计算）
    combo_items: List[ComboProductItem]  # 组合明细

    class Config:
        from_attributes = True


class ComboProductListResponse(BaseModel):
    """组合商品列表响应，包含分页信息"""
    items: List[ComboProduct]
    total: int
    skip: int
    limit: int
    has_more: bool

    class Config:
        from_attributes = True