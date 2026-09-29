import type { ErrorDetails, Menu, Review, ReviewRequest, Session } from '../../../docs/contracts/frontend-types.js';

// Internal transaction inputs; never serialize these objects as a public response.
export interface Snapshot {
  dishId: string;
  variantId: string;
  dishName: string;
  variantName: string;
  portionDescription: string;
  dishKind: 'PERMANENT' | 'TEMPORARY';
}
export interface DemandItem extends Snapshot {
  id: string;
  decision: 'UNREVIEWED' | 'CONFIRMED' | 'CANCELLED';
  plannedQuantity: number | null;
  reason: string;
  demandVersion: number;
  reviewedDemandVersion: number;
  lastReviewedParticipantCount: number;
}
export interface Submission {
  id: string;
  memberId: string;
  submittedAt: string;
  note: string;
  version: number;
  variantIds: string[];
  itemNotes?: Record<string, {note:string; noteUpdatedAt:string|null; noteUpdatedAfterReview:boolean}>;
}
export interface MealState {
  sessionId: string;
  serviceDate: string;
  reviewVersion: number;
  items: DemandItem[];
  submissions: Submission[];
}
export class MenuRuleError extends Error {
  readonly code: string;
  readonly details: ErrorDetails;
  constructor(code: string, details: ErrorDetails = {}) {
    super(code);
    this.name = 'MenuRuleError';
    this.code = code;
    this.details = details;
  }
}
export function requireRule(condition: unknown, code = 'VALIDATION_ERROR', details: ErrorDetails = {}): asserts condition {
  if (!condition) throw new MenuRuleError(code, details);
}
export function requireText(value: string, max: number): void {
  requireRule(typeof value === 'string' && [...value].length <= max);
}
export function requireId(value: string): void {
  requireRule(typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value));
}
export function requireVersion(value: number): void {
  requireRule(Number.isSafeInteger(value) && value >= 1);
}
export function shanghaiDate(now: Date): string {
  requireRule(Number.isFinite(now.getTime()));
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function requireToday(serviceDate: string, now: Date): void {
  requireRule(serviceDate === shanghaiDate(now), 'DATE_READ_ONLY');
}
export function submitBlockedReason(serviceDate: string, submitted: boolean, now: Date): Session['submitBlockedReason'] {
  return submitted ? 'ALREADY_SUBMITTED' : serviceDate === shanghaiDate(now) ? null : 'DATE_READ_ONLY';
}
export function needsReview(item: DemandItem): boolean {
  return item.decision === 'UNREVIEWED' || item.demandVersion > item.reviewedDemandVersion;
}
export function newDemandItem(id: string, snapshot: Snapshot): DemandItem {
  return { id, ...snapshot, decision: 'UNREVIEWED', plannedQuantity: null, reason: '',
    demandVersion: 1, reviewedDemandVersion: 0, lastReviewedParticipantCount: 0 };
}
export function participantIds(state: MealState, variantId: string): Set<string> {
  return new Set(state.submissions.filter(s => s.variantIds.includes(variantId)).map(s => s.memberId));
}

// Display names come from retained member records, including LEFT/REMOVED members.
export function reviewDishes(state: MealState, names: ReadonlyMap<string, string>): Review['dishes'] {
  const dishes = new Map<string, Review['dishes'][number]>();
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  for (const item of state.items) {
    let dish = dishes.get(item.dishId);
    if (!dish) {
      dish = { dishId: item.dishId, name: item.dishName, kind: item.dishKind, uniqueParticipantCount: 0, variants: [] };
      dishes.set(item.dishId, dish);
    }
    const selected = state.submissions.filter(s => s.variantIds.includes(item.variantId))
      .sort((a, b) => compare(a.submittedAt, b.submittedAt) || compare(a.memberId, b.memberId));
    const participants = [...new Map(selected.map(s => [s.memberId, {
      memberId: s.memberId, displayName: names.get(s.memberId) ?? '',
      note: s.itemNotes?.[item.variantId]?.note ?? '', legacyNote: s.note,
      noteUpdatedAt: s.itemNotes?.[item.variantId]?.noteUpdatedAt ?? null,
      noteUpdatedAfterReview: s.itemNotes?.[item.variantId]?.noteUpdatedAfterReview ?? false,
    }])).values()];
    dish.variants.push({ itemId: item.id, variantId: item.variantId, name: item.variantName,
      portionDescription: item.portionDescription, participantCount: participants.length,
      decision: item.decision, needsReview: needsReview(item), plannedQuantity: item.plannedQuantity,
      unit: 'PORTION', reason: item.reason, participants,
      lastReviewedParticipantCount: item.lastReviewedParticipantCount,
      demandVersion: item.demandVersion, reviewedDemandVersion: item.reviewedDemandVersion });
  }
  for (const dish of dishes.values()) {
    dish.uniqueParticipantCount = new Set(dish.variants.flatMap(v => v.participants.map(p => p.memberId))).size;
    dish.variants.sort((a, b) => compare(a.name, b.name) || compare(a.variantId, b.variantId));
  }
  return [...dishes.values()].sort((a, b) => compare(a.name, b.name) || compare(a.dishId, b.dishId));
}
export function publicDishes(state: MealState): Menu['dishes'] {
  return reviewDishes(state, new Map()).map(dish => ({
    dishId: dish.dishId, name: dish.name, kind: dish.kind, uniqueParticipantCount: dish.uniqueParticipantCount,
    variants: dish.variants.map(v => ({ itemId: v.itemId, variantId: v.variantId, name: v.name,
      portionDescription: v.portionDescription, participantCount: v.participantCount,
      decision: v.decision, needsReview: v.needsReview, plannedQuantity: v.plannedQuantity,
      unit: v.unit, reason: v.reason })),
  }));
}

// Caller must hold the session lock and recheck ACTIVE ADMIN inside the transaction.
export function applyReview(state: MealState, request: ReviewRequest, now: Date): MealState {
  requireToday(state.serviceDate, now);
  requireVersion(request.expectedReviewVersion);
  requireRule(request.expectedReviewVersion === state.reviewVersion, 'REVIEW_VERSION_CONFLICT', { currentVersion: state.reviewVersion });
  requireRule(Array.isArray(request.items) && request.items.length > 0 && request.items.length <= 100);
  const changes = new Map<string, DemandItem>();
  let changed = false;
  for (const change of request.items) {
    requireId(change.itemId);
    requireRule(!changes.has(change.itemId));
    const item = state.items.find(i => i.id === change.itemId);
    requireRule(item, 'NOT_FOUND');
    requireText(change.reason, 200);
    if (change.decision === 'CONFIRMED') {
      const q = change.plannedQuantity;
      // Decimal tenths are compared with tolerance for binary floating-point only.
      requireRule(Number.isFinite(q) && q >= 0.1 && q <= 999.9 && Math.abs(q * 10 - Math.round(q * 10)) < 1e-9);
    } else {
      requireRule(change.decision === 'CANCELLED' && change.plannedQuantity === null && change.reason.trim().length > 0);
    }
    changed ||= needsReview(item) || item.decision !== change.decision || item.plannedQuantity !== change.plannedQuantity || item.reason !== change.reason;
    changes.set(item.id, { ...item, decision: change.decision, plannedQuantity: change.plannedQuantity,
      reason: change.reason, reviewedDemandVersion: item.demandVersion,
      lastReviewedParticipantCount: participantIds(state, item.variantId).size });
  }
  requireRule(changed);
  return { ...structuredClone(state), reviewVersion: state.reviewVersion + 1,
    items: state.items.map(item => ({ ...(changes.get(item.id) ?? item) })) };
}
