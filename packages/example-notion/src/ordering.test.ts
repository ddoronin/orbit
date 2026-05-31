import { describe, expect, it } from "vitest";
import {
  compareOrderKeys,
  orderKeyAfter,
  orderKeyBefore,
  orderKeyBetween,
  orderKeysBetween,
} from "./ordering.js";

describe("ordering", () => {
  it("generates a key between null boundaries", () => {
    const key = orderKeyBetween(null, null);
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  it("generates a key after another key", () => {
    const first = orderKeyBetween(null, null);
    const second = orderKeyAfter(first);
    expect(compareOrderKeys(first, second)).toBeLessThan(0);
  });

  it("generates a key before another key", () => {
    const last = orderKeyBetween(null, null);
    const first = orderKeyBefore(last);
    expect(compareOrderKeys(first, last)).toBeLessThan(0);
  });

  it("generates stable keys between neighbors", () => {
    const left = orderKeyBetween(null, null);
    const right = orderKeyAfter(left);
    const middle = orderKeyBetween(left, right);

    expect(compareOrderKeys(left, middle)).toBeLessThan(0);
    expect(compareOrderKeys(middle, right)).toBeLessThan(0);
  });

  it("can generate many keys between neighbors", () => {
    const left = orderKeyBetween(null, null);
    const right = orderKeyAfter(left);
    const keys = orderKeysBetween(left, right, 5);

    expect(keys).toHaveLength(5);
    expect(compareOrderKeys(left, keys[0]!)).toBeLessThan(0);
    expect(compareOrderKeys(keys[4]!, right)).toBeLessThan(0);

    for (let i = 1; i < keys.length; i += 1) {
      expect(compareOrderKeys(keys[i - 1]!, keys[i]!)).toBeLessThan(0);
    }
  });
});
