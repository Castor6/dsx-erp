from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, create_refresh_token, verify_refresh_token
from app.models.user import User
from app.schemas.user import Token, RefreshTokenRequest
from app.core.logging_config import get_logger

router = APIRouter()
logger = get_logger("app.api.auth")


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    request_id = getattr(request.state, 'request_id', 'unknown')
    username = form_data.username
    
    logger.info(
        f"Login attempt for user: {username}",
        extra={
            "request_id": request_id,
            "username": username,
            "event": "login_attempt"
        }
    )
    
    try:
        # 验证用户
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        
        if not user or not verify_password(form_data.password, user.hashed_password):
            logger.warning(
                f"Failed login attempt for user: {username} - Invalid credentials",
                extra={
                    "request_id": request_id,
                    "username": username,
                    "event": "login_failed",
                    "reason": "invalid_credentials"
                }
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户名或密码错误",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not user.is_active:
            logger.warning(
                f"Failed login attempt for user: {username} - Account disabled",
                extra={
                    "request_id": request_id,
                    "username": username,
                    "user_id": user.id,
                    "event": "login_failed",
                    "reason": "account_disabled"
                }
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="用户已被禁用"
            )
        
        # 创建访问令牌和刷新令牌
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username}, expires_delta=access_token_expires
        )
        
        refresh_token_expires = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        refresh_token = create_refresh_token(
            data={"sub": user.username}, expires_delta=refresh_token_expires
        )
        
        logger.info(
            f"Successful login for user: {username}",
            extra={
                "request_id": request_id,
                "username": username,
                "user_id": user.id,
                "event": "login_success"
            }
        )
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer"
        }
        
    except HTTPException:
        # 重新抛出HTTP异常
        raise
    except Exception as e:
        logger.error(
            f"Unexpected error during login for user: {username}",
            extra={
                "request_id": request_id,
                "username": username,
                "event": "login_error",
                "error": str(e)
            },
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="登录过程中发生错误"
        )


@router.post("/refresh", response_model=Token)
async def refresh_access_token(
    request: Request,
    refresh_request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """使用refresh token刷新access token"""
    request_id = getattr(request.state, 'request_id', 'unknown')
    
    logger.info(
        "Token refresh attempt",
        extra={
            "request_id": request_id,
            "event": "token_refresh_attempt"
        }
    )
    
    try:
        # 验证refresh token
        token_data = verify_refresh_token(refresh_request.refresh_token)
        if token_data is None:
            logger.warning(
                "Invalid refresh token",
                extra={
                    "request_id": request_id,
                    "event": "token_refresh_failed",
                    "reason": "invalid_token"
                }
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的刷新令牌"
            )
        
        # 验证用户是否存在且活跃
        result = await db.execute(select(User).where(User.username == token_data.username))
        user = result.scalar_one_or_none()
        
        if not user:
            logger.warning(
                f"User not found during token refresh: {token_data.username}",
                extra={
                    "request_id": request_id,
                    "username": token_data.username,
                    "event": "token_refresh_failed",
                    "reason": "user_not_found"
                }
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户不存在"
            )
        
        if not user.is_active:
            logger.warning(
                f"Inactive user attempted token refresh: {token_data.username}",
                extra={
                    "request_id": request_id,
                    "username": token_data.username,
                    "user_id": user.id,
                    "event": "token_refresh_failed",
                    "reason": "user_inactive"
                }
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户已被禁用"
            )
        
        # 创建新的access token和refresh token
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username}, expires_delta=access_token_expires
        )
        
        refresh_token_expires = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        new_refresh_token = create_refresh_token(
            data={"sub": user.username}, expires_delta=refresh_token_expires
        )
        
        logger.info(
            f"Successful token refresh for user: {user.username}",
            extra={
                "request_id": request_id,
                "username": user.username,
                "user_id": user.id,
                "event": "token_refresh_success"
            }
        )
        
        return {
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer"
        }
        
    except HTTPException:
        # 重新抛出HTTP异常
        raise
    except Exception as e:
        logger.error(
            "Unexpected error during token refresh",
            extra={
                "request_id": request_id,
                "event": "token_refresh_error",
                "error": str(e)
            },
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="刷新令牌过程中发生错误"
        )
