import { useEffect } from "react";
import { clamp } from "./helpers";
import { schedulePresenceUpdate, useAppStore } from "./store";
import type { PresenceEntry } from "./types";

function getTextNodes(root: Element): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

function locateCaret(
  body: Element,
  offset: number | null,
): { left: number; top: number; height: number } {
  const bodyRect = body.getBoundingClientRect();
  const textNodes = getTextNodes(body);
  if (textNodes.length === 0) {
    return { left: 0, top: 2, height: Math.max(18, bodyRect.height || 20) };
  }

  const totalLength = body.textContent?.length ?? 0;
  const target = clamp(offset ?? 0, 0, totalLength);
  let remaining = target;
  let node = textNodes[textNodes.length - 1];
  let nodeOffset = node.textContent?.length ?? 0;

  for (const textNode of textNodes) {
    const length = textNode.textContent?.length ?? 0;
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
      rect.height ||
        parseFloat(getComputedStyle(body as HTMLElement).lineHeight) ||
        20,
    ),
  };
}

function resolveTextPosition(
  root: Element,
  targetOffset: number,
): { node: Text; offset: number } | null {
  const textNodes = getTextNodes(root);
  if (textNodes.length === 0) return null;

  const totalLength = root.textContent?.length ?? 0;
  let remaining = clamp(targetOffset, 0, totalLength);

  for (const textNode of textNodes) {
    const length = textNode.textContent?.length ?? 0;
    if (remaining <= length) {
      return { node: textNode, offset: remaining };
    }
    remaining -= length;
  }

  const last = textNodes[textNodes.length - 1];
  return { node: last, offset: last.textContent?.length ?? 0 };
}

function createRangeFromOffsets(
  body: Element,
  startOffset: number | null,
  endOffset: number | null,
): Range | null {
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

function withAlpha(color: string, alphaHex: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${alphaHex}`;
  return color;
}

function renderRemotePresence(): void {
  document
    .querySelectorAll(".remote-selection")
    .forEach((node) => node.remove());
  document.querySelectorAll(".remote-cursor").forEach((node) => node.remove());

  const { currentPage, presence, auth } = useAppStore.getState();
  if (!currentPage || !auth) return;

  const entriesByBlock = new Map<string, PresenceEntry[]>();
  for (const entry of Object.values(presence)) {
    if (entry.userId === auth.userId || !entry.cursorBlockId) continue;
    const list = entriesByBlock.get(entry.cursorBlockId) ?? [];
    list.push(entry);
    entriesByBlock.set(entry.cursorBlockId, list);
  }

  for (const [blockId, entries] of entriesByBlock.entries()) {
    const block = document.querySelector(`.block[data-block-id="${blockId}"]`);
    const body = block?.querySelector(".block-body");
    if (!block || !body) continue;

    entries.forEach((entry, index) => {
      const range = createRangeFromOffsets(
        body,
        entry.selectionStartOffset,
        entry.selectionEndOffset,
      );
      if (range) {
        const blockRect = block.getBoundingClientRect();
        const rects = Array.from(range.getClientRects());
        for (const rect of rects) {
          const selection = document.createElement("div");
          selection.className = "remote-selection";
          selection.style.left = `${rect.left - blockRect.left}px`;
          selection.style.top = `${rect.top - blockRect.top}px`;
          selection.style.width = `${Math.max(1, rect.width)}px`;
          selection.style.height = `${Math.max(2, rect.height)}px`;
          selection.style.background = withAlpha(entry.color, "33");
          block.append(selection);
        }
      }

      const position = locateCaret(body, entry.cursorOffset);
      const blockRect = block.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      const marker = document.createElement("div");
      marker.className = "remote-cursor";
      marker.title = `${entry.displayName} is here`;
      marker.style.setProperty("--cursor-color", entry.color);
      marker.style.left = `${bodyRect.left - blockRect.left + position.left + index * 8}px`;
      marker.style.top = `${bodyRect.top - blockRect.top + position.top}px`;
      marker.style.height = `${position.height}px`;

      const label = document.createElement("span");
      label.className = "remote-cursor-label";
      label.textContent = entry.displayName;
      marker.append(label);
      block.append(marker);
    });
  }
}

export function useRemotePresenceRenderer(): void {
  const pageId = useAppStore((state) => state.currentPage?.pageId ?? null);
  const version = useAppStore((state) => state.currentPage?.version ?? 0);
  const presence = useAppStore((state) => state.presence);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      renderRemotePresence();
    });
    return () => cancelAnimationFrame(frame);
  }, [pageId, version, presence]);

  useEffect(() => {
    const rerender = () => renderRemotePresence();
    window.addEventListener("resize", rerender);
    window.addEventListener("scroll", rerender, true);
    return () => {
      window.removeEventListener("resize", rerender);
      window.removeEventListener("scroll", rerender, true);
    };
  }, []);
}

export function usePresenceSelectionSync(): void {
  useEffect(() => {
    const onSelectionChange = () => {
      const active = document.activeElement;
      if (!active?.classList?.contains("block-body")) return;
      schedulePresenceUpdate();
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, []);
}
