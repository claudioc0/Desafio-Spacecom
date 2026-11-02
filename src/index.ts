import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EncounterDetectionEngine } from './engine.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const INPUTS_DIR = path.join(PROJECT_ROOT, 'Inputs');
const OUTPUTS_DIR = path.join(PROJECT_ROOT, 'Outputs');

async function main(): Promise<void> {
  if (!fs.existsSync(OUTPUTS_DIR)) {
    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  }

  const cpuCount = os.cpus().length;
  const cpuModel = os.cpus()[0]?.model.trim() ?? 'CPU';
  const engine = new EncounterDetectionEngine(cpuCount);

  console.log('================================================================================');
  console.log(' DESAFIO SPACECOM - DETECCAO DE ENCONTROS GEORREFERENCIADOS');
  console.log(` Ambiente: Node.js ${process.version} | Threads: ${cpuCount} (${cpuModel})`);
  console.log('================================================================================\n');

  await engine.init();

  const datasets = [1, 2, 3, 4, 5, 6, 7];
  let totalComputeMs = 0;
  let totalIoWriteMs = 0;
  let totalBytes = 0;
  let totalEncounters = 0;

  console.log(
    'Dataset       | Tamanho    | Encontros | Tempo Calc (ms) | Escrita JSON (ms) | Throughput'
  );
  console.log(
    '--------------+------------+-----------+-----------------+-------------------+------------'
  );

  for (const idx of datasets) {
    const inputFile = path.join(INPUTS_DIR, `dataset${idx}.txt`);
    if (!fs.existsSync(inputFile)) {
      console.warn(`Arquivo nao encontrado: ${inputFile}`);
      continue;
    }

    const fileSize = fs.statSync(inputFile).size;
    totalBytes += fileSize;

    const t0 = performance.now();
    const encounters = await engine.processDataset(inputFile);
    const computeMs = performance.now() - t0;
    totalComputeMs += computeMs;
    totalEncounters += encounters.length;

    const outputFile = path.join(OUTPUTS_DIR, `respostas${idx}.json`);
    const tWrite0 = performance.now();
    fs.writeFileSync(outputFile, JSON.stringify(encounters, null, 2), 'utf8');
    const writeMs = performance.now() - tWrite0;
    totalIoWriteMs += writeMs;

    const sizeMb = (fileSize / (1024 * 1024)).toFixed(2).padStart(7) + ' MB';
    const throughputMbS = ((fileSize / (1024 * 1024)) / (computeMs / 1000)).toFixed(0).padStart(6) + ' MB/s';

    console.log(
      `dataset${idx}.txt  | ${sizeMb} | ${String(encounters.length).padStart(9)} | ${computeMs
        .toFixed(2)
        .padStart(12)} ms | ${writeMs.toFixed(2).padStart(14)} ms | ${throughputMbS}`
    );
  }

  console.log(
    '--------------+------------+-----------+-----------------+-------------------+------------'
  );
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
  const avgThroughput = ((totalBytes / (1024 * 1024)) / (totalComputeMs / 1000)).toFixed(0);
  console.log(
    `TOTAL (1..7)  | ${totalMb.padStart(7)} MB | ${String(totalEncounters).padStart(
      9
    )} | ${totalComputeMs.toFixed(2).padStart(12)} ms | ${totalIoWriteMs
      .toFixed(2)
      .padStart(14)} ms | ${avgThroughput.padStart(6)} MB/s\n`
  );

  await engine.close();
}

main().catch((err) => {
  console.error('Erro fatal durante o processamento:', err);
  process.exit(1);
});
