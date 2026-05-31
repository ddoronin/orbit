import { create } from "zustand";
import { mergeIncomingBlock } from "../../lib/block-merge";
import { BLOCK_SAVE_DEBOUNCE_MS, STORAGE_KEY } from "./constants";
import { colorForUser } from "./helpers";
import type {
  AppStore,
  AuthState,
  Block,
  PageState,
  PageSummary,
  Session,
  WorkspaceState,
} from "./types";

let socket: WebSocket | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let presenceTimer: ReturnType<typeof setTimeout> | null = null;
let presenceHeartbeat: ReturnType<typeof setInterval> | null = null;
const blockSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const blockPendingText = new Map<string, string>();
const blockInFlightText = new Map<string, string>();

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const auth = useAppStore.getState().auth;
  const headers = new Headers(opts.headers ?? {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (auth?.token) {
    headers.set("Authorization", `Bearer ${auth.token}`);
  }

  const response = await fetch(path, { ...opts, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  if (response.status === 204) {
    return null as T;
  }
  return (await response.json()) as T;
}

function setToast(message: string, ms = 2200): void {
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  useAppStore.setState({ toast: { id: Date.now(), message } });
  toastTimer = setTimeout(() => {
    useAppStore.setState({ toast: null });
  }, ms);
}

function stopPresenceHeartbeat(): void {
  if (!presenceHeartbeat) return;
  clearInterval(presenceHeartbeat);
  presenceHeartbeat = null;
}

function sendWS(type: string, payload: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, payload }));
  }
}

function getOffsetInBody(
  body: Element,
  node: Node,
  nodeOffset: number,
): number {
  const range = document.createRange();
  range.selectNodeContents(body);
  range.setEnd(node, nodeOffset);
  return range.toString().length;
}

function getEmptyPresencePayload(auth: AuthState) {
  return {
    userId: auth.userId,
    displayName: auth.displayName,
    color: auth.color,
    cursorBlockId: null,
    cursorOffset: null,
    selectionStartOffset: null,
    selectionEndOffset: null,
  };
}

function getCurrentPresencePayload() {
  const { auth, currentPage } = useAppStore.getState();
  if (!auth || !currentPage) return null;

  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return getEmptyPresencePayload(auth);
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  const body =
    anchorNode instanceof Element
      ? anchorNode.closest(".block-body")
      : anchorNode?.parentElement?.closest(".block-body");

  if (!body || !focusNode || !body.contains(focusNode)) {
    return getEmptyPresencePayload(auth);
  }

  const anchorOffset = getOffsetInBody(
    body,
    selection.anchorNode as Node,
    selection.anchorOffset,
  );
  const focusOffset = getOffsetInBody(body, focusNode, selection.focusOffset);

  return {
    userId: auth.userId,
    displayName: auth.displayName,
    color: auth.color,
    cursorBlockId:
      body.closest(".block")?.getAttribute("data-block-id") ?? null,
    cursorOffset: focusOffset,
    selectionStartOffset: Math.min(anchorOffset, focusOffset),
    selectionEndOffset: Math.max(anchorOffset, focusOffset),
  };
}

function sendCurrentPresence(): void {
  const payload = getCurrentPresencePayload();
  if (payload) {
    sendWS("page.presence.update", payload);
  }
}

export function schedulePresenceUpdate(): void {
  if (presenceTimer) {
    clearTimeout(presenceTimer);
  }
  presenceTimer = setTimeout(() => {
    sendCurrentPresence();
  }, 40);
}

function startPresenceHeartbeat(): void {
  stopPresenceHeartbeat();
  presenceHeartbeat = setInterval(() => {
    sendCurrentPresence();
  }, 10_000);
}

export function getSelectionInBody(body: HTMLElement): Selection | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if (!anchor || !focus) return null;
  if (!body.contains(anchor) || !body.contains(focus)) return null;
  return selection;
}

export function getCaretOffset(
  body: HTMLElement,
  selection: Selection,
): number {
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(body);
  if (selection.focusNode) {
    range.setEnd(selection.focusNode, selection.focusOffset);
  }
  return range.toString().length;
}

