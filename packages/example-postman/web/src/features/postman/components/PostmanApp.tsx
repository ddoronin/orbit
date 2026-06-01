import { useEffect, useMemo, useState } from "react";
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  Trash2,
  Pencil,
  Plus,
  MoveRight,
  Globe,
  Clock,
  FolderTree,
  X,
} from "lucide-react";
import { createEmptyKeyValue, usePostmanStore, type SidebarPane } from "../store";
import type {
  CollectionState,
  KeyValueEntry,
  RequestAuth,
  RequestBody,
  RequestDraft,
  TestResult,
} from "../types";
import { CodeEditor } from "./common/CodeEditor";
import { CommandPalette } from "./common/CommandPalette";

const HTTP_METHODS: RequestDraft["method"][] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

const REQUEST_TABS = [
  { id: "params", label: "Params" },
  { id: "auth", label: "Authorization" },
  { id: "headers", label: "Headers" },
  { id: "body", label: "Body" },
  { id: "scripts", label: "Pre-request" },
  { id: "tests", label: "Tests" },
] as const;

const RESPONSE_TABS = [
  { id: "body", label: "Body" },
  { id: "headers", label: "Headers" },
  { id: "tests", label: "Test Results" },
  { id: "history", label: "History" },
] as const;

type RequestTab = (typeof REQUEST_TABS)[number]["id"];
type ResponseTab = (typeof RESPONSE_TABS)[number]["id"];
type BodyEditorMode = "none" | "raw" | "graphql";

interface BodyDraft {
  mode: BodyEditorMode;
  contentType: string;
  rawText: string;
  graphqlQuery: string;
  graphqlVariables: string;
}

interface ResponseSource {
  status: number;
  statusText?: string;
  durationMs: number;
  body: string;
  headers: Record<string, string>;
  size?: number;
}

export function PostmanApp(): JSX.Element {
  const bootstrapped = usePostmanStore((s) => s.bootstrapped);
  const auth = usePostmanStore((s) => s.auth);
  const init = usePostmanStore((s) => s.init);
  const login = usePostmanStore((s) => s.login);
  const setPaletteOpen = usePostmanStore((s) => s.setPaletteOpen);

  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  if (!bootstrapped) {
    return <section className="loading-screen">Preparing workspace…</section>;
  }

  if (!auth) {
    return (
      <section className="auth-layout">
        <article className="auth-card">
          <div className="brand-mark">OS</div>
          <h1>Postman on OrbitStack</h1>
          <p>
            API request workbench backed by Durable Objects, KV sessions, and
            D1 request history.
          </p>
          <input
            className="input"
            placeholder="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <button
            className="btn"
            onClick={() => {
              void login(displayName || "Developer");
            }}
          >
            Enter Workspace
          </button>
        </article>
      </section>
    );
  }

  return (
    <>
      <Shell />
      <CommandPalette />
    </>
  );
}

function Shell(): JSX.Element {
  const workspace = usePostmanStore((s) => s.workspace);
  const session = usePostmanStore((s) => s.auth?.session);
  const logout = usePostmanStore((s) => s.logout);
  const setPaletteOpen = usePostmanStore((s) => s.setPaletteOpen);
  const exportWorkspace = usePostmanStore((s) => s.exportWorkspace);
  const importWorkspace = usePostmanStore((s) => s.importWorkspace);

  const initials = (session?.displayName ?? "?")
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");

  return (
    <section className="pm-shell">
      <header className="pm-global-header">
        <div className="pm-gh-left">
          <div className="pm-logo">OS</div>
          <button className="pm-workspace-switcher" type="button">
            <strong>{workspace?.name ?? "Shared API Lab"}</strong>
            <span className="ws-caret">▾</span>
          </button>
        </div>

        <div className="pm-gh-center">
          <button
            className="pm-search"
            type="button"
            onClick={() => setPaletteOpen(true)}
          >
            <span className="subtle" style={{ flex: 1, textAlign: "left" }}>
              Search collections, requests, environment variables…
            </span>
            <span className="pm-search-kbd">⌘K</span>
          </button>
        </div>

        <div className="pm-gh-right">
          <button
            className="mini-btn"
            onClick={() => {
              void exportWorkspace().then((payload) => {
                if (!payload) return;
                navigator.clipboard.writeText(payload).catch(() => undefined);
                window.alert("Workspace export copied to clipboard");
              });
            }}
          >
            Export
          </button>
          <button
            className="mini-btn"
            onClick={() => {
              const raw = window.prompt("Paste workspace JSON payload");
              if (!raw) return;
              void importWorkspace(raw);
            }}
          >
            Import
          </button>
          <button
            className="pm-avatar"
            title={`${session?.displayName ?? ""} — click to log out`}
            onClick={() => logout()}
          >
            {initials || "·"}
          </button>
        </div>
      </header>

      <section className="pm-workspace-grid">
        <WorkbenchRail />
        <Sidebar />
        <main className="pm-main-pane">
          <MainPane />
        </main>
      </section>
    </section>
  );
}

