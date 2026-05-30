// Orbit Notion frontend — vanilla JS, no build step.

const STORAGE_KEY = "orbit-notion:auth";

const PRESENCE_COLORS = [
  "#e03e3e",
  "#d9730d",
  "#dfab01",
  "#0f7b6c",
  "#0b6e99",
  "#6940a5",
  "#ad1a72",
];

const BLOCK_TYPES = [
  { type: "paragraph", label: "Text", placeholder: "Type '/' for commands" },
  { type: "heading_1", label: "Heading 1", placeholder: "Heading 1" },
  { type: "heading_2", label: "Heading 2", placeholder: "Heading 2" },
  { type: "heading_3", label: "Heading 3", placeholder: "Heading 3" },
  { type: "todo", label: "To-do", placeholder: "To-do" },
  { type: "bulleted_list", label: "Bulleted list", placeholder: "List item" },
  { type: "numbered_list", label: "Numbered list", placeholder: "List item" },
  { type: "quote", label: "Quote", placeholder: "Empty quote" },
  { type: "code", label: "Code", placeholder: "code" },
  { type: "divider", label: "Divider", placeholder: "" },
];

const state = {
  auth: null, // { token, userId, displayName, color }
  workspace: null, // WorkspaceState
  pages: [], // PageSummary[]
  currentPage: null, // PageState
  ws: null, // WebSocket
  presence: {}, // userId -> PresenceEntry
};

let presenceTimer = null;
let presenceHeartbeat = null;
const BLOCK_SAVE_DEBOUNCE_MS = 50;
const blockSaveTimers = new Map();
const blockPendingText = new Map();

// ---------- DOM helpers ----------
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, children = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k.startsWith("on") && typeof v === "function")
      e.addEventListener(k.slice(2), v);
    else if (v != null) e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
};

function toast(msg, ms = 2200) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}

function colorForUser(userId) {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length];
}

function initials(name) {
  return (
    name
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ---------- API ----------
async function api(path, opts = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers ?? {}),
  };
  if (state.auth?.token) headers.Authorization = `Bearer ${state.auth.token}`;
  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------- Auth ----------
async function login(displayName) {
  const { token, session } = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });
  state.auth = { token, ...session, color: colorForUser(session.userId) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.auth));
  await bootstrapApp();
}

function logout() {
  flushAllBlockSaves();
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  stopPresenceHeartbeat();
  clearTimeout(presenceTimer);
  presenceTimer = null;
  localStorage.removeItem(STORAGE_KEY);
  state.auth = null;
  state.workspace = null;
  state.pages = [];
  state.currentPage = null;
  state.presence = {};
  showLogin();
}

// ---------- Workspace ----------
async function loadOrCreateWorkspace() {
  return api("/workspaces", {
    method: "POST",
    body: JSON.stringify({ name: "Shared docs" }),
  });
}

async function refreshPageList() {
  state.pages = await api(`/workspaces/${state.workspace.workspaceId}/pages`);
  renderPageList();
}

async function createPage() {
  const page = await api("/pages", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.workspace.workspaceId,
      title: "Untitled",
    }),
  });
  await refreshPageList();
  openPage(page.pageId);
}

// ---------- Page open / WebSocket ----------
async function openPage(pageId) {
  await flushAllBlockSaves();
  const page = await api(`/pages/${pageId}`);
  state.currentPage = page;
  state.presence = page.presence ?? {};
  renderPage();
  connectSocket(pageId);
  // mark active in sidebar
  for (const el of document.querySelectorAll(".page-item")) {
    el.classList.toggle("active", el.dataset.pageId === pageId);
  }
}

