/**
 * cfbed-gallery 统一边缘服务端核心 (Edge Core BFF)
 * 纯 Web 标准实现 (Request / Response / Web Crypto)
 * 同时为 Cloudflare Pages / Vercel Edge / Netlify Edge 及本地 Vite 开发服务器提供同一套安全内核。
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
 * 基于 SHA-256 定长摘要的恒定时间安全比对（彻底防御时序攻击与长度侧信道泄漏）
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  // 分别计算 SHA-256 映射为固定 32 字节摘要，循环次数与耗时彻底与输入原始长度解耦
  const hashA = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(a)));
  const hashB = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(b)));

  let mismatch = 0;
  for (let i = 0; i < 32; i++) {
    mismatch |= hashA[i] ^ hashB[i];
  }

  return mismatch === 0;
}

/**
 * 解析 Cookie 标头（带容错处理，防御畸形 URI 编码造成 DoS）
 */
function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val; // 遇到非法 URI 字符降级取原始字面量，严防抛出 URIError 崩溃
      }
    }
  }
  return cookies;
}

/**
 * 安全规范化路径（彻底消除路径穿越、多重 URL 编码绕过、反斜杠及空字符注入）
 * 返回规范化后的标准绝对路径（如 /api/manage/list），若检测到恶意逃逸或非法字符则返回 null
 */
function sanitizePath(rawPath: string): string | null {
  if (typeof rawPath !== 'string' || !rawPath.startsWith('/')) {
    return null;
  }

  // 检测并阻止空字符注入
  if (rawPath.includes('\0') || rawPath.toLowerCase().includes('%00')) {
    return null;
  }

  // 统一将反斜杠替换为正斜杠（防御反斜杠路径混淆）
  let decoded = rawPath.replace(/\\/g, '/');

  // 最多执行 3 轮解码，抵御多重 URL 编码绕过（例如 %252e%252e）
  for (let i = 0; i < 3; i++) {
    try {
      const nextDecoded = decodeURIComponent(decoded);
      if (nextDecoded === decoded) break;
      decoded = nextDecoded;
    } catch {
      // 出现畸形 URI 编码直接判定为非法路径
      return null;
    }
  }

  // 再次检测解码后是否出现空字符
  if (decoded.includes('\0')) {
    return null;
  }

  // 切割并消除冗余斜杠与 .. / . 逃逸
  const segments = decoded.split('/');
  const safeSegments: string[] = [];

  for (const seg of segments) {
    if (!seg || seg === '.') {
      continue;
    }
    if (seg === '..') {
      // 尝试向上逃逸出根路径，判定非法
      if (safeSegments.length === 0) {
        return null;
      }
      safeSegments.pop();
    } else {
      safeSegments.push(seg);
    }
  }

  const normalized = '/' + safeSegments.join('/');
  if (rawPath.endsWith('/') && normalized !== '/') {
    return normalized + '/';
  }
  return normalized;
}

/**
 * 提取客户端真实 IP 地址
 */
function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1'
  );
}

/**
 * 规范化主机字符串（去除标准默认 80/443 端口，防御跨端口及端口混淆伪造）
 */
function normalizeHost(h: string): string {
  const lower = h.toLowerCase().trim();
  if (lower.endsWith(':80')) return lower.slice(0, -3);
  if (lower.endsWith(':443')) return lower.slice(0, -4);
  return lower;
}

/**
 * 判断两个 Origin/Host 是否为严格同源（防御跨域 CSRF 与非法凭据窃取）
 */
function isSameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    const originUrl = new URL(origin);
    const originHost = normalizeHost(originUrl.host);
    const requestHost = normalizeHost(host);
    return originHost === requestHost;
  } catch {
    return false;
  }
}

