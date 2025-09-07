from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from math import ceil

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.supplier import Supplier
from app.models.user import User
from app.schemas.supplier import (
    Supplier as SupplierSchema, 
    SupplierCreate, 
    SupplierUpdate, 
    SupplierListResponse
)

router = APIRouter()


@router.get("/", response_model=SupplierListResponse)
async def get_suppliers(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
    search: str = Query(None, description="供应商名称搜索"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取供应商列表，支持分页和名称模糊查询"""
    # 构建基础查询
    query = select(Supplier)
    count_query = select(func.count(Supplier.id))
    
    # 添加搜索条件
    if search:
        search_filter = Supplier.name.ilike(f"%{search}%")
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)
    
    # 获取总数
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 计算偏移量
    offset = (page - 1) * size
    
    # 添加分页
    query = query.offset(offset).limit(size).order_by(Supplier.created_at.desc())
    
    # 执行查询
    result = await db.execute(query)
    suppliers = result.scalars().all()
    
    # 计算总页数
    pages = ceil(total / size) if total > 0 else 1
    
    return SupplierListResponse(
        items=suppliers,
        total=total,
        page=page,
        size=size,
        pages=pages
    )


@router.post("/", response_model=SupplierSchema)
async def create_supplier(
    supplier_data: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """创建供应商"""
    # 检查供应商名称是否已存在
    result = await db.execute(select(Supplier).where(Supplier.name == supplier_data.name))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="供应商名称已存在"
        )
    
    db_supplier = Supplier(**supplier_data.model_dump())
    db.add(db_supplier)
    await db.commit()
    await db.refresh(db_supplier)
    
    return db_supplier


@router.put("/{supplier_id}", response_model=SupplierSchema)
async def update_supplier(
    supplier_id: int,
    supplier_data: SupplierUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """更新供应商"""
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    db_supplier = result.scalar_one_or_none()
    
    if not db_supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="供应商不存在"
        )
    
    # 检查名称唯一性（如果要更新名称）
    if supplier_data.name and supplier_data.name != db_supplier.name:
        result = await db.execute(select(Supplier).where(Supplier.name == supplier_data.name))
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="供应商名称已存在"
            )
    
    # 更新字段
    update_data = supplier_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_supplier, field, value)
    
    await db.commit()
    await db.refresh(db_supplier)
    
    return db_supplier


@router.delete("/{supplier_id}")
async def delete_supplier(
    supplier_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """删除供应商"""
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    db_supplier = result.scalar_one_or_none()
    
    if not db_supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="供应商不存在"
        )
    
    await db.delete(db_supplier)
    await db.commit()
    
    return {"message": "供应商删除成功"}
