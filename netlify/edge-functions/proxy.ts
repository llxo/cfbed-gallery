import { handleRequest } from '../../server/core';

export default async (request: Request): Promise<Response> => {
  const env =
    typeof (globalThis as any).Netlify?.env?.toObject === 'function'
      ? (globalThis as any).Netlify.env.toObject()
      : (process.env as Record<string, string>);

  return handleRequest(request, env);
};
