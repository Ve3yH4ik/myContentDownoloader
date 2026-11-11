import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const html = await readFile(
  new URL("../examples/catalog.html", import.meta.url),
);
createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}).listen(4179, "127.0.0.1", () =>
  console.log("Fixture: http://127.0.0.1:4179"),
);
