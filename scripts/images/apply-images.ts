import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { catalogPhotos } from '../../backend/prisma/photo-manifest';
import { options } from './options';

async function main() {
  const args = options();
  const photos = Object.fromEntries(Object.entries(catalogPhotos).filter(([slug]) => !args.only || args.only === slug));
  for (const files of Object.values(photos)) {
    for (const file of files) {
      await readFile('frontend/public' + file);
      await readFile('frontend/public' + file.replace(/\.webp$/, '-thumb.webp'));
    }
  }
  const input = { photos, only: args.only, dryRun: args['dry-run'], refresh: args.refresh };
  if (args.docker) {
    const run = spawnSync('docker', ['compose', 'exec', '-T', 'backend', 'node', '-e', [
      "const {applyCatalogPhotos}=require('./dist/src/apply-catalog-photos.js');",
      "const {db}=require('./dist/src/db.js');",
      "const input=JSON.parse(require('node:fs').readFileSync(0,'utf8'));",
      'applyCatalogPhotos(input).then(rows=>rows.forEach(row=>console.log(row.slug+": "+row.action)))',
      '.catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>db.$disconnect());',
    ].join('')], { input: JSON.stringify(input), encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });
    if (run.error) throw run.error;
    if (run.status !== 0) process.exitCode = run.status ?? 1;
    return;
  }

  const { applyCatalogPhotos } = await import('../../backend/src/apply-catalog-photos');
  const { db } = await import('../../backend/src/db');
  try {
    for (const row of await applyCatalogPhotos(input)) console.log(row.slug + ': ' + row.action);
  } finally { await db.$disconnect(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });

