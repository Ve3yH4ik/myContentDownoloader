import { parentPort, workerData } from 'node:worker_threads';
import { runProject } from '../core/engine';
runProject(workerData).then(result => parentPort!.postMessage({ result })).catch(error => parentPort!.postMessage({ error: error.message }));
