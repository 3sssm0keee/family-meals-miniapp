import { Injectable } from '@nestjs/common';
import type { RequestContext, FamilyContext } from './context.js';
import type { TransactionClient } from '../database/prisma.service.js';
import { fail } from './errors.js';
@Injectable()
export class AccessService {
  // Every family write locks this row FIRST, before membership/session/dish locks.
  // Role changes use the same lock, so authorization remains valid through commit.
  async lockFamily(tx: TransactionClient, familyId: string) {
    const rows = await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM family WHERE id = ${familyId} FOR UPDATE`;
    if (!rows.length) fail(403, 'MEMBERSHIP_INACTIVE');
  }
  async requireMember(tx: TransactionClient, ctx: RequestContext, admin = false, lock = false): Promise<FamilyContext> {
    if (!ctx.familyId) fail(403, 'FORBIDDEN');
    if (lock) await this.lockFamily(tx, ctx.familyId);
    const member = await tx.familyMember.findUnique({where:{familyId_userId:{familyId:ctx.familyId,userId:ctx.userId}}});
    if (!member || member.status !== 'ACTIVE' || (member.accessExpiresAt && member.accessExpiresAt <= new Date())) fail(403, 'MEMBERSHIP_INACTIVE');
    if (admin && member.role !== 'ADMIN') fail(403, 'FORBIDDEN');
    return {...ctx, familyId:ctx.familyId,memberId:member.id,role:member.role};
  }
}
