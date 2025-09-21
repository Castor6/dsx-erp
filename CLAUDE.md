# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

### 后端开发 (在 backend/ 目录下)
```bash
# 启动开发服务器
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 数据库迁移命令
alembic revision --autogenerate -m "描述"  # 生成迁移文件
alembic upgrade head                      # 应用迁移
alembic history                          # 查看迁移历史

# 创建管理员用户
python create_admin.py

# 安装依赖
pip install -r requirements.txt
```

### 前端开发 (在 frontend/ 目录下)
```bash
# 开发模式
npm run dev

# 构建和部署
npm run build
npm start

# 代码检查
npm run lint
npm run type-check

# 安装依赖
npm install
```

## 代码架构

### 后端架构 (FastAPI + SQLAlchemy 2.0 异步)
- **FastAPI 应用**: main.py 作为入口点，使用异步 lifespan 管理
- **数据库**: PostgreSQL + SQLAlchemy 2.0 (异步) + Alembic 迁移
- **身份验证**: JWT + FastAPI Security
- **API 结构**: `/api/v1/` 前缀，按功能模块组织路由
- **数据层**: models/ (SQLAlchemy) + schemas/ (Pydantic)

#### 核心模块
- `app/models/` - 数据库模型 (User, Product, ComboProduct, Inventory 等)
- `app/schemas/` - Pydantic 数据验证模式
- `app/api/api_v1/endpoints/` - API 端点定义
- `app/core/` - 核心配置、数据库连接、异常处理
- `app/middleware/` - 中间件 (日志、CORS 等)

#### 重要业务逻辑
- **库存管理**: 四阶段流转 (在途 → 半成品 → 成品 → 出库)
- **组合商品**: 支持多件装商品，自动计算可组装数量
- **包材消耗**: 商品打包时自动消耗对应包材库存
- **多包材关系**: 商品和组合商品支持多个包材关联

### 前端架构 (Next.js 14 + App Router)
- **框架**: Next.js 14 with App Router
- **UI**: shadcn/ui + Radix UI + Tailwind CSS
- **状态管理**: Zustand (stores/auth.ts)
- **表单**: React Hook Form + Zod 验证
- **HTTP**: Axios 客户端

#### 页面结构
- `app/login/` - 登录页面
- `app/dashboard/` - 主要功能模块:
  - `users/` - 用户管理
  - `suppliers/` - 供应商管理
  - `supplier-products/` - 供货关系管理
  - `warehouses/` - 仓库管理
  - `products/` - 商品管理
  - `combo-products/` - 组合商品管理
  - `purchase-orders/` - 采购订单管理
  - `inventory/` - 库存管理

#### 组件架构
- `components/ui/` - shadcn/ui 基础组件
- `components/dashboard/` - 业务组件
- `types/` - TypeScript 类型定义
- `lib/` - 工具函数

## 开发规范

### 后端开发规范 (来自 .cursor/rules/fastapi.mdc)
- 使用函数式编程，避免不必要的类
- 所有函数签名使用类型提示
- API 使用 Pydantic 模型进行输入验证
- 异步操作使用 `async def`，同步操作使用 `def`
- 错误处理优先，使用早期返回模式
- 使用 HTTPException 处理预期错误

### 前端开发规范 (来自 .cursor/rules/nextjs.mdc)
- 优先使用 const 而非 function
- 事件处理函数使用 "handle" 前缀 (handleClick, handleSubmit)
- 样式使用 Tailwind classes，避免 CSS 文件
- 实现无障碍功能 (aria-label, tabindex 等)
- 使用早期返回提高代码可读性

## 数据库

### 核心实体关系
- **User** - 用户管理 (管理员/普通用户角色)
- **Supplier** - 供应商信息
- **Warehouse** - 仓库管理
- **Product** - 商品信息 (支持商品/包材类型)
- **ComboProduct** - 组合商品 (多件装商品)
- **Inventory** - 库存记录 (四阶段状态)
- **PurchaseOrder** - 采购订单
- **SupplierProduct** - 供货关系
- **PackagingRelation** - 包材关系 (多对多)

### 数据库连接
- **默认数据库**: postgresql://postgres:password@localhost:5432/dsx_erp
- **配置位置**: backend/alembic.ini 和 backend/app/core/config.py

## 重要技术特性

### 异步数据库操作
- 使用 SQLAlchemy 2.0 异步特性
- 数据库会话通过依赖注入管理
- 关联查询使用 `selectinload` 预加载

### 权限控制
- JWT 身份验证
- 基于角色的权限控制
- 前端界面根据用户角色动态显示

### 文件上传
- 商品图片上传到 `backend/uploads/` 目录
- 静态文件服务通过 `/uploads` 路径访问
- Excel 文件导入功能 (供货关系等)

## 业务流程

### 采购流程
1. 创建采购订单 → 增加在途库存
2. 记录到货 → 在途库存转为半成品
3. 商品打包 → 半成品转为成品 (消耗包材)
4. 商品出库 → 成品转为出库记录

### 组合商品流程
1. 创建组合商品，设置基础商品组合关系
2. 系统自动计算可组装数量
3. 执行组装 → 消耗基础商品成品库存
4. 组合商品出库管理