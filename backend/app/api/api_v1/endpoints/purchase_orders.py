from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload
from decimal import Decimal
import uuid
import io
import pandas as pd

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.user import User
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem, OrderStatus
from app.models.inventory import InventoryRecord, InventoryTransaction, InventoryStatus
from app.models.product import Product
from app.models.supplier_product import SupplierProduct
from app.models.supplier import Supplier
from app.schemas.purchase_order import (
    PurchaseOrder as PurchaseOrderSchema,
    PurchaseOrderCreate,
    PurchaseOrderUpdate,
    PurchaseOrderWithDetails,
    ReceiveOrderRequest
)

router = APIRouter()


@router.get("/")
async def get_purchase_orders(
    page: int = 1,
    size: int = 5,
    status: OrderStatus = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取采购订单列表（分页）"""
    # 计算偏移量
    skip = (page - 1) * size
    
    # 构建查询
    query = select(PurchaseOrder).options(
        selectinload(PurchaseOrder.supplier),
        selectinload(PurchaseOrder.warehouse),
        selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product)
    )
    
    if status:
        query = query.where(PurchaseOrder.status == status)
    
    # 获取总数
    count_query = select(func.count(PurchaseOrder.id))
    if status:
        count_query = count_query.where(PurchaseOrder.status == status)
    
    count_result = await db.execute(count_query)
    total = count_result.scalar()
    
    # 获取分页数据
    data_query = query.offset(skip).limit(size).order_by(PurchaseOrder.created_at.desc())
    result = await db.execute(data_query)
    orders = result.scalars().all()
    
    # 计算总页数
    total_pages = (total + size - 1) // size if total > 0 else 1
    
    return {
        "items": orders,
        "total": total,
        "page": page,
        "size": size,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1
    }


@router.get("/{order_id}", response_model=PurchaseOrderWithDetails)
async def get_purchase_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取单个采购订单详情"""
    result = await db.execute(
        select(PurchaseOrder)
        .options(
            selectinload(PurchaseOrder.supplier),
            selectinload(PurchaseOrder.warehouse),
            selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product)
        )
        .where(PurchaseOrder.id == order_id)
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="采购订单不存在"
        )
    
    return order


@router.post("/", response_model=PurchaseOrderSchema)
async def create_purchase_order(
    order_data: PurchaseOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """创建采购订单"""
    # 生成订单号
    order_number = f"PO-{uuid.uuid4().hex[:8].upper()}"
    
    # 计算总金额
    total_amount = sum(item.subtotal for item in order_data.items)
    
    # 创建采购订单
    db_order = PurchaseOrder(
        order_number=order_number,
        supplier_id=order_data.supplier_id,
        purchaser=order_data.purchaser,
        warehouse_id=order_data.warehouse_id,
        total_amount=total_amount,
        status=OrderStatus.PENDING
    )
    db.add(db_order)
    await db.flush()  # 获取ID
    
    # 创建采购明细
    for item_data in order_data.items:
        subtotal = item_data.quantity * item_data.unit_price
        db_item = PurchaseOrderItem(
            purchase_order_id=db_order.id,
            product_id=item_data.product_id,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            subtotal=subtotal
        )
        db.add(db_item)
        
        # 更新库存记录 - 增加在途数量
        await _update_inventory_in_transit(
            db, item_data.product_id, order_data.warehouse_id, item_data.quantity
        )
        
        # 记录库存变动
        await _create_inventory_transaction(
            db,
            product_id=item_data.product_id,
            warehouse_id=order_data.warehouse_id,
            transaction_type="采购",
            to_status=InventoryStatus.IN_TRANSIT,
            quantity=item_data.quantity,
            reference_id=db_order.id,
            notes=f"采购订单 {order_number} 创建"
        )
    
    await db.commit()
    await db.refresh(db_order)
    
    return db_order


@router.put("/{order_id}", response_model=PurchaseOrderSchema)
async def update_purchase_order(
    order_id: int,
    order_data: PurchaseOrderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """更新采购订单"""
    result = await db.execute(select(PurchaseOrder).where(PurchaseOrder.id == order_id))
    db_order = result.scalar_one_or_none()
    
    if not db_order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="采购订单不存在"
        )
    
    # 只允许更新待收货状态的订单基本信息
    if db_order.status != OrderStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只能修改待收货状态的采购订单"
        )
    
    update_data = order_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_order, field, value)
    
    await db.commit()
    await db.refresh(db_order)
    
    return db_order


