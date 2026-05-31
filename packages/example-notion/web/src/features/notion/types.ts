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
  children: string[];
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

export interface WorkspaceState {
  workspaceId: string;
  name: string;
  ownerId: string;
  members: Record<string, string>;
  pages: Record<string, PageSummary>;
  rootPageIds: string[];
  createdAt: number;
}

export interface PageSummary {
  pageId: string;
  title: string;
  icon: string | null;
  updatedAt: number;
  parentPageId: string | null;
}

export interface Session {
  userId: string;
  displayName: string;
}

export interface AuthState extends Session {
  token: string;
  color: string;
}

export interface TypeMenuState {
  blockId: string;
  top: number;
  left: number;
  fromSlash: boolean;
}

export interface ToastState {
  id: number;
  message: string;
}

export interface AppStore {
  auth: AuthState | null;
  workspace: WorkspaceState | null;
  pages: PageSummary[];
  currentPage: PageState | null;
  presence: Record<string, PresenceEntry>;
  bootstrapped: boolean;
  isBusy: boolean;
  toast: ToastState | null;
  typeMenu: TypeMenuState | null;
  init: () => Promise<void>;
  login: (displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshPageList: () => Promise<void>;
  createPage: () => Promise<void>;
  openPage: (pageId: string) => Promise<void>;
  setPageTitle: (title: string) => Promise<void>;
  addBlock: (
    type?: BlockType,
    afterBlockId?: string | null,
    text?: string,
    focusAt?: "start" | "end",
  ) => Promise<Block>;
  updateBlock: (blockId: string, patch: Partial<Block>) => Promise<void>;
  deleteBlock: (blockId: string) => Promise<void>;
  setTypeMenu: (menu: TypeMenuState | null) => void;
  showToast: (message: string, ms?: number) => void;
  applySocketMessage: (raw: string) => void;
}
