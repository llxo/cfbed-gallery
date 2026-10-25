import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ImageItem } from '@/types';
import { extractImageBackdrop } from '@/lib/color';
import { DetailDrawer } from './DetailDrawer';
import { ThumbnailStrip } from './ThumbnailStrip';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  PanelRight,
} from 'lucide-react';

interface LightboxModalProps {
  items: ImageItem[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  items,
  currentIndex,
  isOpen,
  onClose,
  onIndexChange,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 双缓冲流光交叉溶解背景状态 (Buffer A / Buffer B)
  const [bufferA, setBufferA] = useState<string | null>(null);
  const [bufferB, setBufferB] = useState<string | null>(null);
  const [activeBuffer, setActiveBuffer] = useState<'A' | 'B'>('A');

  // 当前照片主色调 Accent (RGB 与 Hex)
  const [accentRgb, setAccentRgb] = useState<string>('120, 120, 128');
  const [accentHex, setAccentHex] = useState<string>('#787880');

  const currentItem = items[currentIndex] as ImageItem | undefined;
  const isFirstRender = useRef(true);

  // 1:1 对齐 Afilmory 的低频流光背景抽取与双缓冲交叉溶解
  useEffect(() => {
    if (!currentItem) return;
    let isCancelled = false;

    extractImageBackdrop(currentItem.url).then((res) => {
      if (isCancelled) return;

      setAccentRgb(res.accentRgb);
      setAccentHex(res.accentHex);

      if (isFirstRender.current) {
        // 首屏直接载入 Buffer A
        setBufferA(res.backdropUrl);
        setActiveBuffer('A');
        isFirstRender.current = false;
      } else {
        // 后续平滑交替淡入淡出（Cross-Dissolve）
        if (activeBuffer === 'A') {
          setBufferB(res.backdropUrl);
          setActiveBuffer('B');
        } else {
          setBufferA(res.backdropUrl);
          setActiveBuffer('A');
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [currentItem?.url]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
    }
  }, [currentIndex, onIndexChange]);

  const handleNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      onIndexChange(currentIndex + 1);
    }
  }, [currentIndex, items.length, onIndexChange]);

  // 键盘快捷键监听：← 上一张，→ 下一张，Esc 关闭，i 打开/关闭抽屉
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drawerOpen && window.innerWidth < 768) {
          setDrawerOpen(false);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'i' || e.key === 'I') {
        setDrawerOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handlePrevious, handleNext, drawerOpen]);

  if (!isOpen || !currentItem) return null;

  return (
    <div className="fixed inset-0 z-50 flex h-full w-full overflow-hidden bg-[#0d0d0f] select-none animate-in fade-in duration-200">
      {/* 
        1:1 复刻 Afilmory 原生 Thumbhash 双缓冲交叉溶解流光背景体系：
        - 缓冲区 A / B 独立层级平滑交叉溶解（700ms 缓动），彻底杜绝闪黑或闪白
        - 纯净透亮，无多余黑灰色压制遮罩，真实还原本色流光
      */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none bg-black">
        {/* 流光缓冲区 A */}
        {bufferA && (
          <div
            className="absolute inset-0 transition-opacity duration-700 ease-in-out"
            style={{ opacity: activeBuffer === 'A' ? 1 : 0 }}
          >
            <img
              src={bufferA}
              alt=""
              className="h-full w-full object-cover scale-110 blur-2xl brightness-75 transform-gpu"
            />
          </div>
        )}

        {/* 流光缓冲区 B */}
        {bufferB && (
          <div
            className="absolute inset-0 transition-opacity duration-700 ease-in-out"
            style={{ opacity: activeBuffer === 'B' ? 1 : 0 }}
          >
            <img
              src={bufferB}
              alt=""
              className="h-full w-full object-cover scale-110 blur-2xl brightness-75 transform-gpu"
            />
          </div>
        )}
      </div>

      {/* 
        主展示区与大图舞台：
        - 完全沉浸式架构
        - 与右侧 DetailDrawer 保持联动，侧边栏展开时主舞台平滑收缩，大图自然保持居中
      */}
      <div className="relative z-10 flex flex-1 flex-col h-full w-full min-h-0 min-w-0 overflow-hidden transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
        {/* 右上角原生浮动按钮群（Apple UIKit 风格） */}
        <div className="absolute top-4 right-4 z-40 flex items-center gap-2 pointer-events-auto">
          {/* 照片序号徽标 */}
          <div className="flex h-8 items-center px-3 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[11px] font-mono text-white/80 shadow-lg">
            {currentIndex + 1} / {items.length}
          </div>

          {/* 详细信息面板切换按钮 */}
          <button
            onClick={() => setDrawerOpen((prev) => !prev)}
            title={drawerOpen ? '收起详情 (I)' : '查看详情 (I)'}
            className={`flex size-8 items-center justify-center rounded-full backdrop-blur-md border shadow-lg transition-all duration-200 ${
              drawerOpen
                ? 'bg-white/20 text-white border-white/25 shadow-md scale-105'
                : 'bg-black/40 text-white/70 border-white/10 hover:bg-black/70 hover:text-white hover:scale-105'
            }`}
          >
            <PanelRight className="size-4" strokeWidth={1.5} />
          </button>

          {/* 新标签页打开原图 */}
          <button
            onClick={() => window.open(currentItem.url, '_blank')}
            title="在新标签页打开原图"
            className="flex size-8 items-center justify-center rounded-full bg-black/40 text-white/70 backdrop-blur-md border border-white/10 shadow-lg transition-all duration-200 hover:bg-black/70 hover:text-white hover:scale-105"
          >
            <ExternalLink className="size-3.5" strokeWidth={1.5} />
          </button>

          {/* 关闭预览按钮 */}
          <button
            onClick={onClose}
            title="关闭 (Esc)"
            className="flex size-8 items-center justify-center rounded-full bg-black/40 text-white/70 backdrop-blur-md border border-white/10 shadow-lg transition-all duration-200 hover:bg-black/70 hover:text-white hover:scale-105"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* 中间大图舞台（零裁切，完整包含，立体悬浮在流光背景上） */}
        <div
          className="relative z-10 flex flex-1 min-h-0 min-w-0 w-full items-center justify-center p-3 sm:p-5"
          onClick={() => {
            if (drawerOpen && window.innerWidth < 768) {
              setDrawerOpen(false);
            }
          }}
        >
          {/* 上一张按钮 */}
          {currentIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrevious();
              }}
              title="上一张 (←)"
              className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-30 flex size-9 sm:size-10 items-center justify-center rounded-full bg-black/40 text-white/70 backdrop-blur-md border border-white/10 transition-all duration-200 hover:scale-110 hover:bg-black/80 hover:text-white shadow-2xl"
            >
              <ChevronLeft className="size-5 sm:size-6" strokeWidth={1.5} />
            </button>
          )}

          {/* 真实大图 */}
          <img
            key={currentItem.id}
            src={currentItem.url}
            alt={currentItem.fileName}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full w-auto h-auto object-contain select-none rounded-lg shadow-[0_24px_64px_rgba(0,0,0,0.7)] ring-1 ring-white/10 transition-all duration-200 animate-in fade-in zoom-in-98 duration-150"
            style={{ maxHeight: '100%', maxWidth: '100%' }}
          />

          {/* 下一张按钮 */}
          {currentIndex < items.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              title="下一张 (→)"
              className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-30 flex size-9 sm:size-10 items-center justify-center rounded-full bg-black/40 text-white/70 backdrop-blur-md border border-white/10 transition-all duration-200 hover:scale-110 hover:bg-black/80 hover:text-white shadow-2xl"
            >
              <ChevronRight className="size-5 sm:size-6" strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* 底部缩略图导轨（shrink-0，不挤压大图舞台） */}
        <div className="relative z-20 shrink-0 pb-3">
          <ThumbnailStrip
            items={items}
            currentIndex={currentIndex}
            onSelectIndex={onIndexChange}
          />
        </div>
      </div>

      {/* 
        右侧照片元数据抽屉（DetailDrawer / Inspector）：
        - 1:1 对齐 Afilmory 交互：支持平滑滑入滑出、分段控制、参数工整清单、外链代码与 InnerGlow
      */}
      <DetailDrawer
        item={currentItem}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        accentRgb={accentRgb}
        accentHex={accentHex}
      />
    </div>
  );
};
