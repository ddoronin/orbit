import {
  Resource,
  Post,
  Body,
  Param,
  Auth,
  Inject,
  ActorRegistry,
  ACTOR_REGISTRY_TOKEN,
  D1_TOKEN,
  NotFoundException,
  bearer,
} from "@orbitstack/app";
import { CollectionActor } from "./collection.actor.js";
import { WorkspaceActor } from "./workspace.actor.js";
import { ensureHistorySchema } from "./d1-schema.js";
import type {
  CollectionState,
  ExecuteFailure,
  ExecuteResponse,
  KeyValueEntry,
  MemberRole,
  RequestAuth,
  RequestBody,
  RequestDraft,
  Session,
  WorkspaceState,
} from "./types.js";

@Resource("/execute", { guards: [bearer("ORBIT_POSTMAN_SESSIONS")] })
export class ExecuteController {
  constructor(
    @Inject(ACTOR_REGISTRY_TOKEN) private actors: ActorRegistry,
    @Inject(D1_TOKEN) private db: D1Database | undefined,
  ) {}

  @Post("/collections/:id/requests/:requestId")
  async execute(
    @Param("id") id: string,
    @Param("requestId") requestId: string,
    @Body()
    body: {
      environment?: Record<string, string>;
      overrides?: Partial<
        Pick<
          RequestDraft,
          "url" | "method" | "headers" | "query" | "body" | "auth"
        >
      >;
    },
    @Auth() me: Session,
  ): Promise<ExecuteResponse | ExecuteFailure> {
    const collection = await this.actors
      .ref(CollectionActor, id)
      .snapshot<CollectionState>();
    if (!collection.collectionId)
      throw new NotFoundException(`Collection ${id}`);

    const ws = await this.actors
      .ref(WorkspaceActor, collection.workspaceId)
      .snapshot<WorkspaceState>();
    assertMember(ws, me.userId);

    const request = collection.requests[requestId];
    if (!request) throw new NotFoundException(`Request ${requestId}`);

    const env = {
      ...ws.environmentVariables,
      ...(body.environment ?? {}),
    };

    const resolved = resolveRequest(
      {
        ...request,
        ...body.overrides,
      },
      env,
    );

    const headers = toHeaders(resolved.headers);
    const finalUrl = appendQuery(resolved.url, resolved.query);
    applyAuth(headers, resolved.auth, finalUrl.searchParams);

    const startedAt = Date.now();
    const timeoutMs = 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(finalUrl, {
        method: resolved.method,
        headers,
        body: toBody(resolved.body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const bodyText = await response.text();
      const createdAt = Date.now();
      const durationMs = createdAt - startedAt;
      const responseHeaders = mapHeaders(response.headers);
      const jsonBody = tryParseJson(bodyText, responseHeaders["content-type"]);

      const payload: ExecuteResponse = {
        requestId,
        method: resolved.method,
        url: finalUrl.toString(),
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        bodyText,
        jsonBody,
        durationMs,
        size: bodyText.length,
        createdAt,
      };

      await this.persistHistory({
        id: crypto.randomUUID(),
        workspaceId: collection.workspaceId,
        collectionId: collection.collectionId,
        requestId,
        method: payload.method,
        url: payload.url,
        status: payload.status,
        durationMs: payload.durationMs,
        responseHeaders: payload.headers,
        responseBody: payload.bodyText,
        createdAt,
      });

      return payload;
    } catch (error) {
      clearTimeout(timer);
      const aborted = controller.signal.aborted;
      const message = aborted
        ? `Request aborted after ${timeoutMs}ms (worker outbound network unreachable?)`
        : error instanceof Error
          ? error.message
          : "Request failed";
      return {
        requestId,
        method: resolved.method,
        url: finalUrl.toString(),
        error: message,
        createdAt: Date.now(),
      };
    }
  }

  private async persistHistory(entry: {
    id: string;
    workspaceId: string;
    collectionId: string;
    requestId: string;
    method: string;
    url: string;
    status: number;
    durationMs: number;
    responseHeaders: Record<string, string>;
    responseBody: string;
    createdAt: number;
  }): Promise<void> {
    if (!this.db) return;
    await ensureHistorySchema(this.db);

    await this.db
      .prepare(
        "INSERT INTO postman_request_history (id, workspace_id, collection_id, request_id, method, url, status, duration_ms, response_headers, response_body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        entry.id,
        entry.workspaceId,
        entry.collectionId,
        entry.requestId,
        entry.method,
        entry.url,
        entry.status,
        entry.durationMs,
        JSON.stringify(entry.responseHeaders),
        entry.responseBody,
        entry.createdAt,
      )
      .run();
  }
}

function resolveRequest(
  request: RequestDraft,
  env: Record<string, string>,
): RequestDraft {
  return {
    ...request,
    url: resolveVars(request.url, env),
    headers: request.headers.map((header) => ({
      ...header,
      key: resolveVars(header.key, env),
      value: resolveVars(header.value, env),
    })),
    query: request.query.map((query) => ({
      ...query,
      key: resolveVars(query.key, env),
      value: resolveVars(query.value, env),
    })),
    body: resolveBody(request.body, env),
    auth: resolveAuth(request.auth, env),
  };
}

function resolveBody(
  body: RequestBody,
  env: Record<string, string>,
): RequestBody {
  if (body.mode === "none") return body;
  return {
    ...body,
    text: resolveVars(body.text, env),
    contentType: body.contentType
      ? resolveVars(body.contentType, env)
      : body.contentType,
  };
}

function resolveAuth(
  auth: RequestAuth,
  env: Record<string, string>,
): RequestAuth {
  if (auth.type === "none") return auth;
  if (auth.type === "bearer") {
    return { type: "bearer", token: resolveVars(auth.token, env) };
  }
  if (auth.type === "apiKey") {
    return {
      type: "apiKey",
      key: resolveVars(auth.key, env),
      value: resolveVars(auth.value, env),
      in: auth.in,
    };
  }
  return {
    type: "basic",
    username: resolveVars(auth.username, env),
    password: resolveVars(auth.password, env),
  };
}

function resolveVars(value: string, env: Record<string, string>): string {
  return value.replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (_match, key: string) => {
      if (env[key] === undefined) return `{{${key}}}`;
      return env[key];
    },
  );
}

function toHeaders(entries: KeyValueEntry[]): Headers {
  const headers = new Headers();
  for (const entry of entries) {
    if (!entry.enabled) continue;
    const key = entry.key.trim();
    if (!key) continue;
    headers.set(key, entry.value);
  }
  return headers;
}

function toBody(body: RequestBody): string | undefined {
  if (body.mode === "none") return undefined;
  return body.text;
}

function appendQuery(url: string, query: KeyValueEntry[]): URL {
  const parsed = new URL(url);
  for (const entry of query) {
    if (!entry.enabled) continue;
    const key = entry.key.trim();
    if (!key) continue;
    parsed.searchParams.set(key, entry.value);
  }
  return parsed;
}

function applyAuth(
  headers: Headers,
  auth: RequestAuth,
  query: URLSearchParams,
): void {
  if (auth.type === "none") return;

  if (auth.type === "bearer") {
    if (auth.token.trim()) {
      headers.set("authorization", `Bearer ${auth.token}`);
    }
    return;
  }

  if (auth.type === "apiKey") {
    if (!auth.key.trim()) return;
    if (auth.in === "query") {
      query.set(auth.key, auth.value);
    } else {
      headers.set(auth.key, auth.value);
    }
    return;
  }

  const encoded = btoa(`${auth.username}:${auth.password}`);
  headers.set("authorization", `Basic ${encoded}`);
}

function mapHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function tryParseJson(
  bodyText: string,
  contentType: string | undefined,
): unknown {
  if (!contentType || !contentType.includes("application/json")) return null;
  try {
    return JSON.parse(bodyText);
  } catch {
    return null;
  }
}

function assertMember(ws: WorkspaceState, userId: string): void {
  const role = ws.members[userId] as MemberRole | undefined;
  if (!role) {
    throw new NotFoundException(`Workspace ${ws.workspaceId}`);
  }
}
