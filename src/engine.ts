import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { computeAlignedChunks, processFileChunk } from './parser.ts';
import type { Encontro, WorkerRequest, WorkerResponse } from './types.ts';

/**
 * Motor de detecção de encontros com Pool persistente de Worker Threads.
 * Escala automaticamente entre execução direta (para datasets pequenos <= 6 MB)
 * e execução paralela multi-core (para datasets médios e grandes).
 */
export class EncounterDetectionEngine {
  private readonly maxWorkers: number;
  private workers: Worker[] = [];
  private isInitialized = false;

  constructor(maxWorkers: number = os.cpus().length) {
    this.maxWorkers = Math.max(1, maxWorkers);
  }

  /**
   * Inicializa e pré-aquece as Worker Threads do pool para eliminar latência de inicialização V8.
   */
  public async init(): Promise<void> {
    if (this.isInitialized || this.maxWorkers <= 1) {
      this.isInitialized = true;
      return;
    }

    const currentUrl = import.meta.url;
    const workerFile = currentUrl.endsWith('.ts') ? './worker.ts' : './worker.js';
    const workerUrl = new URL(workerFile, currentUrl);

    await Promise.all(
      Array.from({ length: this.maxWorkers }, () => {
        return new Promise<void>((resolve, reject) => {
          const worker = new Worker(workerUrl);
          const onFirstMessage = (msg: WorkerResponse) => {
            if (msg.type === 'ready') {
              worker.off('message', onFirstMessage);
              worker.off('error', reject);
              resolve();
            }
          };
          worker.on('message', onFirstMessage);
          worker.once('error', reject);
          this.workers.push(worker);
        });
      })
    );

    this.isInitialized = true;
  }

  /**
   * Processa um arquivo de dataset e retorna a lista de encontros detectados.
   */
  public async processDataset(filePath: string): Promise<Encontro[]> {
    if (!this.isInitialized) {
      await this.init();
    }

    const chunks = computeAlignedChunks(filePath, this.maxWorkers);

    // Caminho rápido single-thread para datasets menores (< 6 MB)
    if (chunks.length === 1) {
      return processFileChunk(filePath, chunks[0].start, chunks[0].end);
    }

    const chunkResults = new Array<Encontro[]>(chunks.length);

    await Promise.all(
      chunks.map((chunk, idx) => {
        return new Promise<void>((resolve, reject) => {
          const worker = this.workers[idx];
          const onMessage = (msg: WorkerResponse) => {
            if (msg.type === 'result' && msg.chunkIdx === idx) {
              worker.off('message', onMessage);
              worker.off('error', onError);
              chunkResults[idx] = msg.encounters;
              resolve();
            }
          };
          const onError = (err: Error) => {
            worker.off('message', onMessage);
            reject(err);
          };

          worker.on('message', onMessage);
          worker.once('error', onError);

          const request: WorkerRequest = {
            type: 'process',
            chunkIdx: idx,
            filePath,
            start: chunk.start,
            end: chunk.end,
          };
          worker.postMessage(request);
        });
      })
    );

    return chunkResults.flat();
  }

  /**
   * Encerra todas as Worker Threads ativas do pool.
   */
  public async close(): Promise<void> {
    const exitMsg: WorkerRequest = { type: 'exit' };
    for (const worker of this.workers) {
      worker.postMessage(exitMsg);
    }
    this.workers = [];
    this.isInitialized = false;
  }
}
