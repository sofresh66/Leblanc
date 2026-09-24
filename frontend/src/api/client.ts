/**
 * Client HTTP de base préparé pour le branchement de l'API réelle Cloudflare Worker (Lot 4).
 */
export interface ApiClientConfig {
  baseUrl: string;
}

export class ApiClient {
  private readonly baseUrl: string;

  constructor(config?: Partial<ApiClientConfig>) {
    this.baseUrl = config?.baseUrl ?? '/api';
  }

  async get<T>(path: string, searchParams?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(this.baseUrl + path, window.location.origin);
    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }
}

export const apiClient = new ApiClient();
