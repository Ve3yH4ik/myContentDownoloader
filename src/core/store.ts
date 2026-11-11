import { DatabaseSync } from "node:sqlite";
import { projectSchema, type Project } from "./schema";

export class ProjectStore {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, config TEXT NOT NULL, saved_at TEXT NOT NULL)",
    );
  }
  save(input: unknown): number {
    const project = projectSchema.parse(input);
    const info = this.db
      .prepare("INSERT INTO projects(name,config,saved_at) VALUES (?,?,?)")
      .run(project.name, JSON.stringify(project), new Date().toISOString());
    return Number(info.lastInsertRowid);
  }
  list(): { id: number; name: string; saved_at: string }[] {
    return this.db
      .prepare(
        "SELECT id,name,saved_at FROM projects ORDER BY id DESC LIMIT 100",
      )
      .all() as { id: number; name: string; saved_at: string }[];
  }
  open(id: number): Project {
    const row = this.db
      .prepare("SELECT config FROM projects WHERE id=?")
      .get(id);
    if (!row) throw new Error("Project version not found");
    return projectSchema.parse(JSON.parse(String(row.config)));
  }
  close() {
    this.db.close();
  }
}
