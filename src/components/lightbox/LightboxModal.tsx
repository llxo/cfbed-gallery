import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ImageItem } from '@/types';
import { extractImageBackdrop, extractBackdropFromImageElement, BackdropResult } from '@/lib/color';
import { DetailDrawer } from './DetailDrawer';
import { ThumbnailStrip } from './ThumbnailStrip';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  PanelRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';

interface LightboxModalProps {
  items: ImageItem[];
  currentIndex: number;
  isOpen: boolean;
  originRect?: DOMRect | null;
  originMetrics?: { naturalWidth: number; naturalHeight: number } | null;
  initialBackdrop?: BackdropResult | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  items,
  currentIndex,
  isOpen,
  originRect,
  originMetrics,
  initialBackdrop,
  onClose,
  onIndexChange,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 双缓冲流光交叉溶解背景状态 (Buffer A / Buffer B) - 首屏直接从已缓存的 initialBackdrop 瞬时注色
  const [bufferA, setBufferA] = useState<string | null>(initialBackdrop?.backdropUrl || null);
  const [bufferB, setBufferB] = useState<string | null>(null);
  const [activeBuffer, setActiveBuffer] = useState<'A' | 'B'>('A');

  // 当前照片主色调 Accent (RGB 与 Hex)
  const [accentRgb, setAccentRgb] = useState<string>(initialBackdrop?.accentRgb || '120, 120, 128');
  const [accentHex, setAccentHex] = useState<string>(initialBackdrop?.accentHex || '#787880');

  // 滚轮缩放与拖拽平移、手势滑动状态
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [swipeOffset, setSwipeOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isWheelZooming, setIsWheelZooming] = useState(false);

