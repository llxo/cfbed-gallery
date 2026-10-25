import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Search,
  RefreshCw,
  Settings,
  X,
  Folder,
  FolderOpen,
  ChevronDown,
  Layers,
  Check,
  LayoutGrid,
  List,
  Lock,
} from 'lucide-react';
import { LinearBlur } from '@/components/ui/LinearBlur';
import { GalleryMode } from '@/types';

interface HeaderProps {
  currentDir: string;
  directories: string[];
  totalCount: number;
  loading: boolean;
  search: string;
  recursive: boolean;
  viewMode?: 'masonry' | 'list';
  mode: GalleryMode;
  onSelectDir: (dir: string) => void;
  onToggleRecursive: (recursive: boolean) => void;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onViewModeChange?: (mode: 'masonry' | 'list') => void;
  onOpenUnlock?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentDir,
  directories,
  totalCount,
  loading,
  search,
  recursive,
  viewMode = 'masonry',
  mode,
  onSelectDir,
  onToggleRecursive,
  onSearchChange,
  onRefresh,
  onOpenSettings,
  onViewModeChange,
  onOpenUnlock,
}) => {
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 点击外部关闭文件夹下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFolderDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 搜索框展开聚焦
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  const currentDirDisplayName = currentDir
    ? currentDir.replace(/\/+$/, '').split('/').pop() || currentDir
    : '全部';

  return (
    <header className="fixed top-0 inset-x-0 z-40 h-12 w-full bg-transparent antialiased pointer-events-none select-none">
      {/* Afilmory 渐进式毛玻璃（向下滑落融入底图） */}
      <LinearBlur
        className="pointer-events-none absolute inset-x-0 top-0 z-[-1] h-16"
        tint="#09090b"
        strength={128}
        side="top"
      />

      <div className="flex h-full w-full items-center justify-between px-3 lg:px-4 pointer-events-auto">
        {/* 左侧：Logo、标题、数量、无边框极简文件夹下拉 */}
        <div className="flex items-center gap-2">
          {/* Logo 头像方标（原版标准 size-7 lg:size-8） */}
          <div className="flex size-7 items-center justify-center rounded-lg bg-white/10 text-white shadow-xs shrink-0 lg:size-8">
            <Camera className="size-4" strokeWidth={1.5} />
          </div>

          {/* 标题与数量 */}
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-sm font-semibold tracking-tight text-white lg:text-base">
              相册
            </h1>
            <span className="text-xs text-white/40 lg:text-sm font-mono">
              {totalCount}
            </span>
          </div>

          {/* 竖线分割线 */}
          <div className="ml-1 flex items-center border-l border-white/10 pl-2">
            {/* 极简无边框文件夹切换下拉 */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setFolderDropdownOpen(!folderDropdownOpen)}
                className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white lg:h-8 lg:text-sm"
                title="选择目录"
              >
                <Folder className="size-3.5 lg:size-4 text-white/60" strokeWidth={1.5} />
                <span className="max-w-[120px] sm:max-w-[160px] truncate font-medium">
                  {currentDirDisplayName}
                </span>
                <ChevronDown className="size-3 lg:size-3.5 opacity-60" strokeWidth={1.5} />
              </button>

              {/* 下拉面板 */}
              {folderDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-[#1c1c1e]/95 p-1 shadow-2xl shadow-black/90 backdrop-blur-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2.5 py-1.5 text-xs font-medium text-white/40 tracking-wider">
                    相册文件夹
                  </div>

                  {/* 全部相册 */}
                  <button
                    type="button"
                    onClick={() => {
                      onSelectDir('');
                      setFolderDropdownOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs text-left transition-colors ${
                      !currentDir
                        ? 'bg-white/15 text-white font-medium'
                        : 'text-white/70 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FolderOpen className="size-4 text-white/70" strokeWidth={1.5} />
                      <span>全部相册</span>
                    </div>
                    {!currentDir && <Check className="size-4 text-white" strokeWidth={1.5} />}
                  </button>

                  {/* 各目录项 */}
                  {directories && directories.length > 0 && (
                    <div className="my-1 border-t border-white/[0.08] pt-1 max-h-64 overflow-y-auto">
                      {directories.map((dir) => {
                        const clean = dir.replace(/\/+$/, '');
                        const isSelected = currentDir === dir || currentDir === `${clean}/`;
                        return (
                          <button
                            key={dir}
                            type="button"
                            onClick={() => {
                              onSelectDir(dir.endsWith('/') ? dir : `${dir}/`);
                              setFolderDropdownOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs text-left transition-colors ${
                              isSelected
                                ? 'bg-white/15 text-white font-medium'
                                : 'text-white/70 hover:bg-white/[0.08] hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <Folder className="size-4 text-white/60 shrink-0" strokeWidth={1.5} />
                              <span className="truncate">{clean}</span>
                            </div>
                            {isSelected && <Check className="size-4 text-white shrink-0" strokeWidth={1.5} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：1:1 精确复刻 Afilmory 双胶囊（ViewModeSegment + ActionButtons） */}
        <div className="flex items-center gap-1.5 lg:gap-2">
          {/* 搜索展开框 */}
          {searchOpen && (
            <div className="flex h-7 items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 text-xs text-white backdrop-blur-md lg:h-8 animate-in fade-in duration-150">
              <Search className="size-3.5 text-white/50" strokeWidth={1.5} />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="搜索文件名..."
                className="w-28 sm:w-44 bg-transparent text-xs text-white placeholder-white/30 outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
                  setSearchOpen(false);
                }}
                className="text-white/40 hover:text-white"
              >
                <X className="size-3" strokeWidth={1.5} />
              </button>
            </div>
          )}

          {/* 胶囊 1：原版 ViewModeSegment 视图模式分段（高度严格 h-7 lg:h-8，内含横向长方形按钮） */}
          <div className="relative flex h-7 items-center gap-0.5 rounded-lg bg-white/10 p-0.5 lg:h-8 lg:gap-1 lg:p-1">
            {/* 网格视图按钮 */}
            <button
              type="button"
              onClick={() => onViewModeChange?.('masonry')}
              className={`relative z-10 flex h-full items-center justify-center rounded-md px-2.5 text-xs font-medium transition-colors duration-200 lg:px-3 ${
                viewMode === 'masonry' ? 'text-white' : 'text-white/60 hover:text-white/80'
              }`}
              title="瀑布流网格视图"
            >
              {viewMode === 'masonry' && (
                <span className="absolute inset-0 rounded-md bg-white/15 shadow-sm" />
              )}
              <LayoutGrid className="relative z-10 size-4" strokeWidth={1.5} />
            </button>

            {/* 列表视图按钮 */}
            <button
              type="button"
              onClick={() => onViewModeChange?.('list')}
              className={`relative z-10 flex h-full items-center justify-center rounded-md px-2.5 text-xs font-medium transition-colors duration-200 lg:px-3 ${
                viewMode === 'list' ? 'text-white' : 'text-white/60 hover:text-white/80'
              }`}
              title="紧凑列表视图"
            >
              {viewMode === 'list' && (
                <span className="absolute inset-0 rounded-md bg-white/15 shadow-sm" />
              )}
              <List className="relative z-10 size-4" strokeWidth={1.5} />
            </button>
          </div>

          {/* 身份徽标 */}
          {mode === 'visitor' ? (
            <div className="flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-2 text-xs text-white/50 lg:h-8">
              <span className="size-1.5 rounded-full bg-white/30" />
              <span className="hidden sm:inline text-[11px] font-medium text-white/60">访客</span>
              {onOpenUnlock && (
                <button
                  type="button"
                  onClick={onOpenUnlock}
                  title="管理员解锁"
                  className="ml-0.5 flex items-center gap-1 text-[11px] text-white/60 hover:text-white transition-colors"
                >
                  <Lock className="size-3" strokeWidth={1.5} />
                  <span className="hidden sm:inline">解锁</span>
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenSettings}
              title="管理员模式设置"
              className="flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-2 text-xs text-white transition-colors hover:bg-white/15 lg:h-8"
            >
              <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span className="text-[11px] font-medium tracking-wide">Admin</span>
            </button>
          )}

          {/* 胶囊 2：原版 ActionButtons 功能操作按钮组（高度严格 h-7 lg:h-8，每个按钮 size-7 lg:size-8） */}
          <div className="flex h-7 items-center gap-0.5 rounded-lg bg-white/10 p-0.5 lg:h-8 lg:gap-1 lg:p-1">
            {/* 搜索 */}
            {!searchOpen && (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                title="搜索相册"
                className={`relative flex size-6.5 items-center justify-center rounded text-white/60 transition-all duration-200 hover:bg-white/10 hover:text-white lg:size-7 ${
                  search ? 'text-white' : ''
                }`}
              >
                <Search className="size-4" strokeWidth={1.5} />
                {search && (
                  <span className="absolute top-1 right-1 size-1.5 rounded-full bg-white lg:top-1.5 lg:right-1.5" />
                )}
              </button>
            )}

            {/* 包含子目录 */}
            <button
              type="button"
              onClick={() => onToggleRecursive(!recursive)}
              title={recursive ? '包含子目录：开启' : '包含子目录：关闭'}
              className={`relative flex size-6.5 items-center justify-center rounded text-white/60 transition-all duration-200 hover:bg-white/10 hover:text-white lg:size-7 ${
                recursive ? 'text-white' : 'opacity-40'
              }`}
            >
              <Layers className="size-4" strokeWidth={1.5} />
            </button>

            {/* 刷新 */}
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              title="刷新"
              className="relative flex size-6.5 items-center justify-center rounded text-white/60 transition-all duration-200 hover:bg-white/10 hover:text-white disabled:opacity-30 lg:size-7"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin text-white' : ''}`} strokeWidth={1.5} />
            </button>

            {/* 设置 */}
            <button
              type="button"
              onClick={mode === 'admin' ? onOpenSettings : (onOpenUnlock || onOpenSettings)}
              title={mode === 'admin' ? '设置' : '解锁'}
              className="relative flex size-6.5 items-center justify-center rounded text-white/60 transition-all duration-200 hover:bg-white/10 hover:text-white lg:size-7"
            >
              {mode === 'admin' ? (
                <Settings className="size-4" strokeWidth={1.5} />
              ) : (
                <Lock className="size-4" strokeWidth={1.5} />
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
