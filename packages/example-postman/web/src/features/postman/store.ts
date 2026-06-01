import { create } from "zustand";
import type {
  CollectionState,
  CollectionSummary,
  ExecuteFailure,
  ExecuteResponse,
  HistoryEntry,
  KeyValueEntry,
  RequestDraft,
  Session,
  TestResult,
  WorkspaceState,
} from "./types";

const STORAGE_KEY = "orbit.postman.auth";
const SKIP_PROXY_KEY = "orbit.postman.skipProxy";

type ExecuteResult = ExecuteResponse | ExecuteFailure | null;

export type SidebarPane = "collections" | "environments" | "history";

interface AuthState {
  token: string;
  session: Session;
}

interface AppStore {
  bootstrapped: boolean;
  auth: AuthState | null;
  workspace: WorkspaceState | null;
  collections: CollectionSummary[];
  activeCollection: CollectionState | null;
  activeRequestId: string | null;
  executeResult: ExecuteResult;
  history: HistoryEntry[];
  testResults: TestResult[];
  sidebarPane: SidebarPane;
  paletteOpen: boolean;
  error: string | null;
  init: () => Promise<void>;
  login: (displayName: string) => Promise<void>;
  logout: () => void;
  setSidebarPane: (pane: SidebarPane) => void;
  setPaletteOpen: (open: boolean) => void;
  refreshWorkspace: () => Promise<void>;
  selectCollection: (collectionId: string) => Promise<void>;
  createCollection: (name: string) => Promise<void>;
  renameCollection: (collectionId: string, name: string) => Promise<void>;
  deleteCollection: (collectionId: string) => Promise<void>;
  createFolder: (name: string, parentFolderId?: string | null) => Promise<void>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  createRequest: (name: string, folderId?: string | null) => Promise<void>;
  selectRequest: (requestId: string) => void;
  moveRequest: (
    requestId: string,
    folderId?: string | null,
    afterRequestId?: string | null,
  ) => Promise<void>;
  deleteRequest: (requestId: string) => Promise<void>;
  updateRequest: (
    requestId: string,
    patch: Partial<RequestDraft>,
  ) => Promise<void>;
  sendRequest: () => Promise<void>;
  saveExample: (name: string) => Promise<void>;
  setEnvVar: (key: string, value: string) => Promise<void>;
  deleteEnvVar: (key: string) => Promise<void>;
  exportWorkspace: () => Promise<string>;
  importWorkspace: (raw: string) => Promise<void>;
}

