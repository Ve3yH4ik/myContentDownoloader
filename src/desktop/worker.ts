import { parentPort, workerData } from "node:worker_threads";
import { fetchDocument, runProject } from "../core/engine";
import { extractLinks } from "../core/links";
async function execute() {
  if (workerData.kind === "scan") {
    const { document } = await fetchDocument(workerData);
    return extractLinks(document, workerData.url, workerData.sameOrigin);
  }
  return runProject(workerData.project);
}
execute()
  .then((result) => parentPort!.postMessage({ result }))
  .catch((error) => parentPort!.postMessage({ error: error.message }));
