export type BlockType =
  | "paragraph"
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "todo"
  | "bulleted_list"
  | "numbered_list"
  | "code"
  | "quote"
  | "divider";

export interface Block {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean;
  language?: string;
  color?: string | null;
  backgroundColor?: string | null;
  parentId: string | null;
  order: string;
  archived?: boolean;
  children: string[];
}

export interface PageState {
  pageId: string;
  workspaceId: string | null;
  title: string;
  icon: string | null;
  blocks: Record<string, Block>;
  rootBlockIds: string[];
  version: number;
  createdAt: number;
  updatedAt: number;
  presence: Record<string, PresenceEntry>;
}

export interface PresenceEntry {
  userId: string;
  displayName: string;
  color: string;
  cursorBlockId: string | null;
  cursorOffset: number | null;
  selectionStartOffset: number | null;
  selectionEndOffset: number | null;
  lastSeen: number;
}

export interface PageSummary {
  pageId: string;
  title: string;
  icon: string | null;
  updatedAt: number;
  parentPageId: string | null;
}

export type MemberRole = "owner" | "editor" | "commenter" | "viewer";

export const SHARED_WORKSPACE_ID = "shared-docs";
export const SHARED_WORKSPACE_NAME = "Shared docs";

export interface WorkspaceState {
  workspaceId: string;
  name: string;
  ownerId: string;
  members: Record<string, MemberRole>;
  pages: Record<string, PageSummary>;
  rootPageIds: string[];
  createdAt: number;
}

export interface Session {
  userId: string;
  displayName: string;
}

export interface LoginAuditEvent {
  id: string;
  userId: string;
  displayName: string;
  createdAt: number;
}
