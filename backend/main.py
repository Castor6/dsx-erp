from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
import os

from app.core.config import settings
from app.core.database import engine, Base, async_engine
from app.api.api_v1.api import api_router
from app.core.logging_config import setup_logging, get_logger
from app.middleware.logging_middleware import LoggingMiddleware
from app.core.exception_handlers import (
    http_exception_handler,
    general_exception_handler,
    validation_exception_handler
)

# 导入所有模型以确保它们被注册到Base.metadata
from app.models import *

# 设置日志
setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时执行 - 创建数据库表
    logger.info("Application startup: Initializing database tables")
    try:
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database tables: {e}", exc_info=True)
        raise
    
    logger.info("Application startup completed")
    yield
    
    # 关闭时执行
    logger.info("Application shutdown: Disposing database connections")
    await async_engine.dispose()
    logger.info("Application shutdown completed")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="DSX ERP系统 - 采购和仓库管理",
    lifespan=lifespan
)

# 添加日志中间件
app.add_middleware(LoggingMiddleware)

# 设置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 添加异常处理器
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

# 确保上传目录存在
upload_dir = "uploads"
if not os.path.exists(upload_dir):
    os.makedirs(upload_dir)
    logger.info(f"Created upload directory: {upload_dir}")

# 静态文件服务
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# 注册路由
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")
async def root():
    return {"message": "DSX ERP API"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
