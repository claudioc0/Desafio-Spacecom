import type { Encontro } from './types.ts';
/**
 * Motor de detecção de encontros com Pool persistente de Worker Threads.
 * Escala automaticamente entre execução direta (para datasets pequenos <= 6 MB)
 * e execução paralela multi-core (para datasets médios e grandes).
 */
export declare class EncounterDetectionEngine {
    private readonly maxWorkers;
    private workers;
    private isInitialized;
    constructor(maxWorkers?: number);
    /**
     * Inicializa e pré-aquece as Worker Threads do pool para eliminar latência de inicialização V8.
     */
    init(): Promise<void>;
    /**
     * Processa um arquivo de dataset e retorna a lista de encontros detectados.
     */
    processDataset(filePath: string): Promise<Encontro[]>;
    /**
     * Encerra todas as Worker Threads ativas do pool.
     */
    close(): Promise<void>;
}
