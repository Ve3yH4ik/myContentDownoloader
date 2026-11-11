import type { Project } from "../core/schema";
import type { RunResult } from "../core/engine";
export type WindowKind =
  "settings" | "template" | "scanner" | "boundaries" | "report" | "projects";
export interface ReportEntry {
  url: string;
  status: "ok" | "error";
  rows: number;
  durationMs: number;
  message: string;
  time: string;
}
export interface SessionState {
  project: Project;
  result?: RunResult;
  busy: boolean;
  status: string;
  history: ReportEntry[];
}
export interface Version {
  id: number;
  name: string;
  saved_at: string;
}
export interface DownloaderApi {
  state(): Promise<SessionState>;
  subscribe(listener: (state: SessionState) => void): () => void;
  patch(patch: Partial<Project>): Promise<void>;
  replace(project: unknown): Promise<void>;
  window(kind: WindowKind): Promise<void>;
  run(project: unknown): Promise<RunResult>;
  runQueue(): Promise<void>;
  stop(): Promise<void>;
  save(project: unknown): Promise<number>;
  list(): Promise<Version[]>;
  open(id: number): Promise<Project>;
  scan(url: string, sameOrigin: boolean): Promise<string[]>;
  preview(template: string): Promise<string>;
  export(content: string, format: "csv" | "json"): Promise<boolean>;
}
declare global {
  interface Window {
    downloader: DownloaderApi;
  }
}
