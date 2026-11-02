import { parentPort } from 'node:worker_threads';
import { processFileChunk } from './parser.ts';
import type { WorkerRequest, WorkerResponse } from './types.ts';

if (parentPort) {
  const port = parentPort;
  const readyMsg: WorkerResponse = { type: 'ready' };
  port.postMessage(readyMsg);

  port.on('message', (msg: WorkerRequest) => {
    if (msg.type === 'exit') {
      process.exit(0);
    }
    const encounters = processFileChunk(msg.filePath, msg.start, msg.end);
    const response: WorkerResponse = {
      type: 'result',
      chunkIdx: msg.chunkIdx,
      encounters,
    };
    port.postMessage(response);
  });
}
