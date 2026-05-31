export type BlockType =
  | "page"
  | "paragraph"
  | "heading"
  | "quote"
  | "callout"
  | "divider"
  | "bulleted_list"
  | "numbered_list"
  | "todo"
  | "toggle"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "embed"
  | "code"
  | "equation"
  | "table"
  | "link_to_page"
  | "synced_block"
  | "breadcrumb"
  | "table_of_contents"
  | "database";

export type Mention =
  | { type: "user"; id: string }
  | { type: "page"; id: string }
  | { type: "date"; date: string };

export interface RichTextAnnotations {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  color?: string;
}

export interface RichTextSegment {
  text: string;
  annotations: RichTextAnnotations;
  href?: string;
  mention?: Mention;
  equation?: { expression: string };
}

export type RichText = RichTextSegment[];

export interface Block {
  id: string;
  type: BlockType;
  parentId: string | null;
  order: string;
  properties: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  archived?: boolean;
}

export interface CreateBlockInput {
  type: BlockType;
  parentId: string | null;
  afterBlockId?: string | null;
  properties?: Record<string, unknown>;
}

export interface UpdateBlockInput {
  id: string;
  properties: Record<string, unknown>;
}

export interface MoveBlockInput {
  id: string;
  newParentId: string | null;
  afterBlockId?: string | null;
}

export interface DeleteBlockInput {
  id: string;
}

export interface DuplicateBlockInput {
  id: string;
}

export interface BlockMutationResult {
  block: Block;
  version: number;
}