@router.post("/{order_id}/receive")
async def receive_order(
    order_id: int,
    receive_data: ReceiveOrderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """记录采购订单到货"""
    result = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .where(PurchaseOrder.id == order_id)
    )
    db_order = result.scalar_one_or_none()
    
    if not db_order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="采购订单不存在"
        )
    
    if db_order.status == OrderStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="采购订单已完成，无法继续到货"
        )
    
    # 处理每个到货明细
    for receive_item in receive_data.items:
        # 查找对应的采购明细
        order_item = next(
            (item for item in db_order.items if item.id == receive_item.item_id),
            None
        )
        if not order_item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"采购明细 {receive_item.item_id} 不存在"
            )
        
        # 检查到货数量是否超过采购数量
        new_received = order_item.received_quantity + receive_item.received_quantity
        if new_received > order_item.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"商品 {order_item.product_id} 到货数量超过采购数量"
            )
        
        # 更新到货数量
        order_item.received_quantity = new_received
        
        # 更新库存：从在途转为半成品
        await _transfer_inventory(
            db,
            product_id=order_item.product_id,
            warehouse_id=db_order.warehouse_id,
            from_status="in_transit",
            to_status="semi_finished",
            quantity=receive_item.received_quantity
        )
        
        # 记录库存变动
        await _create_inventory_transaction(
            db,
            product_id=order_item.product_id,
            warehouse_id=db_order.warehouse_id,
            transaction_type="到货",
            from_status=InventoryStatus.IN_TRANSIT,
            to_status=InventoryStatus.SEMI_FINISHED,
            quantity=receive_item.received_quantity,
            reference_id=order_id,
            notes=f"采购订单 {db_order.order_number} 到货"
        )
    
    # 更新订单状态
    all_items_received = all(
        item.received_quantity == item.quantity for item in db_order.items
    )
    any_items_received = any(
        item.received_quantity > 0 for item in db_order.items
    )
    
    if all_items_received:
        db_order.status = OrderStatus.COMPLETED
    elif any_items_received:
        db_order.status = OrderStatus.PARTIAL
    
    await db.commit()
    
    return {"message": "到货记录成功", "order_status": db_order.status}


@router.delete("/{order_id}")
async def delete_purchase_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """删除采购订单"""
    result = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .where(PurchaseOrder.id == order_id)
    )
    db_order = result.scalar_one_or_none()
    
    if not db_order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="采购订单不存在"
        )
    
    # 只允许删除待收货状态的订单
    if db_order.status != OrderStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只能删除待收货状态的采购订单"
        )
    
    # 恢复库存在途数量
    for item in db_order.items:
        await _update_inventory_in_transit(
            db, item.product_id, db_order.warehouse_id, -item.quantity
        )
        
        # 记录库存变动
        await _create_inventory_transaction(
            db,
            product_id=item.product_id,
            warehouse_id=db_order.warehouse_id,
            transaction_type="取消采购",
            from_status=InventoryStatus.IN_TRANSIT,
            to_status=None,
            quantity=-item.quantity,
            reference_id=order_id,
            notes=f"删除采购订单 {db_order.order_number}"
        )
    
    await db.delete(db_order)
    await db.commit()
    
    return {"message": "采购订单删除成功"}


@router.get("/template/{supplier_id}/download")
async def download_purchase_template(
    supplier_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """下载采购模板 - 导出供应商供货关系的Excel，表头：商品名称、SKU、数量（数量都是0）"""
    # 检查供应商是否存在
    supplier_result = await db.execute(
        select(Supplier).where(Supplier.id == supplier_id)
    )
    supplier = supplier_result.scalar_one_or_none()
    
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="供应商不存在"
        )
    
    # 获取该供应商的所有供货关系
    result = await db.execute(
        select(SupplierProduct)
        .options(selectinload(SupplierProduct.product))
        .where(SupplierProduct.supplier_id == supplier_id)
        .order_by(SupplierProduct.id)
    )
    supplier_products = result.scalars().all()
    
    if not supplier_products:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该供应商没有供货关系，请先添加供货商品"
        )
    
    # 构建Excel数据
    data = []
    for sp in supplier_products:
        if sp.product:
            data.append({
                '商品名称': sp.product.name,
                'SKU': sp.product.sku,
                '数量': 0,
                '单价': ''
            })
    
    # 创建DataFrame
    df = pd.DataFrame(data)
    
    # 创建Excel文件
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='采购明细')
    output.seek(0)
    
    # 返回文件
    from urllib.parse import quote
    filename = f"采购模板_{supplier.name}.xlsx"
    encoded_filename = quote(filename)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        }
    )


