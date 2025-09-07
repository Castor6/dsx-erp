from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.combo_product import ComboProduct, ComboProductItem, ComboInventoryRecord, ComboInventoryTransaction
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
        selectinload(ComboProduct.warehouse),
        selectinload(ComboProduct.packaging),
        selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.base_product)
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
    
    # 仓库筛选
    if warehouse_id:
        query = query.where(ComboProduct.warehouse_id == warehouse_id)
    
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
        count_query = count_query.where(ComboProduct.warehouse_id == warehouse_id)
    
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 分页查询
    query = query.offset(skip).limit(limit).order_by(ComboProduct.created_at.desc())
    result = await db.execute(query)
    combo_products = result.scalars().all()
    
    # 转换数据，添加关联信息
    result_list = []
    for combo in combo_products:
        combo_dict = {
            "id": combo.id,
            "name": combo.name,
            "sku": combo.sku,
            "warehouse_id": combo.warehouse_id,
            "warehouse_name": combo.warehouse.name if combo.warehouse else None,
            "packaging_id": combo.packaging_id,
            "packaging_name": combo.packaging.name if combo.packaging else None,
            "packaging_sku": combo.packaging.sku if combo.packaging else None,
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
                }
                for item in combo.combo_items
            ]
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
    warehouse_result = await db.execute(select(Warehouse).where(Warehouse.id == combo_product_data.warehouse_id))
    if not warehouse_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="仓库不存在"
        )
    
    # 验证包材是否存在且为包材类型
    packaging_result = await db.execute(
        select(Product).where(
            and_(Product.id == combo_product_data.packaging_id, Product.sale_type == "包材")
        )
    )
    if not packaging_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="包材不存在或非包材类型"
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
        combo_product_dict = combo_product_data.model_dump(exclude={"combo_items"})
        db_combo_product = ComboProduct(**combo_product_dict)
        db.add(db_combo_product)
        await db.flush()  # 刷新以获取ID
        
        # 创建组合明细
        for item_data in combo_product_data.combo_items:
            combo_item = ComboProductItem(
                combo_product_id=db_combo_product.id,
                **item_data.model_dump()
            )
            db.add(combo_item)
        
        # 创建库存记录
        combo_inventory = ComboInventoryRecord(
            combo_product_id=db_combo_product.id,
            warehouse_id=combo_product_data.warehouse_id
        )
        db.add(combo_inventory)
        
        await db.commit()
        await db.refresh(db_combo_product)
        
        # 重新查询获取完整信息
        result = await db.execute(
            select(ComboProduct)
            .options(
                selectinload(ComboProduct.warehouse),
                selectinload(ComboProduct.packaging),
                selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.base_product)
            )
            .where(ComboProduct.id == db_combo_product.id)
        )
        combo_product = result.scalar_one()
        
        # 构建返回数据
        return {
            "id": combo_product.id,
            "name": combo_product.name,
            "sku": combo_product.sku,
            "warehouse_id": combo_product.warehouse_id,
            "warehouse_name": combo_product.warehouse.name,
            "packaging_id": combo_product.packaging_id,
            "packaging_name": combo_product.packaging.name,
            "packaging_sku": combo_product.packaging.sku,
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
                }
                for item in combo_product.combo_items
            ]
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
            selectinload(ComboProduct.warehouse),
            selectinload(ComboProduct.packaging),
            selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.base_product)
        )
        .where(ComboProduct.id == combo_product_id)
    )
    combo_product = result.scalar_one_or_none()
    
    if not combo_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="组合商品不存在"
        )
    
    # 构建返回数据
    return {
        "id": combo_product.id,
        "name": combo_product.name,
        "sku": combo_product.sku,
        "warehouse_id": combo_product.warehouse_id,
        "warehouse_name": combo_product.warehouse.name,
        "packaging_id": combo_product.packaging_id,
        "packaging_name": combo_product.packaging.name,
        "packaging_sku": combo_product.packaging.sku,
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
            }
            for item in combo_product.combo_items
        ]
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
        update_data = combo_product_data.model_dump(exclude_unset=True, exclude={"combo_items"})
        for field, value in update_data.items():
            setattr(db_combo_product, field, value)
        
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
                
                combo_item = ComboProductItem(
                    combo_product_id=combo_product_id,
                    **item_data.model_dump()
                )
                db.add(combo_item)
        
        await db.commit()
        await db.refresh(db_combo_product)
        
        # 重新查询获取完整信息
        result = await db.execute(
            select(ComboProduct)
            .options(
                selectinload(ComboProduct.warehouse),
                selectinload(ComboProduct.packaging),
                selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.base_product)
            )
            .where(ComboProduct.id == combo_product_id)
        )
        combo_product = result.scalar_one()
        
        # 构建返回数据
        return {
            "id": combo_product.id,
            "name": combo_product.name,
            "sku": combo_product.sku,
            "warehouse_id": combo_product.warehouse_id,
            "warehouse_name": combo_product.warehouse.name,
            "packaging_id": combo_product.packaging_id,
            "packaging_name": combo_product.packaging.name,
            "packaging_sku": combo_product.packaging.sku,
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
                }
                for item in combo_product.combo_items
            ]
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
        .options(selectinload(ComboProduct.combo_items).selectinload(ComboProductItem.base_product))
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
        combo_product, combo_product.warehouse_id, db
    )
    
    if request.quantity > available_to_assemble:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"可组合数量不足，最多可组合 {available_to_assemble} 件"
        )
    
    try:
        # 1. 扣减基础商品的半成品库存
        for item in combo_product.combo_items:
            needed_quantity = item.quantity * request.quantity
            
            # 获取基础商品库存
            inventory_result = await db.execute(
                select(InventoryRecord).where(
                    and_(
                        InventoryRecord.product_id == item.base_product_id,
                        InventoryRecord.warehouse_id == combo_product.warehouse_id
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
        
        # 2. 扣减组合商品包材的半成品库存
        packaging_inventory_result = await db.execute(
            select(InventoryRecord).where(
                and_(
                    InventoryRecord.product_id == combo_product.packaging_id,
                    InventoryRecord.warehouse_id == combo_product.warehouse_id
                )
            )
        )
        packaging_inventory = packaging_inventory_result.scalar_one_or_none()
        
        if not packaging_inventory or packaging_inventory.semi_finished < request.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="组合商品包材半成品库存不足"
            )
        
        # 扣减包材半成品库存
        packaging_inventory.semi_finished -= request.quantity
        
        # 3. 增加组合商品成品库存
        combo_inventory_result = await db.execute(
            select(ComboInventoryRecord).where(
                and_(
                    ComboInventoryRecord.combo_product_id == request.combo_product_id,
                    ComboInventoryRecord.warehouse_id == combo_product.warehouse_id
                )
            )
        )
        combo_inventory = combo_inventory_result.scalar_one_or_none()
        
        if not combo_inventory:
            combo_inventory = ComboInventoryRecord(
                combo_product_id=request.combo_product_id,
                warehouse_id=combo_product.warehouse_id
            )
            db.add(combo_inventory)
        
        combo_inventory.finished += request.quantity
        
        # 记录库存变动
        transaction = ComboInventoryTransaction(
            combo_product_id=request.combo_product_id,
            warehouse_id=combo_product.warehouse_id,
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
        .where(ComboInventoryRecord.combo_product_id == request.combo_product_id)
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
            warehouse_id=combo_inventory.warehouse_id,
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
    """计算可组合数量（基于基础商品半成品库存 + 组合商品包材半成品库存计算）"""
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
    
    # 2. 检查组合商品包材的半成品库存限制
    packaging_inventory_result = await db.execute(
        select(InventoryRecord).where(
            and_(
                InventoryRecord.product_id == combo_product.packaging_id,
                InventoryRecord.warehouse_id == warehouse_id
            )
        )
    )
    packaging_inventory = packaging_inventory_result.scalar_one_or_none()
    
    if not packaging_inventory:
        return 0
    
    # 包材库存限制组合数量（每个组合商品需要1个包材）
    min_available = min(min_available, packaging_inventory.semi_finished)
    
    return int(min_available) if min_available != float('inf') else 0
