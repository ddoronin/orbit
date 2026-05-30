/**
 * Radix trie router for URL matching.
 *
 * Supports:
 * - Static segments: /users/list
 * - Named parameters: /users/:id
 * - Wildcard: /files/*path
 * - Route groups with shared middleware
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface RouteMatch {
  handler: RouteHandler;
  params: Record<string, string>;
  guards: GuardFn[];
  pipes: PipeFn[];
  middleware: MiddlewareFn[];
}

export type MiddlewareFn = (ctx: RequestContext, next: () => Promise<Response>) => Promise<Response>;
export type GuardFn = (ctx: RequestContext) => boolean | Promise<boolean>;
export type PipeFn = (value: unknown, ctx: RequestContext) => unknown | Promise<unknown>;
export type RouteHandler = (ctx: RequestContext) => Promise<Response> | Response;

export interface RequestContext {
  readonly request: Request;
  readonly env: any;
  readonly params: Record<string, string>;
  readonly query: URLSearchParams;
  readonly url: URL;
  readonly waitUntil: (p: Promise<unknown>) => void;
  readonly container: any;
  body<T = any>(): Promise<T>;
  header(name: string): string | null;
  json<T = any>(data: T, status?: number, headers?: Record<string, string>): Response;
  text(body: string, status?: number): Response;
  html(body: string, status?: number): Response;
  redirect(url: string, status?: number): Response;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  paramChild: TrieNode | null;
  paramName: string | null;
  wildcardChild: TrieNode | null;
  wildcardName: string | null;
  handlers: Map<HttpMethod, RouteEntry>;
  wsHandler: RouteEntry | null;
}

interface RouteEntry {
  handler: RouteHandler;
  guards: GuardFn[];
  pipes: PipeFn[];
  middleware: MiddlewareFn[];
}

function createNode(): TrieNode {
  return {
    children: new Map(),
    paramChild: null,
    paramName: null,
    wildcardChild: null,
    wildcardName: null,
    handlers: new Map(),
    wsHandler: null,
  };
}

export class Router {
  private root = createNode();
  private globalMiddleware: MiddlewareFn[] = [];

  use(...middleware: MiddlewareFn[]): this {
    this.globalMiddleware.push(...middleware);
    return this;
  }

  get(path: string, handler: RouteHandler, opts?: RouteOpts): this {
    return this.add('GET', path, handler, opts);
  }

  post(path: string, handler: RouteHandler, opts?: RouteOpts): this {
    return this.add('POST', path, handler, opts);
  }

  put(path: string, handler: RouteHandler, opts?: RouteOpts): this {
    return this.add('PUT', path, handler, opts);
  }

  delete(path: string, handler: RouteHandler, opts?: RouteOpts): this {
    return this.add('DELETE', path, handler, opts);
  }

  patch(path: string, handler: RouteHandler, opts?: RouteOpts): this {
    return this.add('PATCH', path, handler, opts);
  }

  ws(path: string, handler: RouteHandler, opts?: RouteOpts): this {
    this.insert(path, {
      handler,
      guards: opts?.guards ?? [],
      pipes: opts?.pipes ?? [],
      middleware: opts?.middleware ?? [],
    }, 'WS');
    return this;
  }

  group(prefix: string, configure: (group: RouteGroup) => void): this {
    const group = new RouteGroup(prefix, this);
    configure(group);
    return this;
  }

  add(method: HttpMethod, path: string, handler: RouteHandler, opts?: RouteOpts): this {
    this.insert(path, {
      handler,
      guards: opts?.guards ?? [],
      pipes: opts?.pipes ?? [],
      middleware: opts?.middleware ?? [],
    }, method);
    return this;
  }

  /** @internal */
  insert(path: string, entry: RouteEntry, method: HttpMethod | 'WS'): void {
    const segments = path.split('/').filter(Boolean);
    let node = this.root;

    for (const segment of segments) {
      if (segment.startsWith(':')) {
        // Parameter segment
        if (!node.paramChild) {
          node.paramChild = createNode();
          node.paramName = segment.slice(1);
        }
        node = node.paramChild;
      } else if (segment.startsWith('*')) {
        // Wildcard segment
        if (!node.wildcardChild) {
          node.wildcardChild = createNode();
          node.wildcardName = segment.slice(1) || 'wildcard';
        }
        node = node.wildcardChild;
        break; // Wildcard consumes rest
      } else {
        // Static segment
        if (!node.children.has(segment)) {
          node.children.set(segment, createNode());
        }
        node = node.children.get(segment)!;
      }
    }

    if (method === 'WS') {
      node.wsHandler = entry;
    } else {
      node.handlers.set(method, entry);
    }
  }

  match(method: HttpMethod | 'WS', path: string): RouteMatch | null {
    const segments = path.split('/').filter(Boolean);
    const params: Record<string, string> = {};

    const result = this.search(this.root, segments, 0, params);
    if (!result) return null;

    const entry = method === 'WS'
      ? result.wsHandler
      : result.handlers.get(method as HttpMethod);

    if (!entry) {
      // Check HEAD → GET fallback
      if (method === 'HEAD') {
        const getEntry = result.handlers.get('GET');
        if (getEntry) {
          return {
            handler: getEntry.handler,
            params,
            guards: getEntry.guards,
            pipes: getEntry.pipes,
            middleware: [...this.globalMiddleware, ...getEntry.middleware],
          };
        }
      }
      return null;
    }

    return {
      handler: entry.handler,
      params,
      guards: entry.guards,
      pipes: entry.pipes,
      middleware: [...this.globalMiddleware, ...entry.middleware],
    };
  }

  private search(
    node: TrieNode,
    segments: string[],
    index: number,
    params: Record<string, string>,
  ): TrieNode | null {
    if (index === segments.length) {
      return node;
    }

    const segment = segments[index];

    // Try static match first
    const staticChild = node.children.get(segment);
    if (staticChild) {
      const result = this.search(staticChild, segments, index + 1, params);
      if (result) return result;
    }

    // Try parameter match
    if (node.paramChild && node.paramName) {
      const prevValue = params[node.paramName];
      params[node.paramName] = segment;
      const result = this.search(node.paramChild, segments, index + 1, params);
      if (result) return result;
      // Backtrack
      if (prevValue !== undefined) {
        params[node.paramName] = prevValue;
      } else {
        delete params[node.paramName];
      }
    }

    // Try wildcard match
    if (node.wildcardChild && node.wildcardName) {
      params[node.wildcardName] = segments.slice(index).join('/');
      return node.wildcardChild;
    }

    return null;
  }

  async handle(request: Request, container: any): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase() as HttpMethod;
    const isWebSocket = request.headers.get('Upgrade') === 'websocket';

    const routeMatch = this.match(isWebSocket ? 'WS' : method, url.pathname);
    if (!routeMatch) {
      return new Response('Not Found', { status: 404 });
    }

    const ctx = createRequestContext(request, url, routeMatch.params, container);

    // Execute middleware chain
    const chain = [...routeMatch.middleware];

    const executeChain = async (index: number): Promise<Response> => {
      if (index < chain.length) {
        return chain[index](ctx, () => executeChain(index + 1));
      }

      // Execute guards
      for (const guard of routeMatch.guards) {
        const allowed = await guard(ctx);
        if (!allowed) {
          return new Response('Forbidden', { status: 403 });
        }
      }

      // Execute handler
      return routeMatch.handler(ctx);
    };

    try {
      return await executeChain(0);
    } catch (err: any) {
      if (err.statusCode && typeof err.toResponse === 'function') {
        return err.toResponse();
      }
      return Response.json(
        { statusCode: 500, message: err.message ?? 'Internal Server Error' },
        { status: 500 },
      );
    }
  }
}

