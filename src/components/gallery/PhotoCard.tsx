import React, { useState } from 'react';
import { ImageItem } from '@/types';
import { formatFileSize, formatTimestamp, copyToClipboard } from '@/lib/utils';
import { Copy, Check, ExternalLink, Tag } from 'lucide-react';

interface PhotoCardProps {
  item: ImageItem;
  onPreview?: (item: ImageItem) => void;
}

export const PhotoCard: React.FC<PhotoCardProps> = ({ item, onPreview }) => {
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyToClipboard(item.url);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenDirect = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(item.url, '_blank');
  };

  // 格式大写，如 JPG, PNG
  const formatExt = (item.fileType?.split('/')[1] || item.fileName.split('.').pop() || 'JPG').toUpperCase();

  return (
    <div
      onClick={() => onPreview?.(item)}
      className="group relative w-full cursor-pointer overflow-hidden rounded-[2px] bg-[#141416] transition-all duration-300"
    >
      {/* 骨架屏占位 */}
      {!loaded && !error && (
        <div className="relative aspect-[4/3] w-full animate-pulse bg-white/[0.04]">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-5 w-5 rounded-full border-2 border-white/10 border-t-white/80 animate-spin" />
          </div>
        </div>
      )}

      {/* 真实图片 */}
      {!error ? (
        <img
          src={item.url}
          alt={item.fileName}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setError(true);
            setLoaded(true);
          }}
          className={`w-full block object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] ${
            loaded ? 'opacity-100' : 'opacity-0 absolute inset-0'
          }`}
        />
      ) : (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center bg-white/[0.02] p-4 text-center">
          <span className="text-xs text-white/40">加载失败</span>
          <span className="mt-1 line-clamp-1 text-[11px] text-white/20">{item.fileName}</span>
        </div>
      )}

      {/* Afilmory 风格悬浮覆盖层 */}
      {loaded && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          {/* 右上角快捷操作 */}
          <div className="pointer-events-auto absolute top-2 right-2 flex items-center gap-1.5 opacity-0 transition-all duration-200 group-hover:opacity-100">
            <button
              onClick={handleCopy}
              title={copied ? '已复制直链' : '复制直链'}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/60 text-white/80 backdrop-blur-md transition-all hover:bg-black/90 hover:text-white"
            >
              {copied ? <Check className="h-3 w-3 text-white" /> : <Copy className="h-3 w-3" />}
            </button>
            <button
              onClick={handleOpenDirect}
              title="新标签页打开原图"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/60 text-white/80 backdrop-blur-md transition-all hover:bg-black/90 hover:text-white"
            >
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>

          {/* 底部摄影元数据 HUD 信息层 */}
          <div className="absolute inset-x-0 bottom-0 p-3 text-left text-white">
            <h3 className="line-clamp-1 text-xs font-semibold text-white/95 drop-shadow-sm sm:text-sm">
              {item.fileName}
            </h3>

            {/* 参数规格小字 */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-white/70">
              <span className="font-mono">{formatExt}</span>
              <span>•</span>
              {item.width && item.height && (
                <>
                  <span>{item.width} × {item.height}</span>
                  <span>•</span>
                </>
              )}
              <span>{formatFileSize(item.sizeMB)}</span>
              <span>•</span>
              <span>{formatTimestamp(item.timestamp)}</span>
            </div>

            {/* 标签胶囊 */}
            {item.tags && item.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur-md"
                  >
                    <Tag className="h-2 w-2 opacity-50" />
                    {tag}
                  </span>
                ))}
                {item.tags.length > 3 && (
                  <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] text-white/70">
                    +{item.tags.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
