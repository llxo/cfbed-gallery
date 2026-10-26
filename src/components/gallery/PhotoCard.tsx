import React, { useState, useRef, useEffect } from 'react';
import { ImageItem } from '@/types';
import { formatFileSize, formatTimestamp, copyToClipboard } from '@/lib/utils';
import { extractBackdropFromImageElement, BackdropResult } from '@/lib/color';
import { Copy, Check, ExternalLink, Tag } from 'lucide-react';

interface PhotoCardProps {
  item: ImageItem;
  onPreview?: (
    item: ImageItem,
    sourceRect?: DOMRect,
    metrics?: { naturalWidth: number; naturalHeight: number },
    initialBackdrop?: BackdropResult | null
  ) => void;
}

// 模块级单例 IntersectionObserver：执行视口动态卸载（DOM Recycling）
// 视口上下保留 1000px 缓冲，超出缓冲的离屏卡片自动卸载 <img> 标签以释放解码位图显存与 RAM
type ObserverCallback = (isIntersecting: boolean) => void;
const observerCallbacks = new Map<Element, ObserverCallback>();

let sharedObserver: IntersectionObserver | null = null;

function getSharedObserver(): IntersectionObserver | null {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return null;
  }
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const cb = observerCallbacks.get(entry.target);
          if (cb) {
            cb(entry.isIntersecting);
          }
        }
      },
      {
        rootMargin: '1000px 0px 1000px 0px',
        threshold: 0,
      }
    );
  }
  return sharedObserver;
}

function observeCard(el: Element, cb: ObserverCallback) {
  const obs = getSharedObserver();
  if (!obs) {
    cb(true);
    return;
  }
  observerCallbacks.set(el, cb);
  obs.observe(el);
}

function unobserveCard(el: Element) {
  const obs = getSharedObserver();
  if (obs) {
    observerCallbacks.delete(el);
    obs.unobserve(el);
  }
}

export const PhotoCard: React.FC<PhotoCardProps> = ({ item, onPreview }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  // 视口可见性：超出视口 1000px 范围后为 false，触发内部 <img> 卸载
  const [isInViewport, setIsInViewport] = useState<boolean>(true);

  // 宽高比精准锁定：优先使用元数据，缺失时通过首次加载测量锁定，杜绝 CLS 布局抖动
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(
    item.aspectRatio || (item.width && item.height ? item.width / item.height : undefined)
  );

  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  // 监听卡片进入/移出视口缓冲（1000px）
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    observeCard(el, (isIntersecting) => {
      setIsInViewport(isIntersecting);
    });

    return () => {
      unobserveCard(el);
    };
  }, []);

  // 当 item 变化时重置状态
  useEffect(() => {
    setLoaded(false);
    setError(false);
    if (item.aspectRatio || (item.width && item.height)) {
      setAspectRatio(item.aspectRatio || (item.width && item.height ? item.width / item.height : undefined));
    }
  }, [item.id, item.url, item.aspectRatio, item.width, item.height]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setLoaded(true);
    // 若原先无宽高元数据，首次加载成功后锁定测量的宽高比，避免后续卸载与滚回时抖动
    if (!aspectRatio) {
      const img = e.currentTarget;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setAspectRatio(img.naturalWidth / img.naturalHeight);
      }
    }
  };

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

  const activeAspect = aspectRatio || 1.33;

  return (
    <div
      ref={cardRef}
      data-photo-id={item.id}
      onClick={() => {
        const imgEl = cardRef.current?.querySelector('img');
        const rect = (imgEl || cardRef.current)?.getBoundingClientRect();
        const naturalWidth = imgEl?.naturalWidth || item.width || 0;
        const naturalHeight = imgEl?.naturalHeight || item.height || 0;
        const backdrop = imgEl ? extractBackdropFromImageElement(imgEl) : null;
        onPreview?.(item, rect, { naturalWidth, naturalHeight }, backdrop);
      }}
      style={{
        aspectRatio: activeAspect,
        contentVisibility: 'auto',
        containIntrinsicSize: `auto 280px ${Math.round(280 / activeAspect)}px`,
      }}
      className="group relative w-full cursor-pointer overflow-hidden rounded-[2px] bg-[#141416] transition-all duration-300"
    >
      {/* 骨架屏占位 */}
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center animate-pulse bg-white/[0.04]">
          <div className="h-5 w-5 rounded-full border-2 border-white/10 border-t-white/80 animate-spin" />
        </div>
      )}

      {/* 真实图片：仅在视口上下 1000px 缓冲内挂载，滚出缓冲后卸载，彻底释放解码位图显存 */}
      {isInViewport && !error && (
        <img
          src={item.url}
          alt={item.fileName}
          crossOrigin="anonymous"
          loading="lazy"
          decoding="async"
          onLoad={handleImageLoad}
          onError={() => {
            setError(true);
            setLoaded(true);
          }}
          className={`h-full w-full block object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* 加载失败兜底 */}
      {error && (
        <div className="flex h-full w-full flex-col items-center justify-center bg-white/[0.02] p-4 text-center">
          <span className="text-xs text-white/40">加载失败</span>
          <span className="mt-1 line-clamp-1 text-[11px] text-white/20">{item.fileName}</span>
        </div>
      )}

      {/* Afilmory 风格悬浮覆盖层（仅在已挂载且加载完毕时呈现） */}
      {isInViewport && loaded && (
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