export function focusBlock(blockId: string, at: "start" | "end" = "end"): void {
  setTimeout(() => {
    const body = document.querySelector<HTMLElement>(
      `.block[data-block-id="${blockId}"] .block-body`,
    );
    if (!body) return;
    body.focus();

    const range = document.createRange();
    range.selectNodeContents(body);
    range.collapse(at === "start");

    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }, 0);
}

export async function flushBlockSave(
  blockId: string,
  textOverride?: string,
): Promise<void> {
  const pending = textOverride ?? blockPendingText.get(blockId);
  const timer = blockSaveTimers.get(blockId);
  if (timer) {
    clearTimeout(timer);
  }
  blockSaveTimers.delete(blockId);
  blockPendingText.delete(blockId);

  const page = useAppStore.getState().currentPage;
  if (pending == null || !page?.blocks[blockId]) return;
  if (pending === page.blocks[blockId].text) return;

  blockInFlightText.set(blockId, pending);
  try {
    await useAppStore.getState().updateBlock(blockId, { text: pending });
  } finally {
    if (blockInFlightText.get(blockId) === pending) {
      blockInFlightText.delete(blockId);
    }
  }
}

export function scheduleBlockSave(blockId: string, text: string): void {
  const timer = blockSaveTimers.get(blockId);
  if (timer) {
    clearTimeout(timer);
  }

  blockPendingText.set(blockId, text);
  blockSaveTimers.set(
    blockId,
    setTimeout(() => {
      flushBlockSave(blockId).catch((error: unknown) => {
        setToast(
          error instanceof Error ? error.message : "Failed to save block",
        );
      });
    }, BLOCK_SAVE_DEBOUNCE_MS),
  );
}

export function isBlockLocalTextDirty(blockId: string): boolean {
  return blockPendingText.has(blockId) || blockInFlightText.has(blockId);
}

async function flushAllBlockSaves(): Promise<void> {
  if (blockPendingText.size === 0) return;
  const pending = Array.from(blockPendingText.entries());
  await Promise.allSettled(
    pending.map(([blockId, text]) => flushBlockSave(blockId, text)),
  );
}

