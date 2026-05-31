import React, { useCallback, useEffect, useRef, useState } from "react";
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

interface ResizeSession {
  startX: number;
  startWidth: number;
}

function ToastMessage({ message }: { message: string }): JSX.Element {
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}

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
  const resizeSessionRef = useRef<ResizeSession | null>(null);

  usePresenceSelectionSync();

  useEffect(() => {
    init().catch((error: unknown) => {
      showErrorToast(error, "Failed to initialize app");
    });
  }, [init]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const onSidebarPointerMove = useCallback((event: PointerEvent): void => {
    const session = resizeSessionRef.current;
    if (!session) return;

    const nextWidth = computeNextSidebarWidth(
      session.startWidth,
      event.clientX - session.startX,
    );
    setSidebarWidth(nextWidth);
  }, []);

  const stopSidebarResize = useCallback((): void => {
    if (!resizeSessionRef.current) return;

    resizeSessionRef.current = null;
    setIsResizingSidebar(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onSidebarPointerMove);
    window.removeEventListener("pointerup", stopSidebarResize);
    window.removeEventListener("pointercancel", stopSidebarResize);
  }, [onSidebarPointerMove]);

  useEffect(() => {
    return () => {
      stopSidebarResize();
    };
  }, [stopSidebarResize]);

  const startSidebarResize = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      event.preventDefault();

      resizeSessionRef.current = {
        startX: event.clientX,
        startWidth: sidebarWidth,
      };

      setIsResizingSidebar(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onSidebarPointerMove);
      window.addEventListener("pointerup", stopSidebarResize);
      window.addEventListener("pointercancel", stopSidebarResize);
    },
    [onSidebarPointerMove, sidebarWidth, stopSidebarResize],
  );

  if (!bootstrapped) {
    return <section className="login" />;
  }

  if (!auth) {
    return (
      <>
        <LoginView />
        {toast ? <ToastMessage message={toast.message} /> : null}
      </>
    );
  }

  return (
    <>
      <section
        id="app-view"
        className={cn(
          "relative flex h-full min-h-0 overflow-hidden",
          isResizingSidebar && "select-none",
        )}
      >
        <div
          className="h-full min-h-0 shrink-0"
          style={{ width: sidebarWidth }}
        >
          <Sidebar />
        </div>
        <button
          type="button"
          aria-label="Resize left panel"
          className="sidebar-resize-handle"
          onPointerDown={startSidebarResize}
        >
          <span
            className={cn(
              "sidebar-resize-handle-line",
              isResizingSidebar
                ? "sidebar-resize-handle-line-active"
                : "sidebar-resize-handle-line-idle",
            )}
          />
        </button>
        <div className="min-h-0 min-w-0 flex-1">
          <EditorPane />
        </div>
      </section>
      {toast ? <ToastMessage message={toast.message} /> : null}
    </>
  );
}