// 登录防暴破内存限流器（基于客户端 IP 的滑动窗口）
interface LoginAttemptRecord {
  count: number;
  firstAttemptTime: number;
  lockedUntil: number;
}
const loginRateLimitMap = new Map<string, LoginAttemptRecord>();
const MAX_LOGIN_FAILS = 5; // 允许最多连续失败 5 次
const LOGIN_WINDOW_MS = 60 * 1000; // 统计窗口 60 秒
const LOCKOUT_MS = 60 * 1000; // 锁定 60 秒
const MAX_RATE_LIMIT_ENTRIES = 1000; // 防御海量离散 IP 字典扫描造成内存泄漏

function cleanupExpiredRateLimit(now: number): void {
  for (const [key, record] of loginRateLimitMap.entries()) {
    if (now > record.lockedUntil && now - record.firstAttemptTime > LOGIN_WINDOW_MS) {
      loginRateLimitMap.delete(key);
    }
  }
  // 若清理后依然超出上限，淘汰最早的一批记录
  if (loginRateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
    let excess = loginRateLimitMap.size - MAX_RATE_LIMIT_ENTRIES;
    for (const key of loginRateLimitMap.keys()) {
      if (excess <= 0) break;
      loginRateLimitMap.delete(key);
      excess--;
    }
  }
}