function connectSocket(pageId: string): void {
  const { auth } = useAppStore.getState();
  if (!auth) return;

  if (socket) {
    socket.close();
    socket = null;
  }
  stopPresenceHeartbeat();

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${location.host}/pages/${pageId}/socket?access_token=${encodeURIComponent(auth.token)}`;
  socket = new WebSocket(url);

  socket.addEventListener("open", () => {
    sendCurrentPresence();
    startPresenceHeartbeat();
  });

  socket.addEventListener("message", (event) => {
    useAppStore.getState().applySocketMessage(event.data);
  });

  socket.addEventListener("close", () => {
    stopPresenceHeartbeat();
    if (socket?.readyState === WebSocket.CLOSED) {
      socket = null;
    }
  });

  socket.addEventListener("error", () => {
    stopPresenceHeartbeat();
    setToast("Connection lost - refresh to retry");
  });
}

export const useAppStore = create<AppStore>((set, get) => ({
  auth: null,
  workspace: null,
  pages: [],
  currentPage: null,
  presence: {},
  bootstrapped: false,
  isBusy: false,
  toast: null,
  typeMenu: null,

  setTypeMenu: (menu) => set({ typeMenu: menu }),

  showToast: (message, ms = 2200) => {
    setToast(message, ms);
  },

  init: async () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      set({ bootstrapped: true });
      return;
    }

    try {
      const parsed = JSON.parse(saved) as AuthState;
      const auth = {
        ...parsed,
        color: parsed.color ?? colorForUser(parsed.userId),
      };
      set({ auth });
      const workspace = await api<WorkspaceState>("/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: "Shared docs" }),
      });
      set({ workspace });
      await get().refreshPageList();
      const pages = useAppStore.getState().pages;
      if (pages.length > 0) {
        await get().openPage(pages[0].pageId);
      } else {
        await get().createPage();
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      set({
        auth: null,
        workspace: null,
        pages: [],
        currentPage: null,
        presence: {},
      });
    } finally {
      set({ bootstrapped: true });
    }
  },

  login: async (displayName) => {
    const response = await api<{ token: string; session: Session }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ displayName }),
      },
    );

    const auth: AuthState = {
      token: response.token,
      userId: response.session.userId,
      displayName: response.session.displayName,
      color: colorForUser(response.session.userId),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    set({ auth, workspace: null, pages: [], currentPage: null, presence: {} });

    const workspace = await api<WorkspaceState>("/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "Shared docs" }),
    });

    set({ workspace });
    await get().refreshPageList();

    if (useAppStore.getState().pages.length > 0) {
      await get().openPage(useAppStore.getState().pages[0].pageId);
    } else {
      await get().createPage();
    }
  },

  logout: async () => {
    await flushAllBlockSaves();

    if (socket) {
      socket.close();
      socket = null;
    }

    stopPresenceHeartbeat();
    if (presenceTimer) {
      clearTimeout(presenceTimer);
      presenceTimer = null;
    }

    localStorage.removeItem(STORAGE_KEY);
    set({
      auth: null,
      workspace: null,
      pages: [],
      currentPage: null,
      presence: {},
      typeMenu: null,
    });
  },

  refreshPageList: async () => {
    const workspace = get().workspace;
    if (!workspace) return;

    const pages = await api<PageSummary[]>(
      `/workspaces/${workspace.workspaceId}/pages`,
    );
    set({ pages });
  },

  createPage: async () => {
    const workspace = get().workspace;
    if (!workspace) return;

    const page = await api<PageState>("/pages", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: workspace.workspaceId,
        title: "Untitled",
      }),
    });

    await get().refreshPageList();
    await get().openPage(page.pageId);
  },

  openPage: async (pageId) => {
    await flushAllBlockSaves();
    const page = await api<PageState>(`/pages/${pageId}`);
    set({ currentPage: page, presence: page.presence ?? {} });
    connectSocket(pageId);
  },

  setPageTitle: async (title) => {
    const page = get().currentPage;
    if (!page) return;

    set((state) => {
      if (!state.currentPage) return state;
      return {
        ...state,
        currentPage: { ...state.currentPage, title },
        pages: state.pages.map((entry) =>
          entry.pageId === state.currentPage?.pageId
            ? { ...entry, title: title || "Untitled" }
            : entry,
        ),
      };
    });

    await api<void>(`/pages/${page.pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
  },

  addBlock: async (
    type = "paragraph",
    afterBlockId = null,
    text = "",
    focusAt = "end",
  ) => {
    const page = get().currentPage;
    if (!page) throw new Error("No page is open");

    const block = await api<Block>(`/pages/${page.pageId}/blocks`, {
      method: "POST",
      body: JSON.stringify({ type, text, afterBlockId }),
    });

    focusBlock(block.id, focusAt);
    return block;
  },

  updateBlock: async (blockId, patch) => {
    const page = get().currentPage;
    if (!page || !page.blocks[blockId]) return;

    set((state) => {
      if (!state.currentPage || !state.currentPage.blocks[blockId]) {
        return state;
      }
      const nextBlock = { ...state.currentPage.blocks[blockId], ...patch };
      return {
        ...state,
        currentPage: {
          ...state.currentPage,
          blocks: {
            ...state.currentPage.blocks,
            [blockId]: nextBlock,
          },
        },
      };
    });

    await api<Block>(`/pages/${page.pageId}/blocks/${blockId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  deleteBlock: async (blockId) => {
    const page = get().currentPage;
    if (!page) return;

    blockPendingText.delete(blockId);
    const timer = blockSaveTimers.get(blockId);
    if (timer) {
      clearTimeout(timer);
      blockSaveTimers.delete(blockId);
    }

    set((state) => {
      if (!state.currentPage) return state;
      const blocks = { ...state.currentPage.blocks };
      delete blocks[blockId];
      return {
        ...state,
        currentPage: {
          ...state.currentPage,
          blocks,
          rootBlockIds: state.currentPage.rootBlockIds.filter(
            (id) => id !== blockId,
          ),
        },
      };
    });

    await api<void>(`/pages/${page.pageId}/blocks/${blockId}`, {
      method: "DELETE",
    });
  },

  applySocketMessage: (raw) => {
    let msg: { event?: string; payload?: any };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const event = msg.event;
    const payload = msg.payload;
    if (!event) return;

    switch (event) {
      case "page.title.changed": {
        set((state) => {
          if (!state.currentPage) return state;
          return {
            ...state,
            currentPage: {
              ...state.currentPage,
              title: payload.title,
            },
            pages: state.pages.map((entry) =>
              entry.pageId === state.currentPage?.pageId
                ? { ...entry, title: payload.title || "Untitled" }
                : entry,
            ),
          };
        });
        break;
      }

      case "page.block.inserted": {
        const incoming = payload.block as Block;
        const parentBlockId =
          (payload.parentBlockId as string | null | undefined) ?? null;
        const afterBlockId =
          (payload.afterBlockId as string | null | undefined) ?? null;
        set((state) => {
          if (!state.currentPage) return state;

          const blocks = {
            ...state.currentPage.blocks,
            [incoming.id]: incoming,
          };

          const insertAfter = (ids: string[]): string[] => {
            const deduped = ids.filter((id) => id !== incoming.id);
            const afterIdx = afterBlockId ? deduped.indexOf(afterBlockId) : -1;
            const at = afterIdx >= 0 ? afterIdx + 1 : deduped.length;
            const next = [...deduped];
            next.splice(at, 0, incoming.id);
            return next;
          };

          let rootBlockIds = state.currentPage.rootBlockIds;
          if (parentBlockId && blocks[parentBlockId]) {
            const parent = blocks[parentBlockId];
            blocks[parentBlockId] = {
              ...parent,
              children: insertAfter(parent.children),
            };
            rootBlockIds = rootBlockIds.filter((id) => id !== incoming.id);
          } else {
            rootBlockIds = insertAfter(rootBlockIds);
          }

          return {
            ...state,
            currentPage: {
              ...state.currentPage,
              blocks,
              rootBlockIds,
            },
          };
        });
        break;
      }

      case "page.block.updated": {
        const incoming = payload.block as Block;
        const pending = blockPendingText.get(incoming.id);
        const inFlight = blockInFlightText.get(incoming.id);

        set((state) => {
          if (!state.currentPage) return state;
          const local = state.currentPage.blocks[incoming.id];
          const nextBlock = mergeIncomingBlock(
            incoming,
            local,
            pending,
            inFlight,
          );

          return {
            ...state,
            currentPage: {
              ...state.currentPage,
              blocks: {
                ...state.currentPage.blocks,
                [incoming.id]: nextBlock,
              },
            },
          };
        });

        if (pending != null && pending === incoming.text) {
          const timer = blockSaveTimers.get(incoming.id);
          if (timer) {
            clearTimeout(timer);
            blockSaveTimers.delete(incoming.id);
          }
          blockPendingText.delete(incoming.id);
        }

        if (inFlight != null && inFlight === incoming.text) {
          blockInFlightText.delete(incoming.id);
        }
        break;
      }

      case "page.block.deleted": {
        const removedIds = (payload.removedIds as string[] | undefined) ?? [
          payload.blockId as string,
        ];
        set((state) => {
          if (!state.currentPage) return state;
          const blocks = { ...state.currentPage.blocks };
          for (const id of removedIds) delete blocks[id];

          return {
            ...state,
            currentPage: {
              ...state.currentPage,
              blocks,
              rootBlockIds: state.currentPage.rootBlockIds.filter(
                (id) => !removedIds.includes(id),
              ),
            },
          };
        });
        break;
      }

      case "page.presence.changed": {
        set((state) => {
          const entry = payload.entry;
          return {
            ...state,
            presence: {
              ...state.presence,
              [entry.userId]: entry,
            },
          };
        });
        break;
      }

      case "page.presence.left": {
        const userId = payload.userId as string;
        set((state) => {
          const nextPresence = { ...state.presence };
          delete nextPresence[userId];
          return {
            ...state,
            presence: nextPresence,
          };
        });
        break;
      }

      default:
        break;
    }
  },
}));

export function showErrorToast(error: unknown, fallback: string): void {
  const message = error instanceof Error ? error.message : fallback;
  useAppStore.getState().showToast(message);
}
