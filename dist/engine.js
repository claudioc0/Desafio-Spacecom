import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { computeAlignedChunks, processFileChunk } from "./parser.js";
/**
 * Motor de detecção de encontros com Pool persistente de Worker Threads.
 * Escala automaticamente entre execução direta (para datasets pequenos <= 6 MB)
 * e execução paralela multi-core (para datasets médios e grandes).
 */
export class EncounterDetectionEngine {
    maxWorkers;
    workers = [];
    isInitialized = false;
    constructor(maxWorkers = os.cpus().length) {
        this.maxWorkers = Math.max(1, maxWorkers);
    }
    /**
     * Inicializa e pré-aquece as Worker Threads do pool para eliminar latência de inicialização V8.
     */
    async init() {
        if (this.isInitialized || this.maxWorkers <= 1) {
            this.isInitialized = true;
            return;
        }
        const currentUrl = import.meta.url;
        const workerFile = currentUrl.endsWith('.ts') ? './worker.ts' : './worker.js';
        const workerUrl = new URL(workerFile, currentUrl);
        await Promise.all(Array.from({ length: this.maxWorkers }, () => {
            return new Promise((resolve, reject) => {
                const worker = new Worker(workerUrl);
                const onFirstMessage = (msg) => {
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
        }));
        this.isInitialized = true;
    }
    /**
     * Processa um arquivo de dataset e retorna a lista de encontros detectados.
     */
    async processDataset(filePath) {
        if (!this.isInitialized) {
            await this.init();
        }
        const chunks = computeAlignedChunks(filePath, this.maxWorkers);
        // Caminho rápido single-thread para datasets menores (< 6 MB)
        if (chunks.length === 1) {
            return processFileChunk(filePath, chunks[0].start, chunks[0].end);
        }
        const chunkResults = new Array(chunks.length);
        await Promise.all(chunks.map((chunk, idx) => {
            return new Promise((resolve, reject) => {
                const worker = this.workers[idx];
                const onMessage = (msg) => {
                    if (msg.type === 'result' && msg.chunkIdx === idx) {
                        worker.off('message', onMessage);
                        worker.off('error', onError);
                        chunkResults[idx] = msg.encounters;
                        resolve();
                    }
                };
                const onError = (err) => {
                    worker.off('message', onMessage);
                    reject(err);
                };
                worker.on('message', onMessage);
                worker.once('error', onError);
                const request = {
                    type: 'process',
                    chunkIdx: idx,
                    filePath,
                    start: chunk.start,
                    end: chunk.end,
                };
                worker.postMessage(request);
            });
        }));
        return chunkResults.flat();
    }
    /**
     * Encerra todas as Worker Threads ativas do pool.
     */
    async close() {
        const exitMsg = { type: 'exit' };
        for (const worker of this.workers) {
            worker.postMessage(exitMsg);
        }
        this.workers = [];
        this.isInitialized = false;
    }
}
