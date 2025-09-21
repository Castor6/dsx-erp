from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.combo_product import ComboProduct, ComboProductItem, ComboInventoryRecord, ComboInventoryTransaction
from app.models.packaging_relation import ComboProductPackagingRelation, ComboItemPackagingRelation
from app.models.product import Product
from app.models.warehouse import Warehouse
from app.models.inventory import InventoryRecord
from app.models.user import User
from app.schemas.combo_product import (
    ComboProduct as ComboProductSchema, ComboProductCreate, ComboProductUpdate,
    ComboInventoryRecord as ComboInventoryRecordSchema, ComboInventorySummary,
    ComboProductAssembleRequest, ComboProductShipRequest, ComboProductListResponse
)

router = APIRouter()


@router.get("/", response_model=ComboProductListResponse)
async def get_combo_products(
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(20, ge=1, le=100, description="每页记录数"),
    search: Optional[str] = Query(None, description="搜索关键词（支持商品名称、SKU模糊查询）"),
    warehouse_id: Optional[int] = Query(None, description="仓库ID筛选"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取组合商品列表，支持模糊查询和分页"""
    # 构建查询条件
    query = select(ComboProduct).options(
        selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.base_product),
        selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.packaging_relations).selectinload(ComboItemPackagingRelation.packaging),
        selectinload(ComboProduct.packaging_relations).selectinload(ComboProductPackagingRelation.packaging),
        selectinload(ComboProduct.inventory_records).selectinload(ComboInventoryRecord.warehouse)
    )
    
    # 搜索条件：支持商品名称和SKU模糊查询
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                ComboProduct.name.ilike(search_pattern),
                ComboProduct.sku.ilike(search_pattern)
            )
        )
    
    # 仓库筛选 - 通过库存记录关联
    if warehouse_id:
        query = query.join(ComboInventoryRecord).where(ComboInventoryRecord.warehouse_id == warehouse_id)
    
    # 获取总数
    count_query = select(func.count(ComboProduct.id))
    if search:
        search_pattern = f"%{search}%"
        count_query = count_query.where(
            or_(
                ComboProduct.name.ilike(search_pattern),
                ComboProduct.sku.ilike(search_pattern)
            )
        )
    if warehouse_id:
        count_query = count_query.join(ComboInventoryRecord).where(ComboInventoryRecord.warehouse_id == warehouse_id)
    
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 分页查询
    query = query.offset(skip).limit(limit).order_by(ComboProduct.created_at.desc())
    result = await db.execute(query)
    combo_products = result.scalars().all()
    
    # 转换数据，添加关联信息
    result_list = []
    for combo in combo_products:
        # 构建仓库信息
        warehouses = []
        for inventory_record in combo.inventory_records:
            warehouses.append({
                "warehouse_id": inventory_record.warehouse_id,
                "warehouse_name": inventory_record.warehouse.name,
                "finished": inventory_record.finished,
                "shipped": inventory_record.shipped
            })

        combo_dict = {
            "id": combo.id,
            "name": combo.name,
            "sku": combo.sku,
            "warehouses": warehouses,
            "created_at": combo.created_at,
            "updated_at": combo.updated_at,
            "combo_items": [
                {
                    "id": item.id,
                    "combo_product_id": item.combo_product_id,
                    "base_product_id": item.base_product_id,
                    "quantity": item.quantity,
                    "created_at": item.created_at,
                    "base_product_name": item.base_product.name if item.base_product else None,
                    "base_product_sku": item.base_product.sku if item.base_product else None,
                    "packaging_relations": [
                        {
                            "id": rel.id,
                            "combo_product_item_id": rel.combo_product_item_id,
                            "packaging_id": rel.packaging_id,
                            "quantity": rel.quantity,
                            "created_at": rel.created_at,
                            "packaging_name": rel.packaging.name if rel.packaging else None,
                            "packaging_sku": rel.packaging.sku if rel.packaging else None,
                        }
                        for rel in item.packaging_relations
                    ] if hasattr(item, 'packaging_relations') and item.packaging_relations else []
                }
                for item in combo.combo_items
            ],
            "packaging_relations": [
                {
                    "id": rel.id,
                    "combo_product_id": rel.combo_product_id,
                    "packaging_id": rel.packaging_id,
                    "quantity": rel.quantity,
                    "created_at": rel.created_at,
                    "packaging_name": rel.packaging.name if rel.packaging else None,
                    "packaging_sku": rel.packaging.sku if rel.packaging else None,
                }
                for rel in combo.packaging_relations
            ] if hasattr(combo, 'packaging_relations') and combo.packaging_relations else []
        }
        result_list.append(combo_dict)
    
    return {
        "items": result_list,
        "total": total,
        "skip": skip,
        "limit": limit,
        "has_more": skip + limit < total
    }


@router.post("/", response_model=ComboProductSchema)
async def create_combo_product(
    combo_product_data: ComboProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """创建组合商品"""
    # 检查SKU是否已存在（包括基础商品和组合商品）
    basic_product_result = await db.execute(select(Product).where(Product.sku == combo_product_data.sku))
    combo_product_result = await db.execute(select(ComboProduct).where(ComboProduct.sku == combo_product_data.sku))
    
    if basic_product_result.scalar_one_or_none() or combo_product_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="商品SKU已存在"
        )
    
    # 验证仓库是否存在
    if not combo_product_data.warehouse_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="必须选择至少一个仓库"
        )

    for warehouse_id in combo_product_data.warehouse_ids:
        warehouse_result = await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
        if not warehouse_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"仓库ID {warehouse_id} 不存在"
            )
    
    # 验证包材关系
    if not combo_product_data.packaging_relations:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="必须配置组合商品的包材"
        )
    
    for packaging_relation in combo_product_data.packaging_relations:
        packaging_result = await db.execute(
            select(Product).where(
                and_(Product.id == packaging_relation.packaging_id, Product.sale_type == "包材")
            )
        )
        if not packaging_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"包材ID {packaging_relation.packaging_id} 不存在或非包材类型"
            )
    
    # 验证基础商品是否存在且为商品类型
    for item in combo_product_data.combo_items:
        product_result = await db.execute(
            select(Product).where(
                and_(Product.id == item.base_product_id, Product.sale_type == "商品")
            )
        )
        if not product_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"基础商品ID {item.base_product_id} 不存在或非商品类型"
            )
    
    try:
        # 创建组合商品
        combo_product_dict = combo_product_data.model_dump(exclude={"combo_items", "packaging_relations", "warehouse_ids"})
        db_combo_product = ComboProduct(**combo_product_dict)
        db.add(db_combo_product)
        await db.flush()  # 刷新以获取ID
        
        # 创建组合明细
        for item_data in combo_product_data.combo_items:
            combo_item_dict = item_data.model_dump(exclude={'packaging_relations'})
            combo_item = ComboProductItem(
                combo_product_id=db_combo_product.id,
                **combo_item_dict
            )
            db.add(combo_item)
            await db.flush()  # 获取combo_item的ID
            
            # 创建基础商品的包材关系
            if item_data.packaging_relations:
                for packaging_data in item_data.packaging_relations:
                    # 验证包材是否存在且为包材类型
                    packaging_result = await db.execute(
                        select(Product).where(
                            and_(Product.id == packaging_data.packaging_id, Product.sale_type == "包材")
                        )
                    )
                    packaging = packaging_result.scalar_one_or_none()
                    if not packaging:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"包材ID {packaging_data.packaging_id} 不存在或非包材类型"
                        )
                    
                    # 创建基础商品包材关联记录
                    item_packaging_relation = ComboItemPackagingRelation(
                        combo_product_item_id=combo_item.id,
                        packaging_id=packaging_data.packaging_id,
                        quantity=packaging_data.quantity
                    )
                    db.add(item_packaging_relation)
        
        # 创建包材关系
        if combo_product_data.packaging_relations:
            for relation_data in combo_product_data.packaging_relations:
                # 验证包材是否存在且为包材类型
                packaging_result = await db.execute(
                    select(Product).where(
                        and_(Product.id == relation_data.packaging_id, Product.sale_type == "包材")
                    )
                )
                packaging = packaging_result.scalar_one_or_none()
                if not packaging:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"包材ID {relation_data.packaging_id} 不存在或非包材类型"
                    )
                
                # 创建关联记录
                db_relation = ComboProductPackagingRelation(
                    combo_product_id=db_combo_product.id,
                    packaging_id=relation_data.packaging_id,
                    quantity=relation_data.quantity
                )
                db.add(db_relation)
        
        # 为每个选择的仓库创建库存记录
        for warehouse_id in combo_product_data.warehouse_ids:
            combo_inventory = ComboInventoryRecord(
                combo_product_id=db_combo_product.id,
                warehouse_id=warehouse_id,
                finished=0,
                shipped=0
            )
            db.add(combo_inventory)
        
        await db.commit()
        await db.refresh(db_combo_product)
        
        # 重新查询获取完整信息
        result = await db.execute(
            select(ComboProduct)
            .options(
                selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.base_product),
                selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.packaging_relations).selectinload(ComboItemPackagingRelation.packaging),
                selectinload(ComboProduct.packaging_relations).selectinload(ComboProductPackagingRelation.packaging),
                selectinload(ComboProduct.inventory_records).selectinload(ComboInventoryRecord.warehouse)
            )
            .where(ComboProduct.id == db_combo_product.id)
        )
        combo_product = result.scalar_one()

        # 构建仓库信息
        warehouses = []
        for inventory_record in combo_product.inventory_records:
            warehouses.append({
                "warehouse_id": inventory_record.warehouse_id,
                "warehouse_name": inventory_record.warehouse.name,
                "finished": inventory_record.finished,
                "shipped": inventory_record.shipped
            })

        # 构建返回数据
        return {
            "id": combo_product.id,
            "name": combo_product.name,
            "sku": combo_product.sku,
            "warehouses": warehouses,
            "created_at": combo_product.created_at,
            "updated_at": combo_product.updated_at,
            "combo_items": [
                {
                    "id": item.id,
                    "combo_product_id": item.combo_product_id,
                    "base_product_id": item.base_product_id,
                    "quantity": item.quantity,
                    "created_at": item.created_at,
                    "base_product_name": item.base_product.name,
                    "base_product_sku": item.base_product.sku,
                    "packaging_relations": [
                        {
                            "id": rel.id,
                            "combo_product_item_id": rel.combo_product_item_id,
                            "packaging_id": rel.packaging_id,
                            "quantity": rel.quantity,
                            "created_at": rel.created_at,
                            "packaging_name": rel.packaging.name if rel.packaging else None,
                            "packaging_sku": rel.packaging.sku if rel.packaging else None,
                        }
                        for rel in item.packaging_relations
                    ] if hasattr(item, 'packaging_relations') and item.packaging_relations else []
                }
                for item in combo_product.combo_items
            ],
            "packaging_relations": [
                {
                    "id": rel.id,
                    "combo_product_id": rel.combo_product_id,
                    "packaging_id": rel.packaging_id,
                    "quantity": rel.quantity,
                    "created_at": rel.created_at,
                    "packaging_name": rel.packaging.name if rel.packaging else None,
                    "packaging_sku": rel.packaging.sku if rel.packaging else None,
                }
                for rel in combo_product.packaging_relations
            ] if hasattr(combo_product, 'packaging_relations') and combo_product.packaging_relations else []
        }
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"创建组合商品失败: {str(e)}"
        )


@router.get("/{combo_product_id}", response_model=ComboProductSchema)
async def get_combo_product(
    combo_product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取组合商品详情"""
    result = await db.execute(
        select(ComboProduct)
        .options(
            selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.base_product),
            selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.packaging_relations).selectinload(ComboItemPackagingRelation.packaging),
            selectinload(ComboProduct.packaging_relations).selectinload(ComboProductPackagingRelation.packaging),
            selectinload(ComboProduct.inventory_records).selectinload(ComboInventoryRecord.warehouse)
        )
        .where(ComboProduct.id == combo_product_id)
    )
    combo_product = result.scalar_one_or_none()
    
    if not combo_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="组合商品不存在"
        )
    
    # 构建仓库信息
    warehouses = []
    for inventory_record in combo_product.inventory_records:
        warehouses.append({
            "warehouse_id": inventory_record.warehouse_id,
            "warehouse_name": inventory_record.warehouse.name,
            "finished": inventory_record.finished,
            "shipped": inventory_record.shipped
        })

    # 构建返回数据
    return {
        "id": combo_product.id,
        "name": combo_product.name,
        "sku": combo_product.sku,
        "warehouses": warehouses,
        "created_at": combo_product.created_at,
        "updated_at": combo_product.updated_at,
        "combo_items": [
            {
                "id": item.id,
                "combo_product_id": item.combo_product_id,
                "base_product_id": item.base_product_id,
                "quantity": item.quantity,
                "created_at": item.created_at,
                "base_product_name": item.base_product.name,
                "base_product_sku": item.base_product.sku,
                "packaging_relations": [
                    {
                        "id": rel.id,
                        "combo_product_item_id": rel.combo_product_item_id,
                        "packaging_id": rel.packaging_id,
                        "quantity": rel.quantity,
                        "created_at": rel.created_at,
                        "packaging_name": rel.packaging.name if rel.packaging else None,
                        "packaging_sku": rel.packaging.sku if rel.packaging else None,
                    }
                    for rel in item.packaging_relations
                ] if hasattr(item, 'packaging_relations') and item.packaging_relations else []
            }
            for item in combo_product.combo_items
        ],
        "packaging_relations": [
            {
                "id": rel.id,
                "combo_product_id": rel.combo_product_id,
                "packaging_id": rel.packaging_id,
                "quantity": rel.quantity,
                "created_at": rel.created_at,
                "packaging_name": rel.packaging.name if rel.packaging else None,
                "packaging_sku": rel.packaging.sku if rel.packaging else None,
            }
            for rel in combo_product.packaging_relations
        ] if hasattr(combo_product, 'packaging_relations') and combo_product.packaging_relations else []
    }


