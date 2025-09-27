"""
临时脚本：检查数据库中的批量出库相关数据
"""

import asyncio
import sys
import os

# 添加项目根目录到路径
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.core.database import get_async_session_context
from app.models.inventory import InventoryTransaction, BatchShippingRecord
from app.models.combo_product import ComboInventoryTransaction
from sqlalchemy import select, text

async def check_batch_data():
    async with get_async_session_context() as session:
        print("=== 检查数据库表是否存在 ===")

        # 检查 batch_shipping_records 表是否存在
        try:
            result = await session.execute(text("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'batch_shipping_records'
            """))
            table_exists = result.fetchone()
            if table_exists:
                print("✓ batch_shipping_records 表存在")
            else:
                print("✗ batch_shipping_records 表不存在")
        except Exception as e:
            print(f"检查表存在性时出错: {e}")

        # 检查 batch_id 字段是否存在
        try:
            result = await session.execute(text("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'inventory_transactions' AND column_name = 'batch_id'
            """))
            column_exists = result.fetchone()
            if column_exists:
                print("✓ inventory_transactions.batch_id 字段存在")
            else:
                print("✗ inventory_transactions.batch_id 字段不存在")
        except Exception as e:
            print(f"检查 inventory_transactions 字段时出错: {e}")

        try:
            result = await session.execute(text("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'combo_inventory_transactions' AND column_name = 'batch_id'
            """))
            column_exists = result.fetchone()
            if column_exists:
                print("✓ combo_inventory_transactions.batch_id 字段存在")
            else:
                print("✗ combo_inventory_transactions.batch_id 字段不存在")
        except Exception as e:
            print(f"检查 combo_inventory_transactions 字段时出错: {e}")

        print("\n=== 检查现有数据 ===")

        # 检查批量出库记录数量
        try:
            result = await session.execute(select(BatchShippingRecord))
            batch_records = result.scalars().all()
            print(f"批量出库记录数量: {len(batch_records)}")
            for record in batch_records:
                print(f"  - 批次ID: {record.batch_id}, 仓库ID: {record.warehouse_id}, 时间: {record.created_at}")
        except Exception as e:
            print(f"查询批量出库记录时出错: {e}")

        # 检查有 batch_id 的事务记录
        try:
            result = await session.execute(
                select(InventoryTransaction).where(InventoryTransaction.batch_id.is_not(None))
            )
            batch_transactions = result.scalars().all()
            print(f"有批次ID的基础商品事务记录数量: {len(batch_transactions)}")
        except Exception as e:
            print(f"查询基础商品事务记录时出错: {e}")

        try:
            result = await session.execute(
                select(ComboInventoryTransaction).where(ComboInventoryTransaction.batch_id.is_not(None))
            )
            combo_batch_transactions = result.scalars().all()
            print(f"有批次ID的组合商品事务记录数量: {len(combo_batch_transactions)}")
        except Exception as e:
            print(f"查询组合商品事务记录时出错: {e}")

        # 检查最近的批量出库相关记录
        try:
            result = await session.execute(
                select(InventoryTransaction)
                .where(InventoryTransaction.transaction_type == "批量出库")
                .order_by(InventoryTransaction.created_at.desc())
                .limit(5)
            )
            recent_transactions = result.scalars().all()
            print(f"\n最近的批量出库事务记录 (基础商品):")
            for trans in recent_transactions:
                print(f"  - ID: {trans.id}, 商品: {trans.product_id}, 数量: {trans.quantity}, 批次ID: {trans.batch_id}, 时间: {trans.created_at}")
        except Exception as e:
            print(f"查询最近批量出库事务记录时出错: {e}")

if __name__ == "__main__":
    asyncio.run(check_batch_data())