import { describe, expect, it } from "vitest";
import { mergeIncomingBlock } from "./block-merge";

describe("mergeIncomingBlock", () => {
  it("keeps incoming block when local text is not newer", () => {
    const incoming = { id: "b1", text: "server" };
    const result = mergeIncomingBlock(incoming, { id: "b1", text: "local" }, undefined, undefined);
    expect(result).toEqual(incoming);
  });

  it("prefers pending local text over stale incoming text", () => {
    const incoming = { id: "b1", text: "server" };
    const result = mergeIncomingBlock(incoming, { id: "b1", text: "local" }, "draft", undefined);
    expect(result.text).toBe("draft");
  });

  it("falls back to in-flight text when pending text is absent", () => {
    const incoming = { id: "b1", text: "server" };
    const result = mergeIncomingBlock(incoming, { id: "b1", text: "local" }, undefined, "in-flight");
    expect(result.text).toBe("in-flight");
  });
});
