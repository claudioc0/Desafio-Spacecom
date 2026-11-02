import fs from 'node:fs';
import { haversineDistance, LAT_E5_DOUBLE_DELTA, LAT_E5_MAX_DELTA, LON_E5_DOUBLE_DELTA, LON_E5_MAX_DELTA, MAX_ENCOUNTER_DISTANCE_METERS, } from "./geo.js";
const READ_BUFFER_SIZE = 4 * 1024 * 1024; // 4 MB por leitura (ótimo para cache L3)
const OVERFLOW_GUARD = 65536;
const MAX_GROUP_CAPACITY = 4096;
// Buffer de I/O reutilizado por thread para evitar realocações de 4 MB
const threadReadBuffer = Buffer.allocUnsafe(READ_BUFFER_SIZE + OVERFLOW_GUARD);
/**
 * Processa um intervalo de bytes [startOffset, endOffset) de um arquivo de dataset,
 * realizando o parsing binário direto do Buffer (zero-allocation nas linhas normais)
 * e detectando todos os encontros por timestamp.
 */
export function processFileChunk(filePath, startOffset, endOffset) {
    const fd = fs.openSync(filePath, 'r');
    const buf = threadReadBuffer;
    // Estruturas colunares locais (Struct-of-Arrays em TypedArrays) mantidas em registradores pela JIT V8
    const ids = new Int32Array(MAX_GROUP_CAPACITY);
    const faccoes = new Int32Array(MAX_GROUP_CAPACITY);
    const latE5s = new Int32Array(MAX_GROUP_CAPACITY);
    const lonE5s = new Int32Array(MAX_GROUP_CAPACITY);
    const mps = new Uint8Array(MAX_GROUP_CAPACITY);
    const restrStart = new Int32Array(MAX_GROUP_CAPACITY);
    const restrCount = new Uint8Array(MAX_GROUP_CAPACITY);
    const restrPool = new Int32Array(MAX_GROUP_CAPACITY * 16);
    const tsBuf = Buffer.allocUnsafe(19);
    let groupSize = 0;
    let restrPoolPtr = 0;
    let prevTs0 = -1;
    let prevTsA = -1;
    let prevTsB = -1;
    let prevTsC = -1;
    const encounters = [];
    function hasRestriction(idx, targetId) {
        const count = restrCount[idx];
        const start = restrStart[idx];
        for (let k = 0; k < count; k++) {
            if (restrPool[start + k] === targetId)
                return true;
        }
        return false;
    }
    function flushGroup() {
        const n = groupSize;
        if (n > 1) {
            const latMax = LAT_E5_MAX_DELTA;
            const latDouble = LAT_E5_DOUBLE_DELTA;
            const lonMax = LON_E5_MAX_DELTA;
            const lonDouble = LON_E5_DOUBLE_DELTA;
            let seenPairs = null;
            for (let i = 0; i < n; i++) {
                const latI = latE5s[i];
                const lonI = lonE5s[i];
                for (let j = i + 1; j < n; j++) {
                    // Pré-filtro espacial O(1) em aritmética inteira sem ponto flutuante:
                    // Descarta 99,99999% dos pares distantes em 2 instruções de CPU
                    if (((latI - latE5s[j] + latMax) >>> 0) > latDouble) {
                        continue;
                    }
                    if (((lonI - lonE5s[j] + lonMax) >>> 0) > lonDouble) {
                        continue;
                    }
                    const latA = latI / 100000;
                    const lonA = lonI / 100000;
                    const latB = latE5s[j] / 100000;
                    const lonB = lonE5s[j] / 100000;
                    const dist = haversineDistance(latA, lonA, latB, lonB);
                    if (dist < MAX_ENCOUNTER_DISTANCE_METERS) {
                        const idA = ids[i];
                        const idB = ids[j];
                        if (idA === idB)
                            continue;
                        const mpA = mps[i] === 1;
                        const mpB = mps[j] === 1;
                        let tipo = null;
                        if (mpA || mpB) {
                            // Se ao menos um dos envolvidos possui medida protetiva (vítima),
                            // configura-se encontro de medida protetiva se o outro está na lista de restrição.
                            if ((mpA && hasRestriction(i, idB)) || (mpB && hasRestriction(j, idA))) {
                                tipo = 'protetiva';
                            }
                        }
                        else {
                            // Ambos são monitorados/tornozeleiras:
                            // Se pertencem à mesma facção (não vazia), é 'faccao'; caso contrário, 'generico'.
                            if (faccoes[i] !== 0 && faccoes[i] === faccoes[j]) {
                                tipo = 'faccao';
                            }
                            else {
                                tipo = 'generico';
                            }
                        }
                        if (tipo !== null) {
                            const firstId = idA < idB ? idA : idB;
                            const secondId = idA < idB ? idB : idA;
                            // Garantia de unicidade por par de envolvidos no mesmo timestamp
                            const pairKey = `${firstId}:${secondId}`;
                            if (!seenPairs)
                                seenPairs = new Set();
                            if (seenPairs.has(pairKey))
                                continue;
                            seenPairs.add(pairKey);
                            const tsStr = tsBuf.toString('latin1', 0, 19);
                            const firstPos = idA < idB ? { lat: latA, lon: lonA } : { lat: latB, lon: lonB };
                            const secondPos = idA < idB ? { lat: latB, lon: lonB } : { lat: latA, lon: lonA };
                            encounters.push({
                                tipo,
                                monitoradosEncontro: [firstId, secondId],
                                timestamp: tsStr,
                                posicoes: {
                                    [firstId]: firstPos,
                                    [secondId]: secondPos,
                                },
                                distanciaMetros: dist,
                            });
                        }
                    }
                }
            }
        }
        groupSize = 0;
        restrPoolPtr = 0;
    }
    let filePos = startOffset;
    let leftover = 0;
    try {
        while (filePos < endOffset) {
            const toRead = Math.min(READ_BUFFER_SIZE, endOffset - filePos);
            const bytesRead = fs.readSync(fd, buf, leftover, toRead, filePos);
            if (bytesRead <= 0)
                break;
            filePos += bytesRead;
            const totalLen = leftover + bytesRead;
            let parseLimit = totalLen;
            if (filePos < endOffset) {
                while (parseLimit > 0 && buf[parseLimit - 1] !== 10) {
                    parseLimit--;
                }
            }
            let p = 0;
            while (p < parseLimit) {
                const b0 = buf[p];
                if (b0 === 10 || b0 === 13) {
                    p++;
                    continue;
                }
                // Ignora linha de cabeçalho ("idMonitorado;...")
                if (b0 === 105) {
                    while (p < parseLimit && buf[p] !== 10)
                        p++;
                    p++;
                    continue;
                }
                // 1. idMonitorado (Inteiro positivo)
                let id = b0 - 48;
                p++;
                while (buf[p] !== 59) {
                    id = id * 10 + (buf[p] - 48);
                    p++;
                }
                p++; // pula ';'
                // 2. faccaoMonitorado (Hash FNV-1a 32-bit se preenchido, 0 se vazio)
                let faccao = 0;
                if (buf[p] !== 59) {
                    faccao = 2166136261;
                    while (buf[p] !== 59) {
                        faccao = Math.imul(faccao ^ buf[p], 16777619) | 0;
                        p++;
                    }
                    if (faccao === 0)
                        faccao = 1;
                }
                p++; // pula ';'
                // 3. timestamp: "YYYY-MM-DD HH:MM:SS"
                p++; // pula '"' inicial
                const tsC = buf.readInt32LE(p + 15);
                const tsB = buf.readInt32LE(p + 11);
                const tsA = buf.readInt32LE(p + 7);
                const ts0 = buf.readInt32LE(p + 3);
                if (tsC !== prevTsC || tsB !== prevTsB || tsA !== prevTsA || ts0 !== prevTs0) {
                    if (groupSize > 0)
                        flushGroup();
                    prevTsC = tsC;
                    prevTsB = tsB;
                    prevTsA = tsA;
                    prevTs0 = ts0;
                    buf.copy(tsBuf, 0, p, p + 19);
                }
                p += 21; // pula 19 caracteres + '";'
                // 4. latitude (ex: -25.59386 -> inteiro escalado por 10^5)
                let latSign = 1;
                if (buf[p] === 45) {
                    latSign = -1;
                    p++;
                }
                let latVal = 0;
                while (buf[p] !== 46) {
                    latVal = latVal * 10 + (buf[p] - 48);
                    p++;
                }
                p++; // pula '.'
                let latDec = 0;
                while (buf[p] !== 59) {
                    latVal = latVal * 10 + (buf[p] - 48);
                    latDec++;
                    p++;
                }
                if (latDec !== 5) {
                    while (latDec < 5) {
                        latVal *= 10;
                        latDec++;
                    }
                }
                p++; // pula ';'
                // 5. longitude (ex: -73.96319 -> inteiro escalado por 10^5)
                let lonSign = 1;
                if (buf[p] === 45) {
                    lonSign = -1;
                    p++;
                }
                let lonVal = 0;
                while (buf[p] !== 46) {
                    lonVal = lonVal * 10 + (buf[p] - 48);
                    p++;
                }
                p++; // pula '.'
                let lonDec = 0;
                while (buf[p] !== 59) {
                    lonVal = lonVal * 10 + (buf[p] - 48);
                    lonDec++;
                    p++;
                }
                if (lonDec !== 5) {
                    while (lonDec < 5) {
                        lonVal *= 10;
                        lonDec++;
                    }
                }
                p++; // pula ';'
                // 6. medidaProtetiva e 7. idsRestricaoMedida
                const idx = groupSize++;
                ids[idx] = id;
                faccoes[idx] = faccao;
                latE5s[idx] = latSign * latVal;
                lonE5s[idx] = lonSign * lonVal;
                if (buf[p] === 102) {
                    // 'f' -> false;
                    mps[idx] = 0;
                    restrCount[idx] = 0;
                    p += 6;
                    while (p < parseLimit && buf[p] !== 10)
                        p++;
                    p++;
                }
                else {
                    // 't' -> true;
                    mps[idx] = 1;
                    p += 5;
                    const rStart = restrPoolPtr;
                    restrStart[idx] = rStart;
                    let rCnt = 0;
                    let curId = 0;
                    let hasDigit = false;
                    while (p < parseLimit && buf[p] !== 10) {
                        const c = buf[p];
                        if (c >= 48 && c <= 57) {
                            curId = curId * 10 + (c - 48);
                            hasDigit = true;
                        }
                        else if (c === 44) {
                            if (hasDigit) {
                                restrPool[restrPoolPtr++] = curId;
                                rCnt++;
                                curId = 0;
                                hasDigit = false;
                            }
                        }
                        p++;
                    }
                    if (hasDigit) {
                        restrPool[restrPoolPtr++] = curId;
                        rCnt++;
                    }
                    restrCount[idx] = rCnt;
                    p++;
                }
            }
            leftover = totalLen - parseLimit;
            if (leftover > 0) {
                buf.copy(buf, 0, parseLimit, totalLen);
            }
        }
        if (groupSize > 0)
            flushGroup();
    }
    finally {
        fs.closeSync(fd);
    }
    return encounters;
}
/**
 * Divide um arquivo de entrada em múltiplos intervalos de bytes (ByteChunks)
 * garantindo que nenhum grupo de mesmo timestamp seja partido entre duas threads.
 */
