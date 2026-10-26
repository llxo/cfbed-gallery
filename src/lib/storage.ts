import { ServerStatus } from '@/types';

const STORAGE_KEY_CDN = 'cfbed_custom_cdn_url';

/**
 * 检查当前服务端会话状态（HttpOnly Cookie 校验）
 */
export async function checkAuthSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.authenticated === true;
  } catch {
    return false;
  }
}

/**
 * 请求服务端验证管理密码并下发 HttpOnly 签名 Cookie
 */
export async function loginWithPassword(
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        success: false,
        error: data.error || `验证失败 (${res.status})`,
      };
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: `连接鉴权服务失败: ${err?.message || '网络异常'}`,
    };
  }
}

/**
 * 登出管理会话（由服务端清除 HttpOnly Cookie）
 */
export async function logoutSession(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // 忽略登出网络错误
  }
}

/**
 * 获取服务端健康与配置状态
 */
export async function getServerStatus(): Promise<ServerStatus> {
  try {
    const res = await fetch('/api/auth/status', {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) {
      return {
        configured: false,
        hasBase: false,
        hasToken: false,
        hasPassword: false,
        authenticated: false,
        apiBase: '',
      };
    }
    return await res.json();
  } catch {
    return {
      configured: false,
      hasBase: false,
      hasToken: false,
      hasPassword: false,
      authenticated: false,
      apiBase: '',
    };
  }
}

/**
 * 获取本地可选配置的直连 CDN 加速域名
 */
export function getStoredCdnUrl(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY_CDN) || '';
}

/**
 * 保存本地自定义直连 CDN 域名
 */
export function saveStoredCdnUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const normalized = url.trim().replace(/\/+$/, '');
  if (normalized) {
    localStorage.setItem(STORAGE_KEY_CDN, normalized);
  } else {
    localStorage.removeItem(STORAGE_KEY_CDN);
  }
}

/**
 * 清除本地自定义直连 CDN 域名
 */
export function resetStoredCdnUrl(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_CDN);
}

/**
 * 生成游客专属公开访问直链
 */
export function getPublicShareUrl(): string {
  if (typeof window === 'undefined') return '/public';
  const origin = window.location.origin;
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${origin}${normalizedBase}public`;
}
