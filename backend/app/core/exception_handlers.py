from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
import traceback
from typing import Union

from app.core.logging_config import get_error_logger


error_logger = get_error_logger()


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """处理HTTP异常"""
    request_id = getattr(request.state, 'request_id', 'unknown')
    
    # 记录HTTP异常
    error_logger.warning(
        f"HTTP Exception: {exc.status_code} - {exc.detail}",
        extra={
            "request_id": request_id,
            "method": request.method,
            "endpoint": str(request.url),
            "status_code": exc.status_code,
            "error_detail": exc.detail,
            "event": "http_exception"
        }
    )
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "message": exc.detail,
            "status_code": exc.status_code,
            "request_id": request_id
        }
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """处理一般异常"""
    request_id = getattr(request.state, 'request_id', 'unknown')
    
    # 记录详细的异常信息
    error_logger.error(
        f"Unhandled Exception: {type(exc).__name__}: {str(exc)}",
        extra={
            "request_id": request_id,
            "method": request.method,
            "endpoint": str(request.url),
            "exception_type": type(exc).__name__,
            "exception_message": str(exc),
            "traceback": traceback.format_exc(),
            "event": "unhandled_exception"
        },
        exc_info=True
    )
    
    return JSONResponse(
        status_code=500,
        content={
            "error": True,
            "message": "Internal server error",
            "status_code": 500,
            "request_id": request_id
        }
    )


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """处理验证异常"""
    request_id = getattr(request.state, 'request_id', 'unknown')
    
    # 记录验证异常
    error_logger.warning(
        f"Validation Exception: {str(exc)}",
        extra={
            "request_id": request_id,
            "method": request.method,
            "endpoint": str(request.url),
            "exception_type": type(exc).__name__,
            "exception_message": str(exc),
            "event": "validation_exception"
        }
    )
    
    return JSONResponse(
        status_code=422,
        content={
            "error": True,
            "message": "Validation error",
            "detail": str(exc),
            "status_code": 422,
            "request_id": request_id
        }
    )
