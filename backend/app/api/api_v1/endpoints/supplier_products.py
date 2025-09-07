import base64
import io
import pandas as pd
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, or_
from sqlalchemy.orm import selectinload
from math import ceil

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.supplier_product import SupplierProduct
from app.models.supplier import Supplier
from app.models.product import Product
from app.models.user import User
from app.schemas.supplier_product import (
    SupplierProduct as SupplierProductSchema,
    SupplierProductCreate,
    SupplierProductUpdate,
    SupplierProductWithDetails,
    SupplierProductBatchCreate,
    SupplierProductListResponse,
    ExcelImportResponse,
    ImportError
)

router = APIRouter()


@router.get("/", response_model=SupplierProductListResponse)
async def get_supplier_products(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
    supplier_name: str = Query(None, description="供应商名称搜索"),
    product_search: str = Query(None, description="商品搜索（支持名称、SKU模糊查询）"),
    product_name: str = Query(None, description="商品名称搜索（兼容性保留）"),
    product_sku: str = Query(None, description="商品SKU搜索（兼容性保留）"),
    supplier_id: int = Query(None, description="供应商ID过滤"),
    product_id: int = Query(None, description="商品ID过滤"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取供货关系列表，支持分页和多字段模糊查询"""
    # 构建基础查询，包含关联表
    query = select(SupplierProduct).options(
        selectinload(SupplierProduct.supplier),
        selectinload(SupplierProduct.product)
    ).join(Supplier, SupplierProduct.supplier_id == Supplier.id).join(Product, SupplierProduct.product_id == Product.id)
    
    count_query = select(func.count(SupplierProduct.id)).join(Supplier, SupplierProduct.supplier_id == Supplier.id).join(Product, SupplierProduct.product_id == Product.id)
    
    # 构建搜索条件
    search_conditions = []
    
    # 供应商名称搜索
    if supplier_name:
        search_conditions.append(Supplier.name.ilike(f"%{supplier_name}%"))
    
    # 商品搜索（优先使用product_search，同时搜索名称和SKU）
    if product_search:
        product_search_pattern = f"%{product_search}%"
        search_conditions.append(
            or_(
                Product.name.ilike(product_search_pattern),
                Product.sku.ilike(product_search_pattern)
            )
        )
    else:
        # 兼容性支持：如果没有product_search，使用原有的分别搜索
        if product_name:
            search_conditions.append(Product.name.ilike(f"%{product_name}%"))
        
        if product_sku:
            search_conditions.append(Product.sku.ilike(f"%{product_sku}%"))
    
    # ID过滤条件
    if supplier_id:
        search_conditions.append(SupplierProduct.supplier_id == supplier_id)
    if product_id:
        search_conditions.append(SupplierProduct.product_id == product_id)
    
    # 应用搜索条件
    if search_conditions:
        search_filter = and_(*search_conditions)
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)
    
    # 获取总数
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 计算偏移量
    offset = (page - 1) * size
    
    # 添加分页和排序
    query = query.offset(offset).limit(size).order_by(SupplierProduct.created_at.desc())
    
    # 执行查询
    result = await db.execute(query)
    supplier_products = result.scalars().all()
    
    # 计算总页数
    pages = ceil(total / size) if total > 0 else 1
    
    return SupplierProductListResponse(
        items=supplier_products,
        total=total,
        page=page,
        size=size,
        pages=pages
    )


@router.post("/", response_model=SupplierProductSchema)
async def create_supplier_product(
    supplier_product_data: SupplierProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """创建供货关系"""
    # 检查供应商是否存在
    supplier_result = await db.execute(
        select(Supplier).where(Supplier.id == supplier_product_data.supplier_id)
    )
    if not supplier_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="供应商不存在"
        )
    
    # 检查商品是否存在
    product_result = await db.execute(
        select(Product).where(Product.id == supplier_product_data.product_id)
    )
    if not product_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="商品不存在"
        )
    
    # 检查供货关系是否已存在
    existing_result = await db.execute(
        select(SupplierProduct).where(
            and_(
                SupplierProduct.supplier_id == supplier_product_data.supplier_id,
                SupplierProduct.product_id == supplier_product_data.product_id
            )
        )
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该供货关系已存在"
        )
    
    db_supplier_product = SupplierProduct(**supplier_product_data.model_dump())
    db.add(db_supplier_product)
    await db.commit()
    await db.refresh(db_supplier_product)
    
    return db_supplier_product


@router.post("/batch", response_model=List[SupplierProductSchema])
async def create_supplier_products_batch(
    batch_data: SupplierProductBatchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """批量创建供货关系"""
    created_items = []
    errors = []
    
    for item_data in batch_data.items:
        try:
            # 检查供应商是否存在
            supplier_result = await db.execute(
                select(Supplier).where(Supplier.id == item_data.supplier_id)
            )
            if not supplier_result.scalar_one_or_none():
                errors.append(f"供应商ID {item_data.supplier_id} 不存在")
                continue
            
            # 检查商品是否存在
            product_result = await db.execute(
                select(Product).where(Product.id == item_data.product_id)
            )
            if not product_result.scalar_one_or_none():
                errors.append(f"商品ID {item_data.product_id} 不存在")
                continue
            
            # 检查供货关系是否已存在
            existing_result = await db.execute(
                select(SupplierProduct).where(
                    and_(
                        SupplierProduct.supplier_id == item_data.supplier_id,
                        SupplierProduct.product_id == item_data.product_id
                    )
                )
            )
            if existing_result.scalar_one_or_none():
                errors.append(f"供应商ID {item_data.supplier_id} 和商品ID {item_data.product_id} 的供货关系已存在")
                continue
            
            db_supplier_product = SupplierProduct(**item_data.model_dump())
            db.add(db_supplier_product)
            created_items.append(db_supplier_product)
            
        except Exception as e:
            errors.append(f"创建供货关系失败: {str(e)}")
    
    if created_items:
        await db.commit()
        for item in created_items:
            await db.refresh(item)
    
    if errors:
        # 如果有错误，在响应中返回警告信息
        # 但不抛出异常，因为部分成功的项目应该被保存
        pass
    
    return created_items


@router.put("/{supplier_product_id}", response_model=SupplierProductSchema)
async def update_supplier_product(
    supplier_product_id: int,
    supplier_product_data: SupplierProductUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """更新供货关系"""
    result = await db.execute(
        select(SupplierProduct).where(SupplierProduct.id == supplier_product_id)
    )
    db_supplier_product = result.scalar_one_or_none()
    
    if not db_supplier_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="供货关系不存在"
        )
    
    # 如果要更新供应商或商品，需要验证存在性和唯一性
    update_data = supplier_product_data.model_dump(exclude_unset=True)
    
    if 'supplier_id' in update_data:
        supplier_result = await db.execute(
            select(Supplier).where(Supplier.id == update_data['supplier_id'])
        )
        if not supplier_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="供应商不存在"
            )
    
    if 'product_id' in update_data:
        product_result = await db.execute(
            select(Product).where(Product.id == update_data['product_id'])
        )
        if not product_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="商品不存在"
            )
    
    # 检查更新后的组合是否会重复
    if 'supplier_id' in update_data or 'product_id' in update_data:
        new_supplier_id = update_data.get('supplier_id', db_supplier_product.supplier_id)
        new_product_id = update_data.get('product_id', db_supplier_product.product_id)
        
        existing_result = await db.execute(
            select(SupplierProduct).where(
                and_(
                    SupplierProduct.supplier_id == new_supplier_id,
                    SupplierProduct.product_id == new_product_id,
                    SupplierProduct.id != supplier_product_id
                )
            )
        )
        if existing_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该供货关系已存在"
            )
    
    # 更新字段
    for field, value in update_data.items():
        setattr(db_supplier_product, field, value)
    
    await db.commit()
    await db.refresh(db_supplier_product)
    
    return db_supplier_product


@router.delete("/{supplier_product_id}")
async def delete_supplier_product(
    supplier_product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """删除供货关系"""
    result = await db.execute(
        select(SupplierProduct).where(SupplierProduct.id == supplier_product_id)
    )
    db_supplier_product = result.scalar_one_or_none()
    
    if not db_supplier_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="供货关系不存在"
        )
    
    await db.delete(db_supplier_product)
    await db.commit()
    
    return {"message": "供货关系删除成功"}


@router.post("/import/excel", response_model=ExcelImportResponse)
async def import_supplier_products_from_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """从Excel文件导入供货关系"""
    
    # 验证文件类型
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只支持Excel文件格式 (.xlsx, .xls)"
        )
    
    try:
        # 读取Excel文件
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        # 验证必需的列
        required_columns = ['供应商名称', '商品SKU']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Excel文件缺少必需的列: {', '.join(missing_columns)}"
            )
        
        # 获取所有供应商和商品的映射
        suppliers_result = await db.execute(select(Supplier))
        suppliers = {s.name: s.id for s in suppliers_result.scalars().all()}
        
        products_result = await db.execute(select(Product))
        products = {p.sku: p.id for p in products_result.scalars().all()}
        
        created_items = []
        errors = []
        success_count = 0
        error_count = 0
        total_rows = len(df)
        
        # 处理每一行数据
        for index, row in df.iterrows():
            try:
                supplier_name = str(row['供应商名称']).strip()
                product_sku = str(row['商品SKU']).strip()
                row_number = index + 2  # Excel行号从2开始（去掉标题行）
                
                # 跳过空行
                if not supplier_name or not product_sku or supplier_name == 'nan' or product_sku == 'nan':
                    if supplier_name != '' or product_sku != '':  # 不是完全空行
                        errors.append(ImportError(
                            row=row_number,
                            supplier_name=supplier_name if supplier_name != 'nan' else '',
                            product_sku=product_sku if product_sku != 'nan' else '',
                            error_type="数据缺失",
                            error_message="供应商名称和商品SKU都必须填写"
                        ))
                        error_count += 1
                    continue
                
                # 查找供应商ID
                supplier_id = suppliers.get(supplier_name)
                if not supplier_id:
                    errors.append(ImportError(
                        row=row_number,
                        supplier_name=supplier_name,
                        product_sku=product_sku,
                        error_type="供应商不存在",
                        error_message=f"供应商'{supplier_name}'在系统中不存在，请先创建该供应商"
                    ))
                    error_count += 1
                    continue
                
                # 查找商品ID
                product_id = products.get(product_sku)
                if not product_id:
                    errors.append(ImportError(
                        row=row_number,
                        supplier_name=supplier_name,
                        product_sku=product_sku,
                        error_type="商品不存在",
                        error_message=f"商品SKU'{product_sku}'在系统中不存在，请先创建该商品"
                    ))
                    error_count += 1
                    continue
                
                # 检查供货关系是否已存在
                existing_result = await db.execute(
                    select(SupplierProduct).where(
                        and_(
                            SupplierProduct.supplier_id == supplier_id,
                            SupplierProduct.product_id == product_id
                        )
                    )
                )
                if existing_result.scalar_one_or_none():
                    errors.append(ImportError(
                        row=row_number,
                        supplier_name=supplier_name,
                        product_sku=product_sku,
                        error_type="重复关系",
                        error_message=f"供应商'{supplier_name}'和商品'{product_sku}'的供货关系已存在"
                    ))
                    error_count += 1
                    continue
                
                # 创建供货关系
                db_supplier_product = SupplierProduct(
                    supplier_id=supplier_id,
                    product_id=product_id
                )
                db.add(db_supplier_product)
                created_items.append(db_supplier_product)
                success_count += 1
                
            except Exception as e:
                errors.append(ImportError(
                    row=index + 2,
                    supplier_name=supplier_name if 'supplier_name' in locals() else '',
                    product_sku=product_sku if 'product_sku' in locals() else '',
                    error_type="系统错误",
                    error_message=f"处理失败: {str(e)}"
                ))
                error_count += 1
        
        # 提交成功的记录
        if created_items:
            await db.commit()
            for item in created_items:
                await db.refresh(item)
        
        # 生成导入摘要
        if success_count == 0 and error_count > 0:
            summary = f"导入失败：共{total_rows}行数据，全部导入失败"
        elif success_count > 0 and error_count == 0:
            summary = f"导入成功：共{total_rows}行数据，全部导入成功"
        elif success_count > 0 and error_count > 0:
            summary = f"部分导入成功：共{total_rows}行数据，成功{success_count}行，失败{error_count}行"
        else:
            summary = f"没有有效数据：共{total_rows}行数据，均为空行或无效数据"
        
        return ExcelImportResponse(
            success_count=success_count,
            error_count=error_count,
            total_rows=total_rows,
            errors=errors,  # 返回所有错误信息
            created_items=created_items,
            summary=summary
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"文件处理失败: {str(e)}"
        )


@router.get("/suppliers/{supplier_id}/products", response_model=List[SupplierProductWithDetails])
async def get_supplier_products_by_supplier(
    supplier_id: int,
    search: str = Query(None, description="商品名称或SKU搜索"),
    limit: int = Query(50, ge=1, le=100, description="返回数量限制"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取指定供应商的供货关系，支持商品名称或SKU模糊搜索"""
    # 构建基础查询
    query = select(SupplierProduct).options(
        selectinload(SupplierProduct.supplier),
        selectinload(SupplierProduct.product)
    ).join(Product, SupplierProduct.product_id == Product.id).where(
        SupplierProduct.supplier_id == supplier_id
    )
    
    # 添加搜索条件
    if search and search.strip():
        search_term = f"%{search.strip()}%"
        query = query.where(
            or_(
                Product.name.ilike(search_term),
                Product.sku.ilike(search_term)
            )
        )
    
    # 添加限制和排序
    query = query.limit(limit).order_by(Product.name)
    
    result = await db.execute(query)
    supplier_products = result.scalars().all()
    return supplier_products


@router.get("/products/{product_id}/suppliers", response_model=List[SupplierProductWithDetails])
async def get_product_suppliers_by_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """获取指定商品的所有供货关系"""
    result = await db.execute(
        select(SupplierProduct)
        .options(
            selectinload(SupplierProduct.supplier),
            selectinload(SupplierProduct.product)
        )
        .where(SupplierProduct.product_id == product_id)
    )
    supplier_products = result.scalars().all()
    return supplier_products
