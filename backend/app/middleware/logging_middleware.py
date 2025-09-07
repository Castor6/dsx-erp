import time
import uuid
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
import logging

from app.core.logging_config import get_api_logger, get_error_logger


class LoggingMiddleware(BaseHTTPMiddleware):
    """请求响应日志中间件"""
    
    def __init__(self, app, logger_name: str = "app.api"):
        super().__init__(app)
        self.logger = get_api_logger()
        self.error_logger = get_error_logger()
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 生成请求ID
        request_id = str(uuid.uuid4())
        
        # 记录请求开始时间
        start_time = time.time()
        
        # 获取请求信息
        method = request.method
        url = str(request.url)
        client_ip = self.get_client_ip(request)
        user_agent = request.headers.get("user-agent", "")
        
        # 获取用户信息（如果已认证）
        user_id = None
        if hasattr(request.state, 'user'):
            user_id = getattr(request.state.user, 'id', None)
        
        # 记录请求开始
        self.logger.info(
            f"Request started: {method} {url}",
            extra={
                "request_id": request_id,
                "method": method,
                "endpoint": url,
                "client_ip": client_ip,
                "user_agent": user_agent,
                "user_id": user_id,
                "event": "request_start"
            }
        )
        
        # 将请求ID添加到request state
        request.state.request_id = request_id
        
        try:
            # 处理请求
            response = await call_next(request)
            
            # 计算响应时间
            process_time = time.time() - start_time
            
            # 记录响应
            self.logger.info(
                f"Request completed: {method} {url} - {response.status_code}",
                extra={
                    "request_id": request_id,
                    "method": method,
                    "endpoint": url,
                    "status_code": response.status_code,
                    "response_time": round(process_time * 1000, 2),  # 毫秒
                    "client_ip": client_ip,
                    "user_id": user_id,
                    "event": "request_complete"
                }
            )
            
            # 添加响应头
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Process-Time"] = str(round(process_time * 1000, 2))
            
            return response
            
        except Exception as exc:
            # 计算响应时间
            process_time = time.time() - start_time
            
            # 记录错误
            self.error_logger.error(
                f"Request failed: {method} {url} - {type(exc).__name__}: {str(exc)}",
                extra={
                    "request_id": request_id,
                    "method": method,
                    "endpoint": url,
                    "response_time": round(process_time * 1000, 2),
                    "client_ip": client_ip,
                    "user_id": user_id,
                    "event": "request_error",
                    "exception_type": type(exc).__name__,
                    "exception_message": str(exc)
                },
                exc_info=True
            )
            
            # 重新抛出异常让FastAPI处理
            raise exc
    
    def get_client_ip(self, request: Request) -> str:
        """获取客户端IP地址"""
        # 检查代理头
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # 返回直接连接的IP
        return request.client.host if request.client else "unknown"
