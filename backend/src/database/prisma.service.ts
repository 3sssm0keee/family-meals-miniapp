import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient, Prisma } from '../../generated/prisma/client.js';
export type TransactionClient = Prisma.TransactionClient;
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const value = process.env.DATABASE_URL;
    if (!value) throw new Error('DATABASE_URL is required');
    const url = new URL(value);
    super({ adapter: new PrismaMariaDb({host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: url.pathname.slice(1), connectionLimit: 5, connectTimeout: 10000, acquireTimeout: 10000, timezone: '+00:00'}) });
  }
  async onModuleDestroy() { await this.$disconnect(); }
  transaction<T>(work: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 20000 });
  }
}
