import React, { useEffect, useState } from "react";
import { cn } from "../../../lib/utils";
import {
  SIDEBAR_STORAGE_KEY,
  computeNextSidebarWidth,
  parseStoredSidebarWidth,
} from "../../../lib/panel";
import { usePresenceSelectionSync } from "../realtime";
import { showErrorToast, useAppStore } from "../store";
import { EditorPane } from "./EditorPane";
import { LoginView } from "./LoginView";
import { Sidebar } from "./Sidebar";

export function NotionApp(): JSX.Element {
  const init = useAppStore((state) => state.init);
  const auth = useAppStore((state) => state.auth);
  const bootstrapped = useAppStore((state) => state.bootstrapped);
  const toast = useAppStore((state) => state.toast);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    parseStoredSidebarWidth(
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(SIDEBAR_STORAGE_KEY),
    ),
  );
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  usePresenceSelectionSync();

  useEffect(() => {
    init().catch((error) => {
      showErrorToast(error, "Failed to initialize app");
    });
  }, [init]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const startSidebarResize = (
    event: React.PointerEvent<HTMLButtonElement>,
  ): void => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    setIsResizingSidebar(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (moveEvent: PointerEvent) => {
      const nextWidth = computeNextSidebarWidth(
        startWidth,
        moveEvent.clientX - startX,
      );
      setSidebarWidth(nextWidth);
    };

    const onUp = () => {
      setIsResizingSidebar(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (!bootstrapped) {
    return <section className="login" />;
  }

  if (!auth) {
    return (
      <>
        <LoginView />
        {toast ? <div className="toast">{toast.message}</div> : null}
      </>
    );
  }

  return (
    <>
      <section
        id="app-view"
        className={cn(
          "relative flex h-full",
          isResizingSidebar && "select-none",
        )}
      >
        <div className="h-full shrink-0" style={{ width: sidebarWidth }}>
          <Sidebar />
        </div>
        <button
          type="button"
          aria-label="Resize left panel"
          className="group relative h-full w-2 cursor-col-resize bg-transparent"
          onPointerDown={startSidebarResize}
        >
          <span
            className={cn(
              "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-zinc-200 transition-colors",
              isResizingSidebar ? "bg-zinc-400" : "group-hover:bg-zinc-300",
            )}
          />
        </button>
        <div className="min-w-0 flex-1">
          <EditorPane />
        </div>
      </section>
      {toast ? <div className="toast">{toast.message}</div> : null}
    </>
  );
}