export const usePostmanStore = create<AppStore>((set, get) => ({
  bootstrapped: false,
  auth: null,
  workspace: null,
  collections: [],
  activeCollection: null,
  activeRequestId: null,
  executeResult: null,
  history: [],
  testResults: [],
  sidebarPane: "collections",
  paletteOpen: false,
  error: null,

  setSidebarPane: (pane) => set({ sidebarPane: pane }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),

  init: async () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      set({ bootstrapped: true });
      return;
    }

    try {
      const parsed = JSON.parse(raw) as AuthState;
      set({ auth: parsed });
      await get().refreshWorkspace();
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      set({ auth: null });
    } finally {
      set({ bootstrapped: true });
    }
  },

  login: async (displayName: string) => {
    const result = await api<{ token: string; session: Session }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ displayName }),
      },
    );

    const auth: AuthState = { token: result.token, session: result.session };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    set({ auth, error: null });
    await get().refreshWorkspace();
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SKIP_PROXY_KEY);
    set({
      auth: null,
      workspace: null,
      collections: [],
      activeCollection: null,
      activeRequestId: null,
      executeResult: null,
      history: [],
      testResults: [],
      error: null,
    });
  },

  refreshWorkspace: async () => {
    const auth = get().auth;
    if (!auth) return;

    const workspace = await api<WorkspaceState>("/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "Shared API Lab" }),
      token: auth.token,
    });

    const collections = await api<CollectionSummary[]>(
      `/workspaces/${workspace.workspaceId}/collections`,
      { token: auth.token },
    );

    set({ workspace, collections });

    if (collections.length === 0) {
      await get().createCollection("API Collection");
      return;
    }

    await get().selectCollection(collections[0].collectionId);
  },

  selectCollection: async (collectionId: string) => {
    const auth = get().auth;
    if (!auth) return;

    const activeCollection = await api<CollectionState>(
      `/collections/${collectionId}`,
      {
        token: auth.token,
      },
    );

    const activeRequestId = firstRequestId(activeCollection);

    set({
      activeCollection,
      activeRequestId,
      executeResult: null,
      error: null,
    });

    if (activeRequestId) {
      await loadHistory(collectionId, activeRequestId, auth.token, set);
    } else {
      set({ history: [] });
    }
  },

  createCollection: async (name: string) => {
    const auth = get().auth;
    const workspace = get().workspace;
    if (!auth || !workspace) return;

    const created = await api<CollectionState>(
      `/workspaces/${workspace.workspaceId}/collections`,
      {
        method: "POST",
        token: auth.token,
        body: JSON.stringify({ name }),
      },
    );

    await get().refreshWorkspace();
    await get().selectCollection(created.collectionId);
  },

  renameCollection: async (collectionId: string, name: string) => {
    const auth = get().auth;
    if (!auth) return;

    await api(`/collections/${collectionId}`, {
      method: "PATCH",
      token: auth.token,
      body: JSON.stringify({ name }),
    });

    await get().refreshWorkspace();
    await get().selectCollection(collectionId);
  },

  deleteCollection: async (collectionId: string) => {
    const auth = get().auth;
    const workspace = get().workspace;
    const activeCollectionId = get().activeCollection?.collectionId ?? null;
    if (!auth || !workspace) return;

    await api<void>(
      `/workspaces/${workspace.workspaceId}/collections/${collectionId}`,
      {
        method: "DELETE",
        token: auth.token,
      },
    );

    await get().refreshWorkspace();

    const nextCollections = get().collections;
    if (nextCollections.length === 0) {
      set({
        activeCollection: null,
        activeRequestId: null,
        history: [],
        executeResult: null,
      });
      return;
    }

    if (activeCollectionId === collectionId) {
      await get().selectCollection(nextCollections[0].collectionId);
    }
  },

  createFolder: async (name: string, parentFolderId = null) => {
    const auth = get().auth;
    const collection = get().activeCollection;
    if (!auth || !collection) return;

    await api(`/collections/${collection.collectionId}/folders`, {
      method: "POST",
      token: auth.token,
      body: JSON.stringify({ name, parentFolderId }),
    });

    await get().selectCollection(collection.collectionId);
  },

  renameFolder: async (folderId: string, name: string) => {
    const auth = get().auth;
    const collection = get().activeCollection;
    if (!auth || !collection) return;

    await api(`/collections/${collection.collectionId}/folders/${folderId}`, {
      method: "PATCH",
      token: auth.token,
      body: JSON.stringify({ name }),
    });

    await get().selectCollection(collection.collectionId);
  },

  deleteFolder: async (folderId: string) => {
    const auth = get().auth;
    const collection = get().activeCollection;
    const activeRequestId = get().activeRequestId;
    if (!auth || !collection) return;

    const willDeleteSelected =
      Boolean(activeRequestId) &&
      isRequestInsideFolder(collection, folderId, activeRequestId as string);

    await api<void>(
      `/collections/${collection.collectionId}/folders/${folderId}`,
      {
        method: "DELETE",
        token: auth.token,
      },
    );

    await get().selectCollection(collection.collectionId);
    if (willDeleteSelected) {
      set({ executeResult: null, history: [] });
    }
  },

  createRequest: async (name: string, folderId = null) => {
    const auth = get().auth;
    const collection = get().activeCollection;
    if (!auth || !collection) return;

    const request = await api<RequestDraft>(
      `/collections/${collection.collectionId}/requests`,
      {
        method: "POST",
        token: auth.token,
        body: JSON.stringify({
          name,
          method: "GET",
          url: "https://httpbin.org/get?hello=orbit",
          folderId,
        }),
      },
    );

    await get().selectCollection(collection.collectionId);
    set({ activeRequestId: request.requestId });
  },

  selectRequest: (requestId: string) => {
    const auth = get().auth;
    const collection = get().activeCollection;
    set({ activeRequestId: requestId, testResults: [], executeResult: null });
    if (!auth || !collection) return;
    void loadHistory(collection.collectionId, requestId, auth.token, set);
  },

  moveRequest: async (
    requestId: string,
    folderId = null,
    afterRequestId = null,
  ) => {
    const auth = get().auth;
    const collection = get().activeCollection;
    if (!auth || !collection) return;

    await api<RequestDraft>(
      `/collections/${collection.collectionId}/requests/${requestId}/move`,
      {
        method: "POST",
        token: auth.token,
        body: JSON.stringify({ folderId, afterRequestId }),
      },
    );

    await get().selectCollection(collection.collectionId);
    set({ activeRequestId: requestId });
  },

  deleteRequest: async (requestId: string) => {
    const auth = get().auth;
    const collection = get().activeCollection;
    const activeRequestId = get().activeRequestId;
    if (!auth || !collection) return;

    await api<void>(
      `/collections/${collection.collectionId}/requests/${requestId}`,
      {
        method: "DELETE",
        token: auth.token,
      },
    );

    await get().selectCollection(collection.collectionId);
    if (activeRequestId === requestId) {
      set({ executeResult: null, history: [] });
    }
  },

  updateRequest: async (requestId: string, patch: Partial<RequestDraft>) => {
    const auth = get().auth;
    const collection = get().activeCollection;
    if (!auth || !collection) return;

    await api<RequestDraft>(
      `/collections/${collection.collectionId}/requests/${requestId}`,
      {
        method: "PATCH",
        token: auth.token,
        body: JSON.stringify(cleanPatch(patch)),
      },
    );

    await get().selectCollection(collection.collectionId);
    set({ activeRequestId: requestId });
  },

  sendRequest: async () => {
    const auth = get().auth;
    const workspace = get().workspace;
    const collection = get().activeCollection;
    const requestId = get().activeRequestId;
    if (!auth || !workspace || !collection || !requestId) return;

    const request = collection.requests[requestId];

    // Run pre-request script — may mutate environment via pm.environment.set
    let env: Record<string, string> = { ...workspace.environmentVariables };
    if (request?.preRequestScript?.trim()) {
      const result = runUserScript(request.preRequestScript, {
        environment: env,
      });
      env = result.environment;
      for (const [k, v] of Object.entries(env)) {
        if (workspace.environmentVariables[k] !== v) {
          await get().setEnvVar(k, v);
        }
      }
    }

    // Worker proxy execution, with a client-side timeout + browser fallback.
    // workerd in local dev sometimes hangs on outbound fetch (DNS resolver
    // bug on some hosts); once we know that's happening for this session we
    // skip the proxy entirely on subsequent sends. The browser fallback
    // works for any CORS-friendly endpoint.
    let executeResult: ExecuteResponse | ExecuteFailure;
    const skipProxy = sessionStorage.getItem(SKIP_PROXY_KEY) === "1";

    if (skipProxy && request) {
      const fallback = await executeInBrowser(request, env, requestId);
      executeResult = fallback ?? {
        requestId,
        method: request.method,
        url: request.url,
        error: "Browser fallback failed",
        createdAt: Date.now(),
      };
    } else {
      const proxyPromise = api<ExecuteResponse | ExecuteFailure>(
        `/execute/collections/${collection.collectionId}/requests/${requestId}`,
        {
          method: "POST",
          token: auth.token,
          body: JSON.stringify({ environment: env }),
        },
      ).catch(
        (err) =>
          ({
            requestId,
            method: request?.method ?? "GET",
            url: request?.url ?? "",
            error: err instanceof Error ? err.message : String(err),
            createdAt: Date.now(),
          }) as ExecuteFailure,
      );

      const TIMEOUT = 4000;
      const timeoutResult = new Promise<ExecuteFailure>((resolve) =>
        setTimeout(
          () =>
            resolve({
              requestId,
              method: request?.method ?? "GET",
              url: request?.url ?? "",
              error: `Worker proxy timed out after ${TIMEOUT}ms`,
              createdAt: Date.now(),
            }),
          TIMEOUT,
        ),
      );

      executeResult = await Promise.race([proxyPromise, timeoutResult]);

      if (executeResult && "error" in executeResult && request) {
        sessionStorage.setItem(SKIP_PROXY_KEY, "1");
        const fallback = await executeInBrowser(request, env, requestId);
        if (fallback) executeResult = fallback;
      }
    }

    let testResults: TestResult[] = [];
    if (request?.testScript?.trim() && executeResult && !("error" in executeResult)) {
      testResults = runTestScript(request.testScript, executeResult);
    }

    set({ executeResult, testResults, error: null });
    await loadHistory(collection.collectionId, requestId, auth.token, set);
  },

  saveExample: async (name: string) => {
    const auth = get().auth;
    const collection = get().activeCollection;
    const requestId = get().activeRequestId;
    const executeResult = get().executeResult;
    if (
      !auth ||
      !collection ||
      !requestId ||
      !executeResult ||
      "error" in executeResult
    ) {
      return;
    }

    await api(
      `/collections/${collection.collectionId}/requests/${requestId}/examples`,
      {
        method: "POST",
        token: auth.token,
        body: JSON.stringify({
          name,
          status: executeResult.status,
          headers: executeResult.headers,
          bodyText: executeResult.bodyText,
          durationMs: executeResult.durationMs,
        }),
      },
    );

    await get().selectCollection(collection.collectionId);
    set({ activeRequestId: requestId });
  },

  setEnvVar: async (key: string, value: string) => {
    const auth = get().auth;
    const workspace = get().workspace;
    if (!auth || !workspace) return;

    const environmentVariables = await api<Record<string, string>>(
      `/workspaces/${workspace.workspaceId}/environments/${encodeURIComponent(key)}`,
      {
        method: "PUT",
        token: auth.token,
        body: JSON.stringify({ value }),
      },
    );

    set({
      workspace: {
        ...workspace,
        environmentVariables,
      },
    });
  },

  deleteEnvVar: async (key: string) => {
    const auth = get().auth;
    const workspace = get().workspace;
    if (!auth || !workspace) return;

    const environmentVariables = await api<Record<string, string>>(
      `/workspaces/${workspace.workspaceId}/environments/${encodeURIComponent(key)}`,
      {
        method: "DELETE",
        token: auth.token,
      },
    );

    set({
      workspace: {
        ...workspace,
        environmentVariables,
      },
    });
  },

  exportWorkspace: async () => {
    const auth = get().auth;
    const workspace = get().workspace;
    if (!auth || !workspace) return "";

    const payload = await api<unknown>(
      `/workspaces/${workspace.workspaceId}/export`,
      {
        token: auth.token,
      },
    );

    return JSON.stringify(payload, null, 2);
  },

  importWorkspace: async (raw: string) => {
    const auth = get().auth;
    const workspace = get().workspace;
    if (!auth || !workspace) return;

    const payload = JSON.parse(raw) as {
      collections?: CollectionState[];
      environmentVariables?: Record<string, string>;
    };

    await api(`/workspaces/${workspace.workspaceId}/import`, {
      method: "POST",
      token: auth.token,
      body: JSON.stringify(payload),
    });

    await get().refreshWorkspace();
  },
}));

