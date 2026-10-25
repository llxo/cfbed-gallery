import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/api/client';
import { checkAuthSession } from '@/lib/storage';
import { GalleryMode, ImageItem } from '@/types';
import { Header } from '@/components/layout/Header';
import { DirectoryNav } from '@/components/layout/DirectoryNav';
import { MasonryGrid } from '@/components/gallery/MasonryGrid';
import { LightboxModal } from '@/components/lightbox/LightboxModal';
import { SettingsModal } from '@/components/ui/SettingsModal';
import { LockScreen } from '@/components/ui/LockScreen';
import { AlertCircle, Settings as SettingsIcon, ShieldAlert } from 'lucide-react';

// 辅助探测当前 URL 是否处于专属游客路径或参数
function detectIsVisitorRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase().replace(/\/+$/, '');
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();
  return (
    path.endsWith('/public') ||
    hash.includes('/public') ||
    search.includes('mode=public') ||
    search.includes('public=1')
  );
}

export default function App() {
  // 检查是否在专属游客路径 (/public)，并动态监听浏览器历史与 Hash 变更
  const [isVisitorRoute, setIsVisitorRoute] = useState<boolean>(detectIsVisitorRoute);

  useEffect(() => {
    const handleLocationChange = () => {
      setIsVisitorRoute(detectIsVisitorRoute());
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  // 管理会话解锁状态（初始化通过服务端 HttpOnly Cookie 异步探测）
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [unlockModalOpen, setUnlockModalOpen] = useState<boolean>(false);

  // 决定当前生效的画廊模式：
  // 访问专属公开路径 (/public) 时强制为真实访客模式，确保所见即访客所得，绝不泄露管理相册；
  // 访问主站时，校验管理凭证（已解锁为 admin，未解锁由锁屏门禁阻断）。
  const mode: GalleryMode = isVisitorRoute ? 'visitor' : (isUnlocked ? 'admin' : 'visitor');

  const [items, setItems] = useState<ImageItem[]>([]);
  const [directories, setDirectories] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 筛选状态
  const [currentDir, setCurrentDir] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [recursive, setRecursive] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'masonry' | 'list'>('masonry');

  // 弹窗与查看器
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  const PAGE_SIZE = 50;

  // 初始化：向服务端发起安全会话探测
  useEffect(() => {
    let mounted = true;
    checkAuthSession().then((authenticated) => {
      if (!mounted) return;
      setIsUnlocked(authenticated);
      setIsCheckingAuth(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // 加载图片数据
  const loadImages = useCallback(
    async (isInitial = true, offset = 0, targetDir = currentDir) => {
      if (isInitial) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      try {
        const res = await apiClient.fetchImages({
          start: offset,
          count: PAGE_SIZE,
          filters: {
            dir: targetDir,
            search: search.trim(),
            recursive,
          },
          mode,
        });

        if (isInitial) {
          setItems(res.items);
        } else {
          setItems((prev) => [...prev, ...res.items]);
        }

        setDirectories(res.directories || []);
        setTotalCount(res.totalCount);
        setHasMore(res.hasMore);

        // 访客模式白名单目录自动容错：
        // 若请求根目录时为空且后端限定了开放子目录，自动平滑切入首个可用开放目录
        if (
          mode === 'visitor' &&
          targetDir === '' &&
          res.items.length === 0 &&
          res.allowedDirs &&
          res.allowedDirs.length > 0 &&
          res.allowedDirs[0] !== '*' &&
          res.allowedDirs[0] !== ''
        ) {
          const firstAllowed = res.allowedDirs[0].endsWith('/')
            ? res.allowedDirs[0]
            : `${res.allowedDirs[0]}/`;
          setCurrentDir(firstAllowed);
        }
      } catch (err: any) {
        console.error('加载画廊失败:', err);

        // 401 会话失效：重新拉起锁屏门禁
        if (err.code === 'UNAUTHORIZED') {
          setIsUnlocked(false);
          setError('会话已过期，请重新解锁');
          return;
        }

        // 访客模式下目录权限 403 容错
        if (err.code === 'DIRECTORY_NOT_ALLOWED' && mode === 'visitor') {
          if (targetDir !== '') {
            setError('当前目录未公开');
          } else {
            setError('根目录未公开');
          }
        } else if (err.code === 'PUBLIC_BROWSE_DISABLED' && mode === 'visitor') {
          setError('公开浏览未开启');
        } else {
          setError(err?.message || '加载失败');
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [currentDir, search, recursive, mode]
  );

  // 当目录、搜索、递归或权限模式变动时重新拉取
  useEffect(() => {
    // 探测进行中或私密主站尚未解锁时，不拉取数据
    if (isCheckingAuth || (!isVisitorRoute && !isUnlocked)) {
      return;
    }
    loadImages(true, 0);
  }, [loadImages, isCheckingAuth, isVisitorRoute, isUnlocked]);

  // 加载更多（触底自动无限滚动）
  const handleLoadMore = useCallback(() => {
    if (!loading && !loadingMore && hasMore) {
      loadImages(false, items.length);
    }
  }, [loading, loadingMore, hasMore, loadImages, items.length]);

  // 解锁回调
  const handleUnlock = () => {
    setIsUnlocked(true);
    setUnlockModalOpen(false);
    // 若在 /public 路径下完成解锁，平滑切入主站管理态
    if (isVisitorRoute && typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
      setIsVisitorRoute(false);
    }
  };

  // 触发解锁（已登录时从 /public 直接切回主站，未登录时拉起密码弹窗）
  const handleOpenUnlock = () => {
    if (isUnlocked) {
      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', '/');
        setIsVisitorRoute(false);
      }
    } else {
      setUnlockModalOpen(true);
    }
  };

  // 锁定退出回调
  const handleLockSession = () => {
    setIsUnlocked(false);
    setSettingsOpen(false);
    setItems([]);
  };

  // 0. 初始化探测会话时的极简暗黑占位屏（防白闪烁）
  if (isCheckingAuth) {
    return <div className="min-h-screen bg-[#09090b]" />;
  }

  // 1. 若访问主站且尚未解锁：方案 B 呈现全屏私密锁屏门禁（完全不暴露游客入口）
  if (!isVisitorRoute && !isUnlocked) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5]">
      {/* 沉浸式固定顶栏 */}
      <Header
        currentDir={currentDir}
        directories={directories}
        totalCount={totalCount}
        loading={loading}
        search={search}
        recursive={recursive}
        viewMode={viewMode}
        mode={mode}
        onSelectDir={setCurrentDir}
        onToggleRecursive={setRecursive}
        onViewModeChange={setViewMode}
        onSearchChange={setSearch}
        onRefresh={() => loadImages(true, 0)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenUnlock={handleOpenUnlock}
      />

      {/* 主体画廊（满幅全屏，四周严格 4px 对称等距） */}
      <main className="w-full p-[4px]">
        {/* 错误提示 */}
        {error && (
          <div className="my-2 mx-1 flex items-center justify-between rounded-xl border border-red-500/20 bg-red-950/30 p-3 text-xs text-red-200 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
            {mode === 'admin' ? (
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-1 underline underline-offset-2 hover:text-white"
              >
                <SettingsIcon className="h-3 w-3" />
                <span>检查连接设置</span>
              </button>
            ) : (
              <button
                onClick={() => setUnlockModalOpen(true)}
                className="flex items-center gap-1 underline underline-offset-2 hover:text-white"
              >
                <ShieldAlert className="h-3 w-3" />
                <span>管理员解锁</span>
              </button>
            )}
          </div>
        )}

        {/* 子目录面包屑微标（进入子文件夹时悬浮展示） */}
        {currentDir && (
          <div className="pt-10">
            <DirectoryNav
              currentDir={currentDir}
              directories={directories}
              totalCount={totalCount}
              recursive={recursive}
              onSelectDir={setCurrentDir}
              onToggleRecursive={setRecursive}
            />
          </div>
        )}

        {/* 紧密 4px 瀑布流画卷 */}
        <MasonryGrid
          items={items}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          onPreview={(item) => {
            const index = items.findIndex((i) => i.id === item.id);
            setActivePhotoIndex(index !== -1 ? index : 0);
          }}
        />
      </main>

      {/* 沉浸式大图全屏查看器 */}
      <LightboxModal
        items={items}
        currentIndex={activePhotoIndex ?? 0}
        isOpen={activePhotoIndex !== null}
        onClose={() => setActivePhotoIndex(null)}
        onIndexChange={(newIndex) => setActivePhotoIndex(newIndex)}
      />

      {/* 管理设置弹窗 */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onLockSession={handleLockSession}
        onSave={() => {
          loadImages(true, 0);
        }}
      />

      {/* 游客路径下的管理员解锁弹窗 */}
      {unlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => setUnlockModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm">
            <LockScreen onUnlock={handleUnlock} />
          </div>
        </div>
      )}
    </div>
  );
}
