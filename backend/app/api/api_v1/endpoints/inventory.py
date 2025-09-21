from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.user import User
from app.models.inventory import InventoryRecord, InventoryTransaction, InventoryStatus
from app.models.product import Product, SaleType
from app.models.packaging_relation import ProductPackagingRelation, ComboProductPackagingRelation, ComboItemPackagingRelation
from app.models.warehouse import Warehouse
from app.models.combo_product import ComboProduct, ComboProductItem, ComboInventoryRecord, ComboInventoryTransaction
from app.schemas.inventory import (
    InventoryRecord as InventoryRecordSchema,
    InventoryRecordWithDetails,
    InventoryTransaction as InventoryTransactionSchema,
    InventoryTransactionWithDetails,
    InventoryTransactionCreate,
    PackagingRequest,
    ShippingRequest,
    InventorySummary
)
from app.schemas.combo_product import (
    ComboInventoryRecord as ComboInventoryRecordSchema,
    ComboInventorySummary,
    ComboProductAssembleRequest,
    ComboProductShipRequest
)

router = APIRouter()


# 分页响应模型
class PaginatedInventoryResponse(BaseModel):
    """分页库存记录响应"""
    items: List[InventoryRecordWithDetails]
    total: int
    page: int
    size: int
    pages: int


class PaginatedComboInventoryResponse(BaseModel):
    """分页组合商品库存记录响应"""
    items: List[ComboInventoryRecordSchema]
    total: int
    page: int
    size: int
    pages: int


