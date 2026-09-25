import { neon } from '@neondatabase/serverless';

/**
 * Erreur spécifique levée en cas d'indisponibilité ou timeout de la base de données.
 */
export class DatabaseServiceError extends Error {
  constructor(
    message = 'Service de base de données indisponible',
    public readonly originalCause?: unknown
  ) {
    super(message);
    this.name = 'DatabaseServiceError';
  }
}

/**
 * Exécute une requête SQL paramétrée sur Neon avec un timeout strict de 5 secondes.
 *
 * @param databaseUrl URL de connexion Neon PostgreSQL
 * @param query Requête SQL paramétrée ($1, $2, etc.)
 * @param params Tableau des paramètres
 * @param timeoutMs Délai maximal en millisecondes (défaut : 5000 ms)
 */
export async function executeQuery<T = unknown>(
  databaseUrl: string,
  query: string,
  params: unknown[] = [],
  timeoutMs = 5000
): Promise<T[]> {
  if (!databaseUrl) {
    throw new DatabaseServiceError('Variable d’environnement DATABASE_URL non configurée');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const sql = neon(databaseUrl);
    const result = await sql.query(query, params, {
      fetchOptions: { signal: controller.signal },
    });
    return result as T[];
  } catch (err: unknown) {
    const isAbort =
      (err instanceof Error && err.name === 'AbortError') ||
      controller.signal.aborted;

    if (isAbort) {
      throw new DatabaseServiceError(
        'Délai d’attente dépassé lors de la communication avec la base de données (timeout 5s)',
        err
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes('connecting to database') ||
      message.includes('fetch failed') ||
      message.includes('Server error (HTTP status 5')
    ) {
      throw new DatabaseServiceError(
        'Impossible d’établir la connexion avec la base de données Neon',
        err
      );
    }

    throw err;
  } finally {
    clearTimeout(timer);
  }
}
