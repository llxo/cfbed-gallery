/**
 * cfbed-gallery 统一边缘服务端核心 (Edge Core BFF)
 * 职责聚焦：
 * 1. 服务端托管上游 API Token，免除客户端密钥暴露
 * 2. 密码鉴权与登录防暴破限流（HMAC 签名 HttpOnly 会话）
 * 3. 代理只读相册与管理 API 查询（图片纯直连上游图床，不作中转）
 */

export interface ServerEnv {
  API_BASE?: string;
  CF_API_BASE?: string;
  API_TOKEN?: string;
  CF_API_TOKEN?: string;
  ADMIN_PASSWORD?: string;
  CF_ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  [key: string]: string | undefined;
}

const COOKIE_NAME = 'cfbed_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 天 (秒)

/**
 * 恒定时间比对（防时序推断）
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const hashA = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(a)));
  const hashB = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(b)));

  let mismatch = 0;
  for (let i = 0; i < 32; i++) {
    mismatch |= hashA[i] ^ hashB[i];
  }

  return mismatch === 0;
}

/**
 * 解析 Cookie 标头
 */
function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

/**
 * 提取客户端真实 IP 地址
 */
function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('client-ip') ||
    request.headers.get('x-vercel-forwarded-for') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1'
  );
}

// 登录防暴破限流器（基于客户端 IP 的滑动窗口）
interface LoginAttemptRecord {
  count: number;
  firstAttemptTime: number;
  lockedUntil: number;
}
const loginRateLimitMap = new Map<string, LoginAttemptRecord>();
const MAX_LOGIN_FAILS = 5;       // 最多允许失败 5 次
const LOGIN_WINDOW_MS = 60 * 1000; // 统计窗口 60 秒
const LOCKOUT_MS = 60 * 1000;     // 锁定 60 秒
const MAX_MAP_ENTRIES = 500;

function cleanupRateLimit(now: number): void {
  for (const [key, record] of loginRateLimitMap.entries()) {
    if (now > record.lockedUntil && now - record.firstAttemptTime > LOGIN_WINDOW_MS) {
      loginRateLimitMap.delete(key);
    }
  }
}

