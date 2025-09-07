from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.product import Product
from app.models.user import User
from app.schemas.product import Product as ProductSchema, ProductCreate, ProductUpdate, ProductWithWarehouse, ProductListResponse

router = APIRouter()


@router.get("/", response_model=ProductListResponse)
async def get_products(
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(20, ge=1, le=100, description="每页记录数"),
    search: Optional[str] = Query(None, description="搜索关键词（支持商品名称、SKU模糊查询）"),
    warehouse_id: Optional[int] = Query(None, description="仓库ID筛选"),
    sale_type: Optional[str] = Query(None, description="销售类型筛选"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取商品列表，支持模糊查询和分页"""
    # 构建查询条件
    query = select(Product).options(
        selectinload(Product.warehouse), 
        selectinload(Product.packaging)
    )
    
    # 搜索条件：支持商品名称和SKU模糊查询
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                Product.name.ilike(search_pattern),
                Product.sku.ilike(search_pattern)
            )
        )
    
    # 仓库筛选
    if warehouse_id:
        query = query.where(Product.warehouse_id == warehouse_id)
    
    # 销售类型筛选
    if sale_type:
        query = query.where(Product.sale_type == sale_type)
    
    # 获取总数
    count_query = select(func.count(Product.id))
    if search:
        search_pattern = f"%{search}%"
        count_query = count_query.where(
            or_(
                Product.name.ilike(search_pattern),
                Product.sku.ilike(search_pattern)
            )
        )
    if warehouse_id:
        count_query = count_query.where(Product.warehouse_id == warehouse_id)
    if sale_type:
        count_query = count_query.where(Product.sale_type == sale_type)
    
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 分页查询
    query = query.offset(skip).limit(limit).order_by(Product.created_at.desc())
    result = await db.execute(query)
    products = result.scalars().all()
    
    return {
        "items": products,
        "total": total,
        "skip": skip,
        "limit": limit,
        "has_more": skip + limit < total
    }


@router.post("/", response_model=ProductSchema)
async def create_product(
    product_data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """创建商品"""
    # 检查SKU是否已存在
    result = await db.execute(select(Product).where(Product.sku == product_data.sku))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="商品SKU已存在"
        )
    
    db_product = Product(**product_data.model_dump())
    db.add(db_product)
    await db.commit()
    await db.refresh(db_product)
    
    return db_product


@router.put("/{product_id}", response_model=ProductSchema)
async def update_product(
    product_id: int,
    product_data: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """更新商品"""
    # 查找商品
    result = await db.execute(select(Product).where(Product.id == product_id))
    db_product = result.scalar_one_or_none()
    
    if not db_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="商品不存在"
        )
    
    # 如果要更新SKU，检查新SKU是否已存在
    if product_data.sku and product_data.sku != db_product.sku:
        existing_sku = await db.execute(select(Product).where(Product.sku == product_data.sku))
        if existing_sku.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="商品SKU已存在"
            )
    
    # 更新字段
    update_data = product_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_product, field, value)
    
    await db.commit()
    await db.refresh(db_product)
    
    return db_product


@router.delete("/{product_id}")
async def delete_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """删除商品"""
    result = await db.execute(select(Product).where(Product.id == product_id))
    db_product = result.scalar_one_or_none()
    
    if not db_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="商品不存在"
        )
    
    await db.delete(db_product)
    await db.commit()
    
    return {"message": "商品删除成功"}