function cleanPatch(patch: Partial<RequestDraft>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function firstRequestId(collection: CollectionState): string | null {
  if (collection.rootRequestIds.length > 0) return collection.rootRequestIds[0];

  for (const folderId of collection.rootFolderIds) {
    const found = firstRequestInFolder(collection, folderId);
    if (found) return found;
  }

  return null;
}

function firstRequestInFolder(
  collection: CollectionState,
  folderId: string,
): string | null {
  const folder = collection.folders[folderId];
  if (!folder) return null;
  if (folder.requestIds.length > 0) return folder.requestIds[0];

  for (const childId of folder.folderIds) {
    const found = firstRequestInFolder(collection, childId);
    if (found) return found;
  }

  return null;
}

async function loadHistory(
  collectionId: string,
  requestId: string,
  token: string,
  set: (next: Partial<AppStore>) => void,
): Promise<void> {
  const history = await api<{ entries: HistoryEntry[] }>(
    `/d1/history?collectionId=${encodeURIComponent(collectionId)}&requestId=${encodeURIComponent(requestId)}&limit=20`,
    { token },
  );
  set({ history: history.entries });
}

interface ApiOptions {
  method?: string;
  body?: string;
  token?: string;
}

async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers({
    "content-type": "application/json",
  });

  if (options.token) {
    headers.set("authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function createEmptyKeyValue(): KeyValueEntry {
  return {
    id: crypto.randomUUID(),
    key: "",
    value: "",
    enabled: true,
  };
}

function isRequestInsideFolder(
  collection: CollectionState,
  folderId: string,
  requestId: string,
): boolean {
  const folder = collection.folders[folderId];
  if (!folder) return false;

  if (folder.requestIds.includes(requestId)) return true;

  for (const childId of folder.folderIds) {
    if (isRequestInsideFolder(collection, childId, requestId)) return true;
  }

  return false;
}

// ─────────── Browser-side fallback execution ───────────

async function executeInBrowser(
  request: RequestDraft,
  env: Record<string, string>,
  requestId: string,
): Promise<ExecuteResponse | ExecuteFailure | null> {
  const resolveVars = (value: string): string =>
    value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, k: string) =>
      env[k] !== undefined ? env[k] : `{{${k}}}`,
    );

  const headers = new Headers();
  for (const h of request.headers) {
    if (!h.enabled || !h.key.trim()) continue;
    headers.set(resolveVars(h.key), resolveVars(h.value));
  }

  let url: URL;
  try {
    url = new URL(resolveVars(request.url));
  } catch {
    return null;
  }
  for (const q of request.query) {
    if (!q.enabled || !q.key.trim()) continue;
    url.searchParams.set(resolveVars(q.key), resolveVars(q.value));
  }

  if (request.auth.type === "bearer" && request.auth.token.trim()) {
    headers.set("authorization", `Bearer ${resolveVars(request.auth.token)}`);
  } else if (request.auth.type === "apiKey" && request.auth.key.trim()) {
    const k = resolveVars(request.auth.key);
    const v = resolveVars(request.auth.value);
    if (request.auth.in === "query") url.searchParams.set(k, v);
    else headers.set(k, v);
  } else if (request.auth.type === "basic") {
    const u = resolveVars(request.auth.username);
    const p = resolveVars(request.auth.password);
    headers.set("authorization", `Basic ${btoa(`${u}:${p}`)}`);
  }

  const body =
    request.body.mode === "raw" ? resolveVars(request.body.text) : undefined;
  if (request.body.mode === "raw" && request.body.contentType) {
    headers.set("content-type", resolveVars(request.body.contentType));
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(url.toString(), {
      method: request.method,
      headers,
      body,
      mode: "cors",
    });
    const bodyText = await response.text();
    const respHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      respHeaders[key] = value;
    });
    let jsonBody: unknown = null;
    if ((respHeaders["content-type"] ?? "").includes("application/json")) {
      try {
        jsonBody = JSON.parse(bodyText);
      } catch {
        jsonBody = null;
      }
    }
    const createdAt = Date.now();
    return {
      requestId,
      method: request.method,
      url: url.toString(),
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
      bodyText,
      jsonBody,
      durationMs: createdAt - startedAt,
      size: bodyText.length,
      createdAt,
    };
  } catch (err) {
    return {
      requestId,
      method: request.method,
      url: url.toString(),
      error:
        (err instanceof Error ? err.message : "Browser fetch failed") +
        " (worker proxy unreachable; browser fallback also failed — likely CORS)",
      createdAt: Date.now(),
    };
  }
}