function WorkbenchRail(): JSX.Element {
  const pane = usePostmanStore((s) => s.sidebarPane);
  const setPane = usePostmanStore((s) => s.setSidebarPane);

  const items: Array<{ id: SidebarPane; label: string; icon: JSX.Element }> = [
    { id: "collections", label: "Collections", icon: <FolderTree size={18} /> },
    { id: "environments", label: "Environments", icon: <Globe size={18} /> },
    { id: "history", label: "History", icon: <Clock size={18} /> },
  ];

  return (
    <nav className="pm-rail" aria-label="Workbench">
      {items.map((item) => (
        <button
          key={item.id}
          className={`pm-rail-btn ${pane === item.id ? "active" : ""}`}
          onClick={() => setPane(item.id)}
          type="button"
          aria-label={item.label}
        >
          {item.icon}
          <span className="pm-rail-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Sidebar(): JSX.Element {
  const pane = usePostmanStore((s) => s.sidebarPane);

  return (
    <aside className="pm-sidebar-pane">
      <div className="pm-sidebar">
        {pane === "collections" ? <CollectionsPane /> : null}
        {pane === "environments" ? <EnvironmentsPane /> : null}
        {pane === "history" ? <HistoryPane /> : null}
      </div>
    </aside>
  );
}

function CollectionsPane(): JSX.Element {
  const collections = usePostmanStore((s) => s.collections);
  const activeCollection = usePostmanStore((s) => s.activeCollection);
  const activeRequestId = usePostmanStore((s) => s.activeRequestId);
  const selectCollection = usePostmanStore((s) => s.selectCollection);
  const createCollection = usePostmanStore((s) => s.createCollection);
  const renameCollection = usePostmanStore((s) => s.renameCollection);
  const deleteCollection = usePostmanStore((s) => s.deleteCollection);
  const createFolder = usePostmanStore((s) => s.createFolder);
  const renameFolder = usePostmanStore((s) => s.renameFolder);
  const deleteFolder = usePostmanStore((s) => s.deleteFolder);
  const createRequest = usePostmanStore((s) => s.createRequest);
  const selectRequest = usePostmanStore((s) => s.selectRequest);
  const moveRequest = usePostmanStore((s) => s.moveRequest);
  const deleteRequest = usePostmanStore((s) => s.deleteRequest);

  return (
    <>
      <div className="pm-sidebar-header">
        <h3>Collections</h3>
        <button
          className="icon-btn"
          title="New collection"
          onClick={() => {
            const name = window.prompt("Collection name", "API Collection");
            if (!name) return;
            void createCollection(name);
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="pm-sidebar-body">
        <div className="pm-collection-list">
          {collections.map((collection) => {
            const isActive =
              activeCollection?.collectionId === collection.collectionId;
            return (
              <div
                key={collection.collectionId}
                className={`collection-row pm-collection-row ${isActive ? "active" : ""}`}
              >
                <button
                  className="tree-label"
                  onClick={() => {
                    void selectCollection(collection.collectionId);
                  }}
                >
                  {isActive ? <FolderOpen size={13} color="#c4a052" /> : <Folder size={13} color="#c4a052" />}
                  <span className="truncate">{collection.name}</span>
                </button>
                <div className="row-actions">
                  <button
                    className="icon-btn"
                    title="Rename"
                    onClick={() => {
                      const nextName = window.prompt(
                        "Rename collection",
                        collection.name,
                      );
                      if (!nextName) return;
                      void renameCollection(collection.collectionId, nextName);
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    className="icon-btn danger"
                    title="Delete"
                    onClick={() => {
                      const ok = window.confirm(
                        `Delete collection "${collection.name}"?`,
                      );
                      if (!ok) return;
                      void deleteCollection(collection.collectionId);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {activeCollection ? (
          <section className="pm-tree-section">
            <div
              className="pane-title-row"
              style={{ padding: "8px 4px 4px" }}
            >
              <span className="pm-section-title">
                {activeCollection.name}
              </span>
              <div className="row-actions-static">
                <button
                  className="icon-btn"
                  title="New folder"
                  onClick={() => {
                    const name = window.prompt("Folder name", "Users");
                    if (!name) return;
                    void createFolder(name);
                  }}
                >
                  <Folder size={12} />
                </button>
                <button
                  className="icon-btn"
                  title="New request"
                  onClick={() => {
                    const name = window.prompt("Request name", "New Request");
                    if (!name) return;
                    void createRequest(name);
                  }}
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
            <TreeView
              collection={activeCollection}
              activeRequestId={activeRequestId}
              onSelectRequest={selectRequest}
              onCreateRequest={(folderId) => {
                const name = window.prompt("Request name", "New Request");
                if (!name) return;
                void createRequest(name, folderId);
              }}
              onCreateFolder={(folderId) => {
                const name = window.prompt("Folder name", "Folder");
                if (!name) return;
                void createFolder(name, folderId);
              }}
              onRenameFolder={(folderId, currentName) => {
                const nextName = window.prompt("Rename folder", currentName);
                if (!nextName) return;
                void renameFolder(folderId, nextName);
              }}
              onDeleteFolder={(folderId, folderName) => {
                const ok = window.confirm(
                  `Delete folder "${folderName}" and nested requests?`,
                );
                if (!ok) return;
                void deleteFolder(folderId);
              }}
              onDeleteRequest={(requestId, requestName) => {
                const ok = window.confirm(`Delete request "${requestName}"?`);
                if (!ok) return;
                void deleteRequest(requestId);
              }}
              onMoveRequest={(requestId) => {
                const target = window.prompt(
                  "Target folder ID (blank for root)",
                  "",
                );
                void moveRequest(
                  requestId,
                  target?.trim() ? target.trim() : null,
                );
              }}
            />
          </section>
        ) : null}
      </div>
    </>
  );
}

function EnvironmentsPane(): JSX.Element {
  const workspace = usePostmanStore((s) => s.workspace);
  const setEnvVar = usePostmanStore((s) => s.setEnvVar);
  const deleteEnvVar = usePostmanStore((s) => s.deleteEnvVar);

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const entries = Object.entries(workspace?.environmentVariables ?? {}).sort(
    ([a], [b]) => a.localeCompare(b),
  );

  return (
    <>
      <div className="pm-sidebar-header">
        <h3>Environment</h3>
        <span className="subtle">{entries.length} vars</span>
      </div>
      <div className="pm-sidebar-body">
        <div className="env-upsert-row">
          <input
            className="input"
            placeholder="variable"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          />
          <input
            className="input"
            placeholder="value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            className="btn ghost"
            onClick={() => {
              if (!key.trim()) return;
              void setEnvVar(key.trim(), value);
              setKey("");
              setValue("");
            }}
          >
            Add
          </button>
        </div>

        <div className="stack-list compact">
          {entries.length === 0 ? (
            <div className="tree-empty">
              <p>No environment variables.</p>
              <p className="subtle">
                Reference them in requests with{" "}
                <code style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  {"{{name}}"}
                </code>
                .
              </p>
            </div>
          ) : null}
          {entries.map(([entryKey, entryValue]) => (
            <div className="env-row" key={entryKey}>
              <div className="env-title">
                <strong>{entryKey}</strong>
                <button
                  className="icon-btn danger"
                  title="Delete"
                  onClick={() => {
                    void deleteEnvVar(entryKey);
                  }}
                >
                  <X size={12} />
                </button>
              </div>
              <div className="env-value">{entryValue || "(empty)"}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function HistoryPane(): JSX.Element {
  const history = usePostmanStore((s) => s.history);
  const selectRequest = usePostmanStore((s) => s.selectRequest);
  const activeRequestId = usePostmanStore((s) => s.activeRequestId);

  return (
    <>
      <div className="pm-sidebar-header">
        <h3>History</h3>
        <span className="subtle">{history.length}</span>
      </div>
      <div className="pm-sidebar-body">
        {history.length === 0 ? (
          <div className="tree-empty">
            <p>No requests yet.</p>
            <p className="subtle">Send a request to see it here.</p>
          </div>
        ) : null}
        {history.map((entry) => (
          <button
            key={entry.id}
            className={`history-row ${activeRequestId === entry.requestId ? "active" : ""}`}
            onClick={() => selectRequest(entry.requestId)}
          >
            <span
              className={`method-pill method-${entry.method.toLowerCase()}`}
            >
              {entry.method}
            </span>
            <span className="truncate" style={{ flex: 1, minWidth: 0 }}>
              {entry.url}
            </span>
            <span
              className={`status-pill ${classifyStatusTone(entry.status)}`}
            >
              {entry.status}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function MainPane(): JSX.Element {
  const activeCollection = usePostmanStore((s) => s.activeCollection);
  const activeRequestId = usePostmanStore((s) => s.activeRequestId);
  const selectRequest = usePostmanStore((s) => s.selectRequest);
  const createRequest = usePostmanStore((s) => s.createRequest);

  const activeRequest = useMemo(
    () =>
      activeCollection && activeRequestId
        ? (activeCollection.requests[activeRequestId] ?? null)
        : null,
    [activeCollection, activeRequestId],
  );

  if (!activeCollection) {
    return (
      <div className="empty-state">
        <div>
          <div className="empty-illus">📂</div>
          <p>Create or select a collection to begin.</p>
        </div>
      </div>
    );
  }

  if (!activeRequest) {
    return (
      <div className="empty-state">
        <div>
          <div className="empty-illus">📭</div>
          <p>Select a request from the sidebar.</p>
        </div>
      </div>
    );
  }

  const openTabs = activeRequestId ? [activeRequest] : [];

  return (
    <div className="pm-main">
      <div className="pm-open-tabs">
        {openTabs.map((req) => (
          <div
            key={req.requestId}
            className={`pm-open-tab ${req.requestId === activeRequestId ? "active" : ""}`}
            onClick={() => selectRequest(req.requestId)}
          >
            <span
              className={`method-pill method-${req.method.toLowerCase()}`}
            >
              {req.method}
            </span>
            <span className="tab-name">{req.name}</span>
          </div>
        ))}
        <button
          className="pm-open-tab-add"
          title="New request"
          onClick={() => {
            const name = window.prompt("Request name", "New Request");
            if (!name) return;
            void createRequest(name);
          }}
        >
          +
        </button>
      </div>

      <RequestEditor request={activeRequest} />
      <ResponsePanel request={activeRequest} />
    </div>
  );
}

// ─────────── Tree ───────────

function TreeView(props: {
  collection: CollectionState;
  activeRequestId: string | null;
  onSelectRequest: (requestId: string) => void;
  onCreateRequest: (folderId: string | null) => void;
  onCreateFolder: (folderId: string | null) => void;
  onRenameFolder: (folderId: string, currentName: string) => void;
  onDeleteFolder: (folderId: string, folderName: string) => void;
  onDeleteRequest: (requestId: string, requestName: string) => void;
  onMoveRequest: (requestId: string) => void;
}): JSX.Element {
  const hasEntries =
    props.collection.rootRequestIds.length > 0 ||
    props.collection.rootFolderIds.length > 0;

  if (!hasEntries) {
    return (
      <div className="tree-empty">
        <p>No requests yet.</p>
        <div className="row-wrap">
          <button
            className="mini-btn"
            onClick={() => props.onCreateRequest(null)}
          >
            New Request
          </button>
          <button
            className="mini-btn"
            onClick={() => props.onCreateFolder(null)}
          >
            New Folder
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tree-wrap">
      {props.collection.rootRequestIds.map((requestId) => {
        const request = props.collection.requests[requestId];
        if (!request) return null;
        return (
          <RequestRow
            key={request.requestId}
            request={request}
            active={props.activeRequestId === request.requestId}
            onSelectRequest={props.onSelectRequest}
            onDeleteRequest={props.onDeleteRequest}
            onMoveRequest={props.onMoveRequest}
          />
        );
      })}
      {props.collection.rootFolderIds.map((folderId) => (
        <FolderTreeNode
          key={folderId}
          folderId={folderId}
          collection={props.collection}
          activeRequestId={props.activeRequestId}
          onSelectRequest={props.onSelectRequest}
          onCreateRequest={props.onCreateRequest}
          onCreateFolder={props.onCreateFolder}
          onRenameFolder={props.onRenameFolder}
          onDeleteFolder={props.onDeleteFolder}
          onDeleteRequest={props.onDeleteRequest}
          onMoveRequest={props.onMoveRequest}
          depth={0}
        />
      ))}
    </div>
  );
}

function FolderTreeNode(props: {
  folderId: string;
  collection: CollectionState;
  activeRequestId: string | null;
  onSelectRequest: (requestId: string) => void;
  onCreateRequest: (folderId: string | null) => void;
  onCreateFolder: (folderId: string | null) => void;
  onRenameFolder: (folderId: string, currentName: string) => void;
  onDeleteFolder: (folderId: string, folderName: string) => void;
  onDeleteRequest: (requestId: string, requestName: string) => void;
  onMoveRequest: (requestId: string) => void;
  depth: number;
}): JSX.Element | null {
  const folder = props.collection.folders[props.folderId];
  const [expanded, setExpanded] = useState(true);

  if (!folder) return null;

  return (
    <div className="folder-node" style={{ marginLeft: props.depth * 12 }}>
      <div className="folder-row">
        <button
          className="tree-label folder-toggle"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <span className="folder-arrow">
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
          {expanded ? (
            <FolderOpen size={13} color="#c4a052" />
          ) : (
            <Folder size={13} color="#c4a052" />
          )}
          <span className="truncate">{folder.name}</span>
        </button>
        <div className="row-actions">
          <button
            className="icon-btn"
            title="Rename folder"
            onClick={() => props.onRenameFolder(folder.folderId, folder.name)}
          >
            <Pencil size={11} />
          </button>
          <button
            className="icon-btn"
            title="Add request"
            onClick={() => props.onCreateRequest(folder.folderId)}
          >
            <Plus size={11} />
          </button>
          <button
            className="icon-btn danger"
            title="Delete folder"
            onClick={() => props.onDeleteFolder(folder.folderId, folder.name)}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="folder-content">
          {folder.requestIds.map((requestId) => {
            const request = props.collection.requests[requestId];
            if (!request) return null;
            return (
              <RequestRow
                key={request.requestId}
                request={request}
                active={props.activeRequestId === request.requestId}
                onSelectRequest={props.onSelectRequest}
                onDeleteRequest={props.onDeleteRequest}
                onMoveRequest={props.onMoveRequest}
              />
            );
          })}
          {folder.folderIds.map((childId) => (
            <FolderTreeNode
              key={childId}
              folderId={childId}
              collection={props.collection}
              activeRequestId={props.activeRequestId}
              onSelectRequest={props.onSelectRequest}
              onCreateRequest={props.onCreateRequest}
              onCreateFolder={props.onCreateFolder}
              onRenameFolder={props.onRenameFolder}
              onDeleteFolder={props.onDeleteFolder}
              onDeleteRequest={props.onDeleteRequest}
              onMoveRequest={props.onMoveRequest}
              depth={props.depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RequestRow(props: {
  request: RequestDraft;
  active: boolean;
  onSelectRequest: (requestId: string) => void;
  onDeleteRequest: (requestId: string, requestName: string) => void;
  onMoveRequest: (requestId: string) => void;
}): JSX.Element {
  return (
    <div className={`request-row ${props.active ? "active" : ""}`}>
      <button
        className="tree-label"
        onClick={() => props.onSelectRequest(props.request.requestId)}
      >
        <FileText size={11} color="#9ca3af" />
        <span
          className={`method-pill method-${props.request.method.toLowerCase()}`}
        >
          {props.request.method}
        </span>
        <span className="truncate">{props.request.name}</span>
      </button>
      <div className="row-actions">
        <button
          className="icon-btn"
          title="Move request"
          onClick={() => props.onMoveRequest(props.request.requestId)}
        >
          <MoveRight size={11} />
        </button>
        <button
          className="icon-btn danger"
          title="Delete request"
          onClick={() =>
            props.onDeleteRequest(props.request.requestId, props.request.name)
          }
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

// ─────────── Request editor ───────────

function RequestEditor(props: { request: RequestDraft }): JSX.Element {
  const workspace = usePostmanStore((s) => s.workspace);
  const updateRequest = usePostmanStore((s) => s.updateRequest);
  const sendRequest = usePostmanStore((s) => s.sendRequest);
  const saveExample = usePostmanStore((s) => s.saveExample);

  const [tab, setTab] = useState<RequestTab>("params");
  const [name, setName] = useState(props.request.name);
  const [method, setMethod] = useState<RequestDraft["method"]>(props.request.method);
  const [url, setUrl] = useState(props.request.url);
  const [auth, setAuth] = useState<RequestAuth>(props.request.auth);
  const [bodyDraft, setBodyDraft] = useState<BodyDraft>(() =>
    readBodyDraft(props.request.body),
  );
  const [headers, setHeaders] = useState<KeyValueEntry[]>(props.request.headers);
  const [query, setQuery] = useState<KeyValueEntry[]>(props.request.query);
  const [preScript, setPreScript] = useState(props.request.preRequestScript ?? "");
  const [testScript, setTestScript] = useState(props.request.testScript ?? "");
  const [exampleName, setExampleName] = useState("Untitled example");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setTab("params");
    setName(props.request.name);
    setMethod(props.request.method);
    setUrl(props.request.url);
    setAuth(props.request.auth);
    setBodyDraft(readBodyDraft(props.request.body));
    setHeaders(props.request.headers);
    setQuery(props.request.query);
    setPreScript(props.request.preRequestScript ?? "");
    setTestScript(props.request.testScript ?? "");
  }, [props.request]);

  const missingVars = useMemo(
    () =>
      collectMissingEnvironmentVars(
        { ...props.request, method, url, headers, query, auth, body: buildRequestBody(bodyDraft) },
        workspace?.environmentVariables ?? {},
      ),
    [props.request, method, url, headers, query, auth, bodyDraft, workspace],
  );

  async function persist(): Promise<void> {
    await updateRequest(props.request.requestId, {
      name: name.trim() || "New Request",
      method,
      url,
      auth,
      body: buildRequestBody(bodyDraft),
      headers,
      query,
      preRequestScript: preScript,
      testScript,
    });
  }

  async function onSend(): Promise<void> {
    setSending(true);
    try {
      await persist();
      await sendRequest();
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="editor-stack">
      <div className="pm-request-meta-row">
        <input
          className="input pm-request-title-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void persist()}
          placeholder="Untitled Request"
        />
      </div>

      <div className="request-url-row">
        <select
          className="select pm-method-select"
          value={method}
          onChange={(event) => {
            const next = event.target.value as RequestDraft["method"];
            setMethod(next);
          }}
          style={{ color: methodColor(method) }}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          className="input"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Enter URL or paste text"
        />
        <button
          className="btn ghost"
          onClick={() => {
            void persist();
          }}
        >
          Save
        </button>
        <button
          className="btn pm-send-btn"
          onClick={() => void onSend()}
          disabled={sending}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>

      {missingVars.length > 0 ? (
        <div className="warn-strip">
          Missing environment variables: {missingVars.join(", ")}.
        </div>
      ) : null}

      <div className="tab-row pm-tab-row">
        {REQUEST_TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "params" ? (
        <KeyValueEditor
          label="Query Params"
          entries={query}
          onUpdate={setQuery}
        />
      ) : null}

      {tab === "auth" ? <AuthEditor auth={auth} onChange={setAuth} /> : null}

      {tab === "headers" ? (
        <KeyValueEditor
          label="Headers"
          entries={headers}
          onUpdate={setHeaders}
        />
      ) : null}

      {tab === "body" ? (
        <BodyEditor draft={bodyDraft} onChange={setBodyDraft} />
      ) : null}

      {tab === "scripts" ? (
        <div className="editor-panel">
          <p className="subtle" style={{ margin: 0 }}>
            JavaScript that runs before the request. Access env via{" "}
            <code style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              pm.environment.get(key)
            </code>{" "}
            /{" "}
            <code style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              pm.environment.set(key, value)
            </code>
            .
          </p>
          <CodeEditor
            value={preScript}
            onChange={setPreScript}
            language="javascript"
            height="200px"
            placeholder={`// Example\npm.environment.set("timestamp", Date.now().toString());`}
          />
        </div>
      ) : null}

      {tab === "tests" ? (
        <div className="editor-panel">
          <p className="subtle" style={{ margin: 0 }}>
            JavaScript that runs after a response. Use{" "}
            <code style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              pm.test(name, fn)
            </code>{" "}
            and{" "}
            <code style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              pm.expect(actual).to.equal(expected)
            </code>
            .
          </p>
          <CodeEditor
            value={testScript}
            onChange={setTestScript}
            language="javascript"
            height="240px"
            placeholder={`// Example\npm.test("status is 200", () => {\n  pm.expect(pm.response.code).to.equal(200);\n});`}
          />
        </div>
      ) : null}

      <div className="bottom-tools">
        <input
          className="input"
          value={exampleName}
          onChange={(event) => setExampleName(event.target.value)}
          placeholder="Example name"
        />
        <button
          className="mini-btn"
          onClick={() => {
            void saveExample(exampleName || "Untitled example");
          }}
        >
          Save as Example
        </button>
      </div>
    </section>
  );
}

function KeyValueEditor(props: {
  label: string;
  entries: KeyValueEntry[];
  onUpdate: (next: KeyValueEntry[]) => void;
}): JSX.Element {
  return (
    <div className="kv-editor">
      <div className="pane-title-row">
        <strong>{props.label}</strong>
        <button
          className="mini-btn"
          onClick={() => props.onUpdate([...props.entries, createEmptyKeyValue()])}
        >
          + Add row
        </button>
      </div>
      <div className="kv-table">
        {props.entries.length === 0 ? (
          <div style={{ padding: 12, color: "var(--muted)", fontSize: 12 }}>
            No entries — add one to begin.
          </div>
        ) : null}
        {props.entries.map((entry, index) => (
          <div className="kv-row" key={entry.id}>
            <label className="toggle-wrap">
              <input
                type="checkbox"
                checked={entry.enabled}
                onChange={(event) => {
                  const next = [...props.entries];
                  next[index] = { ...entry, enabled: event.target.checked };
                  props.onUpdate(next);
                }}
              />
            </label>
            <input
              className="input"
              placeholder="key"
              value={entry.key}
              onChange={(event) => {
                const next = [...props.entries];
                next[index] = { ...entry, key: event.target.value };
                props.onUpdate(next);
              }}
            />
            <input
              className="input"
              placeholder="value"
              value={entry.value}
              onChange={(event) => {
                const next = [...props.entries];
                next[index] = { ...entry, value: event.target.value };
                props.onUpdate(next);
              }}
            />
            <button
              className="icon-btn danger"
              onClick={() => {
                const next = props.entries.filter(
                  (item) => item.id !== entry.id,
                );
                props.onUpdate(next);
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function BodyEditor(props: {
  draft: BodyDraft;
  onChange: (next: BodyDraft) => void;
}): JSX.Element {
  const modes: Array<{ id: BodyEditorMode; label: string }> = [
    { id: "none", label: "none" },
    { id: "raw", label: "raw" },
    { id: "graphql", label: "GraphQL" },
  ];

  const lang = props.draft.contentType.includes("json") ? "json" : "text";

  return (
    <div className="editor-panel">
      <div className="row-wrap">
        {modes.map((m) => (
          <label
            key={m.id}
            className="row"
            style={{ gap: 4, fontSize: 12, color: "var(--muted)" }}
          >
            <input
              type="radio"
              checked={props.draft.mode === m.id}
              onChange={() => props.onChange({ ...props.draft, mode: m.id })}
            />
            <span>{m.label}</span>
          </label>
        ))}
        {props.draft.mode === "raw" ? (
          <select
            className="select"
            style={{ width: 180, marginLeft: "auto" }}
            value={props.draft.contentType}
            onChange={(event) =>
              props.onChange({
                ...props.draft,
                contentType: event.target.value,
              })
            }
          >
            <option value="application/json">JSON</option>
            <option value="text/plain">Text</option>
            <option value="application/xml">XML</option>
            <option value="text/html">HTML</option>
          </select>
        ) : null}
      </div>

      {props.draft.mode === "raw" ? (
        <CodeEditor
          value={props.draft.rawText}
          onChange={(value) =>
            props.onChange({ ...props.draft, rawText: value })
          }
          language={lang}
          height="280px"
          placeholder={
            lang === "json" ? '{\n  "hello": "orbit"\n}' : "Request body"
          }
        />
      ) : null}

      {props.draft.mode === "graphql" ? (
        <div className="editor-panel">
          <label className="pm-section-title">Query</label>
          <CodeEditor
            value={props.draft.graphqlQuery}
            onChange={(value) =>
              props.onChange({ ...props.draft, graphqlQuery: value })
            }
            language="javascript"
            height="200px"
            placeholder={"query { me { id name } }"}
          />
          <label className="pm-section-title">Variables (JSON)</label>
          <CodeEditor
            value={props.draft.graphqlVariables}
            onChange={(value) =>
              props.onChange({ ...props.draft, graphqlVariables: value })
            }
            language="json"
            height="120px"
            placeholder={"{}"}
          />
        </div>
      ) : null}

      {props.draft.mode === "none" ? (
        <div className="placeholder-panel">
          This request does not have a body.
        </div>
      ) : null}
    </div>
  );
}

function AuthEditor(props: {
  auth: RequestAuth;
  onChange: (auth: RequestAuth) => void;
}): JSX.Element {
  return (
    <section className="auth-editor-grid">
      <div className="auth-editor-left">
        <strong>Auth Type</strong>
        <select
          className="select"
          value={props.auth.type}
          onChange={(event) => {
            const type = event.target.value as RequestAuth["type"];
            if (type === "none") props.onChange({ type: "none" });
            if (type === "bearer") props.onChange({ type: "bearer", token: "" });
            if (type === "apiKey") {
              props.onChange({
                type: "apiKey",
                key: "Authorization",
                value: "{{token}}",
                in: "header",
              });
            }
            if (type === "basic") {
              props.onChange({ type: "basic", username: "", password: "" });
            }
          }}
        >
          <option value="none">No Auth</option>
          <option value="bearer">Bearer Token</option>
          <option value="apiKey">API Key</option>
          <option value="basic">Basic Auth</option>
        </select>
        <p className="subtle">{describeAuthType(props.auth.type)}</p>
      </div>

      <div className="auth-editor-right">
        {props.auth.type === "none" ? (
          <div className="subtle">Request will be sent without auth.</div>
        ) : null}
        {props.auth.type === "bearer" ? (
          <>
            <label className="pm-section-title">Token</label>
            <input
              className="input"
              value={props.auth.token}
              placeholder="{{token}}"
              onChange={(event) =>
                props.onChange({ ...props.auth, token: event.target.value })
              }
            />
          </>
        ) : null}
        {props.auth.type === "apiKey" ? (
          <>
            <div className="row-wrap">
              <div style={{ flex: 1 }}>
                <label className="pm-section-title">Key</label>
                <input
                  className="input"
                  value={props.auth.key}
                  onChange={(event) =>
                    props.onChange({ ...props.auth, key: event.target.value })
                  }
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="pm-section-title">Value</label>
                <input
                  className="input"
                  value={props.auth.value}
                  onChange={(event) =>
                    props.onChange({ ...props.auth, value: event.target.value })
                  }
                />
              </div>
              <div style={{ width: 140 }}>
                <label className="pm-section-title">Add to</label>
                <select
                  className="select"
                  value={props.auth.in}
                  onChange={(event) =>
                    props.onChange({
                      ...props.auth,
                      in: event.target.value as "header" | "query",
                    })
                  }
                >
                  <option value="header">Header</option>
                  <option value="query">Query Params</option>
                </select>
              </div>
            </div>
          </>
        ) : null}
        {props.auth.type === "basic" ? (
          <div className="row-wrap">
            <div style={{ flex: 1 }}>
              <label className="pm-section-title">Username</label>
              <input
                className="input"
                value={props.auth.username}
                onChange={(event) =>
                  props.onChange({
                    ...props.auth,
                    username: event.target.value,
                  })
                }
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="pm-section-title">Password</label>
              <input
                className="input"
                type="password"
                value={props.auth.password}
                onChange={(event) =>
                  props.onChange({
                    ...props.auth,
                    password: event.target.value,
                  })
                }
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ─────────── Response panel ───────────

function ResponsePanel(props: { request: RequestDraft }): JSX.Element {
  const executeResult = usePostmanStore((s) => s.executeResult);
  const history = usePostmanStore((s) => s.history);
  const testResults = usePostmanStore((s) => s.testResults);
  const [tab, setTab] = useState<ResponseTab>("body");
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [activeExampleId, setActiveExampleId] = useState<string | null>(null);

  useEffect(() => {
    setActiveHistoryId(null);
    setActiveExampleId(null);
    setTab("body");
  }, [props.request.requestId]);

  const activeHistory = useMemo(
    () => history.find((entry) => entry.id === activeHistoryId) ?? null,
    [history, activeHistoryId],
  );
  const activeExample = useMemo(
    () =>
      props.request.examples.find((ex) => ex.exampleId === activeExampleId) ??
      null,
    [props.request, activeExampleId],
  );

  const source = useMemo<ResponseSource | null>(() => {
    if (activeExample) {
      return {
        status: activeExample.status,
        durationMs: activeExample.durationMs,
        body: activeExample.bodyText,
        headers: activeExample.headers,
      };
    }
    if (activeHistory) {
      return {
        status: activeHistory.status,
        durationMs: activeHistory.durationMs,
        body: activeHistory.responseBody,
        headers: activeHistory.responseHeaders,
      };
    }
    if (!executeResult || "error" in executeResult) return null;
    return {
      status: executeResult.status,
      statusText: executeResult.statusText,
      durationMs: executeResult.durationMs,
      body: prettyJson(executeResult.jsonBody ?? executeResult.bodyText),
      headers: executeResult.headers,
      size: executeResult.size,
    };
  }, [executeResult, activeHistory, activeExample]);

  const failure = executeResult && "error" in executeResult ? executeResult : null;
  const tone = source ? classifyStatusTone(source.status) : "";

  return (
    <section className="response-panel">
      <div className="response-head">
        {source ? (
          <div className="response-strip">
            <span>
              <span className="label">Status:</span>
              <span className={`value ${tone}`}>
                {source.status} {source.statusText ?? ""}
              </span>
            </span>
            <span>
              <span className="label">Time:</span>
              <span className="value">{source.durationMs} ms</span>
            </span>
            {source.size !== undefined ? (
              <span>
                <span className="label">Size:</span>
                <span className="value">{formatBytes(source.size)}</span>
              </span>
            ) : null}
          </div>
        ) : (
          <span className="subtle">Ready</span>
        )}

        <div className="tab-row">
          {RESPONSE_TABS.map((t) => (
            <button
              key={t.id}
              className={`tab-btn ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === "tests" && testResults.length > 0 ? (
                <span style={{ marginLeft: 6 }}>
                  ({testResults.filter((r) => r.passed).length}/
                  {testResults.length})
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {failure ? (
        <div className="warn-strip" style={{ background: "var(--st-5xx-bg)", color: "var(--st-5xx-text)", border: "1px solid #f4c2c2" }}>
          {failure.error}
        </div>
      ) : null}

      {tab === "body" ? (
        source ? (
          <CodeEditor
            value={source.body || ""}
            language={detectBodyLang(source.headers)}
            readOnly
            height="320px"
          />
        ) : (
          <div className="response-empty">
            <p>Send a request to render the response.</p>
          </div>
        )
      ) : null}

      {tab === "headers" ? (
        source ? (
          <pre className="response-body">
            {Object.entries(source.headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")}
          </pre>
        ) : (
          <div className="response-empty">
            <p>No response headers yet.</p>
          </div>
        )
      ) : null}

      {tab === "tests" ? <TestResultsView results={testResults} /> : null}

      {tab === "history" ? (
        <div className="history-layout">
          <div className="history-column">
            <h4>Runs</h4>
            <div className="stack-list compact">
              {history.length === 0 ? (
                <p className="subtle">No runs yet.</p>
              ) : null}
              {history.map((entry) => (
                <button
                  key={entry.id}
                  className={`history-row ${activeHistoryId === entry.id ? "active" : ""}`}
                  onClick={() => {
                    setActiveExampleId(null);
                    setActiveHistoryId(entry.id);
                    setTab("body");
                  }}
                >
                  <span
                    className={`status-pill ${classifyStatusTone(entry.status)}`}
                  >
                    {entry.status}
                  </span>
                  <span className="subtle">{entry.durationMs} ms</span>
                  <span className="subtle">
                    {new Date(entry.createdAt).toLocaleTimeString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="history-column">
            <h4>Saved Examples</h4>
            <div className="stack-list compact">
              {props.request.examples.length === 0 ? (
                <p className="subtle">No saved examples.</p>
              ) : null}
              {props.request.examples.map((example) => (
                <button
                  key={example.exampleId}
                  className={`history-row ${activeExampleId === example.exampleId ? "active" : ""}`}
                  onClick={() => {
                    setActiveHistoryId(null);
                    setActiveExampleId(example.exampleId);
                    setTab("body");
                  }}
                >
                  <span
                    className={`status-pill ${classifyStatusTone(example.status)}`}
                  >
                    {example.status}
                  </span>
                  <span className="truncate">{example.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TestResultsView(props: { results: TestResult[] }): JSX.Element {
  if (props.results.length === 0) {
    return (
      <div className="response-empty">
        <p>No tests have run yet.</p>
        <p className="subtle">
          Write assertions on the Tests tab using pm.test(name, fn).
        </p>
      </div>
    );
  }
  const passed = props.results.filter((r) => r.passed).length;
  const failed = props.results.length - passed;
  return (
    <div>
      <div className="tr-summary">
        <span className="tr-pill pass">{passed} passed</span>
        {failed > 0 ? (
          <span className="tr-pill fail">{failed} failed</span>
        ) : null}
        <span className="subtle">of {props.results.length} total</span>
      </div>
      {props.results.map((result, i) => (
        <div className="tr-row" key={i}>
          <span
            className={`tr-status status-pill ${result.passed ? "ok" : "error"}`}
          >
            {result.passed ? "PASS" : "FAIL"}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="tr-name">{result.name}</div>
            {result.message ? (
              <div className="tr-msg">{result.message}</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────── Helpers ───────────

function collectMissingEnvironmentVars(
  request: RequestDraft,
  vars: Record<string, string>,
): string[] {
  const values: string[] = [request.url];
  values.push(...request.headers.flatMap((entry) => [entry.key, entry.value]));
  values.push(...request.query.flatMap((entry) => [entry.key, entry.value]));
  if (request.body.mode === "raw") {
    values.push(request.body.text);
    if (request.body.contentType) values.push(request.body.contentType);
  }
  if (request.auth.type === "bearer") values.push(request.auth.token);
  if (request.auth.type === "apiKey") {
    values.push(request.auth.key, request.auth.value);
  }
  if (request.auth.type === "basic") {
    values.push(request.auth.username, request.auth.password);
  }

  const used = new Set<string>();
  for (const value of values) {
    for (const match of value.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)) {
      used.add(match[1]);
    }
  }
  return Array.from(used).filter((key) => vars[key] === undefined);
}

function readBodyDraft(body: RequestBody): BodyDraft {
  if (body.mode === "none") {
    return {
      mode: "none",
      contentType: "application/json",
      rawText: "",
      graphqlQuery: "query { me { id name } }",
      graphqlVariables: "{}",
    };
  }
  const parsed = parseGraphqlPayload(body.text);
  if (parsed) {
    return {
      mode: "graphql",
      contentType: body.contentType ?? "application/json",
      rawText: body.text,
      graphqlQuery: parsed.query,
      graphqlVariables:
        parsed.variables === undefined ? "{}" : prettyJson(parsed.variables),
    };
  }
  return {
    mode: "raw",
    contentType: body.contentType ?? "application/json",
    rawText: body.text,
    graphqlQuery: "query { me { id name } }",
    graphqlVariables: "{}",
  };
}

function parseGraphqlPayload(
  value: string,
): { query: string; variables?: unknown } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(query|mutation|subscription)\b/.test(trimmed)) {
    return { query: trimmed };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isObject(parsed) || typeof parsed.query !== "string") return null;
    return { query: parsed.query, variables: parsed.variables };
  } catch {
    return null;
  }
}

function buildRequestBody(draft: BodyDraft): RequestBody {
  if (draft.mode === "none") return { mode: "none" };
  if (draft.mode === "raw") {
    return {
      mode: "raw",
      text: draft.rawText,
      contentType: draft.contentType || undefined,
    };
  }
  const payload: { query: string; variables?: unknown } = {
    query: draft.graphqlQuery || "query { me { id name } }",
  };
  if (draft.graphqlVariables.trim()) {
    payload.variables =
      safeParseJson(draft.graphqlVariables) ?? draft.graphqlVariables;
  }
  return {
    mode: "raw",
    contentType: "application/json",
    text: JSON.stringify(payload, null, 2),
  };
}

function classifyStatusTone(status: number): "ok" | "info" | "warn" | "error" {
  if (status >= 200 && status < 300) return "ok";
  if (status >= 300 && status < 400) return "info";
  if (status >= 400 && status < 500) return "warn";
  return "error";
}

function methodColor(method: RequestDraft["method"]): string {
  switch (method) {
    case "GET":
      return "var(--m-get)";
    case "POST":
      return "var(--m-post)";
    case "PUT":
      return "var(--m-put)";
    case "PATCH":
      return "var(--m-patch)";
    case "DELETE":
      return "var(--m-delete)";
    default:
      return "var(--m-head)";
  }
}

function describeAuthType(type: RequestAuth["type"]): string {
  if (type === "apiKey") return "Inject an API key into the request header or query.";
  if (type === "bearer") return "Attach a bearer token to the Authorization header.";
  if (type === "basic") return "Send username and password as HTTP Basic auth.";
  return "No auth metadata will be attached.";
}

function safeParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function prettyJson(value: unknown): string {
  if (typeof value === "string") {
    // Try to format if JSON
    const parsed = safeParseJson(value);
    if (parsed !== null && typeof parsed === "object") {
      return JSON.stringify(parsed, null, 2);
    }
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function detectBodyLang(
  headers: Record<string, string>,
): "json" | "text" {
  const ct = Object.entries(headers)
    .find(([k]) => k.toLowerCase() === "content-type")?.[1]
    ?.toLowerCase();
  if (ct?.includes("json")) return "json";
  return "text";
}