export function computeAlignedChunks(filePath, maxWorkers) {
    const size = fs.statSync(filePath).size;
    // Para arquivos até 6 MB, o processamento single-thread evita qualquer overhead de sincronização
    if (maxWorkers <= 1 || size < 6 * 1024 * 1024) {
        return [{ start: 0, end: size }];
    }
    const numChunks = size < 30 * 1024 * 1024 ? Math.min(6, maxWorkers) : maxWorkers;
    const fd = fs.openSync(filePath, 'r');
    const probeBuf = Buffer.allocUnsafe(65536);
    const boundaries = [0];
    try {
        for (let i = 1; i < numChunks; i++) {
            const approx = Math.floor((size * i) / numChunks);
            const bytesRead = fs.readSync(fd, probeBuf, 0, probeBuf.length, approx);
            let pos = 0;
            // Avança até o fim da linha parcial onde o offset caiu
            while (pos < bytesRead && probeBuf[pos] !== 10)
                pos++;
            pos++;
            if (pos >= bytesRead)
                continue;
            let firstTs = null;
            while (pos < bytesRead) {
                let lineEnd = pos;
                while (lineEnd < bytesRead && probeBuf[lineEnd] !== 10)
                    lineEnd++;
                if (lineEnd >= bytesRead)
                    break;
                let p = pos;
                while (p < lineEnd && probeBuf[p] !== 59)
                    p++;
                p++;
                while (p < lineEnd && probeBuf[p] !== 59)
                    p++;
                p += 2; // pula ';"'
                const ts = probeBuf.toString('latin1', p, p + 19);
                if (firstTs === null) {
                    firstTs = ts;
                }
                else if (ts !== firstTs) {
                    const exactOffset = approx + pos;
                    if (exactOffset > boundaries[boundaries.length - 1]) {
                        boundaries.push(exactOffset);
                    }
                    break;
                }
                pos = lineEnd + 1;
            }
        }
    }
    finally {
        fs.closeSync(fd);
    }
    boundaries.push(size);
    const chunks = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
        chunks.push({ start: boundaries[i], end: boundaries[i + 1] });
    }
    return chunks;
}
