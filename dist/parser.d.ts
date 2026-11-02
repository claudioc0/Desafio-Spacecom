import type { ByteChunk, Encontro } from './types.ts';
/**
 * Processa um intervalo de bytes [startOffset, endOffset) de um arquivo de dataset,
 * realizando o parsing binário direto do Buffer (zero-allocation nas linhas normais)
 * e detectando todos os encontros por timestamp.
 */
export declare function processFileChunk(filePath: string, startOffset: number, endOffset: number): Encontro[];
/**
 * Divide um arquivo de entrada em múltiplos intervalos de bytes (ByteChunks)
 * garantindo que nenhum grupo de mesmo timestamp seja partido entre duas threads.
 */
export declare function computeAlignedChunks(filePath: string, maxWorkers: number): ByteChunk[];