function connectSocket(pageId) {
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  stopPresenceHeartbeat();
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${location.host}/pages/${pageId}/socket?access_token=${encodeURIComponent(state.auth.token)}`;
  const ws = new WebSocket(url);
  state.ws = ws;

  ws.addEventListener("open", () => {
    sendCurrentPresence();
    startPresenceHeartbeat();
  });
  ws.addEventListener("message", (e) => handleWSMessage(e.data));
  ws.addEventListener("close", () => {
    stopPresenceHeartbeat();
    if (state.ws === ws) state.ws = null;
  });
  ws.addEventListener("error", () => {
    stopPresenceHeartbeat();
    toast("Connection lost — refresh to retry");
  });
}

function sendWS(type, payload) {
  if (state.ws?.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type, payload }));
  }
}

function getEmptyPresencePayload() {
  return {
    userId: state.auth.userId,
    displayName: state.auth.displayName,
    color: state.auth.color,
    cursorBlockId: null,
    cursorOffset: null,
    selectionStartOffset: null,
    selectionEndOffset: null,
  };
}

function getCurrentPresencePayload() {
  if (!state.auth || !state.currentPage) return null;

  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0)
    return getEmptyPresencePayload();

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  const body =
    anchorNode instanceof Element
      ? anchorNode.closest(".block-body")
      : anchorNode?.parentElement?.closest(".block-body");

  if (!body) return getEmptyPresencePayload();
  if (!focusNode || !body.contains(focusNode)) return getEmptyPresencePayload();

  const anchorOffset = getOffsetInBody(
    body,
    selection.anchorNode,
    selection.anchorOffset,
  );
  const focusOffset = getOffsetInBody(body, focusNode, selection.focusOffset);
  const selectionStartOffset = Math.min(anchorOffset, focusOffset);
  const selectionEndOffset = Math.max(anchorOffset, focusOffset);

  return {
    userId: state.auth.userId,
    displayName: state.auth.displayName,
    color: state.auth.color,
    cursorBlockId: body.closest(".block")?.dataset.blockId ?? null,
    cursorOffset: focusOffset,
    selectionStartOffset,
    selectionEndOffset,
  };
}

function sendCurrentPresence() {
  const payload = getCurrentPresencePayload();
  if (payload) sendWS("page.presence.update", payload);
}

function startPresenceHeartbeat() {
  stopPresenceHeartbeat();
  presenceHeartbeat = setInterval(() => {
    sendCurrentPresence();
  }, 10_000);
}

function stopPresenceHeartbeat() {
  if (presenceHeartbeat == null) return;
  clearInterval(presenceHeartbeat);
  presenceHeartbeat = null;
}

function schedulePresenceUpdate() {
  clearTimeout(presenceTimer);
  presenceTimer = setTimeout(() => {
    sendCurrentPresence();
  }, 40);
}

function getCaretOffset(body, selection) {
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(body);
  if (selection.focusNode) {
    range.setEnd(selection.focusNode, selection.focusOffset);
  }
  return range.toString().length;
}

function getOffsetInBody(body, node, nodeOffset) {
  const range = document.createRange();
  range.selectNodeContents(body);
  range.setEnd(node, nodeOffset);
  return range.toString().length;
}

function getSelectionInBody(body) {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if (!anchor || !focus) return null;
  if (!body.contains(anchor) || !body.contains(focus)) return null;
  return selection;
}

function getTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current);
    current = walker.nextNode();
  }
  return nodes;
}

function locateCaret(body, offset) {
  const bodyRect = body.getBoundingClientRect();
  const textNodes = getTextNodes(body);
  if (textNodes.length === 0) {
    return { left: 0, top: 2, height: Math.max(18, bodyRect.height || 20) };
  }

  const totalLength = body.textContent?.length ?? 0;
  const target = clamp(offset ?? 0, 0, totalLength);
  let remaining = target;
  let node = textNodes[textNodes.length - 1];
  let nodeOffset = node.textContent.length;

  for (const textNode of textNodes) {
    const length = textNode.textContent.length;
    if (remaining <= length) {
      node = textNode;
      nodeOffset = remaining;
      break;
    }
    remaining -= length;
  }

  const range = document.createRange();
  range.setStart(node, nodeOffset);
  range.collapse(true);
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  const left = rect.left - bodyRect.left;
  const top = rect.top - bodyRect.top;
  return {
    left: Number.isFinite(left) ? left : 0,
    top: Number.isFinite(top) ? top : 2,
    height: Math.max(
      18,
      rect.height || parseFloat(getComputedStyle(body).lineHeight) || 20,
    ),
  };
}

function resolveTextPosition(root, targetOffset) {
  const textNodes = getTextNodes(root);
  if (textNodes.length === 0) return null;

  const totalLength = root.textContent?.length ?? 0;
  let remaining = clamp(targetOffset, 0, totalLength);

  for (const textNode of textNodes) {
    const length = textNode.textContent.length;
    if (remaining <= length) {
      return { node: textNode, offset: remaining };
    }
    remaining -= length;
  }

  const last = textNodes[textNodes.length - 1];
  return { node: last, offset: last.textContent.length };
}

function createRangeFromOffsets(body, startOffset, endOffset) {
  const totalLength = body.textContent?.length ?? 0;
  const start = clamp(startOffset ?? 0, 0, totalLength);
  const end = clamp(endOffset ?? 0, start, totalLength);
  if (end <= start) return null;

  const startPos = resolveTextPosition(body, start);
  const endPos = resolveTextPosition(body, end);
  if (!startPos || !endPos) return null;

  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);
  return range;
}

function withAlpha(color, alphaHex) {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${alphaHex}`;
  return color;
}

