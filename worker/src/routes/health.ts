import type { Env } from '../env.js';
import { jsonResponse } from '../http/responses.js';

export function handleHealth(request: Request, env: Env | undefined): Response {
  return jsonResponse(
    request,
    env,
    {
      status: 'ok',
      build: 'dev',
    },
    {
      cacheProfile: 'noStore',
    }
  );
}