@router.get("/records", response_model=PaginatedInventoryResponse)
async def get_inventory_records(
    warehouse_id: Optional[int] = Query(None, description="仓库ID"),
    search: Optional[str] = Query(None, description="搜索关键字（商品名称或SKU）"),
    sale_type: Optional[str] = Query(None, description="商品类型（商品或包材）"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(10, ge=1, le=100, description="每页数量"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取基础商品库存记录列表（支持搜索和分页）"""
    query = select(InventoryRecord).options(
        selectinload(InventoryRecord.product),
        selectinload(InventoryRecord.warehouse)
    ).join(Product)
    
    # 筛选条件
    if warehouse_id:
        query = query.where(InventoryRecord.warehouse_id == warehouse_id)
    
    if search:
        query = query.where(
            or_(
                Product.name.contains(search),
                Product.sku.contains(search)
            )
        )
    
    if sale_type:
        query = query.where(Product.sale_type == sale_type)
    
    # 计算总数
    count_query = select(func.count()).select_from(
        query.subquery()
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 按更新时间倒序排序
    query = query.order_by(InventoryRecord.updated_at.desc())
    
    # 分页
    offset = (page - 1) * size
    query = query.offset(offset).limit(size)
    
    result = await db.execute(query)
    records = result.scalars().all()
    
    pages = (total + size - 1) // size
    
    return PaginatedInventoryResponse(
        items=records,
        total=total,
        page=page,
        size=size,
        pages=pages
    )


@router.get("/records/{warehouse_id}", response_model=List[InventoryRecordWithDetails])
async def get_warehouse_inventory(
    warehouse_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取指定仓库的库存清单"""
    result = await db.execute(
        select(InventoryRecord)
        .options(
            selectinload(InventoryRecord.product),
            selectinload(InventoryRecord.warehouse)
        )
        .where(InventoryRecord.warehouse_id == warehouse_id)
        .order_by(InventoryRecord.updated_at.desc())
    )
    records = result.scalars().all()
    return records


@router.get("/summary", response_model=List[InventorySummary])
async def get_inventory_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取各仓库库存汇总（包含基础商品和组合商品）"""
    # 基础商品统计
    base_result = await db.execute(
        select(
            Warehouse.id.label("warehouse_id"),
            Warehouse.name.label("warehouse_name"),
            func.count(InventoryRecord.product_id).label("total_products"),
            func.sum(InventoryRecord.in_transit).label("total_in_transit"),
            func.sum(InventoryRecord.semi_finished).label("total_semi_finished"),
            func.sum(InventoryRecord.finished).label("total_finished"),
            func.sum(InventoryRecord.shipped).label("total_shipped")
        )
        .select_from(Warehouse)
        .outerjoin(InventoryRecord, Warehouse.id == InventoryRecord.warehouse_id)
        .group_by(Warehouse.id, Warehouse.name)
    )

    # 组合商品统计
    combo_result = await db.execute(
        select(
            Warehouse.id.label("warehouse_id"),
            func.count(ComboInventoryRecord.combo_product_id).label("total_combo_products"),
            func.sum(ComboInventoryRecord.finished).label("total_combo_finished"),
            func.sum(ComboInventoryRecord.shipped).label("total_combo_shipped")
        )
        .select_from(Warehouse)
        .outerjoin(ComboInventoryRecord, Warehouse.id == ComboInventoryRecord.warehouse_id)
        .group_by(Warehouse.id)
    )

    # 将组合商品统计转换为字典以便查找
    combo_stats = {row.warehouse_id: row for row in combo_result}

    summaries = []
    for row in base_result:
        combo_row = combo_stats.get(row.warehouse_id)
        summaries.append(InventorySummary(
            warehouse_id=row.warehouse_id,
            warehouse_name=row.warehouse_name,
            total_products=row.total_products or 0,
            total_in_transit=row.total_in_transit or 0,
            total_semi_finished=row.total_semi_finished or 0,
            total_finished=row.total_finished or 0,
            total_shipped=row.total_shipped or 0,
            total_combo_products=combo_row.total_combo_products or 0 if combo_row else 0,
            total_combo_finished=combo_row.total_combo_finished or 0 if combo_row else 0,
            total_combo_shipped=combo_row.total_combo_shipped or 0 if combo_row else 0
        ))

    return summaries


@router.post("/package")
async def package_products(
    request: PackagingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """商品打包（半成品转成品）"""
    # 获取商品信息
    result = await db.execute(
        select(Product).where(Product.id == request.product_id)
    )
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="商品不存在"
        )
    
    # 检查是否是商品类型（需要消耗包材）
    if product.sale_type == SaleType.PRODUCT:
        # 先查询商品的包材关系
        packaging_relations_result = await db.execute(
            select(ProductPackagingRelation)
            .options(selectinload(ProductPackagingRelation.packaging))
            .where(ProductPackagingRelation.product_id == product.id)
        )
        packaging_relations = packaging_relations_result.scalars().all()
        
        # 如果有新的包材关系，使用新的多包材逻辑
        if packaging_relations:
            for relation in packaging_relations:
                needed_quantity = relation.quantity * request.quantity
                
                # 检查包材库存
                packaging_result = await db.execute(
                    select(InventoryRecord).where(
                        InventoryRecord.product_id == relation.packaging_id,
                        InventoryRecord.warehouse_id == request.warehouse_id
                    )
                )
                packaging_inventory = packaging_result.scalar_one_or_none()
                
                if not packaging_inventory or packaging_inventory.semi_finished < needed_quantity:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"包材 {relation.packaging.name} 半成品库存不足，需要 {needed_quantity}，现有 {packaging_inventory.semi_finished if packaging_inventory else 0}"
                    )
                
                # 消耗包材半成品
                packaging_inventory.semi_finished -= needed_quantity
                
                # 记录包材消耗
                await _create_inventory_transaction(
                    db,
                    product_id=relation.packaging_id,
                    warehouse_id=request.warehouse_id,
                    transaction_type="包材消耗",
                    from_status=InventoryStatus.SEMI_FINISHED,
                    to_status=None,
                    quantity=-needed_quantity,
                    notes=f"用于打包商品 {product.sku}，单件需要 {relation.quantity} 个"
                )
        
        # 向后兼容：如果没有新的包材关系但有旧的packaging_id，使用旧逻辑
        elif product.packaging_id:
            # 检查包材库存
            packaging_result = await db.execute(
                select(InventoryRecord).where(
                    InventoryRecord.product_id == product.packaging_id,
                    InventoryRecord.warehouse_id == request.warehouse_id
                )
            )
            packaging_inventory = packaging_result.scalar_one_or_none()
            
            if not packaging_inventory or packaging_inventory.semi_finished < request.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="包材半成品库存不足"
                )
            
            # 消耗包材半成品
            packaging_inventory.semi_finished -= request.quantity
            
            # 记录包材消耗
            await _create_inventory_transaction(
                db,
                product_id=product.packaging_id,
                warehouse_id=request.warehouse_id,
                transaction_type="包材消耗",
                from_status=InventoryStatus.SEMI_FINISHED,
                to_status=None,
                quantity=-request.quantity,
                notes=f"用于打包商品 {product.sku}"
            )
    
    # 转移商品库存：半成品 -> 成品
    await _transfer_inventory(
        db,
        product_id=request.product_id,
        warehouse_id=request.warehouse_id,
        from_status="semi_finished",
        to_status="finished",
        quantity=request.quantity
    )
    
    # 记录库存变动
    await _create_inventory_transaction(
        db,
        product_id=request.product_id,
        warehouse_id=request.warehouse_id,
        transaction_type="打包",
        from_status=InventoryStatus.SEMI_FINISHED,
        to_status=InventoryStatus.FINISHED,
        quantity=request.quantity,
        notes="商品打包完成"
    )
    
    await db.commit()
    
    return {"message": "打包成功", "quantity": request.quantity}


@router.post("/ship")
async def ship_products(
    request: ShippingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """商品出库（成品转出库）"""
    # 转移库存：成品 -> 出库
    await _transfer_inventory(
        db,
        product_id=request.product_id,
        warehouse_id=request.warehouse_id,
        from_status="finished",
        to_status="shipped",
        quantity=request.quantity
    )
    
    # 记录库存变动
    await _create_inventory_transaction(
        db,
        product_id=request.product_id,
        warehouse_id=request.warehouse_id,
        transaction_type="出库",
        from_status=InventoryStatus.FINISHED,
        to_status=InventoryStatus.SHIPPED,
        quantity=request.quantity,
        notes=request.notes or "商品出库"
    )
    
    await db.commit()
    
    return {"message": "出库成功", "quantity": request.quantity}


@router.get("/transactions", response_model=List[InventoryTransactionWithDetails])
async def get_inventory_transactions(
    warehouse_id: Optional[int] = None,
    product_id: Optional[int] = None,
    transaction_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取库存变动记录"""
    query = select(InventoryTransaction).options(
        selectinload(InventoryTransaction.product),
        selectinload(InventoryTransaction.warehouse)
    )
    
    if warehouse_id:
        query = query.where(InventoryTransaction.warehouse_id == warehouse_id)
    if product_id:
        query = query.where(InventoryTransaction.product_id == product_id)
    if transaction_type:
        query = query.where(InventoryTransaction.transaction_type == transaction_type)
    
    query = query.offset(skip).limit(limit).order_by(InventoryTransaction.created_at.desc())
    
    result = await db.execute(query)
    transactions = result.scalars().all()
    return transactions


# 工具函数
async def _transfer_inventory(
    db: AsyncSession, product_id: int, warehouse_id: int,
    from_status: str, to_status: str, quantity: int
):
    """库存状态转移"""
    result = await db.execute(
        select(InventoryRecord).where(
            InventoryRecord.product_id == product_id,
            InventoryRecord.warehouse_id == warehouse_id
        )
    )
    inventory = result.scalar_one_or_none()
    
    if not inventory:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="库存记录不存在"
        )
    
    # 从源状态减少
    if from_status == "in_transit":
        if inventory.in_transit < quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="在途库存不足"
            )
        inventory.in_transit -= quantity
    elif from_status == "semi_finished":
        if inventory.semi_finished < quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="半成品库存不足"
            )
        inventory.semi_finished -= quantity
    elif from_status == "finished":
        if inventory.finished < quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="成品库存不足"
            )
        inventory.finished -= quantity
    
    # 向目标状态增加
    if to_status == "semi_finished":
        inventory.semi_finished += quantity
    elif to_status == "finished":
        inventory.finished += quantity
    elif to_status == "shipped":
        inventory.shipped += quantity


