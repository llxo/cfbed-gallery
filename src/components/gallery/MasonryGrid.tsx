import React, { useMemo, useEffect, useState, useRef } from 'react';
import { ImageItem } from '@/types';
import { PhotoCard } from './PhotoCard';
import { Image as ImageIcon, Loader2 } from 'lucide-react';

import { BackdropResult } from '@/lib/color';

interface MasonryGridProps {
  items: ImageItem[];
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onPreview?: (
    item: ImageItem,
    sourceRect?: DOMRect,
    metrics?: { naturalWidth: number; naturalHeight: number },
    initialBackdrop?: BackdropResult | null
  ) => void;
}

export const MasonryGrid: React.FC<MasonryGridProps> = ({
  items,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  onPreview,
}) => {
  // 底部无限滚动哨兵元素引用
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 根据视口宽度计算 Afilmory 风格的最佳列数（列宽约 240~280px）
  const [columnCount, setColumnCount] = useState<number>(5);

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width < 540) {
        setColumnCount(2); // 小屏手机 2 列
      } else if (width < 840) {
        setColumnCount(3); // 平板 3 列
      } else if (width < 1200) {
        setColumnCount(4); // 笔记本 4 列
      } else if (width < 1600) {
        setColumnCount(5); // 桌面 5 列
      } else if (width < 2100) {
        setColumnCount(6); // 宽屏 6 列
      } else if (width < 2600) {
        setColumnCount(7); // 超宽 7 列
      } else {
        setColumnCount(8); // 4K 8 列
      }
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  // IntersectionObserver 实现自动触底无限滚动
  useEffect(() => {
    if (!hasMore || loadingMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore?.();
        }
      },
      {
        rootMargin: '600px', // 提前 600px 预加载，体验极致顺滑
        threshold: 0,
      }
    );

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
    };
  }, [hasMore, loadingMore, loading, onLoadMore]);

  // 列高度累加平衡分发
  const columns = useMemo(() => {
    const cols: ImageItem[][] = Array.from({ length: columnCount }, () => []);
    const colHeights: number[] = Array(columnCount).fill(0);

    items.forEach((item) => {
      let minColIndex = 0;
      let minHeight = colHeights[0];
      for (let i = 1; i < columnCount; i++) {
        if (colHeights[i] < minHeight) {
          minHeight = colHeights[i];
          minColIndex = i;
        }
      }

      cols[minColIndex].push(item);
      const ratio = item.aspectRatio || 1.33;
      colHeights[minColIndex] += 1 / ratio;
    });

    return cols;
  }, [items, columnCount]);

  // 初次加载骨架屏（严格 4px 间距）
  if (loading && items.length === 0) {
    return (
      <div className="flex w-full gap-[4px]">
        {Array.from({ length: columnCount }).map((_, cIdx) => (
          <div key={cIdx} className="flex flex-1 flex-col gap-[4px]">
            {Array.from({ length: 4 }).map((_, rIdx) => {
              const heights = ['aspect-[3/4]', 'aspect-[4/3]', 'aspect-[1/1]', 'aspect-[16/9]'];
              const hClass = heights[(cIdx + rIdx) % heights.length];
              return (
                <div
                  key={rIdx}
                  className={`w-full ${hClass} animate-pulse rounded-[2px] bg-white/[0.04]`}
                />
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  // 空状态
  if (!loading && items.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center select-none">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.05] text-white/40">
          <ImageIcon className="h-6 w-6" />
        </div>
        <h3 className="mt-3 text-sm font-medium text-white/70">当前目录下暂无照片</h3>
        <p className="mt-1 text-xs text-white/30">请切换文件夹或检查网络</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* 严格等宽 4px 像素级等距瀑布流画卷 */}
      <div className="flex w-full items-start gap-[4px]">
        {columns.map((colItems, colIdx) => (
          <div key={colIdx} className="flex flex-1 flex-col gap-[4px]">
            {colItems.map((item) => (
              <PhotoCard key={item.id} item={item} onPreview={onPreview} />
            ))}
          </div>
        ))}
      </div>

      {/* 无限滚动哨兵与加载提示 */}
      <div
        ref={sentinelRef}
        className="flex w-full justify-center py-8 select-none"
      >
        {loadingMore && (
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-1.5 text-xs text-white/60 backdrop-blur-md">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-white/70" />
            <span>加载更多中...</span>
          </div>
        )}

        {!hasMore && items.length > 0 && (
          <div className="text-[11px] text-white/30">
            共 {items.length} 张照片，已全部呈现
          </div>
        )}
      </div>
    </div>
  );
};
