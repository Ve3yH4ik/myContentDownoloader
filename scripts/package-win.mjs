import { spawnSync } from "node:child_process";
// Fast LZMA compression keeps the bundled Chromium distribution practical to share.
const result = spawnSync(
  process.execPath,
  [
    "node_modules/electron-builder/out/cli/cli.js",
    "--win",
    "portable",
    "--x64",
    "--publish",
    "never",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_BUILDER_COMPRESSION_LEVEL: "1" },
  },
);
process.exitCode = result.status ?? 1;
