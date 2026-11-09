import { parseArgs } from 'node:util';

export const options = () => parseArgs({
  options: { only: { type: 'string' }, 'dry-run': { type: 'boolean' }, refresh: { type: 'boolean' }, docker: { type: 'boolean' } },
}).values;