@router.put("/{combo_product_id}", response_model=ComboProductSchema)
async def update_combo_product(
    combo_product_id: int,
    combo_product_data: ComboProductUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """更新组合商品"""
    # 获取组合商品
    result = await db.execute(
        select(ComboProduct)
        .options(selectinload(ComboProduct.combo_items))
        .where(ComboProduct.id == combo_product_id)
    )
    db_combo_product = result.scalar_one_or_none()
    
    if not db_combo_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="组合商品不存在"
        )
    
    try:
        # 更新基本信息
        update_data = combo_product_data.model_dump(exclude_unset=True, exclude={"combo_items", "packaging_relations", "warehouse_ids"})
        for field, value in update_data.items():
            setattr(db_combo_product, field, value)

        # 处理仓库变更
        if combo_product_data.warehouse_ids is not None:
            # 获取当前的库存记录
            current_inventories = await db.execute(
                select(ComboInventoryRecord).where(
                    ComboInventoryRecord.combo_product_id == combo_product_id
                )
            )
            current_inventory_dict = {
                inv.warehouse_id: inv for inv in current_inventories.scalars().all()
            }

            current_warehouse_ids = set(current_inventory_dict.keys())
            new_warehouse_ids = set(combo_product_data.warehouse_ids)

            # 要移除的仓库
            warehouses_to_remove = current_warehouse_ids - new_warehouse_ids
            # 要添加的仓库
            warehouses_to_add = new_warehouse_ids - current_warehouse_ids

            # 检查要移除的仓库是否有库存
            for warehouse_id in warehouses_to_remove:
                inventory = current_inventory_dict[warehouse_id]
                if inventory.finished > 0 or inventory.shipped > 0:
                    warehouse_name_result = await db.execute(
                        select(Warehouse.name).where(Warehouse.id == warehouse_id)
                    )
                    warehouse_name = warehouse_name_result.scalar_one_or_none()
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"仓库 '{warehouse_name}' 还有库存（成品：{inventory.finished}，出库：{inventory.shipped}），无法移除"
                    )

            # 删除要移除的仓库库存记录（已确认无库存）
            for warehouse_id in warehouses_to_remove:
                inventory = current_inventory_dict[warehouse_id]
                await db.delete(inventory)

            # 验证要添加的仓库是否存在
            for warehouse_id in warehouses_to_add:
                warehouse_result = await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
                if not warehouse_result.scalar_one_or_none():
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"仓库ID {warehouse_id} 不存在"
                    )

            # 为新增的仓库创建库存记录
            for warehouse_id in warehouses_to_add:
                new_inventory = ComboInventoryRecord(
                    combo_product_id=combo_product_id,
                    warehouse_id=warehouse_id,
                    finished=0,
                    shipped=0
                )
                db.add(new_inventory)
        
        # 如果需要更新组合明细
        if combo_product_data.combo_items is not None:
            # 删除旧的组合明细
            for old_item in db_combo_product.combo_items:
                await db.delete(old_item)
            
            # 创建新的组合明细
            for item_data in combo_product_data.combo_items:
                # 验证基础商品存在
                product_result = await db.execute(
                    select(Product).where(
                        and_(Product.id == item_data.base_product_id, Product.sale_type == "商品")
                    )
                )
                if not product_result.scalar_one_or_none():
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"基础商品ID {item_data.base_product_id} 不存在或非商品类型"
                    )
                
                combo_item_dict = item_data.model_dump(exclude={'packaging_relations'})
                combo_item = ComboProductItem(
                    combo_product_id=combo_product_id,
                    **combo_item_dict
                )
                db.add(combo_item)
                await db.flush()  # 获取combo_item的ID
                
                # 创建基础商品的包材关系
                if item_data.packaging_relations:
                    for packaging_data in item_data.packaging_relations:
                        # 验证包材是否存在且为包材类型
                        packaging_result = await db.execute(
                            select(Product).where(
                                and_(Product.id == packaging_data.packaging_id, Product.sale_type == "包材")
                            )
                        )
                        packaging = packaging_result.scalar_one_or_none()
                        if not packaging:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"包材ID {packaging_data.packaging_id} 不存在或非包材类型"
                            )
                        
                        # 创建基础商品包材关联记录
                        item_packaging_relation = ComboItemPackagingRelation(
                            combo_product_item_id=combo_item.id,
                            packaging_id=packaging_data.packaging_id,
                            quantity=packaging_data.quantity
                        )
                        db.add(item_packaging_relation)
        
        # 如果需要更新包材关系
        if combo_product_data.packaging_relations is not None:
            # 删除现有的包材关系
            existing_relations = await db.execute(
                select(ComboProductPackagingRelation).where(
                    ComboProductPackagingRelation.combo_product_id == combo_product_id
                )
            )
            for relation in existing_relations.scalars().all():
                await db.delete(relation)
            
            # 创建新的包材关系
            for relation_data in combo_product_data.packaging_relations:
                # 验证包材是否存在且为包材类型
                packaging_result = await db.execute(
                    select(Product).where(
                        and_(Product.id == relation_data.packaging_id, Product.sale_type == "包材")
                    )
                )
                packaging = packaging_result.scalar_one_or_none()
                if not packaging:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"包材ID {relation_data.packaging_id} 不存在或非包材类型"
                    )
                
                # 创建关联记录
                db_relation = ComboProductPackagingRelation(
                    combo_product_id=combo_product_id,
                    packaging_id=relation_data.packaging_id,
                    quantity=relation_data.quantity
                )
                db.add(db_relation)
        
        await db.commit()
        await db.refresh(db_combo_product)
        
        # 重新查询获取完整信息
        result = await db.execute(
            select(ComboProduct)
            .options(
                selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.base_product),
                selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.packaging_relations).selectinload(ComboItemPackagingRelation.packaging),
                selectinload(ComboProduct.packaging_relations).selectinload(ComboProductPackagingRelation.packaging),
                selectinload(ComboProduct.inventory_records).selectinload(ComboInventoryRecord.warehouse)
            )
            .where(ComboProduct.id == combo_product_id)
        )
        combo_product = result.scalar_one()

        # 构建仓库信息
        warehouses = []
        for inventory_record in combo_product.inventory_records:
            warehouses.append({
                "warehouse_id": inventory_record.warehouse_id,
                "warehouse_name": inventory_record.warehouse.name,
                "finished": inventory_record.finished,
                "shipped": inventory_record.shipped
            })

        # 构建返回数据
        return {
            "id": combo_product.id,
            "name": combo_product.name,
            "sku": combo_product.sku,
            "warehouses": warehouses,
            "created_at": combo_product.created_at,
            "updated_at": combo_product.updated_at,
            "combo_items": [
                {
                    "id": item.id,
                    "combo_product_id": item.combo_product_id,
                    "base_product_id": item.base_product_id,
                    "quantity": item.quantity,
                    "created_at": item.created_at,
                    "base_product_name": item.base_product.name,
                    "base_product_sku": item.base_product.sku,
                    "packaging_relations": [
                        {
                            "id": rel.id,
                            "combo_product_item_id": rel.combo_product_item_id,
                            "packaging_id": rel.packaging_id,
                            "quantity": rel.quantity,
                            "created_at": rel.created_at,
                            "packaging_name": rel.packaging.name if rel.packaging else None,
                            "packaging_sku": rel.packaging.sku if rel.packaging else None,
                        }
                        for rel in item.packaging_relations
                    ] if hasattr(item, 'packaging_relations') and item.packaging_relations else []
                }
                for item in combo_product.combo_items
            ],
            "packaging_relations": [
                {
                    "id": rel.id,
                    "combo_product_id": rel.combo_product_id,
                    "packaging_id": rel.packaging_id,
                    "quantity": rel.quantity,
                    "created_at": rel.created_at,
                    "packaging_name": rel.packaging.name if rel.packaging else None,
                    "packaging_sku": rel.packaging.sku if rel.packaging else None,
                }
                for rel in combo_product.packaging_relations
            ] if hasattr(combo_product, 'packaging_relations') and combo_product.packaging_relations else []
        }
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新组合商品失败: {str(e)}"
        )


