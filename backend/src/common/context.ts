import type { MemberRole } from '../../generated/prisma/enums.js';
export interface RequestContext { requestId: string; userId: string; familyId?: string; memberId?: string; role?: MemberRole }
export interface FamilyContext extends RequestContext { familyId: string; memberId: string; role: MemberRole }
export interface WriteRequest { key: string; method: string; path: string; body?: unknown; query?: unknown; fileHash?: string }
export interface WriteResult<T> { status: number; data: T }
