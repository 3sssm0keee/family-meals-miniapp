import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AccessService } from './access.service.js';
import { IdempotencyService } from './idempotency.service.js';
import { AuthService } from '../auth/auth.service.js';
import { ApiRuntime } from './api-runtime.service.js';
@Global()
@Module({providers:[PrismaService,AccessService,IdempotencyService,AuthService,ApiRuntime],exports:[PrismaService,AccessService,IdempotencyService,AuthService,ApiRuntime]})
export class CommonModule {}
