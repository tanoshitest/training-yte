/**
 * Minimal Durable Object base used by both the original Worker build and the
 * self-hosted VPS adapter.  A Durable Object class only needs to retain the
 * state object supplied by the runtime; it does not need to import
 * `cloudflare:workers`.
 */
export interface DurableObjectStorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
}

export interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
}

export class DurableObject<Env> {
  protected readonly ctx: DurableObjectStateLike;
  protected readonly env: Env;

  constructor(ctx: DurableObjectStateLike, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