function createRemoteCursor(entry, blockId, indexInBlock) {
  const block = document.querySelector(`.block[data-block-id="${blockId}"]`);
  const body = block?.querySelector(".block-body");
  if (!block || !body) return null;

  const position = locateCaret(body, entry.cursorOffset);
  const blockRect = block.getBoundingClientRect();
  const bodyRect = body.getBoundingClientRect();
  const marker = el(
    "div",
    {
      class: "remote-cursor",
      title: `${entry.displayName} is here`,
    },
    [el("span", { class: "remote-cursor-label" }, entry.displayName)],
  );
  marker.style.setProperty("--cursor-color", entry.color);
  marker.style.left = `${bodyRect.left - blockRect.left + position.left + indexInBlock * 8}px`;
  marker.style.top = `${bodyRect.top - blockRect.top + position.top}px`;
  marker.style.height = `${position.height}px`;
  return { block, marker };
}

function createRemoteSelection(entry, blockId) {
  const block = document.querySelector(`.block[data-block-id="${blockId}"]`);
  const body = block?.querySelector(".block-body");
  if (!block || !body) return [];

  const range = createRangeFromOffsets(
    body,
    entry.selectionStartOffset,
    entry.selectionEndOffset,
  );
  if (!range) return [];

  const blockRect = block.getBoundingClientRect();
  const rects = Array.from(range.getClientRects());
  return rects.map((rect) => {
    const node = el("div", { class: "remote-selection" });
    node.style.left = `${rect.left - blockRect.left}px`;
    node.style.top = `${rect.top - blockRect.top}px`;
    node.style.width = `${Math.max(1, rect.width)}px`;
    node.style.height = `${Math.max(2, rect.height)}px`;
    node.style.background = withAlpha(entry.color, "33");
    return { block, node };
  });
}

function renderRemoteCursors() {
  document
    .querySelectorAll(".remote-selection")
    .forEach((node) => node.remove());
  document.querySelectorAll(".remote-cursor").forEach((node) => node.remove());
  if (!state.currentPage || !state.auth) return;

  const entriesByBlock = new Map();
  for (const entry of Object.values(state.presence)) {
    if (entry.userId === state.auth.userId || !entry.cursorBlockId) continue;
    if (!entriesByBlock.has(entry.cursorBlockId)) {
      entriesByBlock.set(entry.cursorBlockId, []);
    }
    entriesByBlock.get(entry.cursorBlockId).push(entry);
  }

  for (const [blockId, entries] of entriesByBlock.entries()) {
    entries.forEach((entry, index) => {
      const selections = createRemoteSelection(entry, blockId);
      for (const selection of selections) {
        selection.block.append(selection.node);
      }
      const cursor = createRemoteCursor(entry, blockId, index);
      if (cursor) cursor.block.append(cursor.marker);
    });
  }
}

function handleWSMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  const { event, payload } = msg;
  if (!event) return;
  switch (event) {
    case "page.title.changed": {
      state.currentPage.title = payload.title;
      const titleEl = $("page-title");
      if (document.activeElement !== titleEl) titleEl.value = payload.title;
      updateSidebarTitle(state.currentPage.pageId, payload.title);
      break;
    }
    case "page.block.inserted":
      state.currentPage.blocks[payload.block.id] = payload.block;
      if (!state.currentPage.rootBlockIds.includes(payload.block.id)) {
        state.currentPage.rootBlockIds.push(payload.block.id);
      }
      renderBlocks();
      break;
    case "page.block.updated": {
      const incoming = payload.block;
      state.currentPage.blocks[incoming.id] = incoming;
      const timer = blockSaveTimers.get(incoming.id);
      if (timer != null) {
        clearTimeout(timer);
        blockSaveTimers.delete(incoming.id);
      }
      blockPendingText.delete(incoming.id);
      const blockEl = document.querySelector(
        `.block[data-block-id="${incoming.id}"]`,
      );
      if (blockEl) {
        const body = blockEl.querySelector(".block-body");
        if (body.textContent !== incoming.text) {
          body.textContent = incoming.text;
        }
        applyBlockTypeAttrs(blockEl, incoming);
      }
      renderRemoteCursors();
      break;
    }
    case "page.block.deleted":
      for (const id of payload.removedIds ?? [payload.blockId]) {
        delete state.currentPage.blocks[id];
      }
      state.currentPage.rootBlockIds = state.currentPage.rootBlockIds.filter(
        (id) => !(payload.removedIds ?? [payload.blockId]).includes(id),
      );
      renderBlocks();
      break;
    case "page.presence.changed":
      state.presence[payload.entry.userId] = payload.entry;
      renderPresence();
      renderRemoteCursors();
      break;
    case "page.presence.left":
      delete state.presence[payload.userId];
      renderPresence();
      renderRemoteCursors();
      break;
  }
}

