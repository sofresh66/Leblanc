import { CATEGORIES } from '@leblanc/shared';
import type { Env } from '../env.js';
import { jsonResponse } from '../http/responses.js';

export function handleCategories(request: Request, env: Env | undefined): Response {
  return jsonResponse(request, env, CATEGORIES, {
    cacheProfile: 'categories',
  });
}
