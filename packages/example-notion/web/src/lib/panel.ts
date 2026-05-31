export const SIDEBAR_STORAGE_KEY = "orbit-notion:sidebar-width";
export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 480;
export const SIDEBAR_DEFAULT_WIDTH = 280;

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, width));
}

export function parseStoredSidebarWidth(raw: string | null): number {
  if (!raw) return SIDEBAR_DEFAULT_WIDTH;
  const parsed = Number.parseInt(raw, 10);
  return clampSidebarWidth(parsed);
}

export function computeNextSidebarWidth(
  startWidth: number,
  pointerDeltaX: number,
): number {
  return clampSidebarWidth(startWidth + pointerDeltaX);
}
