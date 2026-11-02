import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EncounterDetectionEngine } from "./engine.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const INPUTS_DIR = path.join(PROJECT_ROOT, 'Inputs');
const OUTPUTS_DIR = path.join(PROJECT_ROOT, 'Outputs');
const OFFICIAL_REFERENCE = {
    1: [
        {
            tipo: 'generico',
            monitoradosEncontro: [4, 6],
            timestamp: '2024-01-01 00:05:15',
            posicoes: {
                '4': { lat: -31.93195, lon: -40.61438 },
                '6': { lat: -31.93187, lon: -40.61435 },
            },
            distanciaMetros: 9.33522817789823,
        },
        {
            tipo: 'generico',
            monitoradosEncontro: [3, 5],
            timestamp: '2024-01-01 00:10:20',
            posicoes: {
                '3': { lat: -28.28206, lon: -44.63511 },
                '5': { lat: -28.28207, lon: -44.6352 },
            },
            distanciaMetros: 8.882771981092958,
        },
        {
            tipo: 'protetiva',
            monitoradosEncontro: [9, 10],
            timestamp: '2024-01-01 00:16:45',
            posicoes: {
                '9': { lat: 1.83355, lon: -69.5461 },
                '10': { lat: 1.83351, lon: -69.54618 },
            },
            distanciaMetros: 9.941503149375345,
        },
        {
            tipo: 'faccao',
            monitoradosEncontro: [7, 8],
            timestamp: '2024-01-01 00:36:00',
            posicoes: {
                '7': { lat: -13.02054, lon: -46.40609 },
                '8': { lat: -13.02046, lon: -46.40609 },
            },
            distanciaMetros: 8.895594131622975,
        },
    ],
    2: [
        {
            tipo: 'faccao',
            monitoradosEncontro: [10, 11],
            timestamp: '2024-01-01 00:02:05',
            posicoes: {
                '10': { lat: -14.62732, lon: -36.31859 },
                '11': { lat: -14.62731, lon: -36.31869 },
            },
            distanciaMetros: 10.81640474094182,
        },
        {
            tipo: 'protetiva',
            monitoradosEncontro: [12, 13],
            timestamp: '2024-01-01 00:29:50',
            posicoes: {
                '12': { lat: -7.33193, lon: -65.9313 },
                '13': { lat: -7.33197, lon: -65.93137 },
            },
            distanciaMetros: 8.909619516337239,
        },
        {
            tipo: 'generico',
            monitoradosEncontro: [3, 19],
            timestamp: '2024-01-01 00:35:55',
            posicoes: {
                '3': { lat: -25.99892, lon: -56.96696 },
                '19': { lat: -25.99883, lon: -56.96694 },
            },
            distanciaMetros: 10.205209934010645,
        },
        {
            tipo: 'generico',
            monitoradosEncontro: [6, 7],
            timestamp: '2024-01-01 00:43:35',
            posicoes: {
                '6': { lat: -15.03744, lon: -73.42167 },
                '7': { lat: -15.03739, lon: -73.42174 },
            },
            distanciaMetros: 9.349741643529189,
        },
        {
            tipo: 'generico',
            monitoradosEncontro: [4, 5],
            timestamp: '2024-01-01 01:26:30',
            posicoes: {
                '4': { lat: -29.13547, lon: -43.25292 },
                '5': { lat: -29.13546, lon: -43.25301 },
            },
            distanciaMetros: 8.811738897421028,
        },
        {
            tipo: 'faccao',
            monitoradosEncontro: [8, 9],
            timestamp: '2024-01-01 01:43:00',
            posicoes: {
                '8': { lat: -14.77075, lon: -55.87742 },
                '9': { lat: -14.77068, lon: -55.87738 },
            },
            distanciaMetros: 8.892813491126276,
        },
    ],
};
async function validate() {
    const engine = new EncounterDetectionEngine();
    await engine.init();
    console.log('Iniciando validacao automatizada dos resultados...\n');
    let allPassed = true;
    // 1. Validação estrita contra os gabaritos oficiais (Datasets 1 e 2)
    for (const idx of [1, 2]) {
        const inputPath = path.join(INPUTS_DIR, `dataset${idx}.txt`);
        const expected = OFFICIAL_REFERENCE[idx];
        const actual = await engine.processDataset(inputPath);
        const exactMatch = JSON.stringify(actual) === JSON.stringify(expected);
        if (exactMatch) {
            console.log(`[OK] dataset${idx}.txt -> 100% identico ao gabarito oficial (${actual.length} encontros, precisao IEEE-754 exata).`);
        }
        else {
            console.error(`[FALHA] dataset${idx}.txt divergiu do gabarito oficial!`);
            console.error('Esperado:', JSON.stringify(expected, null, 2));
            console.error('Obtido:', JSON.stringify(actual, null, 2));
            allPassed = false;
        }
    }
    // 2. Validação de integridade e invariantes de negócio em todos os arquivos gerados (respostas1..7.json)
    for (const idx of [1, 2, 3, 4, 5, 6, 7]) {
        const outPath = path.join(OUTPUTS_DIR, `respostas${idx}.json`);
        if (!fs.existsSync(outPath)) {
            console.error(`[FALHA] Arquivo ${outPath} nao foi encontrado.`);
            allPassed = false;
            continue;
        }
        const items = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        const seenKeys = new Set();
        for (const item of items) {
            if (!['generico', 'faccao', 'protetiva'].includes(item.tipo)) {
                console.error(`[FALHA] Tipo invalido em respostas${idx}.json:`, item.tipo);
                allPassed = false;
            }
            if (item.distanciaMetros <= 0 || item.distanciaMetros >= 20) {
                console.error(`[FALHA] Distancia fora do limite (< 20m) em respostas${idx}.json:`, item.distanciaMetros);
                allPassed = false;
            }
            const [idA, idB] = item.monitoradosEncontro;
            if (idA === idB || !item.posicoes[idA] || !item.posicoes[idB]) {
                console.error(`[FALHA] IDs ou posicoes invalidas em respostas${idx}.json:`, item);
                allPassed = false;
            }
            const pairKey = `${item.timestamp}|${Math.min(idA, idB)}:${Math.max(idA, idB)}`;
            if (seenKeys.has(pairKey)) {
                console.error(`[FALHA] Encontro duplicado em respostas${idx}.json:`, pairKey);
                allPassed = false;
            }
            seenKeys.add(pairKey);
        }
        const byType = items.reduce((acc, cur) => {
            acc[cur.tipo] = (acc[cur.tipo] ?? 0) + 1;
            return acc;
        }, {});
        console.log(`[OK] respostas${idx}.json validado -> ${items.length} encontros (generico: ${byType.generico ?? 0}, faccao: ${byType.faccao ?? 0}, protetiva: ${byType.protetiva ?? 0})`);
    }
    await engine.close();
    if (!allPassed) {
        process.exit(1);
    }
    console.log('\nTodas as validacoes de regra de negocio e gabarito passaram com sucesso!');
}
validate().catch((err) => {
    console.error(err);
    process.exit(1);
});
