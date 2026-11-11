import { safeStorage } from "electron";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
export class SecretVault {
  private data: Record<string, string> = {};
  constructor(private path: string) {
    try {
      this.data = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  async set(id: string, value: string) {
    if (
      !/^[a-zA-Z0-9_-]{1,100}$/.test(id) ||
      ["__proto__", "prototype", "constructor"].includes(id)
    )
      throw new Error("Invalid secret ID");
    this.data[id] = (await safeStorage.encryptStringAsync(value)).toString(
      "base64",
    );
    this.flush();
  }
  async get(id: string) {
    if (!id) return "";
    if (!Object.hasOwn(this.data, id)) throw new Error("Secret not found");
    return (
      await safeStorage.decryptStringAsync(Buffer.from(this.data[id], "base64"))
    ).result;
  }
  list() {
    return Object.keys(this.data);
  }
  remove(id: string) {
    delete this.data[id];
    this.flush();
  }
  private flush() {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = this.path + ".tmp";
    writeFileSync(temp, JSON.stringify(this.data), "utf8");
    renameSync(temp, this.path);
  }
}
