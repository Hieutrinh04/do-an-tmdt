import './env';
import { PrismaClient } from '@prisma/client';

export const db = new PrismaClient({ transactionOptions: { maxWait: 5000, timeout: 10000 } });