@router.post("/template/import")
async def import_purchase_items(
    supplier_id: int = Query(..., description="供应商ID"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """导入采购明细 - 根据用户上传的采购模板，通过SKU仅导入数量大于0的商品"""
    # 验证文件类型
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只支持Excel文件格式 (.xlsx, .xls)"
        )
    
    # 检查供应商是否存在
    supplier_result = await db.execute(
        select(Supplier).where(Supplier.id == supplier_id)
    )
    supplier = supplier_result.scalar_one_or_none()
    
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="供应商不存在"
        )
    
    try:
        # 读取Excel文件
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        # 验证必需的列
        required_columns = ['SKU', '数量']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Excel文件缺少必需的列: {', '.join(missing_columns)}"
            )
        
        # 获取该供应商的供货关系（SKU -> product_id映射）
        result = await db.execute(
            select(SupplierProduct)
            .options(selectinload(SupplierProduct.product))
            .where(SupplierProduct.supplier_id == supplier_id)
        )
        supplier_products = result.scalars().all()
        
        # 构建SKU到商品的映射
        sku_to_product = {}
        for sp in supplier_products:
            if sp.product:
                sku_to_product[sp.product.sku] = sp.product
        
        # 处理数据，仅导入数量大于0的商品
        imported_items = []
        errors = []
        
        for index, row in df.iterrows():
            row_number = index + 2  # Excel行号从2开始（去掉标题行）
            
            try:
                sku = str(row['SKU']).strip()
                quantity = row['数量']
                
                # 跳过空行或无效数据
                if not sku or sku == 'nan':
                    continue
                
                # 转换数量为整数
                try:
                    quantity = int(float(quantity))
                except (ValueError, TypeError):
                    quantity = 0
                
                # 获取单价
                unit_price = row.get('单价', 0)
                try:
                    unit_price = float(unit_price) if pd.notna(unit_price) and unit_price != '' else 0
                except (ValueError, TypeError):
                    unit_price = 0
                
                # 仅导入数量大于0的商品
                if quantity <= 0:
                    continue
                
                # 检查SKU是否在供货关系中
                product = sku_to_product.get(sku)
                if not product:
                    errors.append({
                        'row': row_number,
                        'sku': sku,
                        'error': f"SKU '{sku}' 不在该供应商的供货关系中"
                    })
                    continue
                
                imported_items.append({
                    'product_id': product.id,
                    'product_name': product.name,
                    'sku': product.sku,
                    'quantity': quantity,
                    'unit_price': unit_price
                })
                
            except Exception as e:
                errors.append({
                    'row': row_number,
                    'sku': str(row.get('SKU', '')),
                    'error': f"处理失败: {str(e)}"
                })
        
        return {
            'success': True,
            'imported_items': imported_items,
            'errors': errors,
            'summary': f"成功导入 {len(imported_items)} 个商品" + (f"，{len(errors)} 个错误" if errors else "")
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"文件处理失败: {str(e)}"
        )


# 工具函数
async def _update_inventory_in_transit(
    db: AsyncSession, product_id: int, warehouse_id: int, quantity: int
):
    """更新库存在途数量"""
    result = await db.execute(
        select(InventoryRecord).where(
            InventoryRecord.product_id == product_id,
            InventoryRecord.warehouse_id == warehouse_id
        )
    )
    inventory = result.scalar_one_or_none()
    
    if not inventory:
        inventory = InventoryRecord(
            product_id=product_id,
            warehouse_id=warehouse_id,
            in_transit=max(0, quantity)
        )
        db.add(inventory)
    else:
        inventory.in_transit = max(0, inventory.in_transit + quantity)


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
