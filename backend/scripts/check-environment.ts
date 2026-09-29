import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';

@Controller('health')
class HealthController {
  @Get()
  health() { return { status: 'ok', purpose: 'environment-check' }; }
}

@Module({ controllers: [HealthController] })
class EnvironmentModule {}

const app = await NestFactory.create(EnvironmentModule, { logger: false });
try {
  await app.listen(0, '127.0.0.1');
  const response = await fetch(`${await app.getUrl()}/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
  console.log('PASS NestJS HTTP server and route');
} finally {
  await app.close();
}

assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required');
const url = new URL(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter: new PrismaMariaDb({
  host: url.hostname, port: Number(url.port || 3306),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: url.pathname.slice(1), connectionLimit: 2,
  connectTimeout: 10000, acquireTimeout: 10000,
}) });
try {
  const result = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 AS result`;
  assert.equal(Number(result[0].result), 1);
  const rollbackMarker = new Error('intentional environment-check rollback');
  await assert.rejects(prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('CREATE TEMPORARY TABLE environment_check (id INT PRIMARY KEY, label VARCHAR(64)) ENGINE=InnoDB');
    try {
      await tx.$executeRaw`INSERT INTO environment_check (id, label) VALUES (1, ${'依赖验证'})`;
      const rows = await tx.$queryRaw<Array<{ label: string }>>`SELECT label FROM environment_check WHERE id = 1`;
      assert.equal(rows[0].label, '依赖验证');
    } finally {
      await tx.$executeRawUnsafe('DROP TEMPORARY TABLE environment_check');
    }
    throw rollbackMarker;
  }), error => error === rollbackMarker);
  console.log('PASS Prisma/MySQL connection, transaction, temporary-table write/read and Chinese text');
} finally {
  await prisma.$disconnect();
}