// ---------- Mutations ----------
async function setPageTitle(title) {
  state.currentPage.title = title;
  updateSidebarTitle(state.currentPage.pageId, title || "Untitled");
  await api(`/pages/${state.currentPage.pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

async function addBlock(type = "paragraph", afterBlockId = null) {
  const block = await api(`/pages/${state.currentPage.pageId}/blocks`, {
    method: "POST",
    body: JSON.stringify({ type, text: "", afterBlockId }),
  });
  // The Page actor broadcasts page.block.inserted to all clients, including the sender.
  // Avoid local optimistic insertion to prevent sender-side duplicates.
  focusBlock(block.id);
  return block;
}

async function updateBlock(blockId, patch) {
  Object.assign(state.currentPage.blocks[blockId], patch);
  await api(`/pages/${state.currentPage.pageId}/blocks/${blockId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

async function flushBlockSave(blockId, textOverride) {
  const pending = textOverride ?? blockPendingText.get(blockId);
  const timer = blockSaveTimers.get(blockId);
  if (timer != null) clearTimeout(timer);
  blockSaveTimers.delete(blockId);
  blockPendingText.delete(blockId);

  if (pending == null) return;
  if (!state.currentPage?.blocks[blockId]) return;
  if (pending === state.currentPage.blocks[blockId].text) return;

  await updateBlock(blockId, { text: pending });
}

function scheduleBlockSave(blockId, text) {
  const timer = blockSaveTimers.get(blockId);
  if (timer != null) clearTimeout(timer);
  blockPendingText.set(blockId, text);
  blockSaveTimers.set(
    blockId,
    setTimeout(() => {
      flushBlockSave(blockId).catch((e) => toast(e.message));
    }, BLOCK_SAVE_DEBOUNCE_MS),
  );
}

function flushAllBlockSaves() {
  if (blockPendingText.size === 0) return Promise.resolve();
  const pending = Array.from(blockPendingText.entries());
  return Promise.allSettled(
    pending.map(([blockId, text]) => flushBlockSave(blockId, text)),
  );
}

async function deleteBlock(blockId) {
  blockPendingText.delete(blockId);
  const timer = blockSaveTimers.get(blockId);
  if (timer != null) {
    clearTimeout(timer);
    blockSaveTimers.delete(blockId);
  }
  delete state.currentPage.blocks[blockId];
  state.currentPage.rootBlockIds = state.currentPage.rootBlockIds.filter(
    (id) => id !== blockId,
  );
  renderBlocks();
  await api(`/pages/${state.currentPage.pageId}/blocks/${blockId}`, {
    method: "DELETE",
  });
}

// ---------- Rendering ----------
function showLogin() {
  $("login-view").hidden = false;
  $("app-view").hidden = true;
}

function showApp() {
  $("login-view").hidden = true;
  $("app-view").hidden = false;
}

function renderMe() {
  const av = $("me-avatar");
  av.textContent = initials(state.auth.displayName);
  av.style.background = state.auth.color;
  $("me-name").textContent = state.auth.displayName;
}

function renderWorkspace() {
  $("workspace-name").textContent = state.workspace.name;
}

function renderPageList() {
  const list = $("page-list");
  list.innerHTML = "";
  if (state.pages.length === 0) {
    list.append(
      el(
        "div",
        { class: "ghost", style: "color:var(--text-faint);padding:6px 10px;" },
        "No pages yet",
      ),
    );
    return;
  }
  for (const p of state.pages) {
    const item = el(
      "button",
      {
        class: "page-item",
        dataset: { pageId: p.pageId },
        onclick: () => openPage(p.pageId),
      },
      [
        el("span", { class: "page-icon" }, p.icon ?? "📄"),
        el("span", {}, p.title || "Untitled"),
      ],
    );
    if (state.currentPage?.pageId === p.pageId) item.classList.add("active");
    list.append(item);
  }
}

function updateSidebarTitle(pageId, title) {
  for (const item of document.querySelectorAll(".page-item")) {
    if (item.dataset.pageId === pageId) {
      const span = item.querySelector("span:last-child");
      if (span) span.textContent = title || "Untitled";
    }
  }
}

function renderPage() {
  $("page-empty").hidden = true;
  $("page-view").hidden = false;
  $("page-title").value = state.currentPage.title;
  renderBlocks();
  renderPresence();
  renderRemoteCursors();
}

function renderBlocks() {
  const container = $("blocks");
  container.innerHTML = "";
  let numberedCounter = 0;
  for (const id of state.currentPage.rootBlockIds) {
    const block = state.currentPage.blocks[id];
    if (!block) continue;
    if (block.type === "numbered_list") numberedCounter++;
    else numberedCounter = 0;
    const node = renderBlock(block, numberedCounter);
    container.append(node);
  }
  renderRemoteCursors();
}

function renderBlock(block, numberedCounter) {
  const tmpl = $("block-template");
  const node = tmpl.content.firstElementChild.cloneNode(true);
  node.dataset.blockId = block.id;
  applyBlockTypeAttrs(node, block, numberedCounter);

  const body = node.querySelector(".block-body");
  body.textContent = block.text ?? "";
  body.dataset.placeholder =
    (BLOCK_TYPES.find((t) => t.type === block.type) || {}).placeholder ?? "";

  body.addEventListener("focus", () => {
    schedulePresenceUpdate();
  });
  body.addEventListener("blur", () => {
    scheduleBlockSave(block.id, body.textContent ?? "");
    schedulePresenceUpdate();
  });
  body.addEventListener("input", () => {
    scheduleBlockSave(block.id, body.textContent ?? "");
    schedulePresenceUpdate();
  });
  body.addEventListener("keyup", schedulePresenceUpdate);
  body.addEventListener("mouseup", schedulePresenceUpdate);
  body.addEventListener("click", schedulePresenceUpdate);
  body.addEventListener("keydown", (e) => onBlockKeydown(e, block, body));

  // gutter buttons
  node.querySelector(".delete-btn").addEventListener("click", () => {
    deleteBlock(block.id).catch((e) => toast(e.message));
  });
  node.querySelector(".type-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openTypeMenu(block, node);
  });

  // todo checkbox
  if (block.type === "todo") {
    const check = el("span", {
      class: "todo-check" + (block.checked ? " checked" : ""),
      onclick: (ev) => {
        ev.stopPropagation();
        const next = !block.checked;
        node.dataset.checked = String(next);
        check.classList.toggle("checked", next);
        updateBlock(block.id, { checked: next }).catch((e) => toast(e.message));
      },
    });
    node.insertBefore(check, body);
  }

  return node;
}

function applyBlockTypeAttrs(node, block, numberedCounter) {
  node.dataset.type = block.type;
  if (block.type === "todo") node.dataset.checked = String(!!block.checked);
  if (block.type === "numbered_list" && numberedCounter != null) {
    const body = node.querySelector(".block-body");
    body.dataset.number = String(numberedCounter);
  }
}

function focusBlock(blockId, at = "end") {
  setTimeout(() => {
    const body = document.querySelector(
      `.block[data-block-id="${blockId}"] .block-body`,
    );
    if (body) {
      body.focus();
      const range = document.createRange();
      range.selectNodeContents(body);
      range.collapse(at === "start");
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, 0);
}

function onBlockKeydown(e, block, body) {
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    const selection = getSelectionInBody(body);
    if (!selection || !selection.isCollapsed) return;

    const offset = getCaretOffset(body, selection);
    const total = body.textContent?.length ?? 0;
    const idx = state.currentPage.rootBlockIds.indexOf(block.id);

    if (e.key === "ArrowUp" && offset === 0 && idx > 0) {
      e.preventDefault();
      focusBlock(state.currentPage.rootBlockIds[idx - 1], "end");
      return;
    }

    if (
      e.key === "ArrowDown" &&
      offset === total &&
      idx >= 0 &&
      idx < state.currentPage.rootBlockIds.length - 1
    ) {
      e.preventDefault();
      focusBlock(state.currentPage.rootBlockIds[idx + 1], "start");
      return;
    }
  }

  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const text = body.textContent ?? "";
    flushBlockSave(block.id, text).catch(() => {});
    addBlock("paragraph", block.id).catch((e) => toast(e.message));
  } else if (
    e.key === "Backspace" &&
    body.textContent === "" &&
    state.currentPage.rootBlockIds.length > 1
  ) {
    e.preventDefault();
    const idx = state.currentPage.rootBlockIds.indexOf(block.id);
    const prevId = state.currentPage.rootBlockIds[idx - 1];
    deleteBlock(block.id).catch(() => {});
    if (prevId) focusBlock(prevId);
  }
}

function openTypeMenu(block, node) {
  document.querySelectorAll(".type-menu").forEach((m) => m.remove());
  const menu = el("div", { class: "type-menu" });
  for (const t of BLOCK_TYPES) {
    menu.append(
      el(
        "button",
        {
          onclick: () => {
            menu.remove();
            if (t.type !== block.type) {
              updateBlock(block.id, { type: t.type }).catch((e) =>
                toast(e.message),
              );
              applyBlockTypeAttrs(node, { ...block, type: t.type });
              const body = node.querySelector(".block-body");
              body.dataset.placeholder = t.placeholder;
            }
          },
        },
        t.label,
      ),
    );
  }
  const rect = node.querySelector(".type-btn").getBoundingClientRect();
  menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
  menu.style.left = `${rect.left + window.scrollX}px`;
  document.body.append(menu);
  setTimeout(() => {
    const close = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener("click", close);
      }
    };
    document.addEventListener("click", close);
  }, 0);
}

