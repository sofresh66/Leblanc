import type { Env } from '../env.js';
import { listCategoryCountsFromDb } from '../db/referenceData.js';
import { jsonResponse } from '../http/responses.js';

/** GET /api/v1/categories : [{ key, count }] pour toutes les catégories. */
export async function handleCategories(
  request: Request,
  env: Env | undefined,
  nowIso: string
): Promise<Response> {
  const categories = await listCategoryCountsFromDb(env?.DATABASE_URL ?? '', nowIso);
  return jsonResponse(request, env, categories, {
    cacheProfile: 'categories',
  });
}
