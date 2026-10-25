import { handleRequest } from '../server/core';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request): Promise<Response> {
  return handleRequest(request, process.env as Record<string, string>);
}
