import React, { useState, useEffect, useRef } from 'react';
import { Lock, KeyRound, ArrowRight, Eye, EyeOff, AlertCircle, ShieldAlert, Loader2 } from 'lucide-react';
import { loginWithPassword, getServerStatus } from '@/lib/storage';

interface LockScreenProps {
  onUnlock: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    getServerStatus().then((status) => {
      if (!mounted) return;
      setIsConfigured(status.hasPassword);
      if (status.hasPassword) {
        inputRef.current?.focus();
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg('请输入访问密码');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const result = await loginWithPassword(password);
    setLoading(false);

    if (result.success) {
      onUnlock();
    } else {
      setErrorMsg(result.error || '密码错误');
      inputRef.current?.select();
    }
  };

  return (
    <div
      style={{
        background: 'radial-gradient(ellipse at 50% 30%, #1a1a24 0%, #0c0c0f 55%, #08080a 100%)',
        isolation: 'isolate',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
      }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 selection:bg-white/20 select-none overflow-hidden"
    >
      {/* 顶部细腻柔和环境光晕 */}
      <div className="pointer-events-none absolute top-1/4 h-[320px] w-[500px] -translate-y-1/2 rounded-full bg-indigo-500/[0.04] blur-[100px]" />
      <div className="pointer-events-none absolute top-1/3 h-[240px] w-[360px] -translate-y-1/2 rounded-full bg-white/[0.03] blur-[80px]" />

      {/* 黑曜石清透高对比卡片 */}
      <div
        style={{
          boxShadow:
            '0 30px 80px -15px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        }}
        className="relative w-full max-w-sm rounded-3xl bg-[#131316] p-8"
      >
        {/* 顶部图标 */}
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-white shadow-inner">
          {isConfigured ? (
            <Lock className="size-6 text-white/90" strokeWidth={1.5} />
          ) : (
            <ShieldAlert className="size-6 text-amber-400" strokeWidth={1.5} />
          )}
        </div>

        {/* 标语 */}
        <div className="mt-5 text-center">
          <h2 className="text-lg font-semibold tracking-tight text-white">
            {isConfigured ? '相册已锁定' : '未配置访问密码'}
          </h2>
          <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
            {isConfigured
              ? '请输入访问密码以继续。'
              : '服务端未设置 ADMIN_PASSWORD 环境变量。'}
          </p>
        </div>

        {/* 若未配置环境变量密码，彻底阻断任何表单 */}
        {!isConfigured ? (
          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-center text-xs text-amber-300/80">
            服务未就绪
          </div>
        ) : (
          /* 正常输入密码解锁 */
          <form onSubmit={handleSubmit} className="mt-6 space-y-3.5">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
                <KeyRound className="size-4" strokeWidth={1.5} />
              </div>
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                disabled={loading}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="输入访问密码"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.05] py-2.5 pl-10 pr-10 text-xs text-white placeholder-zinc-500 outline-none transition-all duration-200 focus:border-white/30 focus:bg-white/[0.08] focus:ring-1 focus:ring-white/20 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="size-4" strokeWidth={1.5} /> : <Eye className="size-4" strokeWidth={1.5} />}
              </button>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-1.5 text-[11px] text-red-400">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-2.5 text-xs font-semibold text-zinc-950 transition-all duration-200 hover:bg-zinc-200 active:scale-[0.98] shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin text-zinc-950" />
                  <span>验证中...</span>
                </>
              ) : (
                <>
                  <span>解锁</span>
                  <ArrowRight className="size-3.5" strokeWidth={2} />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
