import React from 'react';
import { ChevronRight, ArrowLeft } from 'lucide-react';

interface DirectoryNavProps {
  currentDir: string;
  directories: string[];
  totalCount?: number;
  recursive: boolean;
  onSelectDir: (dir: string) => void;
  onToggleRecursive: (recursive: boolean) => void;
}

export const DirectoryNav: React.FC<DirectoryNavProps> = ({
  currentDir,
  onSelectDir,
}) => {
  // 如果在根目录下，不显示面包屑，让画卷全屏纯粹铺满
  if (!currentDir) {
    return null;
  }

  const segments = currentDir.split('/').filter(Boolean);

  const handleGoUp = () => {
    if (segments.length <= 1) {
      onSelectDir('');
    } else {
      const parent = segments.slice(0, -1).join('/') + '/';
      onSelectDir(parent);
    }
  };

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs">
      <button
        onClick={handleGoUp}
        title="返回上级"
        className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
      >
        <ArrowLeft className="h-3 w-3" />
        <span>返回</span>
      </button>

      <button
        onClick={() => onSelectDir('')}
        className="text-white/50 hover:text-white"
      >
        全部
      </button>

      {segments.map((seg, idx) => (
        <React.Fragment key={idx}>
          <ChevronRight className="h-3 w-3 text-white/30" />
          <span className={idx === segments.length - 1 ? 'font-medium text-white' : 'text-white/50'}>
            {seg}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};
