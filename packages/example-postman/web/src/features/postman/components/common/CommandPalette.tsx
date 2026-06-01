import { useEffect, useMemo, useRef, useState } from "react";
import type { CollectionState, FolderNode } from "../../types";
import { usePostmanStore } from "../../store";

interface Entry {
  kind: "collection" | "folder" | "request" | "env";
  label: string;
  detail?: string;
  method?: string;
  onSelect: () => void;
}

export function CommandPalette(): JSX.Element | null {
  const open = usePostmanStore((s) => s.paletteOpen);
  const setPaletteOpen = usePostmanStore((s) => s.setPaletteOpen);
  const collections = usePostmanStore((s) => s.collections);
  const activeCollection = usePostmanStore((s) => s.activeCollection);
  const workspace = usePostmanStore((s) => s.workspace);
  const selectCollection = usePostmanStore((s) => s.selectCollection);
  const selectRequest = usePostmanStore((s) => s.selectRequest);
  const setSidebarPane = usePostmanStore((s) => s.setSidebarPane);

  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [];
    for (const summary of collections) {
      list.push({
        kind: "collection",
        label: summary.name,
        onSelect: () => void selectCollection(summary.collectionId),
      });
    }
    if (activeCollection) {
      collectFromCollection(activeCollection, list, (id) =>
        selectRequest(id),
      );
    }
    if (workspace) {
      for (const [key, value] of Object.entries(workspace.environmentVariables)) {
        list.push({
          kind: "env",
          label: key,
          detail: value,
          onSelect: () => setSidebarPane("environments"),
        });
      }
    }
    return list;
  }, [collections, activeCollection, workspace]);

  const filtered = useMemo(() => {
    if (!q.trim()) return entries.slice(0, 60);
    const needle = q.toLowerCase();
    return entries
      .filter(
        (entry) =>
          entry.label.toLowerCase().includes(needle) ||
          entry.detail?.toLowerCase().includes(needle) ||
          entry.method?.toLowerCase().includes(needle),
      )
      .slice(0, 60);
  }, [entries, q]);

  useEffect(() => {
    setCursor(0);
  }, [q]);

  if (!open) return null;

  function close() {
    setPaletteOpen(false);
  }

  return (
    <div
      className="pm-cmdk-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="pm-cmdk" role="dialog">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search collections, folders, requests, env vars…"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, filtered.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const pick = filtered[cursor];
              if (pick) {
                pick.onSelect();
                close();
              }
              return;
            }
          }}
        />
        {filtered.length === 0 ? (
          <div className="pm-cmdk-empty">No matches.</div>
        ) : (
          <ul className="pm-cmdk-list">
            {filtered.map((entry, i) => (
              <li
                key={`${entry.kind}:${entry.label}:${i}`}
                className={`pm-cmdk-item ${i === cursor ? "active" : ""}`}
                onMouseEnter={() => setCursor(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  entry.onSelect();
                  close();
                }}
              >
                {entry.method ? (
                  <span
                    className={`method-pill method-${entry.method.toLowerCase()}`}
                  >
                    {entry.method}
                  </span>
                ) : null}
                <span className="truncate" style={{ minWidth: 0, flex: 1 }}>
                  {entry.label}
                </span>
                {entry.detail ? (
                  <span className="subtle truncate" style={{ maxWidth: 200 }}>
                    {entry.detail}
                  </span>
                ) : null}
                <span className="kind">{entry.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function collectFromCollection(
  collection: CollectionState,
  out: Entry[],
  onSelectRequest: (id: string) => void,
): void {
  for (const requestId of collection.rootRequestIds) {
    const req = collection.requests[requestId];
    if (!req) continue;
    out.push({
      kind: "request",
      label: req.name,
      detail: req.url,
      method: req.method,
      onSelect: () => onSelectRequest(req.requestId),
    });
  }
  for (const folderId of collection.rootFolderIds) {
    walkFolder(collection, folderId, out, onSelectRequest);
  }
}

function walkFolder(
  collection: CollectionState,
  folderId: string,
  out: Entry[],
  onSelectRequest: (id: string) => void,
): void {
  const folder: FolderNode | undefined = collection.folders[folderId];
  if (!folder) return;
  out.push({
    kind: "folder",
    label: folder.name,
    onSelect: () => undefined,
  });
  for (const requestId of folder.requestIds) {
    const req = collection.requests[requestId];
    if (!req) continue;
    out.push({
      kind: "request",
      label: req.name,
      detail: req.url,
      method: req.method,
      onSelect: () => onSelectRequest(req.requestId),
    });
  }
  for (const childId of folder.folderIds) {
    walkFolder(collection, childId, out, onSelectRequest);
  }
}