function checkLoginRateLimit(ip: string): { allowed: boolean; remainingLockSeconds?: number } {
  const now = Date.now();
  const record = loginRateLimitMap.get(ip);
  if (!record) return { allowed: true };

  // 检查是否在封禁期
  if (now < record.lockedUntil) {
    const remaining = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, remainingLockSeconds: remaining };
  }

  // 封禁期已过或窗口超时，重置计数
  if (now - record.firstAttemptTime > LOGIN_WINDOW_MS) {
    loginRateLimitMap.delete(ip);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordLoginFailure(ip: string): void {
  const now = Date.now();
  if (loginRateLimitMap.size >= MAX_RATE_LIMIT_ENTRIES) {
    cleanupExpiredRateLimit(now);
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

/**
 * 获取用于 HMAC 的 CryptoKey
 */
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

/**
 * 使用 HMAC-SHA256 对消息签名
 */
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

/**
 * 生成 16 字节密码学强随机 Hex 字符串（为会话注入充足熵，防御伪造与重放）
 */
function generateRandomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * 签发 HttpOnly 会话 Cookie
 */
async function createSessionCookie(secret: string, isSecure: boolean): Promise<string> {
  const now = Date.now();
  const nonce = generateRandomNonce();
  const payload = `session:${now}:${nonce}`;
  const signature = await signMessage(payload, secret);
  const cookieValue = `${now}.${nonce}.${signature}`;

  const secureFlag = isSecure ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(cookieValue)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secureFlag}`;
}

/**
 * 校验会话 Cookie 合法性与有效期
 */
async function verifySessionCookie(cookieValue: string | undefined, secret: string): Promise<boolean> {
  if (!cookieValue) return false;

  const parts = cookieValue.split('.');
  // 支持 3 段结构 (timestamp.nonce.signature) 及旧版 2 段结构兼容
  if (parts.length !== 3 && parts.length !== 2) return false;

  let timestampStr: string;
  let nonce = '';
  let signature: string;

  if (parts.length === 3) {
    [timestampStr, nonce, signature] = parts;
  } else {
    [timestampStr, signature] = parts;
  }

  const timestamp = Number(timestampStr);
  if (!Number.isFinite(timestamp)) return false;

  const now = Date.now();
  // 校验有效期：不能晚于未来 60 秒，不能超过 7 天
  if (timestamp > now + 60 * 1000) return false;
  if (now - timestamp > SESSION_MAX_AGE * 1000) return false;

  // 验证签名
  const expectedPayload = nonce ? `session:${timestampStr}:${nonce}` : `session:${timestampStr}`;
  const expectedSignature = await signMessage(expectedPayload, secret);

  return timingSafeEqual(signature, expectedSignature);
}

/**
 * 解析并规范化服务端环境变量
 */
function resolveConfig(env: ServerEnv) {
  const apiBase = (env.API_BASE || env.CF_API_BASE || '').trim().replace(/\/+$/, '');
  const apiToken = (env.API_TOKEN || env.CF_API_TOKEN || '').trim();
  const adminPassword = (env.ADMIN_PASSWORD || env.CF_ADMIN_PASSWORD || '').trim();
  const sessionSecret = (env.SESSION_SECRET || `${adminPassword}:${apiToken}:cfbed-secure-salt-2026`).trim();

  return {
    apiBase,
    apiToken,
    adminPassword,
    sessionSecret,
    isConfigured: !!(apiBase && apiToken && adminPassword),
  };
}

/**
 * 构造统一 JSON 响应（注入严格的安全防护标头）
 */
function jsonResponse(data: any, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...headers,
    },
  });
}

/**
 * 核心请求处理器：分发认证路由与安全反向代理
 */
export async function handleRequest(request: Request, env: ServerEnv): Promise<Response> {
  const url = new URL(request.url);
  const rawPathname = url.pathname;
  const config = resolveConfig(env);

  // 0. 规范化与清洗请求路径（防御 Path Traversal、双重 URL 编码与路径逃逸）
  const pathname = sanitizePath(rawPathname);
  if (!pathname) {
    return jsonResponse({ error: '非法请求路径 (Path Traversal Detected)' }, 400);
  }

  // 严格阻断试图利用编码逃逸出公开前缀的越权探测
  if (rawPathname.startsWith('/file/') && !pathname.startsWith('/file/')) {
    return jsonResponse({ error: '非法路径逃逸' }, 400);
  }
  if (rawPathname.startsWith('/api/public/') && !pathname.startsWith('/api/public/')) {
    return jsonResponse({ error: '非法路径逃逸' }, 400);
  }

  // 提取来源与主机上下文
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  const isTrusted = isSameOrigin(origin, host);
  const isMediaRequest = pathname.startsWith('/file/');

  // 判断是否为 HTTPS 环境
  const isSecure =
    url.protocol === 'https:' ||
    request.headers.get('x-forwarded-proto') === 'https' ||
    request.headers.get('cf-visitor')?.includes('https') === true;

  // 0.1 处理 OPTIONS 预检请求（区分媒体资源与 API 凭据访问）
  if (request.method === 'OPTIONS') {
    if (isMediaRequest) {
      // 图片媒体资源：源站不做保护，允许外部全网跨域展示，不带凭据
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 涉及 API 的预检请求：严禁向恶意跨域第三方开放预检
    if (origin && !isTrusted) {
      return jsonResponse({ error: '拒绝未授权跨域预检' }, 403);
    }

    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Credentials': isTrusted ? 'true' : 'false',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Cfbed-Request',
        'Vary': 'Origin',
      },
    });
  }

  // 0.2 防御跨站 CSRF 攻击：对全站所有写操作（包括认证登录、退出及后端管理接口）统一前置来源审计
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
    const secFetchSite = request.headers.get('sec-fetch-site');
    if (secFetchSite === 'cross-site') {
      return jsonResponse({ error: '拒绝跨站请求 (CSRF Protection)' }, 403);
    }

    if (origin && !isTrusted) {
      return jsonResponse({ error: '跨站 Origin 拒绝访问 (CSRF Protection)' }, 403);
    }

    const referer = request.headers.get('referer');
    if (!origin && referer) {
      try {
        const refUrl = new URL(referer);
        const refHost = normalizeHost(refUrl.host);
        const reqHost = normalizeHost(host);
        if (refHost !== reqHost) {
          return jsonResponse({ error: '跨站 Referer 拒绝访问 (CSRF Protection)' }, 403);
        }
      } catch {
        return jsonResponse({ error: '非法 Referer (CSRF Protection)' }, 403);
      }
    }
  }

  // 1. 认证接口路由处理
  // ==========================================

  // 1.1 状态检测 (GET /api/auth/status)
  if (pathname === '/api/auth/status') {
    if (request.method !== 'GET') {
      return jsonResponse({ error: '方法不允许 (仅支持 GET)' }, 405);
    }
    const cookies = parseCookies(request.headers.get('Cookie'));
    const isSessionValid = await verifySessionCookie(cookies[COOKIE_NAME], config.sessionSecret);

    return jsonResponse({
      configured: config.isConfigured,
      hasBase: !!config.apiBase,
      hasToken: !!config.apiToken,
      hasPassword: !!config.adminPassword,
      authenticated: isSessionValid,
      apiBase: config.apiBase ? config.apiBase.replace(/^https?:\/\//, '') : '',
    });
  }

  // 1.2 会话检查 (GET /api/auth/session)
  if (pathname === '/api/auth/session') {
    if (request.method !== 'GET') {
      return jsonResponse({ error: '方法不允许 (仅支持 GET)' }, 405);
    }
    const cookies = parseCookies(request.headers.get('Cookie'));
    const isAuthenticated = await verifySessionCookie(cookies[COOKIE_NAME], config.sessionSecret);

    return jsonResponse({ authenticated: isAuthenticated });
  }

  // 1.3 密码登录解锁 (POST /api/auth/login)
  if (pathname === '/api/auth/login') {
    if (request.method !== 'POST') {
      return jsonResponse({ error: '方法不允许 (仅支持 POST)' }, 405);
    }

    if (!config.adminPassword) {
      return jsonResponse(
        { error: '未配置 ADMIN_PASSWORD' },
        500
      );
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

    // 限制请求体长度，防御超大 Payload DoS 攻击
    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > 4096) {
      return jsonResponse({ error: '请求数据过大' }, 400);
    }

    try {
      const body: any = await request.json().catch(() => ({}));
      const inputPassword = String(body?.password || '').trim();

      if (!inputPassword) {
        return jsonResponse({ error: '请输入密码' }, 400);
      }

      // 限制密码长度，防御超长字符串计算 DoS
      if (inputPassword.length > 128) {
        recordLoginFailure(clientIp);
        await new Promise((r) => setTimeout(r, 800));
        return jsonResponse({ error: '密码不正确' }, 401);
      }

      const isMatch = await timingSafeEqual(inputPassword, config.adminPassword);
      if (!isMatch) {
        recordLoginFailure(clientIp);
        // 人为注入延时惩罚，大幅压低字典扫描与暴力破解效率
        await new Promise((r) => setTimeout(r, 800));
        return jsonResponse({ error: '密码不正确' }, 401);
      }

      // 密码验证通过，重置失败计数器
      clearLoginFailure(clientIp);

      // 签发基于 HMAC-SHA256 签名的 HttpOnly Cookie
      const cookieHeader = await createSessionCookie(config.sessionSecret, isSecure);

      return jsonResponse(
        { success: true, message: '已解锁' },
        200,
        { 'Set-Cookie': cookieHeader }
      );
    } catch (err: any) {
      return jsonResponse({ error: err.message || '请求无效' }, 400);
    }
  }

  // 1.4 登出与清除会话 (POST /api/auth/logout)
  if (pathname === '/api/auth/logout') {
    if (request.method !== 'POST') {
      return jsonResponse({ error: '方法不允许 (仅支持 POST)' }, 405);
    }
    const secureFlag = isSecure ? '; Secure' : '';
    const expireCookie = `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`;
    return jsonResponse({ success: true, message: '已锁定' }, 200, {
      'Set-Cookie': expireCookie,
    });
  }

  // 2. 反向代理转发与安全鉴权
  // ==========================================

  // 2.1 检查目标图床服务是否就绪
  if (!config.apiBase) {
    return jsonResponse({ error: '未配置 API_BASE' }, 502);
  }

  // 阻断并拒绝任何上传端点请求（相册前端专注看图，不提供文件写入服务）
  if (
    pathname === '/upload' ||
    pathname.startsWith('/upload/') ||
    pathname === '/api/upload' ||
    pathname.startsWith('/api/upload/')
  ) {
    return jsonResponse({ error: '未提供上传端点' }, 404);
  }

  // 2.2 判断是否为管理操作接口
  const isAdminEndpoint =
    pathname === '/api/manage' ||
    pathname.startsWith('/api/manage/') ||
    pathname === '/api/directoryTree';

  // 2.3 判断是否为公开合法放行接口（媒体资源与公开只读相册接口）
  const isPublicEndpoint =
    pathname.startsWith('/file/') ||
    pathname === '/api/public' ||
    pathname.startsWith('/api/public/');

  // 若既非管理端点也非公开端点，严禁作为开放代理向后端透传任意未知请求
  if (!isAdminEndpoint && !isPublicEndpoint) {
    return jsonResponse({ error: '端点不存在或未授权访问' }, 404);
  }

  // 2.4 端点方法约束
  if (pathname === '/api/directoryTree' && request.method !== 'GET') {
    return jsonResponse({ error: '方法不允许 (仅支持 GET)' }, 405);
  }

  // 2.5 管理接口鉴权
  if (isAdminEndpoint) {
    const cookies = parseCookies(request.headers.get('Cookie'));
    const isAuthenticated = await verifySessionCookie(cookies[COOKIE_NAME], config.sessionSecret);

    if (!isAuthenticated) {
      return jsonResponse(
        { error: '未授权' },
        401
      );
    }

    if (!config.apiToken) {
      return jsonResponse({ error: '未配置 API_TOKEN' }, 500);
    }
  }

  // 2.7 组装转发请求
  const targetUrl = `${config.apiBase}${pathname}${url.search}`;

  const forwardHeaders = new Headers();
  // 复制允许的通用标头，过滤掉 hop-by-hop 标头和私密信息
  const hopByHopHeaders = new Set([
    'host',
    'cookie',
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'authorization',
  ]);

  for (const [key, value] of request.headers.entries()) {
    const lower = key.toLowerCase();
    if (!hopByHopHeaders.has(lower)) {
      forwardHeaders.set(key, value);
    }
  }

  // 若为管理接口，由边缘端安全注入最高权限 Token（客户端完全不知情）
  if (isAdminEndpoint) {
    forwardHeaders.set('Authorization', `Bearer ${config.apiToken}`);
  }

  try {
    const bodyInit =
      request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.arrayBuffer()
        : undefined;

    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: bodyInit,
      redirect: 'follow',
    });

    // 复制上游响应头
    const responseHeaders = new Headers();
    for (const [key, value] of upstreamResponse.headers.entries()) {
      const lower = key.toLowerCase();
      if (lower !== 'content-encoding' && lower !== 'content-length') {
        responseHeaders.set(key, value);
      }
    }

    if (isMediaRequest) {
      // 图片等静态媒体资源：图片源站不做保护，允许跨域展示，但强制沙箱隔离，防范 SVG/HTML XSS
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.delete('Access-Control-Allow-Credentials');
      responseHeaders.set('Content-Security-Policy', "default-src 'none'; sandbox");
      responseHeaders.set('X-Content-Type-Options', 'nosniff');
    } else {
      // API 接口：重点防御！强化安全标头
      responseHeaders.set('X-Content-Type-Options', 'nosniff');
      responseHeaders.set('X-Frame-Options', 'DENY');
      responseHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

      // CORS 防护：仅当携带同源/受信 Origin 时才回写 Credentials，严防凭据被恶意跨域页面盗取
      if (origin && isTrusted) {
        responseHeaders.set('Access-Control-Allow-Origin', origin);
        responseHeaders.set('Access-Control-Allow-Credentials', 'true');
        responseHeaders.set('Vary', 'Origin');
      } else {
        responseHeaders.delete('Access-Control-Allow-Credentials');
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error(`[BFF Proxy Error] ${request.method} ${targetUrl}:`, err);
    return jsonResponse(
      {
        error: `连接上游图床服务失败: ${err?.message || '网络连接超时'}`,
      },
      502
    );
  }
}
