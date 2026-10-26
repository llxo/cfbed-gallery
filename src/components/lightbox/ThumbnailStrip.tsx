import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { ImageItem } from '@/types';

interface ThumbnailStripProps {
  items: ImageItem[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  accentRgb?: string;
  accentHex?: string;
}

export const ThumbnailStrip: React.FC<ThumbnailStripProps> = ({
  items,
  currentIndex,
  onSelectIndex,
  accentRgb = '120, 120, 128',
  accentHex = '#787880',
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [isMobile, setIsMobile] = useState(false);

  // 视口尺寸监听
  useEffect(() => {
    const updateSize = () => {
      setIsMobile(window.innerWidth < 640);
      if (scrollRef.current) {
        setContainerWidth(scrollRef.current.clientWidth);
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const thumbnailHeight = isMobile ? 48 : 64;

  // 1. 预计算每个缩略图项的宽度与累积横向偏移坐标（用于高性能虚拟滚动）
  const { offsets, widths, totalWidth } = useMemo(() => {
    const widths: number[] = [];
    const offsets: number[] = [];
    let currentLeft = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const ratio =
        item.width && item.height ? Number((item.width / item.height).toFixed(3)) : 1.33;
      // 限制最小与最大比例，防止极端长条影响轨道视觉
      const clampedRatio = Math.max(0.5, Math.min(2.5, ratio));
      const w = Math.round(thumbnailHeight * clampedRatio);
      widths.push(w);
      offsets.push(currentLeft);
      currentLeft += w;
    }

    return { offsets, widths, totalWidth: currentLeft };
  }, [items, thumbnailHeight]);

  // 2. 虚拟化可视窗口计算：仅在 DOM 中挂载当前视窗内可见的 8~14 张缩略图（外加左右各 350px 缓冲）
  // 彻底避免 50~500 张高清大图同时解码造成严重掉帧卡死
  const visibleItems = useMemo(() => {
    if (items.length === 0) return [];

    const buffer = 350; // 左右超量渲染缓冲区（px）
    const minX = scrollLeft - buffer;
    const maxX = scrollLeft + containerWidth + buffer;

    const visible: { index: number; item: ImageItem; left: number; width: number }[] = [];

    for (let i = 0; i < items.length; i++) {
      const left = offsets[i];
      const width = widths[i];
      const right = left + width;

      if (right >= minX && left <= maxX) {
        visible.push({ index: i, item: items[i], left, width });
      }
    }

    return visible;
  }, [items, offsets, widths, scrollLeft, containerWidth]);

  // 3. 监听滚动位置，使用 requestAnimationFrame 节流
  const rAFRef = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (rAFRef.current) return;
    rAFRef.current = requestAnimationFrame(() => {
      if (scrollRef.current) {
        setScrollLeft(scrollRef.current.scrollLeft);
      }
      rAFRef.current = null;
    });
  }, []);

  // 4. 当前选中照片变动时，平滑滚动至正中央
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || currentIndex < 0 || currentIndex >= items.length) return;

    const itemLeft = offsets[currentIndex];
    const itemWidth = widths[currentIndex];
    const centerPos = itemLeft + itemWidth / 2 - container.clientWidth / 2;

    container.scrollTo({
      left: Math.max(0, centerPos),
      behavior: 'smooth',
    });
  }, [currentIndex, offsets, widths, items.length]);

  // 5. 鼠标滚轮转横向滚动（rAF 批量平滑提交，彻底消除卡顿与重绘风暴）
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let pendingDelta = 0;
    let scrollRaf: number | null = null;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scrollAmount = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      pendingDelta += scrollAmount;

      if (!scrollRaf) {
        scrollRaf = requestAnimationFrame(() => {
          container.scrollLeft += pendingDelta;
          pendingDelta = 0;
          scrollRaf = null;
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
    };
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div
      className="relative z-30 flex h-12 sm:h-16 w-full shrink-0 items-center border-t border-white/10 bg-black/30 backdrop-blur-xl select-none pointer-events-auto"
      style={{
        boxShadow: `0 -8px 32px rgba(${accentRgb}, 0.08), 0 -4px 16px rgba(${accentRgb}, 0.06), 0 -2px 8px rgba(0, 0, 0, 0.4)`,
      }}
    >
      {/* 顶部微光与主色内发光渐变层 */}
      <div
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-700"
        style={{
          background: `linear-gradient(to top, rgba(${accentRgb}, 0.08), transparent)`,
        }}
      />

      {/* 高性能虚拟化横向滚动轨道 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative z-10 h-full w-full overflow-x-auto overflow-y-hidden scrollbar-none transform-gpu"
        style={{ contain: 'paint layout' }}
      >
        {/* 全宽占位容器（撑开原生滚动条尺寸） */}
        <div
          style={{
            width: `${totalWidth}px`,
            height: '100%',
            position: 'relative',
          }}
        >
          {visibleItems.map(({ index: idx, item, left, width }) => {
            const isActive = idx === currentIndex;

            return (
              <div
                key={item.id}
                style={{
                  position: 'absolute',
                  left: `${left}px`,
                  top: 0,
                  width: `${width}px`,
                  height: '100%',
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelectIndex(idx)}
                  style={{
                    width: '100%',
                    height: '100%',
                    borderColor: isActive ? accentHex : undefined,
                    boxShadow: isActive ? `0 0 20px rgba(${accentRgb}, 0.35)` : undefined,
                  }}
                  title={item.fileName}
                  className={`group relative h-full w-full overflow-hidden transition-all duration-200 bg-white/[0.03] ${
                    isActive
                      ? 'z-10 scale-[1.03] opacity-100 border-y-2 border-x-2'
                      : 'opacity-85 hover:opacity-100 border-r border-white/10'
                  }`}
                >
                  <img
                    src={item.url}
                    alt={item.fileName}
                    crossOrigin="anonymous"
                    loading="lazy"
                    draggable={false}
                    className="h-full w-full object-cover pointer-events-none select-none transition-transform duration-300 group-hover:scale-105"
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
