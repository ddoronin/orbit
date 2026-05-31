import React from "react";
import { Button } from "../../../components/ui/button";
import { Separator } from "../../../components/ui/separator";
import { initials } from "../helpers";
import { showErrorToast, useAppStore } from "../store";

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
        <div className="workspace-name">{workspace?.name ?? "Workspace"}</div>
        <Button
          variant="ghost"
          className="w-full justify-start px-2 text-sm"
          onClick={() => {
            createPage().catch((error) => {
              showErrorToast(error, "Failed to create page");
            });
          }}
        >
          + New page
        </Button>
      </div>

      <nav className="page-list">
        {pages.length === 0 ? (
          <div
            className="ghost"
            style={{ color: "var(--text-faint)", padding: "6px 10px" }}
          >
            No pages yet
          </div>
        ) : (
          pages.map((page) => (
            <button
              key={page.pageId}
              className={`page-item${currentPageId === page.pageId ? " active" : ""}`}
              onClick={() => {
                openPage(page.pageId).catch((error) => {
                  showErrorToast(error, "Failed to open page");
                });
              }}
            >
              <span className="page-icon">P</span>
              <span>{page.title || "Untitled"}</span>
            </button>
          ))
        )}
      </nav>
    </aside>
  );
}
