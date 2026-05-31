import React, { useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Separator } from "../../../components/ui/separator";
import { initials } from "../helpers";
import { showErrorToast, useAppStore } from "../store";

function PageDocumentIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="page-icon-glyph"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.5 3.75h5.9l3.6 3.6v10.9a2 2 0 0 1-2 2h-7.5a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2Z" />
      <path d="M14.4 3.75v3.6h3.6" />
      <path d="M9.4 11.2h5.4" />
      <path d="M9.4 14.4h5.4" />
    </svg>
  );
}

export function Sidebar(): JSX.Element {
  const auth = useAppStore((state) => state.auth);
  const workspace = useAppStore((state) => state.workspace);
  const pages = useAppStore((state) => state.pages);
  const currentPageId = useAppStore(
    (state) => state.currentPage?.pageId ?? null,
  );
  const openPage = useAppStore((state) => state.openPage);
  const createPage = useAppStore((state) => state.createPage);
  const logout = useAppStore((state) => state.logout);
  const [query, setQuery] = useState("");

  const filteredPages = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return pages;
    return pages.filter((page) =>
      (page.title || "Untitled").toLowerCase().includes(term),
    );
  }, [pages, query]);

  const formatUpdatedAt = (updatedAt: number): string => {
    return new Date(updatedAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="me">
          <span
            className="avatar"
            style={{ background: auth?.color ?? "#888" }}
          >
            {initials(auth?.displayName ?? "?")}
          </span>
          <span className="me-name">{auth?.displayName ?? ""}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          title="Log out"
          onClick={() => logout().catch(() => {})}
        >
          Sign out
        </Button>
      </div>

      <Separator />

      <div className="workspace-section">
        <div className="workspace-name-row">
          <div className="workspace-name">{workspace?.name ?? "Workspace"}</div>
          <div className="workspace-count">{pages.length} pages</div>
        </div>
        <Button
          variant="ghost"
          className="sidebar-create-btn w-full justify-start px-2 text-sm"
          onClick={() => {
            createPage().catch((error) => {
              showErrorToast(error, "Failed to create page");
            });
          }}
        >
          + New page
        </Button>

        <label className="sidebar-search-wrap" aria-label="Search pages">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="sidebar-search"
            placeholder="Search pages"
          />
        </label>
      </div>

      <nav className="page-list">
        {pages.length === 0 ? (
          <div
            className="ghost"
            style={{ color: "var(--text-faint)", padding: "6px 10px" }}
          >
            No pages yet
          </div>
        ) : filteredPages.length === 0 ? (
          <div className="ghost sidebar-empty-state">No matching pages</div>
        ) : (
          filteredPages.map((page) => (
            <button
              key={page.pageId}
              className={`page-item${currentPageId === page.pageId ? " active" : ""}`}
              onClick={() => {
                openPage(page.pageId).catch((error) => {
                  showErrorToast(error, "Failed to open page");
                });
              }}
            >
              <span className="page-icon">
                <PageDocumentIcon />
              </span>
              <span className="page-item-main">
                <span className="page-item-title">
                  {page.title || "Untitled"}
                </span>
                <span className="page-item-meta">
                  Edited {formatUpdatedAt(page.updatedAt)}
                </span>
              </span>
            </button>
          ))
        )}
      </nav>
    </aside>
  );
}
