from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.warehouse import Warehouse
from app.models.user import User
from app.schemas.warehouse import Warehouse as WarehouseSchema, WarehouseCreate, WarehouseUpdate

router = APIRouter()


@router.get("/", response_model=List[WarehouseSchema])
async def get_warehouses(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取仓库列表"""
    result = await db.execute(select(Warehouse).offset(skip).limit(limit))
    warehouses = result.scalars().all()
    return warehouses


@router.post("/", response_model=WarehouseSchema)
async def create_warehouse(
    warehouse_data: WarehouseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """创建仓库"""
    # 检查仓库名称是否已存在
    result = await db.execute(select(Warehouse).where(Warehouse.name == warehouse_data.name))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仓库名称已存在"
        )
    
    db_warehouse = Warehouse(**warehouse_data.model_dump())
    db.add(db_warehouse)
    await db.commit()
    await db.refresh(db_warehouse)
    
    return db_warehouse


@router.put("/{warehouse_id}", response_model=WarehouseSchema)
async def update_warehouse(
    warehouse_id: int,
    warehouse_data: WarehouseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """更新仓库"""
    result = await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
    db_warehouse = result.scalar_one_or_none()
    
    if not db_warehouse:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="仓库不存在"
        )
    
    # 检查名称唯一性（如果要更新名称）
    if warehouse_data.name and warehouse_data.name != db_warehouse.name:
        result = await db.execute(select(Warehouse).where(Warehouse.name == warehouse_data.name))
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="仓库名称已存在"
            )
    
    # 更新字段
    update_data = warehouse_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_warehouse, field, value)
    
    await db.commit()
    await db.refresh(db_warehouse)
    
    return db_warehouse


@router.delete("/{warehouse_id}")
async def delete_warehouse(
    warehouse_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """删除仓库"""
    result = await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
    db_warehouse = result.scalar_one_or_none()
    
    if not db_warehouse:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="仓库不存在"
        )
    
    await db.delete(db_warehouse)
    await db.commit()
    
    return {"message": "仓库删除成功"}
