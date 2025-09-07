from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class WarehouseBase(BaseModel):
    name: str
    manager: Optional[str] = None
    notes: Optional[str] = None


class WarehouseCreate(WarehouseBase):
    pass


class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    manager: Optional[str] = None
    notes: Optional[str] = None


class Warehouse(WarehouseBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