  const scaleRef = useRef(1);
  scaleRef.current = scale;
  const positionRef = useRef({ x: 0, y: 0 });
  positionRef.current = position;
  const isDraggingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, time: 0 });
  const posStartRef = useRef({ x: 0, y: 0 });
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const currentItem = items[currentIndex] as ImageItem | undefined;
  const isFirstRender = useRef(true);

  // 缩放控制动作
  const handleResetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setSwipeOffset({ x: 0, y: 0 });
    scaleRef.current = 1;
    positionRef.current = { x: 0, y: 0 };
    setIsDragging(false);
    setIsWheelZooming(false);
  }, []);

  // 1:1 ContainedImageFrame 目标居中几何矩形计算
  const targetFrame = useMemo(() => {
    const stageWidth = window.innerWidth;
    const stripHeight = window.innerWidth < 640 ? 48 : 64;
    const stageHeight = Math.max(0, window.innerHeight - stripHeight);

    const imgNaturalW = originMetrics?.naturalWidth || currentItem?.width || 0;
    const imgNaturalH = originMetrics?.naturalHeight || currentItem?.height || 0;

    let aspectRatio = 1.33;
    if (imgNaturalW > 0 && imgNaturalH > 0) {
      aspectRatio = imgNaturalW / imgNaturalH;
    } else if (originRect && originRect.width > 0 && originRect.height > 0) {
      aspectRatio = originRect.width / originRect.height;
    }

    const stageRatio = stageWidth / stageHeight;

    let width = stageWidth;
    let height = stageWidth / aspectRatio;

    if (aspectRatio < stageRatio) {
      // 竖图/高图：以舞台高度撑满视口，水平居中
      height = stageHeight;
      width = stageHeight * aspectRatio;
    } else {
      // 横图/宽图：以舞台宽度撑满视口，垂直居中
      width = stageWidth;
      height = stageWidth / aspectRatio;
    }

    const left = (stageWidth - width) / 2;
    const top = (stageHeight - height) / 2;

    return { width, height, left, top, aspectRatio };
  }, [currentItem, originMetrics, originRect]);

  // 单图 GPU FLIP 硬件级动画状态：'opening' | 'open' | 'closing'
  const [transitionPhase, setTransitionPhase] = useState<'opening' | 'open' | 'closing'>('opening');
  const [motionTransform, setMotionTransform] = useState<string>('none');
  const [motionTransition, setMotionTransition] = useState<string>('none');
  const [motionBorderRadius, setMotionBorderRadius] = useState<number>(0);
  const [motionOpacity, setMotionOpacity] = useState<number>(1);

  // 进场：单图 FLIP 极速居中展开（首帧通过 center-center 几何中心重合，260ms 瞬时弹开）
  useEffect(() => {
    if (!isOpen || !currentItem) {
      setTransitionPhase('opening');
      return;
    }

    if (originRect && targetFrame.width > 0 && targetFrame.height > 0) {
      const stageWidth = window.innerWidth;
      const stripHeight = window.innerWidth < 640 ? 48 : 64;
      const stageHeight = Math.max(0, window.innerHeight - stripHeight);

      const fullCenterX = stageWidth / 2;
      const fullCenterY = stageHeight / 2;

      const cardCenterX = originRect.left + originRect.width / 2;
      const cardCenterY = originRect.top + originRect.height / 2;

      const scale = originRect.width / targetFrame.width;
      const deltaX = cardCenterX - fullCenterX;
      const deltaY = cardCenterY - fullCenterY;

      setMotionTransform(`translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scale})`);
      setMotionBorderRadius(4);
      setMotionTransition('none');
      setMotionOpacity(1);
      setTransitionPhase('opening');

      // 下一帧：启动 260ms Apple 极速弹簧曲线瞬时展开
      const rAF = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setMotionTransition('transform 260ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 260ms ease-out');
          setMotionTransform('translate3d(0px, 0px, 0) scale(1)');
          setMotionBorderRadius(0);
        });
      });

      const timer = setTimeout(() => {
        setTransitionPhase('open');
        setMotionTransition('none');
      }, 260);

      return () => {
        cancelAnimationFrame(rAF);
        clearTimeout(timer);
      };
    } else {
      setTransitionPhase('open');
      setMotionTransform('translate3d(0px, 0px, 0) scale(1)');
      setMotionBorderRadius(0);
      setMotionTransition('none');
    }
  }, [isOpen, originRect, targetFrame]);

  // 退场：单图 FLIP 逆向瞬时缩回原卡片槽位（220ms 极速响应）
  const handleRequestClose = useCallback(() => {
    if (transitionPhase === 'closing') return;

    // 寻找对应网格卡片位置
    const targetCard = document.querySelector(`[data-photo-id="${currentItem?.id}"]`);
    const targetImg = targetCard?.querySelector('img') || targetCard;
    const targetRect = targetImg?.getBoundingClientRect();

    setTransitionPhase('closing');

    if (targetRect && targetRect.width > 0 && targetFrame.width > 0) {
      const stageWidth = window.innerWidth;
      const stripHeight = window.innerWidth < 640 ? 48 : 64;
      const stageHeight = Math.max(0, window.innerHeight - stripHeight);

      const fullCenterX = stageWidth / 2;
      const fullCenterY = stageHeight / 2;

      const targetCardCenterX = targetRect.left + targetRect.width / 2;
      const targetCardCenterY = targetRect.top + targetRect.height / 2;

      const scale = targetRect.width / targetFrame.width;
      const deltaX = targetCardCenterX - fullCenterX;
      const deltaY = targetCardCenterY - fullCenterY;

      setMotionTransition('transform 220ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 220ms ease-out');
      setMotionTransform(`translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scale})`);
      setMotionBorderRadius(4);
    } else {
      // 离屏降级：轻柔缩聚淡出
      setMotionTransition('transform 200ms ease-out, opacity 200ms ease-out');
      setMotionTransform('translate3d(0, 0, 0) scale(0.85)');
      setMotionOpacity(0);
    }

    setTimeout(() => {
      onClose();
    }, 220);
  }, [transitionPhase, currentItem?.id, targetFrame, onClose]);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(Number((prev * 1.25).toFixed(2)), 6));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => {
      const next = Math.max(Number((prev / 1.25).toFixed(2)), 1);
      if (next <= 1.05) {
        setPosition({ x: 0, y: 0 });
        return 1;
      }
      return next;
    });
  }, []);

  // 切换照片或重新打开预览时重置缩放
  useEffect(() => {
    handleResetZoom();
  }, [currentIndex, isOpen, handleResetZoom]);

  // 1:1 对齐 Afilmory 的低频流光背景抽取与双缓冲交叉溶解
  useEffect(() => {
    if (!isOpen || !currentItem) {
      if (!isOpen) {
        isFirstRender.current = true;
      }
      return;
    }
    let isCancelled = false;

    const updateBuffer = (res: BackdropResult) => {
      if (isCancelled) return;
      setAccentRgb(res.accentRgb);
      setAccentHex(res.accentHex);

      if (isFirstRender.current) {
        setBufferA(res.backdropUrl);
        setActiveBuffer('A');
        isFirstRender.current = false;
      } else {
        if (activeBuffer === 'A') {
          setBufferB(res.backdropUrl);
          setActiveBuffer('B');
        } else {
          setBufferA(res.backdropUrl);
          setActiveBuffer('A');
        }
      }
    };

    // 1. 若首屏有 initialBackdrop，直接极速应用
    if (isFirstRender.current && initialBackdrop) {
      updateBuffer(initialBackdrop);
      return;
    }

    // 2. 尝试从对应网格卡片 DOM 中同步提取
    const targetCard = document.querySelector(`[data-photo-id="${currentItem.id}"]`);
    const cardImg = targetCard?.querySelector('img') as HTMLImageElement | null;
    const syncBackdrop = cardImg ? extractBackdropFromImageElement(cardImg) : null;

    if (syncBackdrop) {
      updateBuffer(syncBackdrop);
      return;
    }

    // 3. 异步提取保底
    extractImageBackdrop(currentItem.url).then((res) => {
      updateBuffer(res);
    });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, currentIndex, currentItem?.id, currentItem?.url, initialBackdrop, activeBuffer]);

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

  // 鼠标滚轮以光标所指图片像素为几何中心精准缩放
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !isOpen) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const img = imageRef.current;
      if (!img) return;

      // 滚轮缩放期间关闭 CSS transition 缓动延迟，确保毫秒级像素对齐
      setIsWheelZooming(true);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => {
        setIsWheelZooming(false);
      }, 120);

      // 获取当前图片在视口中的精确视觉几何中心
      const imgRect = img.getBoundingClientRect();
      const imgCenterX = imgRect.left + imgRect.width / 2;
      const imgCenterY = imgRect.top + imgRect.height / 2;

      // 计算鼠标光标距离图片视觉中心的实际视口相对位移
      const mouseOffsetX = e.clientX - imgCenterX;
      const mouseOffsetY = e.clientY - imgCenterY;

      const currentScale = scaleRef.current;
      const currentPosition = positionRef.current;

      // 滚轮缩放步进因子
      const zoomFactor = e.deltaY < 0 ? 1.18 : 0.84;
      let nextScale = Math.min(Math.max(Number((currentScale * zoomFactor).toFixed(3)), 1), 6);

      // 若缩放接近 1x，完全吸附复位
      if (nextScale <= 1.02) {
        nextScale = 1;
        scaleRef.current = 1;
        positionRef.current = { x: 0, y: 0 };
        setScale(1);
        setPosition({ x: 0, y: 0 });
        return;
      }

      // 严格以鼠标指针所指像素为不动点计算补偿位移：
      // nextPos = currentPos + mouseOffset * (1 - nextScale / currentScale)
      const ratio = nextScale / currentScale;
      const nextX = currentPosition.x + mouseOffsetX * (1 - ratio);
      const nextY = currentPosition.y + mouseOffsetY * (1 - ratio);

      scaleRef.current = nextScale;
      positionRef.current = { x: nextX, y: nextY };

      setScale(nextScale);
      setPosition({ x: nextX, y: nextY });
    };

    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      stage.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen]);

  // 左键按下开始拖拽（支持大图平移与左右滑动手势）
  const handleStagePointerDown = (e: React.PointerEvent) => {
    // 仅响应鼠标左键或触控单指
    if (e.button !== 0) return;

    // 忽略点击在按钮或抽屉元素上的事件
    if ((e.target as HTMLElement).closest('button, a, input, [role="button"]')) {
      return;
    }

    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    posStartRef.current = { ...positionRef.current };
    setIsDragging(true);
  };

  // 全局监听鼠标拖拽与松开（防止鼠标移出视口丢帧）
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        hasDraggedRef.current = true;
      }

      const currentScale = scaleRef.current;

      if (currentScale > 1) {
        // 放大模式：自由拖拽平移图片（Pan）
        const nextX = posStartRef.current.x + deltaX;
        const nextY = posStartRef.current.y + deltaY;
        setPosition({ x: nextX, y: nextY });
      } else {
        // 1x 模式：左右拖动切图 / 下拉退出手势（Swipe to navigate / Pull to dismiss）
        if (Math.abs(deltaX) >= Math.abs(deltaY)) {
          setSwipeOffset({ x: deltaX, y: 0 });
        } else if (deltaY > 0) {
          setSwipeOffset({ x: 0, y: deltaY });
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      const deltaTime = Date.now() - dragStartRef.current.time;
      const velocityX = deltaX / (deltaTime || 1);
      const velocityY = deltaY / (deltaTime || 1);

      const currentScale = scaleRef.current;

      if (currentScale <= 1 && hasDraggedRef.current) {
        // 1x 模式释放：判断横向切图或下拉关闭
        if (deltaX < -70 || (deltaX < -30 && velocityX < -0.35)) {
          if (currentIndex < items.length - 1) {
            handleNext();
          }
        } else if (deltaX > 70 || (deltaX > 30 && velocityX > 0.35)) {
          if (currentIndex > 0) {
            handlePrevious();
          }
        } else if (deltaY > 100 || (deltaY > 50 && velocityY > 0.4)) {
          handleRequestClose();
        }
        setSwipeOffset({ x: 0, y: 0 });
      }

      // 拖拽释放后微延迟重置 hasDragged，阻断随后的原生 click 误触发
      if (hasDraggedRef.current) {
        setTimeout(() => {
          hasDraggedRef.current = false;
        }, 80);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isOpen, currentIndex, items.length, handleNext, handlePrevious, onClose]);

  // 双击快速聚焦光标处缩放 / 还原
  const handleDoubleClick = (e: React.MouseEvent<HTMLImageElement>) => {
    e.stopPropagation();
    if (scale > 1) {
      handleResetZoom();
    } else {
      const img = imageRef.current;
      if (!img) return;
      const imgRect = img.getBoundingClientRect();
      const imgCenterX = imgRect.left + imgRect.width / 2;
      const imgCenterY = imgRect.top + imgRect.height / 2;
      const mouseOffsetX = e.clientX - imgCenterX;
      const mouseOffsetY = e.clientY - imgCenterY;

      const targetScale = 2.5;
      const nextX = mouseOffsetX * (1 - targetScale);
      const nextY = mouseOffsetY * (1 - targetScale);

      scaleRef.current = targetScale;
      positionRef.current = { x: nextX, y: nextY };
      setScale(targetScale);
      setPosition({ x: nextX, y: nextY });
    }
  };

  // 键盘快捷键监听：← 上一张，→ 下一张，Esc 关闭/还原缩放，+/- 缩放，0 复位，i 打开/关闭抽屉
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (scale > 1) {
          handleResetZoom();
        } else if (drawerOpen && window.innerWidth < 768) {
          setDrawerOpen(false);
        } else {
          handleRequestClose();
        }
      } else if (e.key === 'ArrowLeft') {
        if (scale <= 1) handlePrevious();
      } else if (e.key === 'ArrowRight') {
        if (scale <= 1) handleNext();
      } else if (e.key === '0') {
        handleResetZoom();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        handleZoomOut();
      } else if (e.key === 'i' || e.key === 'I') {
        setDrawerOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    handleRequestClose,
    handlePrevious,
    handleNext,
    drawerOpen,
    scale,
    handleResetZoom,
    handleZoomIn,
    handleZoomOut,
  ]);

  if (!isOpen || !currentItem) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex h-full w-full overflow-hidden bg-[#0d0d0f] select-none transition-opacity duration-220"
      style={{
        opacity: transitionPhase === 'closing' ? 0 : 1,
      }}
    >
      {/* 
        1:1 复刻 Afilmory 原生 Thumbhash 双缓冲交叉溶解流光背景体系：
        - 缓冲区 A / B 独立层级平滑交叉溶解（700ms 缓动），彻底杜绝闪黑或闪白
        - 纯净透亮，无多余黑灰色压制遮罩，真实还原本色流光
      */}
      <div
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none bg-transparent transition-opacity duration-260"
        style={{
          opacity: transitionPhase === 'closing' ? 0 : 1,
        }}
      >
        {/* 流光缓冲区 A */}
        {bufferA && (
          <div
            className="absolute inset-0 transition-opacity duration-700 ease-in-out"
            style={{ opacity: activeBuffer === 'A' ? 1 : 0 }}
          >
            <img
              src={bufferA}
              alt=""
              className="h-full w-full object-cover scale-125 blur-3xl transform-gpu"
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
              className="h-full w-full object-cover scale-125 blur-3xl transform-gpu"
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
        <div
          className="absolute top-4 right-4 z-40 flex items-center gap-2 pointer-events-auto transition-all duration-200"
          style={{
            opacity: transitionPhase === 'open' ? 1 : 0,
            transform: transitionPhase === 'open' ? 'translateY(0)' : 'translateY(-10px)',
          }}
        >
          {/* 照片序号徽标 */}
          <div className="flex h-8 items-center px-3 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[11px] font-mono text-white/80 shadow-lg">
            {currentIndex + 1} / {items.length}
          </div>

          {/* 缩放比率胶囊控制条（支持一键复位与快捷步进） */}
          <div className="hidden sm:flex items-center rounded-full bg-black/40 backdrop-blur-md border border-white/10 p-0.5 shadow-lg">
            <button
              onClick={handleZoomOut}
              disabled={scale <= 1}
              title="缩小 (-)"
              className="flex size-7 items-center justify-center rounded-full text-white/70 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ZoomOut className="size-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={handleResetZoom}
              title="重置缩放 (0)"
              className="px-1 text-[11px] font-mono text-white/80 hover:text-white transition-colors"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              disabled={scale >= 6}
              title="放大 (+)"
              className="flex size-7 items-center justify-center rounded-full text-white/70 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ZoomIn className="size-3.5" strokeWidth={1.5} />
            </button>
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
            onClick={handleRequestClose}
            title="关闭 (Esc)"
            className="flex size-8 items-center justify-center rounded-full bg-black/40 text-white/70 backdrop-blur-md border border-white/10 shadow-lg transition-all duration-200 hover:bg-black/70 hover:text-white hover:scale-105"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* 中间大图舞台（水平滑动导轨，每个页面自适应撑满高度，纯平面呈现） */}
        <div
          ref={stageRef}
          onPointerDown={handleStagePointerDown}
          className={`relative z-10 flex flex-1 min-h-0 min-w-0 w-full items-center justify-center p-0 overflow-hidden select-none ${
            isDragging
              ? 'cursor-grabbing'
              : scale > 1
              ? 'cursor-grab'
              : 'cursor-grab sm:cursor-default'
          }`}
          onClick={() => {
            if (hasDraggedRef.current) return;
            if (scale > 1) {
              handleResetZoom();
            } else if (drawerOpen && window.innerWidth < 768) {
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

          {/* 水平滑动主导轨：支持从缩略图切换时水平平滑滑入，以及拖拽切图 */}
          <div
            className="relative flex h-full w-full items-center transform-gpu"
            style={{
              width: '100%',
              height: '100%',
              transform: `translate3d(calc(-${currentIndex * 100}% + ${scale === 1 ? swipeOffset.x : 0}px), ${scale === 1 ? swipeOffset.y : 0}px, 0)`,
              transition:
                isDragging || isWheelZooming
                  ? 'none'
                  : 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {items.map((item, idx) => {
              const isNear = Math.abs(idx - currentIndex) <= 2;
              const isCurrent = idx === currentIndex;

              return (
                <div
                  key={item.id}
                  style={{
                    position: 'absolute',
                    left: `${idx * 100}%`,
                    top: 0,
                    width: '100%',
                    height: '100%',
                  }}
                  className="flex h-full w-full items-center justify-center p-0 overflow-hidden"
                >
                  {isNear && (
                    <img
                      ref={isCurrent ? imageRef : undefined}
                      src={item.url}
                      alt={item.fileName}
                      crossOrigin="anonymous"
                      draggable={false}
                      onDoubleClick={isCurrent ? handleDoubleClick : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (hasDraggedRef.current) return;
                      }}
                      className="h-full w-full object-contain select-none block pointer-events-auto transform-gpu"
                      style={
                        isCurrent
                          ? {
                              transform:
                                scale > 1
                                  ? `translate3d(${position.x}px, ${position.y}px, 0px) scale(${scale})`
                                  : transitionPhase !== 'open'
                                  ? motionTransform
                                  : undefined,
                              transition:
                                scale > 1
                                  ? isDragging || isWheelZooming
                                    ? 'none'
                                    : 'transform 180ms ease-out'
                                  : transitionPhase !== 'open'
                                  ? motionTransition
                                  : undefined,
                              transformOrigin: 'center center',
                              borderRadius:
                                transitionPhase !== 'open' ? `${motionBorderRadius}px` : undefined,
                              opacity:
                                transitionPhase !== 'open'
                                  ? motionOpacity
                                  : scale === 1
                                  ? 1 - Math.min(Math.abs(swipeOffset.y) / 450, 0.5)
                                  : 1,
                            }
                          : undefined
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>

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

          {/* 底部悬浮快捷复位徽标（仅在放大后浮现） */}
          {scale > 1 && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-4 z-30 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-xs text-white/90 backdrop-blur-md shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150"
            >
              <span className="font-mono text-[11px]">{Math.round(scale * 100)}%</span>
              <span className="text-white/30">·</span>
              <button
                type="button"
                onClick={handleResetZoom}
                className="flex items-center gap-1 text-[11px] text-white/70 hover:text-white transition-colors"
                title="重置缩放 (双击或按 0)"
              >
                <RotateCcw className="size-3" />
                <span>复位</span>
              </button>
            </div>
          )}
        </div>

        {/* 底部全宽自适应长条缩略图导轨（高度定标，纯色底轨） */}
        <div
          className="w-full shrink-0 transition-all duration-200"
          style={{
            opacity: transitionPhase === 'open' ? 1 : 0,
            transform: transitionPhase === 'open' ? 'translateY(0)' : 'translateY(16px)',
          }}
        >
          <ThumbnailStrip
            items={items}
            currentIndex={currentIndex}
            onSelectIndex={onIndexChange}
            accentRgb={accentRgb}
            accentHex={accentHex}
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
