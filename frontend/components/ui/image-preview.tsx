"use client"

import { useState } from 'react'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImagePreviewProps {
  src: string
  alt: string
  fallbackSrc?: string
  className?: string
  children?: React.ReactNode
  showTrigger?: boolean
}

export function ImagePreview({
  src,
  alt,
  fallbackSrc = '/placeholder-image.png',
  className,
  children,
  showTrigger = true
}: ImagePreviewProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [imageError, setImageError] = useState(false)

  const handleImageError = () => {
    setImageError(true)
  }

  const imageSrc = imageError && fallbackSrc ? fallbackSrc : src

  if (!src) {
    return children || null
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          {children || (
            <img
              src={imageSrc}
              alt={alt}
              className={cn("cursor-pointer hover:opacity-80 transition-opacity", className)}
              onError={handleImageError}
            />
          )}
        </DialogTrigger>
      )}

      <DialogContent className="max-w-5xl w-[95vw] h-[95vh] max-h-[95vh] p-0 overflow-hidden bg-white border-0 shadow-2xl">
        <div className="relative w-full h-full flex flex-col">
          {/* 右上角关闭按钮 */}
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-4 right-4 z-10 rounded-full bg-white/80 backdrop-blur-sm p-2 hover:bg-white/90 transition-colors shadow-md"
          >
            <X className="h-5 w-5 text-gray-600" />
            <span className="sr-only">关闭</span>
          </button>

          {/* 图片容器 */}
          <div className="flex-1 flex items-center justify-center p-8 bg-gray-50/50 overflow-hidden">
            <img
              src={imageSrc}
              alt={alt}
              className="w-full h-full object-contain rounded-lg shadow-lg"
              style={{
                maxWidth: 'calc(100% - 4rem)',
                maxHeight: 'calc(100% - 4rem)'
              }}
              onError={handleImageError}
            />
          </div>

          {/* 底部信息 */}
          <div className="p-3 border-t bg-gray-50 text-center">
            <p className="text-sm text-gray-600">{alt}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// 可点击的图片预览组件
export function ClickableImage({
  src,
  alt,
  fallbackSrc,
  className
}: Omit<ImagePreviewProps, 'children' | 'showTrigger'>) {
  if (!src) {
    return <div className={cn("bg-gray-200 rounded flex items-center justify-center", className)}>
      <div className="text-gray-400 text-xs text-center">无图片</div>
    </div>
  }

  return (
    <ImagePreview
      src={src}
      alt={alt}
      fallbackSrc={fallbackSrc}
      className={className}
    >
      <img
        src={src}
        alt={alt}
        className={cn("cursor-pointer hover:opacity-80 transition-opacity", className)}
        onError={(e) => {
          if (fallbackSrc) {
            e.currentTarget.src = fallbackSrc
          }
        }}
      />
    </ImagePreview>
  )
}

export default ImagePreview