export interface ImageItem {
  id: string;             // 唯一文件名，如 "1792846950004_6giq.jpg"
  url: string;            // 图片直链
  fileName: string;       // 原始/显示文件名
  fileType: string;       // 媒体 MIME 类型，如 "image/jpeg"
  sizeMB: number;         // 大小 (MB)
  timestamp: number;      // 上传时间戳 (ms)
  tags: string[];         // 标签列表
  directory: string;      // 存储目录，如 "wallpaper/"
  channelName?: string;   // 存储渠道，如 "tg"
  width?: number;         // 解析或预估宽度
  height?: number;        // 解析或预估高度
  aspectRatio?: number;   // 宽高比
}

export interface BackendMetadata {
  Channel?: string;
  ChannelName?: string;
  FileName?: string;
  FileType?: string;
  FileSize?: string;
  TimeStamp?: number;
  Directory?: string;
  Tags?: string[];
  MediaGroupId?: string | null;
  Width?: number;
  Height?: number;
}

export interface BackendFileRecord {
  name?: string;
  id?: string;
  metadata?: BackendMetadata;
}

export interface BackendListResponse {
  files: BackendFileRecord[];
  directories?: string[];
  allowedDirs?: string[];
  totalCount: number;
  directFileCount?: number;
  directFolderCount?: number;
  returnedCount: number;
  indexLastUpdated?: number;
  fromCache?: boolean;
}

export interface DirectoryNode {
  name: string;           // 目录名，例如 "wallpaper"
  path: string;           // 路径，例如 "wallpaper/"
  children?: DirectoryNode[];
  count?: number;         // 图片数量
}

export interface FilterOptions {
  dir: string;            // 当前选中目录，如 "" (全部), "anime/"
  search: string;         // 搜索关键词
  tags: string[];         // 标签筛选
  fileType?: string;      // 文件类型，默认为 "image"
  recursive: boolean;     // 是否递归包含子目录
}

export interface ServerStatus {
  configured: boolean;
  hasBase: boolean;
  hasToken: boolean;
  hasPassword: boolean;
  authenticated: boolean;
  apiBase: string;
}

export type GalleryMode = 'admin' | 'visitor';
