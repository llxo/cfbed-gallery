import React, { useState } from 'react';
import { ImageItem } from '@/types';
import { formatFileSize, copyToClipboard } from '@/lib/utils';
import {
  PanelRightClose,
  Copy,
  Check,
  Tag,
  Info,
  ExternalLink,
  Download,
  Layers,
} from 'lucide-react';

interface DetailDrawerProps {
  item: ImageItem;
  isOpen: boolean;
  onClose: () => void;
  accentRgb?: string;
  accentHex?: string;
}

export const DetailDrawer: React.FC<DetailDrawerProps> = ({
  item,
  isOpen,
  onClose,
  accentRgb = '120, 120, 128',
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 快捷复制处理
  const handleCopy = async (text: string, key: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  // 格式化数据
  const formatExt = (item.fileType?.split('/')[1] || item.fileName.split('.').pop() || 'JPEG').toUpperCase();
  const fullDate = item.timestamp ? new Date(item.timestamp).toLocaleString('zh-CN', { hour12: false }) : '未知';
  const megaPixels = item.width && item.height ? `${((item.width * item.height) / 1000000).toFixed(1)} MP` : null;

  // 计算画面比例
  const computeAspectRatio = () => {
    if (!item.width || !item.height) return null;
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(item.width, item.height);
    const aspectW = item.width / divisor;
    const aspectH = item.height / divisor;
    if (aspectW <= 21 && aspectH <= 21) {
      return `${aspectW}:${aspectH}`;
    }
    return (item.width / item.height).toFixed(2) + ':1';
  };
  const aspectRatioStr = computeAspectRatio();

  const fullUrl = item.url;

  // 外链格式（基于图床真实原生直链生成）
  const markdownLink = `![${item.fileName}](${fullUrl})`;
  const htmlLink = `<img src="${fullUrl}" alt="${item.fileName}" />`;
  const bbcodeLink = `[img]${fullUrl}[/img]`;

  return (
    <>
      {/* 小屏遮罩层：点击半透明暗黑背景直接收起 */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity duration-300 md:hidden ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* 
        Afilmory 1:1 原版高透光毛玻璃全高侧边栏：
        - 纯正全高（Full-Height）：从屏幕最顶端直达最底端（h-full h-screen top-0 bottom-0 inset-y-0）
        - 高通透度材质（High-Translucency Frosted Glass）：底层色彩流光自然折射穿透
        - 单页整合（Unified Single Page）：基本信息、标签、外链格式一屏全览，无需二次切换
      */}
      <aside
        style={{
          isolation: 'isolate',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'optimizeLegibility',
          backgroundImage:
            'linear-gradient(155deg, rgba(32, 32, 38, 0.48) 0%, rgba(16, 16, 20, 0.65) 100%)',
          boxShadow:
            '0 0 40px rgba(0, 0, 0, 0.5), inset 1px 0 0 rgba(255, 255, 255, 0.12), -1px 0 0 rgba(255, 255, 255, 0.05)',
        }}
        className={`
          fixed md:relative z-50 flex flex-col text-[#f4f4f5] select-text
          inset-y-0 right-0 h-full h-screen max-h-screen shrink-0
          border-l border-white/15 backdrop-blur-2xl
          transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${
            isOpen
              ? 'translate-x-0 w-84 min-w-[21rem] max-w-[88vw] md:max-w-none opacity-100'
              : 'translate-x-full md:translate-x-0 md:w-0 md:min-w-0 opacity-0 md:border-l-0 overflow-hidden pointer-events-none'
          }
        `}
      >
        {/* 内部固定宽度包装层（确保在伸缩动画过程中排版绝不挤压抖动） */}
        <div className="relative flex flex-col h-full w-full min-w-[21rem] overflow-hidden">
          {/* Afilmory 官方 Inner Glow 内部高光层 */}
          <div
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              background: `linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(${accentRgb}, 0.12) 30%, transparent 70%, rgba(255, 255, 255, 0.02) 100%)`,
            }}
          />

          {/* 专属流动色彩光晕（Ambient Flow Orb）：右上角柔和呼吸 */}
          <div
            className="pointer-events-none absolute -top-16 -right-16 size-64 rounded-full blur-3xl opacity-30 transition-colors duration-700 ease-out"
            style={{
              background: `radial-gradient(circle, rgb(${accentRgb}) 0%, transparent 70%)`,
            }}
          />

          {/* 顶部标题与控制栏 */}
          <div className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4 select-none">
            {/* 标题徽标 */}
            <div className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white border border-white/10 shadow-xs">
              <Info className="size-3.5 text-white/90" strokeWidth={1.5} />
              <span>照片详情与外链</span>
            </div>

            {/* 右侧操作按钮群 */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => window.open(fullUrl, '_blank')}
                title="在新标签页打开原图"
                className="flex size-8 items-center justify-center rounded-lg text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
              >
                <ExternalLink className="size-4" strokeWidth={1.5} />
              </button>

              <button
                type="button"
                onClick={onClose}
                title="收起详细信息 (I)"
                className="flex size-8 items-center justify-center rounded-lg text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
              >
                <PanelRightClose className="size-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* 抽屉核心滚动内容区：信息与外链一页整合贯通 */}
          <div className="relative z-10 flex-1 min-h-0 overflow-y-auto p-4 space-y-6 text-xs">
            {/* 1. 基本参数区块：Afilmory 两端对齐工整清单 */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-semibold text-white/60 tracking-wider uppercase">
                  基本信息
                </h4>
                {item.channelName && (
                  <span className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[10px] font-mono text-white/80 border border-white/10">
                    <Layers className="size-2.5" />
                    {item.channelName.toUpperCase()}
                  </span>
                )}
              </div>

              <div className="space-y-2.5 text-xs">
                {/* 文件名 */}
                <div className="flex justify-between items-center gap-3">
                  <span className="text-white/60 shrink-0">文件名</span>
                  <span
                    className="truncate font-mono text-white text-right font-medium hover:text-white/80 cursor-pointer select-all"
                    title={item.fileName}
                    onClick={() => handleCopy(item.fileName, 'fileName')}
                  >
                    {item.fileName}
                  </span>
                </div>

                {/* 格式 */}
                <div className="flex justify-between items-center gap-3">
                  <span className="text-white/60 shrink-0">格式</span>
                  <span className="font-mono text-white text-right font-medium">
                    {formatExt}
                  </span>
                </div>

                {/* 尺寸分辨率 */}
                {item.width && item.height && (
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-white/60 shrink-0">尺寸分辨率</span>
                    <span className="font-mono text-white text-right font-medium tabular-nums">
                      {item.width} × {item.height}
                    </span>
                  </div>
                )}

                {/* 画面比例 */}
                {aspectRatioStr && (
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-white/60 shrink-0">画面比例</span>
                    <span className="font-mono text-white text-right font-medium tabular-nums">
                      {aspectRatioStr}
                    </span>
                  </div>
                )}

                {/* 像素 */}
                {megaPixels && (
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-white/60 shrink-0">像素</span>
                    <span className="font-mono text-white text-right font-medium tabular-nums">
                      {megaPixels}
                    </span>
                  </div>
                )}

                {/* 文件大小 */}
                <div className="flex justify-between items-center gap-3">
                  <span className="text-white/60 shrink-0">文件大小</span>
                  <span className="font-mono text-white text-right font-medium tabular-nums">
                    {formatFileSize(item.sizeMB)}
                  </span>
                </div>

                {/* 上传时间 */}
                <div className="flex justify-between items-center gap-3">
                  <span className="text-white/60 shrink-0">上传时间</span>
                  <span className="font-mono text-white text-right font-medium tabular-nums">
                    {fullDate}
                  </span>
                </div>

                {/* 存储目录 */}
                {item.directory && (
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-white/60 shrink-0">所属目录</span>
                    <span className="font-mono text-white text-right font-medium truncate max-w-[12rem]">
                      {item.directory}
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* 2. 标签区块 */}
            {item.tags && item.tags.length > 0 && (
              <section className="space-y-2.5">
                <h4 className="text-[11px] font-semibold text-white/60 tracking-wider uppercase">
                  标签
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md bg-white/10 border border-white/10 px-2.5 py-1 text-xs text-white/90 hover:bg-white/20 transition-colors"
                    >
                      <Tag className="size-3 opacity-60 text-white" strokeWidth={1.5} />
                      <span>{tag}</span>
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* 3. 外链与引用格式区块（直接无缝承接在信息下方） */}
            <section className="space-y-3 pt-2 border-t border-white/10 select-none">
              <h4 className="text-[11px] font-semibold text-white/60 tracking-wider uppercase">
                外链与引用代码
              </h4>

              <div className="space-y-2.5">
                {/* 直链 URL */}
                <div className="rounded-xl bg-white/[0.06] p-2.5 border border-white/10 hover:border-white/20 transition-all space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-white/80 tracking-wider">
                      图片直链 (URL)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(fullUrl, 'url')}
                      className="flex items-center gap-1 rounded bg-white/15 px-2.5 py-1 text-xs text-white hover:bg-white/25 transition-colors border border-white/10 shadow-xs"
                    >
                      {copiedKey === 'url' ? (
                        <Check className="size-3 text-emerald-400" strokeWidth={1.5} />
                      ) : (
                        <Copy className="size-3" strokeWidth={1.5} />
                      )}
                      <span>{copiedKey === 'url' ? '已复制' : '复制'}</span>
                    </button>
                  </div>
                  <div className="rounded-md bg-black/40 p-2 border border-white/5">
                    <span className="break-all font-mono text-[11px] text-white/90 select-all leading-relaxed">
                      {fullUrl}
                    </span>
                  </div>
                </div>

                {/* Markdown */}
                <div className="rounded-xl bg-white/[0.06] p-2.5 border border-white/10 hover:border-white/20 transition-all space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-white/80 tracking-wider">
                      Markdown
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(markdownLink, 'md')}
                      className="flex items-center gap-1 rounded bg-white/15 px-2.5 py-1 text-xs text-white hover:bg-white/25 transition-colors border border-white/10 shadow-xs"
                    >
                      {copiedKey === 'md' ? (
                        <Check className="size-3 text-emerald-400" strokeWidth={1.5} />
                      ) : (
                        <Copy className="size-3" strokeWidth={1.5} />
                      )}
                      <span>{copiedKey === 'md' ? '已复制' : '复制'}</span>
                    </button>
                  </div>
                  <div className="rounded-md bg-black/40 p-2 border border-white/5">
                    <span className="break-all font-mono text-[11px] text-white/90 select-all leading-relaxed">
                      {markdownLink}
                    </span>
                  </div>
                </div>

                {/* HTML */}
                <div className="rounded-xl bg-white/[0.06] p-2.5 border border-white/10 hover:border-white/20 transition-all space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-white/80 tracking-wider">
                      HTML
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(htmlLink, 'html')}
                      className="flex items-center gap-1 rounded bg-white/15 px-2.5 py-1 text-xs text-white hover:bg-white/25 transition-colors border border-white/10 shadow-xs"
                    >
                      {copiedKey === 'html' ? (
                        <Check className="size-3 text-emerald-400" strokeWidth={1.5} />
                      ) : (
                        <Copy className="size-3" strokeWidth={1.5} />
                      )}
                      <span>{copiedKey === 'html' ? '已复制' : '复制'}</span>
                    </button>
                  </div>
                  <div className="rounded-md bg-black/40 p-2 border border-white/5">
                    <span className="break-all font-mono text-[11px] text-white/90 select-all leading-relaxed">
                      {htmlLink}
                    </span>
                  </div>
                </div>

                {/* BBCode */}
                <div className="rounded-xl bg-white/[0.06] p-2.5 border border-white/10 hover:border-white/20 transition-all space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-white/80 tracking-wider">
                      BBCode
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(bbcodeLink, 'bb')}
                      className="flex items-center gap-1 rounded bg-white/15 px-2.5 py-1 text-xs text-white hover:bg-white/25 transition-colors border border-white/10 shadow-xs"
                    >
                      {copiedKey === 'bb' ? (
                        <Check className="size-3 text-emerald-400" strokeWidth={1.5} />
                      ) : (
                        <Copy className="size-3" strokeWidth={1.5} />
                      )}
                      <span>{copiedKey === 'bb' ? '已复制' : '复制'}</span>
                    </button>
                  </div>
                  <div className="rounded-md bg-black/40 p-2 border border-white/5">
                    <span className="break-all font-mono text-[11px] text-white/90 select-all leading-relaxed">
                      {bbcodeLink}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* 4. 快捷操作区 */}
            <section className="space-y-2.5 pt-2 border-t border-white/10 select-none">
              <h4 className="text-[11px] font-semibold text-white/60 tracking-wider uppercase">
                快捷操作
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(fullUrl, 'url-quick')}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-white/10 p-2.5 text-xs text-white hover:bg-white/20 border border-white/10 transition-all shadow-xs"
                >
                  {copiedKey === 'url-quick' ? (
                    <Check className="size-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="size-3.5 text-white/70" />
                  )}
                  <span>{copiedKey === 'url-quick' ? '已复制' : '复制直链'}</span>
                </button>

                <a
                  href={fullUrl}
                  download={item.fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-white/10 p-2.5 text-xs text-white hover:bg-white/20 border border-white/10 transition-all shadow-xs"
                >
                  <Download className="size-3.5 text-white/70" />
                  <span>下载原图</span>
                </a>
              </div>
            </section>
          </div>
        </div>
      </aside>
    </>
  );
};
