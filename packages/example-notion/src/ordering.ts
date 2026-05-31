import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

export type OrderKey = string;

export function orderKeyBetween(
  before: OrderKey | null,
  after: OrderKey | null,
): OrderKey {
  return generateKeyBetween(before, after);
}

export function orderKeyAfter(before: OrderKey | null): OrderKey {
  return generateKeyBetween(before, null);
}

export function orderKeyBefore(after: OrderKey | null): OrderKey {
  return generateKeyBetween(null, after);
}

export function orderKeysBetween(
  before: OrderKey | null,
  after: OrderKey | null,
  count: number,
): OrderKey[] {
  if (count <= 0) return [];
  return generateNKeysBetween(before, after, count);
}

export function compareOrderKeys(a: OrderKey, b: OrderKey): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
