import { BLOCK_TYPES, PRESENCE_COLORS } from "./constants";
import type { BlockType } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function initials(name: string): string {
  const parsed = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return parsed || "?";
}

export function colorForUser(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length];
}

export function getBlockTypeConfig(type: BlockType): {
  type: BlockType;
  label: string;
  placeholder: string;
} {
  return BLOCK_TYPES.find((entry) => entry.type === type) ?? BLOCK_TYPES[0];
}
