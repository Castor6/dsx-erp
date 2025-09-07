"""
创建管理员用户的脚本
运行: python create_admin.py
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User
from sqlalchemy import select


async def create_admin_user():
    async with AsyncSessionLocal() as db:
        # 检查是否已存在管理员用户
        result = await db.execute(select(User).where(User.username == "admin"))
        existing_admin = result.scalar_one_or_none()
        
        if existing_admin:
            print("管理员用户已存在")
            return
        
        # 创建管理员用户
        admin_user = User(
            username="admin",
            email="admin@dsx-erp.com",
            hashed_password=get_password_hash("admin123"),
            full_name="系统管理员",
            is_active=True,
            is_admin=True
        )
        
        db.add(admin_user)
        await db.commit()
        await db.refresh(admin_user)
        
        print(f"管理员用户创建成功:")
        print(f"用户名: {admin_user.username}")
        print(f"密码: admin123")
        print(f"请及时修改默认密码！")


if __name__ == "__main__":
    asyncio.run(create_admin_user())