@router.delete("/{combo_product_id}")
async def delete_combo_product(
    combo_product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """删除组合商品"""
    result = await db.execute(select(ComboProduct).where(ComboProduct.id == combo_product_id))
    db_combo_product = result.scalar_one_or_none()
    
    if not db_combo_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="组合商品不存在"
        )
    
    # 检查是否有库存
    inventory_result = await db.execute(
        select(ComboInventoryRecord).where(
            and_(
                ComboInventoryRecord.combo_product_id == combo_product_id,
                ComboInventoryRecord.finished > 0
            )
        )
    )
    if inventory_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该组合商品还有库存，无法删除"
        )
    
    await db.delete(db_combo_product)
    await db.commit()
    
    return {"message": "组合商品删除成功"}


@router.get("/inventory/summary", response_model=List[ComboInventorySummary])
async def get_combo_inventory_summary(
    warehouse_id: int = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取组合商品库存汇总"""
    query = select(ComboInventoryRecord).options(
        selectinload(ComboInventoryRecord.combo_product).selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.base_product),
        selectinload(ComboInventoryRecord.warehouse)
    )
    
    if warehouse_id:
        query = query.where(ComboInventoryRecord.warehouse_id == warehouse_id)
    
    result = await db.execute(query)
    combo_inventory_records = result.scalars().all()
    
    result_list = []
    for record in combo_inventory_records:
        # 计算可组合数量
        available_to_assemble = await calculate_available_to_assemble(
            record.combo_product, record.warehouse_id, db
        )
        
        combo_summary = {
            "combo_product_id": record.combo_product.id,
            "combo_product_name": record.combo_product.name,
            "combo_product_sku": record.combo_product.sku,
            "warehouse_id": record.warehouse_id,
            "warehouse_name": record.warehouse.name,
            "finished": record.finished,
            "shipped": record.shipped,
            "available_to_assemble": available_to_assemble,
            "combo_items": [
                {
                    "id": item.id,
                    "combo_product_id": item.combo_product_id,
                    "base_product_id": item.base_product_id,
                    "quantity": item.quantity,
                    "created_at": item.created_at,
                    "base_product_name": item.base_product.name,
                    "base_product_sku": item.base_product.sku,
                }
                for item in record.combo_product.combo_items
            ]
        }
        result_list.append(combo_summary)
    
    return result_list


@router.post("/assemble", response_model=dict)
async def assemble_combo_product(
    request: ComboProductAssembleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """组装组合商品"""
    # 获取组合商品信息
    combo_result = await db.execute(
        select(ComboProduct)
        .options(
            selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.base_product),
            selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.packaging_relations).selectinload(ComboItemPackagingRelation.packaging),
            selectinload(ComboProduct.packaging_relations).selectinload(ComboProductPackagingRelation.packaging)
        )
        .where(ComboProduct.id == request.combo_product_id)
    )
    combo_product = combo_result.scalar_one_or_none()
    
    if not combo_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="组合商品不存在"
        )
    
    # 计算可组合数量
    available_to_assemble = await calculate_available_to_assemble(
        combo_product, request.warehouse_id, db
    )
    
    if request.quantity > available_to_assemble:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"可组合数量不足，最多可组合 {available_to_assemble} 件"
        )
    
    try:
        # 1. 扣减基础商品的半成品库存和基础商品的包材
        for item in combo_product.combo_items:
            needed_quantity = item.quantity * request.quantity
            
            # 获取基础商品库存
            inventory_result = await db.execute(
                select(InventoryRecord).where(
                    and_(
                        InventoryRecord.product_id == item.base_product_id,
                        InventoryRecord.warehouse_id == request.warehouse_id
                    )
                )
            )
            base_inventory = inventory_result.scalar_one_or_none()
            
            if not base_inventory or base_inventory.semi_finished < needed_quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"基础商品 {item.base_product.name} 半成品库存不足"
                )
            
            # 扣减基础商品半成品库存
            base_inventory.semi_finished -= needed_quantity
            
            # 扣减基础商品在此组合中配置的包材
            if item.packaging_relations:
                for packaging_relation in item.packaging_relations:
                    packaging_needed = packaging_relation.quantity * needed_quantity
                    
                    # 获取包材库存
                    packaging_inventory_result = await db.execute(
                        select(InventoryRecord).where(
                            and_(
                                InventoryRecord.product_id == packaging_relation.packaging_id,
                                InventoryRecord.warehouse_id == request.warehouse_id
                            )
                        )
                    )
                    packaging_inventory = packaging_inventory_result.scalar_one_or_none()
                    
                    if not packaging_inventory or packaging_inventory.semi_finished < packaging_needed:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"基础商品 {item.base_product.name} 的包材 {packaging_relation.packaging.name} 半成品库存不足，需要 {packaging_needed}，现有 {packaging_inventory.semi_finished if packaging_inventory else 0}"
                        )
                    
                    # 扣减包材库存
                    packaging_inventory.semi_finished -= packaging_needed
        
        # 2. 扣减组合商品本身的包材半成品库存
        # 优先使用新的多包材关系
        if combo_product.packaging_relations:
            for packaging_relation in combo_product.packaging_relations:
                packaging_needed = packaging_relation.quantity * request.quantity
                
                # 获取包材库存
                packaging_inventory_result = await db.execute(
                    select(InventoryRecord).where(
                        and_(
                            InventoryRecord.product_id == packaging_relation.packaging_id,
                            InventoryRecord.warehouse_id == request.warehouse_id
                        )
                    )
                )
                packaging_inventory = packaging_inventory_result.scalar_one_or_none()
                
                if not packaging_inventory or packaging_inventory.semi_finished < packaging_needed:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"组合商品包材 {packaging_relation.packaging.name} 半成品库存不足，需要 {packaging_needed}，现有 {packaging_inventory.semi_finished if packaging_inventory else 0}"
                    )
                
                # 扣减包材半成品库存
                packaging_inventory.semi_finished -= packaging_needed
        
        # 3. 增加组合商品成品库存
        combo_inventory_result = await db.execute(
            select(ComboInventoryRecord).where(
                and_(
                    ComboInventoryRecord.combo_product_id == request.combo_product_id,
                    ComboInventoryRecord.warehouse_id == request.warehouse_id
                )
            )
        )
        combo_inventory = combo_inventory_result.scalar_one_or_none()
        
        if not combo_inventory:
            combo_inventory = ComboInventoryRecord(
                combo_product_id=request.combo_product_id,
                warehouse_id=request.warehouse_id,
                finished=0,
                shipped=0
            )
            db.add(combo_inventory)
        
        combo_inventory.finished += request.quantity
        
        # 记录库存变动
        transaction = ComboInventoryTransaction(
            combo_product_id=request.combo_product_id,
            warehouse_id=request.warehouse_id,
            transaction_type="组装",
            quantity=request.quantity,
            notes=request.notes
        )
        db.add(transaction)
        
        await db.commit()
        
        return {
            "message": f"成功组装 {request.quantity} 件组合商品",
            "combo_product_name": combo_product.name,
            "quantity": request.quantity
        }
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"组装失败: {str(e)}"
        )


@router.post("/ship", response_model=dict)
async def ship_combo_product(
    request: ComboProductShipRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """组合商品出库"""
    # 获取组合商品库存
    combo_inventory_result = await db.execute(
        select(ComboInventoryRecord)
        .options(selectinload(ComboInventoryRecord.combo_product))
        .where(
            and_(
                ComboInventoryRecord.combo_product_id == request.combo_product_id,
                ComboInventoryRecord.warehouse_id == request.warehouse_id
            )
        )
    )
    combo_inventory = combo_inventory_result.scalar_one_or_none()
    
    if not combo_inventory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="组合商品库存记录不存在"
        )
    
    if combo_inventory.finished < request.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"成品库存不足，当前库存：{combo_inventory.finished}"
        )
    
    try:
        # 更新库存
        combo_inventory.finished -= request.quantity
        combo_inventory.shipped += request.quantity
        
        # 记录库存变动
        transaction = ComboInventoryTransaction(
            combo_product_id=request.combo_product_id,
            warehouse_id=request.warehouse_id,
            transaction_type="出库",
            quantity=request.quantity,
            notes=request.notes
        )
        db.add(transaction)
        
        await db.commit()
        
        return {
            "message": f"成功出库 {request.quantity} 件组合商品",
            "combo_product_name": combo_inventory.combo_product.name,
            "quantity": request.quantity
        }
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"出库失败: {str(e)}"
        )


async def calculate_available_to_assemble(combo_product: ComboProduct, warehouse_id: int, db: AsyncSession) -> int:
    """计算可组合数量（基于基础商品半成品库存 + 基础商品包材 + 组合商品包材半成品库存计算）"""
    if not combo_product.combo_items:
        return 0
    
    min_available = float('inf')
    
    # 1. 检查基础商品的半成品库存限制
    for item in combo_product.combo_items:
        # 获取基础商品库存
        inventory_result = await db.execute(
            select(InventoryRecord).where(
                and_(
                    InventoryRecord.product_id == item.base_product_id,
                    InventoryRecord.warehouse_id == warehouse_id
                )
            )
        )
        base_inventory = inventory_result.scalar_one_or_none()
        
        if not base_inventory:
            return 0
        
        # 计算这个基础商品的半成品可以支持多少个组合商品
        available_for_this_item = base_inventory.semi_finished // item.quantity
        min_available = min(min_available, available_for_this_item)
        
        # 检查基础商品在此组合中配置的包材限制
        if hasattr(item, 'packaging_relations') and item.packaging_relations:
            for packaging_relation in item.packaging_relations:
                packaging_inventory_result = await db.execute(
                    select(InventoryRecord).where(
                        and_(
                            InventoryRecord.product_id == packaging_relation.packaging_id,
                            InventoryRecord.warehouse_id == warehouse_id
                        )
                    )
                )
                packaging_inventory = packaging_inventory_result.scalar_one_or_none()
                
                if not packaging_inventory:
                    return 0
                
                # 计算这个包材可以支持多少个基础商品
                base_product_quantity_from_packaging = packaging_inventory.semi_finished // packaging_relation.quantity
                # 再计算这些基础商品可以支持多少个组合商品
                available_from_packaging = base_product_quantity_from_packaging // item.quantity
                min_available = min(min_available, available_from_packaging)
    
    # 2. 检查组合商品本身的包材半成品库存限制
    # 优先使用新的多包材关系
    if combo_product.packaging_relations:
        for packaging_relation in combo_product.packaging_relations:
            packaging_inventory_result = await db.execute(
                select(InventoryRecord).where(
                    and_(
                        InventoryRecord.product_id == packaging_relation.packaging_id,
                        InventoryRecord.warehouse_id == warehouse_id
                    )
                )
            )
            packaging_inventory = packaging_inventory_result.scalar_one_or_none()
            
            if not packaging_inventory:
                return 0
            
            # 计算这个包材可以支持多少个组合商品
            available_from_combo_packaging = packaging_inventory.semi_finished // packaging_relation.quantity
            min_available = min(min_available, available_from_combo_packaging)
    
    return int(min_available) if min_available != float('inf') else 0
