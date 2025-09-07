import logging
import logging.config
import os
from datetime import datetime
from typing import Dict, Any
import json


class JSONFormatter(logging.Formatter):
    """自定义JSON格式化器，用于结构化日志"""
    
    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # 添加异常信息
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        
        # 添加额外的上下文信息
        if hasattr(record, 'request_id'):
            log_entry["request_id"] = record.request_id
        if hasattr(record, 'user_id'):
            log_entry["user_id"] = record.user_id
        if hasattr(record, 'endpoint'):
            log_entry["endpoint"] = record.endpoint
        if hasattr(record, 'method'):
            log_entry["method"] = record.method
        if hasattr(record, 'status_code'):
            log_entry["status_code"] = record.status_code
        if hasattr(record, 'response_time'):
            log_entry["response_time"] = record.response_time
        
        return json.dumps(log_entry, ensure_ascii=False)


def setup_logging() -> None:
    """设置日志配置"""
    
    # 确保日志目录存在
    log_dir = "logs"
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)
    
    # 日志配置
    logging_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
            "detailed": {
                "format": "%(asctime)s - %(name)s - %(levelname)s - %(module)s:%(funcName)s:%(lineno)d - %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
            "json": {
                "()": JSONFormatter,
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "level": "INFO",
                "formatter": "default",
                "stream": "ext://sys.stdout",
            },
            "file_info": {
                "class": "logging.handlers.RotatingFileHandler",
                "level": "INFO",
                "formatter": "detailed",
                "filename": "logs/app.log",
                "maxBytes": 10485760,  # 10MB
                "backupCount": 5,
                "encoding": "utf8",
            },
            "file_error": {
                "class": "logging.handlers.RotatingFileHandler",
                "level": "ERROR",
                "formatter": "json",
                "filename": "logs/error.log",
                "maxBytes": 10485760,  # 10MB
                "backupCount": 10,
                "encoding": "utf8",
            },
            "file_api": {
                "class": "logging.handlers.RotatingFileHandler",
                "level": "INFO",
                "formatter": "json",
                "filename": "logs/api.log",
                "maxBytes": 10485760,  # 10MB
                "backupCount": 5,
                "encoding": "utf8",
            },
        },
        "loggers": {
            "": {  # root logger
                "level": "INFO",
                "handlers": ["console", "file_info"],
            },
            "app": {
                "level": "INFO",
                "handlers": ["console", "file_info", "file_error"],
                "propagate": False,
            },
            "app.api": {
                "level": "INFO",
                "handlers": ["file_api", "file_error"],
                "propagate": False,
            },
            "app.error": {
                "level": "ERROR",
                "handlers": ["console", "file_error"],
                "propagate": False,
            },
            "uvicorn.access": {
                "level": "INFO",
                "handlers": ["file_api"],
                "propagate": False,
            },
            "sqlalchemy.engine": {
                "level": "WARNING",
                "handlers": ["file_info"],
                "propagate": False,
            },
        },
    }
    
    logging.config.dictConfig(logging_config)


def get_logger(name: str = None) -> logging.Logger:
    """获取日志记录器"""
    if name is None:
        name = "app"
    return logging.getLogger(name)


def get_api_logger() -> logging.Logger:
    """获取API专用日志记录器"""
    return logging.getLogger("app.api")


def get_error_logger() -> logging.Logger:
    """获取错误专用日志记录器"""
    return logging.getLogger("app.error")