export interface RouteOpts {
  guards?: GuardFn[];
  pipes?: PipeFn[];
  middleware?: MiddlewareFn[];
}

export class RouteGroup {
  private groupMiddleware: MiddlewareFn[] = [];
  private groupGuards: GuardFn[] = [];

  constructor(
    private prefix: string,
    private router: Router,
  ) {}

  use(...middleware: MiddlewareFn[]): this {
    this.groupMiddleware.push(...middleware);
    return this;
  }

  useGuard(...guards: GuardFn[]): this {
    this.groupGuards.push(...guards);
    return this;
  }

  get(path: string, handler: RouteHandler, opts?: RouteOpts): this {
    return this.add('GET', path, handler, opts);
  }

  post(path: string, handler: RouteHandler, opts?: RouteOpts): this {
    return this.add('POST', path, handler, opts);
  }

  put(path: string, handler: RouteHandler, opts?: RouteOpts): this {
    return this.add('PUT', path, handler, opts);
  }

  delete(path: string, handler: RouteHandler, opts?: RouteOpts): this {
    return this.add('DELETE', path, handler, opts);
  }

  patch(path: string, handler: RouteHandler, opts?: RouteOpts): this {
    return this.add('PATCH', path, handler, opts);
  }

  ws(path: string, handler: RouteHandler, opts?: RouteOpts): this {
    this.router.ws(this.prefix + path, handler, {
      ...opts,
      guards: [...this.groupGuards, ...(opts?.guards ?? [])],
      middleware: [...this.groupMiddleware, ...(opts?.middleware ?? [])],
    });
    return this;
  }

  group(prefix: string, configure: (group: RouteGroup) => void): this {
    const nested = new RouteGroup(this.prefix + prefix, this.router);
    nested.groupMiddleware = [...this.groupMiddleware];
    nested.groupGuards = [...this.groupGuards];
    configure(nested);
    return this;
  }

  private add(method: HttpMethod, path: string, handler: RouteHandler, opts?: RouteOpts): this {
    this.router.add(method, this.prefix + path, handler, {
      ...opts,
      guards: [...this.groupGuards, ...(opts?.guards ?? [])],
      middleware: [...this.groupMiddleware, ...(opts?.middleware ?? [])],
    });
    return this;
  }
}

function createRequestContext(
  request: Request,
  url: URL,
  params: Record<string, string>,
  container: any,
): RequestContext {
  let parsedBody: any = undefined;

  return {
    request,
    env: container?.env,
    params,
    query: url.searchParams,
    url,
    waitUntil: container?.waitUntil ?? (() => {}),
    container,
    async body<T = any>(): Promise<T> {
      if (parsedBody === undefined) {
        const contentType = request.headers.get('Content-Type') ?? '';
        if (contentType.includes('application/json')) {
          parsedBody = await request.json();
        } else if (contentType.includes('form')) {
          const fd = await request.formData();
          const obj: Record<string, any> = {};
          fd.forEach((value, key) => { obj[key] = value; });
          parsedBody = obj;
        } else {
          parsedBody = await request.text();
        }
      }
      return parsedBody as T;
    },
    header(name: string): string | null {
      return request.headers.get(name);
    },
    json<T>(data: T, status = 200, headers?: Record<string, string>): Response {
      return Response.json(data, { status, headers });
    },
    text(body: string, status = 200): Response {
      return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });
    },
    html(body: string, status = 200): Response {
      return new Response(body, { status, headers: { 'Content-Type': 'text/html' } });
    },
    redirect(redirectUrl: string, status = 302): Response {
      return Response.redirect(redirectUrl, status);
    },
  };
}

/**
 * Convenience function to create a new router.
 */
export function router(): Router {
  return new Router();
}
