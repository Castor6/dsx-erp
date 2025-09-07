from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from fastapi.responses import FileResponse
import shutil
import uuid
import os
from pathlib import Path

from app.core.security import get_current_active_user
from app.models.user import User

router = APIRouter()

# 确保上传目录存在
UPLOAD_DIR = Path("uploads/products")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# 允许的图片格式
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

# 最大文件大小（5MB）
MAX_FILE_SIZE = 5 * 1024 * 1024


@router.post("/image")
async def upload_product_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user)
):
    """上传商品图片"""
    
    # 检查文件类型
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件名不能为空"
        )
    
    file_extension = Path(file.filename).suffix.lower()
    if file_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件格式。支持的格式：{', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # 检查文件大小
    file_content = await file.read()
    if len(file_content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件大小不能超过5MB"
        )
    
    # 重置文件指针
    await file.seek(0)
    
    # 生成唯一文件名
    file_id = str(uuid.uuid4())
    filename = f"{file_id}{file_extension}"
    file_path = UPLOAD_DIR / filename
    
    # 保存文件
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="文件上传失败"
        )
    
    # 返回文件路径（相对路径）
    relative_path = f"/uploads/products/{filename}"
    
    return {
        "message": "文件上传成功",
        "file_path": relative_path,
        "filename": filename
    }


@router.get("/image/{filename}")
async def get_product_image(filename: str):
    """获取商品图片"""
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文件不存在"
        )
    
    return FileResponse(
        path=file_path,
        media_type="image/jpeg",  # 可以根据文件扩展名动态设置
        filename=filename
    )


@router.delete("/image/{filename}")
async def delete_product_image(
    filename: str,
    current_user: User = Depends(get_current_active_user)
):
    """删除商品图片"""
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文件不存在"
        )
    
    try:
        os.remove(file_path)
        return {"message": "文件删除成功"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="文件删除失败"
        )
