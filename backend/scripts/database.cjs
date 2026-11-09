const { spawnSync } = require('node:child_process');
const { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
process.env.DATABASE_URL ??= 'file:./long-fish.db';

const postgres = /^(postgres|postgresql):\/\//.test(process.env.DATABASE_URL);
let schema = 'prisma/schema.prisma';
if (postgres) {
  schema = 'prisma/.postgres/schema.prisma';
  mkdirSync(path.dirname(schema), { recursive: true });
  writeFileSync(schema, readFileSync('prisma/schema.prisma', 'utf8').replace('provider = "sqlite"', 'provider = "postgresql"'));
  cpSync('prisma/postgres-migrations', 'prisma/.postgres/migrations', { recursive: true });
}

function run(module, args) {
  const result = spawnSync(process.execPath, [require.resolve(module), ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.argv[2] === 'generate') {
  run('prisma/build/index.js', ['generate', '--schema', schema]);
} else if (process.argv[2] === 'setup') {
  run('prisma/build/index.js', ['migrate', 'deploy', '--schema', schema]);
  run('prisma/build/index.js', ['generate', '--schema', schema]);
  if (process.env.LONG_FISH_COMPILED === '1' && existsSync('dist/prisma/seed.js')) {
    run(path.resolve('dist/prisma/seed.js'), []);
  } else run('tsx/cli', ['prisma/seed.ts']);
} else {
  throw new Error('Dùng lệnh generate hoặc setup.');
}

