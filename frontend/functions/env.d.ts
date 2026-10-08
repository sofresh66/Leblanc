// Types minimaux du runtime Cloudflare Pages Functions utilisés par le
// middleware (évite une dépendance @cloudflare/workers-types pour 4 symboles).

interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

interface CacheStorage {
  readonly default: Cache;
}

interface EventContext<Env> {
  request: Request;
  env: Env;
  next(input?: Request | string, init?: RequestInit): Promise<Response>;
  waitUntil(promise: Promise<unknown>): void;
}

type PagesFunction<Env = unknown> = (context: EventContext<Env>) => Response | Promise<Response>;

interface RewriterElement {
  setAttribute(name: string, value: string): RewriterElement;
  setInnerContent(content: string, options?: { html?: boolean }): RewriterElement;
  append(content: string, options?: { html?: boolean }): RewriterElement;
}

declare class HTMLRewriter {
  on(selector: string, handlers: { element?(element: RewriterElement): void | Promise<void> }): HTMLRewriter;
  transform(response: Response): Response;
}
