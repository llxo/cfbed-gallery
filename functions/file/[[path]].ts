import { handleRequest } from '../../server/core';

export const onRequest = async (context: {
  request: Request;
  env: Record<string, string>;
}): Promise<Response> => {
  return handleRequest(context.request, context.env);
};