// ─────────── Pre-request & test script sandboxes ───────────

function runUserScript(
  script: string,
  ctx: { environment: Record<string, string> },
): { environment: Record<string, string> } {
  const env = { ...ctx.environment };
  const pm = {
    environment: {
      get: (k: string) => env[k] ?? "",
      set: (k: string, v: string) => {
        env[k] = String(v);
      },
      unset: (k: string) => {
        delete env[k];
      },
      toObject: () => ({ ...env }),
    },
    variables: {
      get: (k: string) => env[k] ?? "",
      set: (k: string, v: string) => {
        env[k] = String(v);
      },
    },
  };
  try {
    new Function("pm", "console", script)(pm, console);
  } catch (err) {
    console.warn("[orbit] pre-request script error:", err);
  }
  return { environment: env };
}

function runTestScript(script: string, response: ExecuteResponse): TestResult[] {
  const results: TestResult[] = [];
  const pm = {
    response: {
      code: response.status,
      status: response.statusText,
      headers: response.headers,
      text: () => response.bodyText,
      json: () => response.jsonBody ?? safeParse(response.bodyText),
      responseTime: response.durationMs,
      responseSize: response.size,
    },
    test: (name: string, fn: () => void) => {
      try {
        fn();
        results.push({ name, passed: true });
      } catch (err) {
        results.push({
          name,
          passed: false,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    expect: makeExpect,
  };
  try {
    new Function("pm", "console", script)(pm, console);
  } catch (err) {
    results.push({
      name: "(script execution)",
      passed: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }
  return results;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function makeExpect(actual: unknown) {
  const fail = (msg: string): never => {
    throw new Error(msg);
  };
  const matchers = {
    to: {
      equal: (expected: unknown) => {
        if (actual !== expected) {
          fail(`expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
        }
      },
      eql: (expected: unknown) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          fail(`expected ${JSON.stringify(actual)} to deep-equal ${JSON.stringify(expected)}`);
        }
      },
      include: (needle: unknown) => {
        if (typeof actual === "string" && typeof needle === "string") {
          if (!actual.includes(needle)) fail(`expected "${actual}" to include "${needle}"`);
          return;
        }
        if (Array.isArray(actual)) {
          if (!actual.includes(needle as never)) {
            fail(`expected array to include ${JSON.stringify(needle)}`);
          }
          return;
        }
        fail(`include: unsupported actual type`);
      },
      be: {
        ok: () => {
          if (!actual) fail(`expected value to be truthy`);
        },
        a: (type: string) => {
          if (typeof actual !== type) {
            fail(`expected typeof ${typeof actual} to be "${type}"`);
          }
        },
        oneOf: (list: unknown[]) => {
          if (!list.includes(actual)) {
            fail(`expected ${JSON.stringify(actual)} to be one of ${JSON.stringify(list)}`);
          }
        },
      },
    },
  };
  return matchers;
}
