import React, { useState, useEffect } from 'react';
import { getServerStatus, logoutSession, getPublicShareUrl } from '@/lib/storage';
import { ServerStatus } from '@/types';
import { X, Check, Globe, Key, Shield, Copy, LogOut, ExternalLink, Cpu } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
  onLockSession?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onLockSession,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [status, setStatus] = useState<ServerStatus | null>(null);

  const publicUrl = getPublicShareUrl();

  useEffect(() => {
    if (isOpen) {
      setCopiedUrl(false);
      getServerStatus().then((s) => setStatus(s));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyPublicUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleLock = async () => {
    await logoutSession();
    onClose();
    if (onLockSession) {
      onLockSession();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 selection:bg-white/20 select-none">
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* 弹窗主体：Afilmory 高透光微光玻璃架构 */}
      <div
        style={{
          isolation: 'isolate',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'optimizeLegibility',
          backgroundImage:
            'linear-gradient(155deg, rgba(32, 32, 38, 0.88) 0%, rgba(16, 16, 20, 0.94) 100%)',
          boxShadow:
            '0 30px 80px -15px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.18)',
        }}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/15 p-6 backdrop-blur-2xl"
      >
        {/* 顶部微光 Inner Glow */}
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.02) 35%, transparent 100%)',
          }}
        />

        {/* 顶部标题与关闭 */}
        <div className="relative z-10 flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <h2 className="text-sm font-semibold tracking-tight text-white">设置</h2>
          </div>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* 模块 1：公开链接 */}
        <div className="relative z-10 mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-white/90">
              <ExternalLink className="size-3.5 text-white/50" />
              <span>公开访问链接</span>
            </div>
            <button
              type="button"
              onClick={handleCopyPublicUrl}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/20 transition-colors"
            >
              {copiedUrl ? (
                <>
                  <Check className="size-3 text-emerald-400" />
                  <span className="text-emerald-400">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  <span>复制</span>
                </>
              )}
            </button>
          </div>
          <p className="rounded-xl border border-white/8 bg-black/40 px-3 py-2 font-mono text-[11px] text-zinc-300 truncate select-all">
            {publicUrl}
          </p>
          <span className="block text-[11px] text-zinc-400">
            只读访问已开放的相册内容。
          </span>
        </div>

        {/* 模块 2：运行状态 */}
        <div className="relative z-10 mt-3.5 space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <Globe className="size-3.5" />
              <span>图床地址</span>
            </span>
            <span
              className="font-mono text-zinc-200 text-xs truncate max-w-[170px]"
              title={status?.apiBase || '未配置'}
            >
              {status?.apiBase || '未配置'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <Cpu className="size-3.5" />
              <span>图片链路</span>
            </span>
            <span className="font-mono text-emerald-400 text-xs">原生直连（零中转）</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <Key className="size-3.5" />
              <span>API Token</span>
            </span>
            <span className="font-mono text-emerald-400 text-xs">服务端托管</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <Shield className="size-3.5" />
              <span>安全鉴权</span>
            </span>
            <span className="font-mono text-emerald-400 text-xs">HttpOnly Cookie</span>
          </div>
        </div>

        {/* 底部操作 */}
        <div className="relative z-10 mt-4.5 pt-3.5 border-t border-white/10 flex items-center justify-between">
          <button
            type="button"
            onClick={handleLock}
            className="flex items-center gap-1.5 text-xs text-amber-400/90 hover:text-amber-300 transition-colors font-medium"
          >
            <LogOut className="size-3.5" />
            <span>锁定</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/10 px-4 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
