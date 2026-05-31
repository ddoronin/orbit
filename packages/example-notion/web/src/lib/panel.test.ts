import { describe, expect, it } from "vitest";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  computeNextSidebarWidth,
  parseStoredSidebarWidth,
} from "./panel";

describe("panel helpers", () => {
  it("clamps sidebar width within allowed range", () => {
    expect(clampSidebarWidth(SIDEBAR_MIN_WIDTH - 50)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(SIDEBAR_MAX_WIDTH + 50)).toBe(SIDEBAR_MAX_WIDTH);
    expect(clampSidebarWidth(300)).toBe(300);
  });

  it("parses storage values and falls back to default", () => {
    expect(parseStoredSidebarWidth(null)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(parseStoredSidebarWidth("not-a-number")).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(parseStoredSidebarWidth("350")).toBe(350);
  });

  it("computes next width from drag delta with clamping", () => {
    expect(computeNextSidebarWidth(280, 30)).toBe(310);
    expect(computeNextSidebarWidth(280, -1000)).toBe(SIDEBAR_MIN_WIDTH);
    expect(computeNextSidebarWidth(280, 1000)).toBe(SIDEBAR_MAX_WIDTH);
  });
});
