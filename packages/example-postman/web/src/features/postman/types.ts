export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export interface KeyValueEntry {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export type RequestAuth =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "apiKey"; key: string; value: string; in: "header" | "query" }
  | { type: "basic"; username: string; password: string };

export type RequestBody =
  | { mode: "none" }
  | { mode: "raw"; text: string; contentType?: string };

export interface ResponseExample {
  exampleId: string;
  name: string;
  status: number;
  headers: Record<string, string>;
  bodyText: string;
  durationMs: number;
  createdAt: number;
}

export interface RequestDraft {
  requestId: string;
  name: string;
  method: HttpMethod;
  url: string;
  folderId: string | null;
  headers: KeyValueEntry[];
  query: KeyValueEntry[];
  body: RequestBody;
  auth: RequestAuth;
  examples: ResponseExample[];
  preRequestScript?: string;
  testScript?: string;
  updatedAt: number;
  createdAt: number;
}

export interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}

export interface FolderNode {
  folderId: string;
  name: string;
  parentFolderId: string | null;
  folderIds: string[];
  requestIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CollectionState {
  collectionId: string;
  workspaceId: string;
  name: string;
  folders: Record<string, FolderNode>;
  requests: Record<string, RequestDraft>;
  rootFolderIds: string[];
  rootRequestIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CollectionSummary {
  collectionId: string;
  name: string;
  updatedAt: number;
}

export interface WorkspaceState {
  workspaceId: string;
  name: string;
  ownerId: string;
  members: Record<string, "owner" | "editor" | "viewer">;
  collections: Record<string, CollectionSummary>;
  rootCollectionIds: string[];
  environmentVariables: Record<string, string>;
  createdAt: number;
}

export interface Session {
  userId: string;
  displayName: string;
}

export interface ExecuteResponse {
  requestId: string;
  method: HttpMethod;
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyText: string;
  jsonBody: unknown;
  durationMs: number;
  size: number;
  createdAt: number;
}

export interface ExecuteFailure {
  requestId: string;
  method: HttpMethod;
  url: string;
  error: string;
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  workspaceId: string;
  collectionId: string;
  requestId: string;
  method: HttpMethod;
  url: string;
  status: number;
  durationMs: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
  createdAt: number;
}
