import { listCitiesFromDb } from '../db/referenceData.js';
import type { Env } from '../env.js';
import { jsonResponse } from '../http/responses.js';

export async function handleCities(
  request: Request,
  env: Env | undefined,
  nowIso: string
): Promise<Response> {
  const databaseUrl = env?.DATABASE_URL || '';
  const cities = await listCitiesFromDb(databaseUrl, nowIso);

  return jsonResponse(request, env, cities, {
    cacheProfile: 'cities',
  });
}
