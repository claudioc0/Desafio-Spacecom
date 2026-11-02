import { parentPort } from 'node:worker_threads';
import { processFileChunk } from "./parser.js";
if (parentPort) {
    const port = parentPort;
    const readyMsg = { type: 'ready' };
    port.postMessage(readyMsg);
    port.on('message', (msg) => {
        if (msg.type === 'exit') {
            process.exit(0);
        }
        const encounters = processFileChunk(msg.filePath, msg.start, msg.end);
        const response = {
            type: 'result',
            chunkIdx: msg.chunkIdx,
            encounters,
        };
        port.postMessage(response);
    });
}
