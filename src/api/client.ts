import { BackendFileRecord, BackendListResponse, DirectoryNode, FilterOptions, GalleryMode, ImageItem } from '@/types';
import { getStoredCdnUrl } from '@/lib/storage';

export class ApiClient {
  private customCdnUrl: string = '';
  private serverApiBase: string = '';

  constructor() {
    this.customCdnUrl = getStoredCdnUrl();
  }

  public setServerApiBase(url: string) {
    this.serverApiBase = url.trim().replace(/\/+$/, '');
  }

  public setCustomCdnUrl(url: string) {
    this.customCdnUrl = url.trim().replace(/\/+$/, '');
  }

  public getUpstreamBaseUrl(): string {
    if (this.customCdnUrl) return this.customCdnUrl;
    if (this.serverApiBase) return this.serverApiBase;
    const envCdn = (import.meta.env.VITE_API_BASE || '').trim().replace(/\/+$/, '');
    return envCdn;
  }

  /**
   * 通用 Request 封装（基于同源 BFF 边缘代理 + HttpOnly 会话 Cookie）
   */
  public async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    // 默认请求同源 BFF 边缘路由（自动携带 HttpOnly 会话 Cookie，严防客户端密钥泄露）
    const url = normalizedEndpoint;

    const headers: Record<string, string> = {
      'X-Cfbed-Request': '1',
      ...(options.headers as Record<string, string>),
    };

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // 关键：自动携带同源 HttpOnly 签名会话 Cookie
    });

    if (!response.ok) {
      let errorMsg = `HTTP 错误 ${response.status}: ${response.statusText}`;
      let errorJson: any = null;
      try {
        errorJson = await response.json();
        if (errorJson.error) errorMsg = errorJson.error;
        else if (errorJson.message) errorMsg = errorJson.message;
      } catch {
        // ignore
      }

      const error: any = new Error(errorMsg);
      error.status = response.status;
      error.data = errorJson;

      if (response.status === 401) {
        error.code = 'UNAUTHORIZED';
      } else if (response.status === 403 && errorMsg.includes('Public browse is disabled')) {
        error.code = 'PUBLIC_BROWSE_DISABLED';
      } else if (response.status === 403 && errorMsg.includes('Directory not allowed')) {
        error.code = 'DIRECTORY_NOT_ALLOWED';
      }

      throw error;
    }

    return response.json();
  }

  /**
   * 将后端原始文件数据扁平化为前端对象
   * 兼顾管理端 (name) 与原生公开接口 (id) 字段定义
   */
  public transformRecord(raw: BackendFileRecord): ImageItem {
    const meta = (raw.metadata || {}) as any;
    const baseUrl = this.getUpstreamBaseUrl();
    const id = raw.name || raw.id || '';

    // 若后端数据自带直接访问地址（例如 S3CdnFileUrl, HfFileUrl, WebDAVPublicUrl 等）直接使用
    let directUrl = meta.S3CdnFileUrl || meta.HfFileUrl || meta.WebDAVPublicUrl || (raw as any).url || '';

    if (!directUrl && id) {
      // 纯粹直连图床：绝不走前端同源代理，逐段安全编码保持斜杠层级
      const safeId = id.includes('/')
        ? id.split('/').map(encodeURIComponent).join('/')
        : encodeURIComponent(id);

      directUrl = baseUrl ? `${baseUrl}/file/${safeId}` : `${safeId}`;
    }

    return {
      id,
      url: directUrl,
      fileName: meta.FileName || id,
      fileType: meta.FileType || 'image/jpeg',
      sizeMB: parseFloat(meta.FileSize || '0'),
      timestamp: Number(meta.TimeStamp || 0),
      tags: Array.isArray(meta.Tags) ? meta.Tags : [],
      directory: meta.Directory || '',
      channelName: meta.ChannelName,
      width: meta.Width,
      height: meta.Height,
      aspectRatio: meta.Width && meta.Height ? meta.Width / meta.Height : undefined,
    };
  }

  /**
   * 获取相册列表（支持访客原生 /api/public/list 与管理员 /api/manage/list 双轨）
   */
  public async fetchImages(params: {
    start?: number;
    count?: number;
    filters?: Partial<FilterOptions>;
    mode?: GalleryMode;
  } = {}): Promise<{
    items: ImageItem[];
    directories: string[];
    allowedDirs?: string[];
    totalCount: number;
    hasMore: boolean;
  }> {
    const { start = 0, count = 50, filters = {}, mode = 'admin' } = params;
    const query = new URLSearchParams();

    query.set('start', String(start));
    query.set('count', String(count));

    if (filters.dir) {
      query.set('dir', filters.dir);
    }
    if (filters.search) {
      query.set('search', filters.search);
    }
    if (filters.recursive !== undefined) {
      query.set('recursive', String(filters.recursive));
    }

    let endpoint: string;

    if (mode === 'visitor') {
      // 原生访客接口参数对齐
      query.set('type', filters.fileType || 'image');
      endpoint = `/api/public/list?${query.toString()}`;
    } else {
      // 管理员端
      query.set('fileType', filters.fileType || 'image');
      if (filters.tags && filters.tags.length > 0) {
        query.set('includeTags', filters.tags.join(','));
      }
      endpoint = `/api/manage/list?${query.toString()}`;
    }

    const data = await this.request<BackendListResponse>(endpoint);
    const items = (data.files || []).map((f) => this.transformRecord(f));
    const directories = data.directories || [];
    const allowedDirs = data.allowedDirs || [];
    const totalCount = data.totalCount || 0;
    const hasMore = start + items.length < totalCount;

    return {
      items,
      directories,
      allowedDirs,
      totalCount,
      hasMore,
    };
  }

  /**
   * 获取目录树（仅管理员模式调用，访客模式使用相册列表自带的 directories）
   */
  public async fetchDirectoryTree(): Promise<DirectoryNode[]> {
    try {
      const data = await this.request<any>('/api/directoryTree');
      if (Array.isArray(data)) {
        return data;
      }
      if (data && Array.isArray(data.children)) {
        return data.children;
      }
      if (data && typeof data === 'object') {
        return Object.keys(data).map((key) => ({
          name: key,
          path: `${key}/`,
          children: data[key]?.children || [],
        }));
      }
      return [];
    } catch (err) {
      console.warn('获取目录树失败，降级使用相册列表返回的 directories', err);
      return [];
    }
  }

  /**
   * 获取标签建议（仅管理员）
   */
  public async fetchTags(): Promise<string[]> {
    try {
      const data = await this.request<{ tags: string[] }>('/api/manage/tags/autocomplete');
      return Array.isArray(data?.tags) ? data.tags : [];
    } catch {
      return [];
    }
  }
}

export const apiClient = new ApiClient();
