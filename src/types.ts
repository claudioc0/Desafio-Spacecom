/**
 * Tipos de encontros definidos pelas regras de negócio:
 * - 'generico': Encontro entre quaisquer dois monitorados (ambos sem medida protetiva e de facções distintas ou sem facção).
 * - 'faccao': Encontro entre dois monitorados que pertencem à mesma facção.
 * - 'protetiva': Encontro entre um agressor e sua respectiva vítima com medida protetiva.
 */
export type TipoEncontro = 'generico' | 'faccao' | 'protetiva';

/**
 * Coordenadas geográficas de um indivíduo em um dado instante.
 */
export interface Posicao {
  lat: number;
  lon: number;
}

/**
 * Estrutura de saída de um encontro detectado conforme especificação JSON.
 */
export interface Encontro {
  tipo: TipoEncontro;
  monitoradosEncontro: [number, number];
  timestamp: string;
  posicoes: Record<string, Posicao>;
  distanciaMetros: number;
}

/**
 * Intervalo de bytes de um arquivo alinhado por fronteira de timestamp.
 */
export interface ByteChunk {
  start: number;
  end: number;
}

/**
 * Mensagem enviada da thread principal para uma Worker Thread.
 */
export type WorkerRequest =
  | {
      type: 'process';
      chunkIdx: number;
      filePath: string;
      start: number;
      end: number;
    }
  | {
      type: 'exit';
    };

/**
 * Mensagem enviada de uma Worker Thread para a thread principal.
 */
export type WorkerResponse =
  | {
      type: 'ready';
    }
  | {
      type: 'result';
      chunkIdx: number;
      encounters: Encontro[];
    };
