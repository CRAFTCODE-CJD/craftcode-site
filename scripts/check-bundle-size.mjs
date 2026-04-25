/**
 * Bundle-size budget check — fails CI if any per-route or total JS
 * payload exceeds the budget table. Run after `npm run build`.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const astroDir = path.join(root, 'dist/_astro');

const BUDGET_TOTAL_KB = 850;       // total JS across all chunks
const BUDGET_PER_FILE_KB = 200;    // any single chunk

async function main() {
  const files = (await fs.readdir(astroDir)).filter((f) => f.endsWith('.js'));
  let totalKB = 0;
  let failed = false;
  console.log('Bundle-size check:');
  for (const f of files) {
    const stat = await fs.stat(path.join(astroDir, f));
    const kb = stat.size / 1024;
    totalKB += kb;
    const flag = kb > BUDGET_PER_FILE_KB ? '❌ OVER BUDGET' : 'OK';
    if (kb > BUDGET_PER_FILE_KB) failed = true;
    console.log(`  ${f.padEnd(60)} ${kb.toFixed(1).padStart(7)} KB  ${flag}`);
  }
  console.log(`Total JS: ${totalKB.toFixed(1)} KB / ${BUDGET_TOTAL_KB} KB budget`);
  if (totalKB > BUDGET_TOTAL_KB) {
    console.error(`❌ Total JS exceeds budget by ${(totalKB - BUDGET_TOTAL_KB).toFixed(1)} KB`);
    failed = true;
  }
  if (failed) process.exit(1);
  console.log('✅ Bundle within budget.');
}

main().catch((err) => { console.error(err); process.exit(1); });
