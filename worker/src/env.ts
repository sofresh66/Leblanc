/**
 * Types des variables d'environnement et secrets du Worker Cloudflare.
 */
export interface Env {
  DATABASE_URL: string;
  ALLOWED_ORIGINS?: string;
}
