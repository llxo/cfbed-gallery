import React, { useRef, useEffect } from 'react';
import { ImageItem } from '@/types';

interface ThumbnailStripProps {
  items: ImageItem[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
}

export const ThumbnailStrip: React.FC<ThumbnailStripProps> = ({
  items,
  currentIndex,
  onSelectIndex,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 当当前图片索引变化时，自动将选中缩略图平滑滚动到正中间
  useEffect(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const activeItem = container.children[currentIndex] as HTMLElement | undefined;
    if (activeItem) {
      const scrollLeft = activeItem.offsetLeft - container.offsetWidth / 2 + activeItem.offsetWidth / 2;
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, [currentIndex]);

  if (!items || items.length === 0) return null;

  return (
    <div className="relative z-30 flex h-14 w-full items-center justify-center pointer-events-auto select-none">
      <div
        ref={scrollRef}
        className="flex max-w-2xl items-center gap-1.5 overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-1.5 backdrop-blur-xl shadow-2xl scrollbar-none"
      >
        {items.map((item, idx) => {
          const isActive = idx === currentIndex;
          return (
            <button
              key={item.id}
              onClick={() => onSelectIndex(idx)}
              className={`group relative h-9 w-12 shrink-0 overflow-hidden rounded-[2px] transition-all duration-200 ${
                isActive
                  ? 'ring-2 ring-white/90 scale-105 opacity-100 z-10'
                  : 'opacity-40 hover:opacity-80 hover:scale-102'
              }`}
            >
              <img
                src={item.url}
                alt={item.fileName}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};
