import type { AuditItem, Menu, Notification, ReviewRequest, Session } from '../../../docs/contracts/frontend-types.js';
import type { MealState } from '../family-menu/domain.js';
import { applyReview, publicDishes, requireRule } from '../family-menu/domain.js';

export type DeliveryStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'UNKNOWN';
export interface NotificationPlan {
  batchId: string;
  memberId: string;
  channel: 'WECHAT_SUBSCRIBE';
  status: DeliveryStatus;
  reasonCode: Notification['reasonCode'];
}
export interface ReviewBatchSnapshot {
  changes: ReviewRequest['items'];
  menu: Menu;
}
export interface ReviewEffectsContext {
  batchId: string;
  actorMemberId: string;
  actorName: string;
  session: Session;
  now: Date;
  activeMemberIds: ReadonlySet<string>;
  channelEnabled: boolean;
  // Server-side delivery eligibility. Client ACCEPT alone is not proof of authorization.
  eligibleMemberIds: ReadonlySet<string>;
}

// Produces a transaction write plan only. It neither persists nor sends anything.
export function planReview(state: MealState, request: ReviewRequest, context: ReviewEffectsContext) {
  requireRule(context.session.id === state.sessionId && context.session.serviceDate === state.serviceDate);
  const next = applyReview(state, request, context.now);
  const snapshot: ReviewBatchSnapshot = {
    changes: request.items.map(i => i.decision === 'CONFIRMED'
      ? { itemId: i.itemId, decision: i.decision, plannedQuantity: i.plannedQuantity, reason: i.reason }
      : { itemId: i.itemId, decision: i.decision, plannedQuantity: null, reason: i.reason }),
    menu: { session: { id: context.session.id, serviceDate: context.session.serviceDate,
      mealType: context.session.mealType, timezone: 'Asia/Shanghai', serverTime: context.now.toISOString(),
      canSubmit: context.session.canSubmit, submitBlockedReason: context.session.submitBlockedReason,
      reviewVersion: next.reviewVersion }, dishes: publicDishes(next) },
  };
  const notifications: NotificationPlan[] = [...new Set(state.submissions.map(s => s.memberId))]
    .filter(id => context.activeMemberIds.has(id)).sort().map(memberId => {
      const reasonCode = !context.channelEnabled ? 'CHANNEL_DISABLED'
        : !context.eligibleMemberIds.has(memberId) ? 'NO_CONSENT' : null;
      return { batchId: context.batchId, memberId, channel: 'WECHAT_SUBSCRIBE',
        status: reasonCode ? 'SKIPPED' : 'PENDING', reasonCode };
    });
  const audit = {
    sessionId: state.sessionId, actorMemberId: context.actorMemberId, actorName: context.actorName,
    action: 'MENU_REVIEW' satisfies AuditItem['action'], resourceId: context.batchId, reason: '',
    summary: `审核 ${request.items.length} 项`,
    beforeValue: { reviewVersion: state.reviewVersion, dishes: publicDishes(state) },
    afterValue: { reviewVersion: next.reviewVersion, dishes: publicDishes(next) },
  };
  // Cloning severs references to mutable input drafts, catalog and later reviews.
  return structuredClone({ state: next, batch: { id: context.batchId,
    fromVersion: state.reviewVersion, toVersion: next.reviewVersion, snapshot }, notifications, audit });
}

export function finishDelivery(status: DeliveryStatus, outcome: 'SUCCESS' | 'PERMANENT_FAILURE' | 'SKIP' | 'TIMEOUT'): DeliveryStatus {
  requireRule(status === 'PENDING');
  const statuses = { SUCCESS: 'SENT', PERMANENT_FAILURE: 'FAILED', SKIP: 'SKIPPED', TIMEOUT: 'UNKNOWN' } as const;
  requireRule(Object.hasOwn(statuses, outcome));
  return statuses[outcome];
}