function renderPresence() {
  const node = $("presence");
  node.innerHTML = "";
  for (const entry of Object.values(state.presence)) {
    if (entry.userId === state.auth.userId) continue;
    const av = el(
      "span",
      {
        class: "avatar",
        title: entry.displayName,
      },
      initials(entry.displayName),
    );
    av.style.background = entry.color;
    node.append(av);
  }
}

document.addEventListener("selectionchange", () => {
  const active = document.activeElement;
  if (!active?.classList?.contains("block-body")) return;
  schedulePresenceUpdate();
});

// ---------- Bootstrap ----------
async function bootstrapApp() {
  try {
    showApp();
    renderMe();
    state.workspace = await loadOrCreateWorkspace();
    renderWorkspace();
    await refreshPageList();
    if (state.pages.length > 0) {
      openPage(state.pages[0].pageId);
    } else {
      await createPage();
    }
  } catch (err) {
    if (/401|Session/.test(err.message)) {
      logout();
      toast("Session expired, please log in again");
    } else {
      toast(err.message);
    }
  }
}

function wireEvents() {
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("login-name").value.trim();
    if (!name) return;
    try {
      await login(name);
    } catch (err) {
      toast(err.message);
    }
  });

  $("logout").addEventListener("click", logout);
  $("new-page").addEventListener("click", () =>
    createPage().catch((e) => toast(e.message)),
  );
  $("add-block").addEventListener("click", () =>
    addBlock().catch((e) => toast(e.message)),
  );

  let titleTimer;
  $("page-title").addEventListener("input", (e) => {
    clearTimeout(titleTimer);
    const v = e.target.value;
    titleTimer = setTimeout(
      () => setPageTitle(v).catch((err) => toast(err.message)),
      300,
    );
  });
}

function init() {
  wireEvents();
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      state.auth = JSON.parse(saved);
      if (!state.auth.color) state.auth.color = colorForUser(state.auth.userId);
      bootstrapApp();
      return;
    } catch {}
  }
  showLogin();
}

init();
