import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { handleRequest } from './server/core';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 加载 .env, .env.local 等环境变量注入到 process.env (供 BFF 统一服务读取)
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'bff-dev-server',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = req.url || '';
            const isProxyTarget =
              url.startsWith('/api/') ||
              url.startsWith('/file/');

            if (!isProxyTarget) {
              return next();
            }

            try {
              const protocol = req.headers['x-forwarded-proto'] || 'http';
              const host = req.headers.host || 'localhost:5173';
              const fullUrl = `${protocol}://${host}${url}`;

              // 收集请求流 Buffer
              let bodyBuffer: Buffer | undefined;
              if (req.method !== 'GET' && req.method !== 'HEAD') {
                const chunks: Buffer[] = [];
                for await (const chunk of req) {
                  chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
                }
                bodyBuffer = Buffer.concat(chunks);
              }

              // 构造标准 Web Request
              const webReq = new Request(fullUrl, {
                method: req.method,
                headers: req.headers as any,
                body: bodyBuffer,
              });

              // 调用统一边缘服务核心
              const webRes = await handleRequest(webReq, process.env as Record<string, string>);

              // 回写状态与标头
              res.statusCode = webRes.status;
              webRes.headers.forEach((val, key) => {
                if (key.toLowerCase() !== 'set-cookie') {
                  res.setHeader(key, val);
                }
              });

              // 单独确保 Set-Cookie 数组完整写入
              const setCookies = (webRes.headers as any).getSetCookie?.();
              if (Array.isArray(setCookies) && setCookies.length > 0) {
                res.setHeader('set-cookie', setCookies);
              } else {
                const singleCookie = webRes.headers.get('set-cookie');
                if (singleCookie) {
                  res.setHeader('set-cookie', singleCookie);
                }
              }

              // 流式传输响应体（避免代理大图片时造成本地 Node 进程内存突发缓冲）
              if (webRes.body) {
                const reader = webRes.body.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  res.write(value);
                }
                res.end();
              } else {
                res.end();
              }
            } catch (err) {
              next(err);
            }
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: true,
    },
  };
});