function checkLoginRateLimit(ip: string): { allowed: boolean; remainingLockSeconds?: number } {
  const now = Date.now();
  const record = loginRateLimitMap.get(ip);
  if (!record) return { allowed: true };

  if (now < record.lockedUntil) {
    const remaining = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, remainingLockSeconds: remaining };
  }

  if (now - record.firstAttemptTime > LOGIN_WINDOW_MS) {
    loginRateLimitMap.delete(ip);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordLoginFailure(ip: string): void {
  const now = Date.now();
  if (loginRateLimitMap.size >= MAX_MAP_ENTRIES) {
    cleanupRateLimit(now);
  }
  const record = loginRateLimitMap.get(ip);
  if (!record || now - record.firstAttemptTime > LOGIN_WINDOW_MS) {
    loginRateLimitMap.set(ip, {
      count: 1,
      firstAttemptTime: now,
      lockedUntil: 0,
    });
  } else {
    record.count += 1;
    if (record.count >= MAX_LOGIN_FAILS) {
      record.lockedUntil = now + LOCKOUT_MS;
    }
  }
}

function clearLoginFailure(ip: string): void {
  loginRateLimitMap.delete(ip);
}

async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signMessage(message: string, secret: string): Promise<string> {
  const key = await getCryptoKey(secret);
  const enc = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const signatureBytes = new Uint8Array(signatureBuffer);

  let binary = '';
  for (let i = 0; i < signatureBytes.length; i++) {
    binary += String.fromCharCode(signatureBytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generateRandomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

async function createSessionCookie(secret: string, isSecure: boolean): Promise<string> {
  const now = Date.now();
  const nonce = generateRandomNonce();
  const payload = `session:${now}:${nonce}`;
  const signature = await signMessage(payload, secret);
  const cookieValue = `${now}.${nonce}.${signature}`;
  const secureFlag = isSecure ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(cookieValue)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secureFlag}`;
}

async function verifySessionCookie(cookieValue: string | undefined, secret: string): Promise<boolean> {
  if (!cookieValue) return false;
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return false;

  const [timestampStr, nonce, signature] = parts;
  const timestamp = Number(timestampStr);
  if (!Number.isFinite(timestamp)) return false;

  const now = Date.now();
  if (timestamp > now + 60 * 1000) return false;
  if (now - timestamp > SESSION_MAX_AGE * 1000) return false;

  const expectedPayload = `session:${timestampStr}:${nonce}`;
  const expectedSignature = await signMessage(expectedPayload, secret);
  return timingSafeEqual(signature, expectedSignature);
}

function resolveConfig(env: ServerEnv) {
  const apiBase = (env.API_BASE || env.CF_API_BASE || '').trim().replace(/\/+$/, '');
  const apiToken = (env.API_TOKEN || env.CF_API_TOKEN || '').trim();
  const adminPassword = (env.ADMIN_PASSWORD || env.CF_ADMIN_PASSWORD || '').trim();
  const sessionSecret = (env.SESSION_SECRET || `${adminPassword}:${apiToken}:cfbed-salt`).trim();

  return {
    apiBase,
    apiToken,
    adminPassword,
    sessionSecret,
    isConfigured: !!(apiBase && apiToken && adminPassword),
  };
}

function jsonResponse(data: any, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      ...headers,
    },
  });
}

/**
 * 核心请求处理器：分发认证路由与安全反向代理
 */
export async function handleRequest(request: Request, env: ServerEnv): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const config = resolveConfig(env);

  const isSecure =
    url.protocol === 'https:' ||
    request.headers.get('x-forwarded-proto') === 'https' ||
    request.headers.get('cf-visitor')?.includes('https') === true;

  // OPTIONS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Cfbed-Request',
      },
    });
  }

  // 1. 认证接口路由处理
  // 1.1 状态检测 (GET /api/auth/status)
  if (pathname === '/api/auth/status') {
    if (request.method !== 'GET') {
      return jsonResponse({ error: '方法不允许' }, 405);
    }
    const cookies = parseCookies(request.headers.get('Cookie'));
    const isSessionValid = await verifySessionCookie(cookies[COOKIE_NAME], config.sessionSecret);

    return jsonResponse({
      configured: config.isConfigured,
      hasBase: !!config.apiBase,
      hasToken: !!config.apiToken,
      hasPassword: !!config.adminPassword,
      authenticated: isSessionValid,
      apiBase: config.apiBase || '',
    });
  }

  // 1.2 会话检查 (GET /api/auth/session)
  if (pathname === '/api/auth/session') {
    if (request.method !== 'GET') {
      return jsonResponse({ error: '方法不允许' }, 405);
    }
    const cookies = parseCookies(request.headers.get('Cookie'));
    const isAuthenticated = await verifySessionCookie(cookies[COOKIE_NAME], config.sessionSecret);
    return jsonResponse({ authenticated: isAuthenticated });
  }

  // 1.3 密码登录解锁 (POST /api/auth/login)
  if (pathname === '/api/auth/login') {
    if (request.method !== 'POST') {
      return jsonResponse({ error: '方法不允许' }, 405);
    }

    if (!config.adminPassword) {
      return jsonResponse({ error: '未配置 ADMIN_PASSWORD' }, 500);
    }

    // 防暴力破解限流检查
    const clientIp = getClientIp(request);
    const rateLimit = checkLoginRateLimit(clientIp);
    if (!rateLimit.allowed) {
      return jsonResponse(
        { error: `请求过于频繁，请等待 ${rateLimit.remainingLockSeconds} 秒后再试` },
        429
      );
    }

    try {
      const body: any = await request.json().catch(() => ({}));
      const inputPassword = String(body?.password || '').trim();

      if (!inputPassword) {
        return jsonResponse({ error: '请输入密码' }, 400);
      }

      if (inputPassword.length > 128) {
        recordLoginFailure(clientIp);
        return jsonResponse({ error: '密码不正确' }, 401);
      }

      const isMatch = await timingSafeEqual(inputPassword, config.adminPassword);
      if (!isMatch) {
        recordLoginFailure(clientIp);
        return jsonResponse({ error: '密码不正确' }, 401);
      }

      // 验证通过，重置失败计数
      clearLoginFailure(clientIp);

      const cookieHeader = await createSessionCookie(config.sessionSecret, isSecure);
      return jsonResponse(
        { success: true, message: '已解锁' },
        200,
        { 'Set-Cookie': cookieHeader }
      );
    } catch {
      return jsonResponse({ error: '请求无效' }, 400);
    }
  }

  // 1.4 登出与清除会话 (POST /api/auth/logout)
  if (pathname === '/api/auth/logout') {
    if (request.method !== 'POST') {
      return jsonResponse({ error: '方法不允许' }, 405);
    }
    const secureFlag = isSecure ? '; Secure' : '';
    const expireCookie = `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`;
    return jsonResponse({ success: true, message: '已锁定' }, 200, {
      'Set-Cookie': expireCookie,
    });
  }

  // 2. 上游图床 API 安全代理（核心职责：代管 API Token，严防泄露）
  if (!config.apiBase) {
    return jsonResponse({ error: '未配置 API_BASE' }, 502);
  }

  // 严格白名单收敛：只读看图画廊仅允许查询展示类接口，彻底封死任何删除/移动/重命名等破坏性端点
  const ALLOWED_ADMIN_READONLY_ENDPOINTS = new Set([
    '/api/manage/list',
    '/api/directoryTree',
    '/api/manage/tags/autocomplete',
  ]);

  const ALLOWED_PUBLIC_READONLY_ENDPOINTS = new Set([
    '/api/public/list',
  ]);

  const isAdminReadonly = ALLOWED_ADMIN_READONLY_ENDPOINTS.has(pathname);
  const isPublicReadonly = ALLOWED_PUBLIC_READONLY_ENDPOINTS.has(pathname);

  // 绝不放行任何非白名单端点（从物理层面杜绝任何删除与修改图库的可能）
  if (!isAdminReadonly && !isPublicReadonly) {
    return jsonResponse({ error: '端点不存在' }, 404);
  }

  // 向上游图床转发的所有接口均为只读，严格只允许 GET 请求
  if (request.method !== 'GET') {
    return jsonResponse({ error: '方法不允许' }, 405);
  }

  // 管理接口安全鉴权
  if (isAdminReadonly) {
    const cookies = parseCookies(request.headers.get('Cookie'));
    const isAuthenticated = await verifySessionCookie(cookies[COOKIE_NAME], config.sessionSecret);

    if (!isAuthenticated) {
      return jsonResponse({ error: '未授权' }, 401);
    }

    if (!config.apiToken) {
      return jsonResponse({ error: '未配置 API_TOKEN' }, 500);
    }
  }

  // 组装转发请求
  const targetUrl = `${config.apiBase}${pathname}${url.search}`;
  const forwardHeaders = new Headers();

  const hopByHopHeaders = new Set([
    'host',
    'cookie',
    'connection',
    'keep-alive',
    'authorization',
  ]);

  for (const [key, value] of request.headers.entries()) {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      forwardHeaders.set(key, value);
    }
  }

  // 若为管理接口，由边缘服务端代为注入 API Token（客户端完全不知情）
  if (isAdminReadonly) {
    forwardHeaders.set('Authorization', `Bearer ${config.apiToken}`);
  }

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: forwardHeaders,
      redirect: 'follow',
    });

    const responseHeaders = new Headers();
    for (const [key, value] of upstreamResponse.headers.entries()) {
      const lower = key.toLowerCase();
      if (lower !== 'content-encoding' && lower !== 'content-length') {
        responseHeaders.set(key, value);
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return jsonResponse(
      { error: `连接上游图床服务失败: ${err?.message || '网络连接超时'}` },
      502
    );
  }
}
