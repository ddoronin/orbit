import type { BlockType } from "./types";

export const STORAGE_KEY = "orbit-notion:auth";
export const BLOCK_SAVE_DEBOUNCE_MS = 50;

export const PRESENCE_COLORS = [
  "#e03e3e",
  "#d9730d",
  "#dfab01",
  "#0f7b6c",
  "#0b6e99",
  "#6940a5",
  "#ad1a72",
];

export const BLOCK_TYPES: Array<{
  type: BlockType;
  label: string;
  placeholder: string;
}> = [
  { type: "paragraph", label: "Text", placeholder: "Type '/' for commands" },
  { type: "heading_1", label: "Heading 1", placeholder: "Heading 1" },
  { type: "heading_2", label: "Heading 2", placeholder: "Heading 2" },
  { type: "heading_3", label: "Heading 3", placeholder: "Heading 3" },
  { type: "todo", label: "To-do", placeholder: "To-do" },
  { type: "bulleted_list", label: "Bulleted list", placeholder: "List item" },
  { type: "numbered_list", label: "Numbered list", placeholder: "List item" },
  { type: "quote", label: "Quote", placeholder: "Empty quote" },
  { type: "code", label: "Code", placeholder: "code" },
  { type: "divider", label: "Divider", placeholder: "" },
];
