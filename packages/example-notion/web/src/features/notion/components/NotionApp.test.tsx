/** @vitest-environment jsdom */

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SIDEBAR_DEFAULT_WIDTH, SIDEBAR_STORAGE_KEY } from "../../../lib/panel";
import type { AuthState, ToastState } from "../types";
import { NotionApp } from "./NotionApp";

const { state, showErrorToastMock, usePresenceSelectionSyncMock } = vi.hoisted(
  () => ({
    state: {
      init: vi.fn<() => Promise<void>>(),
      auth: null as AuthState | null,
      bootstrapped: true,
      toast: null as ToastState | null,
    },
    showErrorToastMock: vi.fn<(error: unknown, fallback: string) => void>(),
    usePresenceSelectionSyncMock: vi.fn<() => void>(),
  }),
);

vi.mock("../store", () => ({
  useAppStore: (selector: (store: typeof state) => unknown) => selector(state),
  showErrorToast: showErrorToastMock,
}));

vi.mock("../realtime", () => ({
  usePresenceSelectionSync: usePresenceSelectionSyncMock,
}));

vi.mock("./Sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));

vi.mock("./EditorPane", () => ({
  EditorPane: () => <div data-testid="editor-pane">Editor</div>,
}));

vi.mock("./LoginView", () => ({
  LoginView: () => <div data-testid="login-view">Login</div>,
}));

describe("NotionApp", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    state.init.mockReset();
    state.init.mockResolvedValue(undefined);
    state.bootstrapped = true;
    state.auth = {
      userId: "u1",
      displayName: "Alice",
      token: "token",
      color: "#000000",
    };
    state.toast = null;
    showErrorToastMock.mockReset();
    usePresenceSelectionSyncMock.mockReset();
    localStorage.clear();
  });

  it("calls init on mount", async () => {
    render(<NotionApp />);

    await waitFor(() => {
      expect(state.init).toHaveBeenCalledTimes(1);
    });
    expect(usePresenceSelectionSyncMock).toHaveBeenCalledTimes(1);
  });

  it("renders login view when bootstrapped but unauthenticated", () => {
    state.auth = null;
    state.toast = { id: 1, message: "Please log in" };

    render(<NotionApp />);

    expect(screen.getByTestId("login-view")).toBeTruthy();
    expect(screen.getByText("Please log in")).toBeTruthy();
  });

  it("renders loading shell while app is bootstrapping", () => {
    state.bootstrapped = false;
    const { container } = render(<NotionApp />);

    expect(container.querySelector("section.login")).toBeTruthy();
    expect(screen.queryByTestId("editor-pane")).toBeNull();
  });

  it("reports initialization errors", async () => {
    const error = new Error("init failed");
    state.init.mockRejectedValueOnce(error);

    render(<NotionApp />);

    await waitFor(() => {
      expect(showErrorToastMock).toHaveBeenCalledWith(
        error,
        "Failed to initialize app",
      );
    });
  });

  it("resizes sidebar on pointer drag and persists width", () => {
    const { container } = render(<NotionApp />);

    const appView = container.querySelector("#app-view") as HTMLElement;
    const sidebarContainer = screen.getByTestId("sidebar")
      .parentElement as HTMLElement;
    const resizeHandle = screen.getByRole("button", {
      name: /resize left panel/i,
    });

    expect(sidebarContainer.style.width).toBe(`${SIDEBAR_DEFAULT_WIDTH}px`);

    fireEvent.pointerDown(resizeHandle, { clientX: 200 });
    expect(appView.className.includes("select-none")).toBe(true);

    fireEvent.pointerMove(window, { clientX: 260 });
    expect(sidebarContainer.style.width).toBe(
      `${SIDEBAR_DEFAULT_WIDTH + 60}px`,
    );
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe(
      String(SIDEBAR_DEFAULT_WIDTH + 60),
    );

    fireEvent.pointerUp(window);
    expect(appView.className.includes("select-none")).toBe(false);
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });
});