async def _create_inventory_transaction(
    db: AsyncSession, product_id: int, warehouse_id: int,
    transaction_type: str, quantity: int, reference_id: int = None,
    from_status: InventoryStatus = None, to_status: InventoryStatus = None, notes: str = None
):
    """创建库存变动记录"""
    transaction = InventoryTransaction(
        product_id=product_id,
        warehouse_id=warehouse_id,
        transaction_type=transaction_type,
        from_status=from_status,
        to_status=to_status,
        quantity=quantity,
        reference_id=reference_id,
        notes=notes
    )
    db.add(transaction)


# ========== 组合商品库存管理端点 ==========

@router.get("/combo/records", response_model=PaginatedComboInventoryResponse)
async def get_combo_inventory_records(
    warehouse_id: Optional[int] = Query(None, description="仓库ID"),
    search: Optional[str] = Query(None, description="搜索关键字（组合商品名称或SKU）"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(10, ge=1, le=100, description="每页数量"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取组合商品库存记录列表（支持搜索和分页）"""
    query = select(ComboInventoryRecord).options(
        selectinload(ComboInventoryRecord.combo_product)
            .selectinload(ComboProduct.combo_items)
            .selectinload(ComboProductItem.base_product),
        selectinload(ComboInventoryRecord.combo_product)
            .selectinload(ComboProduct.combo_items)
            .selectinload(ComboProductItem.packaging_relations)
            .selectinload(ComboItemPackagingRelation.packaging),
        selectinload(ComboInventoryRecord.combo_product)
            .selectinload(ComboProduct.packaging_relations)
            .selectinload(ComboProductPackagingRelation.packaging),
        selectinload(ComboInventoryRecord.warehouse)
    ).join(ComboProduct)
    
    # 筛选条件
    if warehouse_id:
        query = query.where(ComboInventoryRecord.warehouse_id == warehouse_id)
    
    if search:
        query = query.where(
            or_(
                ComboProduct.name.contains(search),
                ComboProduct.sku.contains(search)
            )
        )
    
    # 计算总数
    count_query = select(func.count()).select_from(
        query.subquery()
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 按更新时间倒序排序
    query = query.order_by(ComboInventoryRecord.updated_at.desc())
    
    # 分页
    offset = (page - 1) * size
    query = query.offset(offset).limit(size)
    
    result = await db.execute(query)
    records = result.scalars().all()
    
    # 为每个记录计算可组合数量
    result_list = []
    for record in records:
        available_to_assemble = await _calculate_available_to_assemble(
            record.combo_product, record.warehouse_id, db
        )
        
        record_dict = {
            "id": record.id,
            "combo_product_id": record.combo_product_id,
            "warehouse_id": record.warehouse_id,
            "finished": record.finished,
            "shipped": record.shipped,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
            "combo_product_name": record.combo_product.name,
            "combo_product_sku": record.combo_product.sku,
            "warehouse_name": record.warehouse.name,
            "available_to_assemble": available_to_assemble
        }
        result_list.append(record_dict)
    
    pages = (total + size - 1) // size
    
    return PaginatedComboInventoryResponse(
        items=result_list,
        total=total,
        page=page,
        size=size,
        pages=pages
    )


@router.get("/combo/records/{warehouse_id}", response_model=List[ComboInventoryRecordSchema])
async def get_warehouse_combo_inventory(
    warehouse_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取指定仓库的组合商品库存清单"""
    result = await db.execute(
        select(ComboInventoryRecord)
        .options(
            selectinload(ComboInventoryRecord.combo_product)
                .selectinload(ComboProduct.combo_items)
                .selectinload(ComboProductItem.base_product),
            selectinload(ComboInventoryRecord.combo_product)
                .selectinload(ComboProduct.combo_items)
                .selectinload(ComboProductItem.packaging_relations)
                .selectinload(ComboItemPackagingRelation.packaging),
            selectinload(ComboInventoryRecord.combo_product)
                .selectinload(ComboProduct.packaging_relations)
                .selectinload(ComboProductPackagingRelation.packaging),
            selectinload(ComboInventoryRecord.warehouse)
        )
        .where(ComboInventoryRecord.warehouse_id == warehouse_id)
        .order_by(ComboInventoryRecord.updated_at.desc())
    )
    records = result.scalars().all()
    
    # 为每个记录计算可组合数量
    result_list = []
    for record in records:
        available_to_assemble = await _calculate_available_to_assemble(
            record.combo_product, record.warehouse_id, db
        )
        
        record_dict = {
            "id": record.id,
            "combo_product_id": record.combo_product_id,
            "warehouse_id": record.warehouse_id,
            "finished": record.finished,
            "shipped": record.shipped,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
            "combo_product_name": record.combo_product.name,
            "combo_product_sku": record.combo_product.sku,
            "warehouse_name": record.warehouse.name,
            "available_to_assemble": available_to_assemble
        }
        result_list.append(record_dict)
    
    return result_list


@router.get("/combo/summary", response_model=List[ComboInventorySummary])
async def get_combo_inventory_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取组合商品库存汇总（按仓库分组）"""
    result = await db.execute(
        select(ComboInventoryRecord)
        .options(
            selectinload(ComboInventoryRecord.combo_product)
                .selectinload(ComboProduct.combo_items)
                .selectinload(ComboProductItem.base_product),
            selectinload(ComboInventoryRecord.combo_product)
                .selectinload(ComboProduct.combo_items)
                .selectinload(ComboProductItem.packaging_relations)
                .selectinload(ComboItemPackagingRelation.packaging),
            selectinload(ComboInventoryRecord.combo_product)
                .selectinload(ComboProduct.packaging_relations)
                .selectinload(ComboProductPackagingRelation.packaging),
            selectinload(ComboInventoryRecord.warehouse)
        )
    )
    records = result.scalars().all()
    
    result_list = []
    for record in records:
        available_to_assemble = await _calculate_available_to_assemble(
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


@router.get("/product/{product_id}/packaging", response_model=List[dict])
async def get_product_packaging_inventory(
    product_id: int,
    warehouse_id: Optional[int] = Query(None, description="仓库ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取商品的包材库存信息"""
    # 获取商品信息
    product_result = await db.execute(
        select(Product).where(Product.id == product_id)
    )
    product = product_result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="商品不存在"
        )
    
    packaging_info = []
    
    # 查询商品的包材关系（多包材）
    packaging_relations_result = await db.execute(
        select(ProductPackagingRelation)
        .options(selectinload(ProductPackagingRelation.packaging))
        .where(ProductPackagingRelation.product_id == product_id)
    )
    packaging_relations = packaging_relations_result.scalars().all()
    
    # 获取仓库名称映射（避免懒加载）
    if not warehouse_id:
        warehouse_result = await db.execute(select(Warehouse))
        warehouses_map = {w.id: w.name for w in warehouse_result.scalars().all()}
    else:
        # 如果指定了仓库，只获取该仓库信息
        specific_warehouse_result = await db.execute(
            select(Warehouse).where(Warehouse.id == warehouse_id)
        )
        specific_warehouse = specific_warehouse_result.scalar_one_or_none()
        warehouses_map = {warehouse_id: specific_warehouse.name if specific_warehouse else "未知仓库"}
    
    for relation in packaging_relations:
        # 查询包材库存并预加载仓库信息
        if warehouse_id:
            inventory_result = await db.execute(
                select(InventoryRecord)
                .options(selectinload(InventoryRecord.warehouse))
                .where(
                    and_(
                        InventoryRecord.product_id == relation.packaging_id,
                        InventoryRecord.warehouse_id == warehouse_id
                    )
                )
            )
            inventory_records = [inventory_result.scalar_one_or_none()]
        else:
            # 查询所有仓库的包材库存
            inventory_result = await db.execute(
                select(InventoryRecord)
                .options(selectinload(InventoryRecord.warehouse))
                .where(InventoryRecord.product_id == relation.packaging_id)
            )
            inventory_records = inventory_result.scalars().all()
        
        for inventory in inventory_records:
            if inventory:
                packaging_info.append({
                    "packaging_id": relation.packaging_id,
                    "packaging_name": relation.packaging.name,
                    "packaging_sku": relation.packaging.sku,
                    "required_quantity": relation.quantity,
                    "warehouse_id": inventory.warehouse_id,
                    "warehouse_name": warehouses_map.get(inventory.warehouse_id, "未知仓库"),
                    "semi_finished": inventory.semi_finished,
                    "total_stock": inventory.semi_finished + inventory.finished,
                    "available_stock": inventory.semi_finished,  # 包材主要看半成品库存
                    "status": "库存充足" if inventory.semi_finished >= relation.quantity else "库存不足"
                })
    
    return packaging_info


@router.get("/combo-product/{combo_product_id}/packaging", response_model=dict)
async def get_combo_product_packaging_inventory(
    combo_product_id: int,
    warehouse_id: Optional[int] = Query(None, description="仓库ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取组合商品的包材库存信息（包括组合商品本身的包材和基础商品的包材）"""
    # 获取组合商品信息
    combo_result = await db.execute(
        select(ComboProduct)
        .options(
            selectinload(ComboProduct.combo_items)
                .selectinload(ComboProductItem.base_product),
            selectinload(ComboProduct.combo_items)
                .selectinload(ComboProductItem.packaging_relations)
                .selectinload(ComboItemPackagingRelation.packaging),
            selectinload(ComboProduct.packaging_relations)
                .selectinload(ComboProductPackagingRelation.packaging)
        )
        .where(ComboProduct.id == combo_product_id)
    )
    combo_product = combo_result.scalar_one_or_none()
    
    if not combo_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="组合商品不存在"
        )
    
    result = {
        "combo_product_packaging": [],
        "base_products_packaging": [],
        "base_products_inventory": []  # 新增：基础商品库存信息
    }
    
    # 获取仓库名称映射（避免懒加载）
    if not warehouse_id:
        warehouse_result = await db.execute(select(Warehouse))
        warehouses_map = {w.id: w.name for w in warehouse_result.scalars().all()}
    else:
        # 如果指定了仓库，只获取该仓库信息
        specific_warehouse_result = await db.execute(
            select(Warehouse).where(Warehouse.id == warehouse_id)
        )
        specific_warehouse = specific_warehouse_result.scalar_one_or_none()
        warehouses_map = {warehouse_id: specific_warehouse.name if specific_warehouse else "未知仓库"}
    
    # 1. 组合商品本身的包材
    if combo_product.packaging_relations:
        for relation in combo_product.packaging_relations:
            if warehouse_id:
                inventory_result = await db.execute(
                    select(InventoryRecord)
                    .options(selectinload(InventoryRecord.warehouse))
                    .where(
                        and_(
                            InventoryRecord.product_id == relation.packaging_id,
                            InventoryRecord.warehouse_id == warehouse_id
                        )
                    )
                )
                inventory = inventory_result.scalar_one_or_none()

                # 即使没有库存记录也要显示包材信息
                if inventory:
                    result["combo_product_packaging"].append({
                        "packaging_id": relation.packaging_id,
                        "packaging_name": relation.packaging.name,
                        "packaging_sku": relation.packaging.sku,
                        "required_quantity": relation.quantity,
                        "warehouse_id": inventory.warehouse_id,
                        "warehouse_name": warehouses_map.get(inventory.warehouse_id, "未知仓库"),
                        "semi_finished": inventory.semi_finished,
                        "total_stock": inventory.semi_finished + inventory.finished,
                        "available_stock": inventory.semi_finished,
                        "status": "库存充足" if inventory.semi_finished >= relation.quantity else "库存不足"
                    })
                else:
                    # 没有库存记录时显示0库存
                    result["combo_product_packaging"].append({
                        "packaging_id": relation.packaging_id,
                        "packaging_name": relation.packaging.name,
                        "packaging_sku": relation.packaging.sku,
                        "required_quantity": relation.quantity,
                        "warehouse_id": warehouse_id,
                        "warehouse_name": warehouses_map.get(warehouse_id, "未知仓库"),
                        "semi_finished": 0,
                        "total_stock": 0,
                        "available_stock": 0,
                        "status": "库存不足"
                    })
            else:
                inventory_result = await db.execute(
                    select(InventoryRecord)
                    .options(selectinload(InventoryRecord.warehouse))
                    .where(InventoryRecord.product_id == relation.packaging_id)
                )
                inventory_records = inventory_result.scalars().all()

                # 如果指定了查询所有仓库，需要确保每个仓库都有记录
                if inventory_records:
                    for inventory in inventory_records:
                        result["combo_product_packaging"].append({
                            "packaging_id": relation.packaging_id,
                            "packaging_name": relation.packaging.name,
                            "packaging_sku": relation.packaging.sku,
                            "required_quantity": relation.quantity,
                            "warehouse_id": inventory.warehouse_id,
                            "warehouse_name": warehouses_map.get(inventory.warehouse_id, "未知仓库"),
                            "semi_finished": inventory.semi_finished,
                            "total_stock": inventory.semi_finished + inventory.finished,
                            "available_stock": inventory.semi_finished,
                            "status": "库存充足" if inventory.semi_finished >= relation.quantity else "库存不足"
                        })
                else:
                    # 没有任何库存记录时，为每个仓库显示0库存
                    for wh_id, wh_name in warehouses_map.items():
                        result["combo_product_packaging"].append({
                            "packaging_id": relation.packaging_id,
                            "packaging_name": relation.packaging.name,
                            "packaging_sku": relation.packaging.sku,
                            "required_quantity": relation.quantity,
                            "warehouse_id": wh_id,
                            "warehouse_name": wh_name,
                            "semi_finished": 0,
                            "total_stock": 0,
                            "available_stock": 0,
                            "status": "库存不足"
                        })
    
    # 2. 基础商品的包材
    for item in combo_product.combo_items:
        # 查询基础商品在指定仓库的库存信息
        base_inventory = None
        if warehouse_id:
            base_inventory_result = await db.execute(
                select(InventoryRecord).where(
                    and_(
                        InventoryRecord.product_id == item.base_product_id,
                        InventoryRecord.warehouse_id == warehouse_id
                    )
                )
            )
            base_inventory = base_inventory_result.scalar_one_or_none()

        item_packaging = {
            "base_product_id": item.base_product_id,
            "base_product_name": item.base_product.name,
            "base_product_sku": item.base_product.sku,
            "required_quantity": item.quantity,
            "current_stock": base_inventory.semi_finished if base_inventory else 0,
            "available_stock": base_inventory.semi_finished if base_inventory else 0,
            "stock_status": "库存充足" if (base_inventory and base_inventory.semi_finished >= item.quantity) else "库存不足",
            "packaging_list": []
        }
        
        # 检查基础商品的包材关系
        if hasattr(item, 'packaging_relations') and item.packaging_relations:
            for packaging_relation in item.packaging_relations:
                if warehouse_id:
                    inventory_result = await db.execute(
                        select(InventoryRecord)
                        .options(selectinload(InventoryRecord.warehouse))
                        .where(
                            and_(
                                InventoryRecord.product_id == packaging_relation.packaging_id,
                                InventoryRecord.warehouse_id == warehouse_id
                            )
                        )
                    )
                    inventory = inventory_result.scalar_one_or_none()

                    # 即使没有库存记录也要显示包材信息
                    if inventory:
                        item_packaging["packaging_list"].append({
                            "packaging_id": packaging_relation.packaging_id,
                            "packaging_name": packaging_relation.packaging.name,
                            "packaging_sku": packaging_relation.packaging.sku,
                            "required_quantity": packaging_relation.quantity,
                            "warehouse_id": inventory.warehouse_id,
                            "warehouse_name": warehouses_map.get(inventory.warehouse_id, "未知仓库"),
                            "semi_finished": inventory.semi_finished,
                            "total_stock": inventory.semi_finished + inventory.finished,
                            "available_stock": inventory.semi_finished,
                            "status": "库存充足" if inventory.semi_finished >= packaging_relation.quantity else "库存不足"
                        })
                    else:
                        # 没有库存记录时显示0库存
                        item_packaging["packaging_list"].append({
                            "packaging_id": packaging_relation.packaging_id,
                            "packaging_name": packaging_relation.packaging.name,
                            "packaging_sku": packaging_relation.packaging.sku,
                            "required_quantity": packaging_relation.quantity,
                            "warehouse_id": warehouse_id,
                            "warehouse_name": warehouses_map.get(warehouse_id, "未知仓库"),
                            "semi_finished": 0,
                            "total_stock": 0,
                            "available_stock": 0,
                            "status": "库存不足"
                        })
                else:
                    inventory_result = await db.execute(
                        select(InventoryRecord)
                        .options(selectinload(InventoryRecord.warehouse))
                        .where(InventoryRecord.product_id == packaging_relation.packaging_id)
                    )
                    inventory_records = inventory_result.scalars().all()

                    # 如果指定了查询所有仓库，需要确保每个仓库都有记录
                    if inventory_records:
                        for inventory in inventory_records:
                            item_packaging["packaging_list"].append({
                                "packaging_id": packaging_relation.packaging_id,
                                "packaging_name": packaging_relation.packaging.name,
                                "packaging_sku": packaging_relation.packaging.sku,
                                "required_quantity": packaging_relation.quantity,
                                "warehouse_id": inventory.warehouse_id,
                                "warehouse_name": warehouses_map.get(inventory.warehouse_id, "未知仓库"),
                                "semi_finished": inventory.semi_finished,
                                "total_stock": inventory.semi_finished + inventory.finished,
                                "available_stock": inventory.semi_finished,
                                "status": "库存充足" if inventory.semi_finished >= packaging_relation.quantity else "库存不足"
                            })
                    else:
                        # 没有任何库存记录时，为每个仓库显示0库存
                        for wh_id, wh_name in warehouses_map.items():
                            item_packaging["packaging_list"].append({
                                "packaging_id": packaging_relation.packaging_id,
                                "packaging_name": packaging_relation.packaging.name,
                                "packaging_sku": packaging_relation.packaging.sku,
                                "required_quantity": packaging_relation.quantity,
                                "warehouse_id": wh_id,
                                "warehouse_name": wh_name,
                                "semi_finished": 0,
                                "total_stock": 0,
                                "available_stock": 0,
                                "status": "库存不足"
                            })
        
        result["base_products_packaging"].append(item_packaging)

        # 同时添加基础商品库存信息到单独的列表中
        result["base_products_inventory"].append({
            "base_product_id": item.base_product_id,
            "base_product_name": item.base_product.name,
            "base_product_sku": item.base_product.sku,
            "required_quantity": item.quantity,
            "current_stock": base_inventory.semi_finished if base_inventory else 0,
            "available_stock": base_inventory.semi_finished if base_inventory else 0,
            "stock_status": "库存充足" if (base_inventory and base_inventory.semi_finished >= item.quantity) else "库存不足"
        })

    return result


async def _calculate_available_to_assemble(combo_product: ComboProduct, warehouse_id: int, db: AsyncSession) -> int:
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
