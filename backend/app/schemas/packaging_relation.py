from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PackagingRelationBase(BaseModel):
    packaging_id: int
    quantity: int = 1


class ProductPackagingRelationCreate(PackagingRelationBase):
    pass


class ProductPackagingRelationUpdate(PackagingRelationBase):
    pass


class ProductPackagingRelation(PackagingRelationBase):
    id: int
    product_id: int
    created_at: datetime
    
    # 包材信息
    packaging_name: Optional[str] = None
    packaging_sku: Optional[str] = None

    class Config:
        from_attributes = True


class ComboProductPackagingRelationCreate(PackagingRelationBase):
    pass


class ComboProductPackagingRelationUpdate(PackagingRelationBase):
    pass


class ComboProductPackagingRelation(PackagingRelationBase):
    id: int
    combo_product_id: int
    created_at: datetime
    
    # 包材信息
    packaging_name: Optional[str] = None
    packaging_sku: Optional[str] = None

    class Config:
        from_attributes = True


class ComboItemPackagingRelationCreate(PackagingRelationBase):
    pass


class ComboItemPackagingRelationUpdate(PackagingRelationBase):
    pass


class ComboItemPackagingRelation(PackagingRelationBase):
    id: int
    combo_product_item_id: int
    created_at: datetime
    
    # 包材信息
    packaging_name: Optional[str] = None
    packaging_sku: Optional[str] = None

    class Config:
        from_attributes = True
