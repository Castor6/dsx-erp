from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.product import Product
from app.models.packaging_relation import ProductPackagingRelation
from app.models.user import User
from app.schemas.product import Product as ProductSchema, ProductCreate, ProductUpdate, ProductWithWarehouse, ProductListResponse
from app.schemas.packaging_relation import ProductPackagingRelation as ProductPackagingRelationSchema

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
        selectinload(Product.packaging_relations).selectinload(ProductPackagingRelation.packaging)
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
    
    # 构建返回数据，确保包材信息正确显示
    items = []
    for product in products:
        product_dict = {
            "id": product.id,
            "name": product.name,
            "sku": product.sku,
            "sale_type": product.sale_type,
            "image_url": product.image_url,
            "warehouse_id": product.warehouse_id,
            "created_at": product.created_at,
            "updated_at": product.updated_at,
            "warehouse": product.warehouse,
            "packaging_relations": []
        }
        
        # 构建包材关系数据，包含包材名称和SKU
        if product.packaging_relations:
            for relation in product.packaging_relations:
                packaging_relation_dict = {
                    "id": relation.id,
                    "product_id": relation.product_id,
                    "packaging_id": relation.packaging_id,
                    "quantity": relation.quantity,
                    "created_at": relation.created_at,
                    "packaging_name": relation.packaging.name if relation.packaging else None,
                    "packaging_sku": relation.packaging.sku if relation.packaging else None
                }
                product_dict["packaging_relations"].append(packaging_relation_dict)
        
        items.append(product_dict)
    
    return {
        "items": items,
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
    
    # 分离包材关系数据
    packaging_relations_data = product_data.packaging_relations
    product_dict = product_data.model_dump(exclude={'packaging_relations'})
    
    # 创建商品
    db_product = Product(**product_dict)
    db.add(db_product)
    await db.flush()  # 获取商品ID但不提交事务
    
    # 创建包材关系
    if packaging_relations_data:
        for relation_data in packaging_relations_data:
            # 验证包材是否存在
            packaging_result = await db.execute(
                select(Product).where(Product.id == relation_data.packaging_id)
            )
            packaging = packaging_result.scalar_one_or_none()
            if not packaging:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"包材ID {relation_data.packaging_id} 不存在"
                )
            
            # 创建关联记录
            db_relation = ProductPackagingRelation(
                product_id=db_product.id,
                packaging_id=relation_data.packaging_id,
                quantity=relation_data.quantity
            )
            db.add(db_relation)
    
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
    
    # 处理包材关系更新
    packaging_relations_data = product_data.packaging_relations
    update_data = product_data.model_dump(exclude_unset=True, exclude={'packaging_relations'})
    
    # 更新基本字段
    for field, value in update_data.items():
        setattr(db_product, field, value)
    
    # 更新包材关系
    if packaging_relations_data is not None:
        # 删除现有的包材关系
        existing_relations = await db.execute(
            select(ProductPackagingRelation).where(
                ProductPackagingRelation.product_id == product_id
            )
        )
        for relation in existing_relations.scalars().all():
            await db.delete(relation)
        
        # 创建新的包材关系
        for relation_data in packaging_relations_data:
            # 验证包材是否存在
            packaging_result = await db.execute(
                select(Product).where(Product.id == relation_data.packaging_id)
            )
            packaging = packaging_result.scalar_one_or_none()
            if not packaging:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"包材ID {relation_data.packaging_id} 不存在"
                )
            
            # 创建关联记录
            db_relation = ProductPackagingRelation(
                product_id=product_id,
                packaging_id=relation_data.packaging_id,
                quantity=relation_data.quantity
            )
            db.add(db_relation)
    
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


@router.get("/{product_id}/packaging-relations", response_model=List[ProductPackagingRelationSchema])
async def get_product_packaging_relations(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取商品的默认包材配置（用于组合商品创建时的预填充）"""
    # 检查商品是否存在
    product_result = await db.execute(select(Product).where(Product.id == product_id))
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="商品不存在"
        )
    
    # 获取商品的包材关系
    result = await db.execute(
        select(ProductPackagingRelation)
        .options(selectinload(ProductPackagingRelation.packaging))
        .where(ProductPackagingRelation.product_id == product_id)
        .order_by(ProductPackagingRelation.created_at)
    )
    packaging_relations = result.scalars().all()
    
    # 构建返回数据
    result_list = []
    for relation in packaging_relations:
        result_list.append({
            "id": relation.id,
            "product_id": relation.product_id,
            "packaging_id": relation.packaging_id,
            "quantity": relation.quantity,
            "created_at": relation.created_at,
            "packaging_name": relation.packaging.name,
            "packaging_sku": relation.packaging.sku
        })
    
    return result_list
