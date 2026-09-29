import test from 'node:test';
import assert from 'node:assert/strict';
import { applyReview, newDemandItem, participantIds, publicDishes, reviewDishes, needsReview, shanghaiDate, submitBlockedReason } from '../../src/family-menu/domain.ts';
import type { MealState } from '../../src/family-menu/domain.ts';
import { submitMenu, updateNote } from '../../src/personal-menu/domain.ts';
import type { AvailableVariant } from '../../src/personal-menu/domain.ts';
import { changeCart, clearSubmittedCart } from '../../src/cart/domain.ts';
import { finishDelivery, planReview } from '../../src/notification/domain.ts';
import type { ReviewRequest, Session } from '../../../docs/contracts/frontend-types.ts';

const now = new Date('2026-09-11T04:00:00.000Z');
const empty = (): MealState => ({ sessionId: 'lunch', serviceDate: '2026-09-11', reviewVersion: 1, items: [], submissions: [] });
const variant = (id: string, overrides: Partial<AvailableVariant> = {}): AvailableVariant => ({
  familyId: 'family', dishId: 'dish', variantId: id, dishName: '番茄炒蛋', variantName: id,
  portionDescription: '一份一盘', dishKind: 'PERMANENT', dishDeleted: false, variantDeleted: false,
  dishAvailable: true, variantAvailable: true, originSessionId: null, ...overrides,
});
function submit(state: MealState, memberId: string, ids: string[], overrides: Partial<AvailableVariant> = {}) {
  return submitMenu(state, { variantIds: ids, note: '少盐' }, {
    familyId: 'family', memberId, personalMenuId: `menu_${memberId}`, now,
    variants: new Map(ids.map(id => [id, variant(id, overrides)])),
    newItemIds: new Map(ids.map(id => [id, `item_${id}`])),
  });
}
function example() {
  let state = empty();
  for (const [id, ids] of [['a', ['normal']], ['b', ['normal', 'oil']], ['c', ['normal']], ['d', ['oil']]] as const) {
    state = submit(state, id, [...ids]);
  }
  return state;
}
const confirm = (state: MealState): ReviewRequest => ({ expectedReviewVersion: state.reviewVersion,
  items: [{ itemId: 'item_normal', decision: 'CONFIRMED', plannedQuantity: 1.5, reason: '' }] });
const error = (code: string) => (e: unknown) => {
  assert.equal((e as { code: string }).code, code);
  return true;
};

test('3/2/4 distinct members; same display names do not merge; quantities are independent', () => {
  const state = example();
  const reviewed = applyReview(state, confirm(state), now);
  const [dish] = reviewDishes(reviewed, new Map(['a', 'b', 'c', 'd'].map(id => [id, '同名'])));
  assert.equal(dish.uniqueParticipantCount, 4);
  assert.deepEqual(dish.variants.map(v => v.participantCount), [3, 2]);
  assert.equal(dish.variants[0].plannedQuantity, 1.5);
  assert.equal(dish.variants[0].lastReviewedParticipantCount, 3);
  assert.deepEqual(dish.variants[0].participants.map(p => p.memberId), ['a', 'b', 'c']);
  assert.equal(state.reviewVersion, 5);
  assert.equal(reviewed.reviewVersion, 6);
  assert.equal(state.items[0].decision, 'UNREVIEWED');
});

test('aggregation deduplicates repeated member links defensively', () => {
  const state = example();
  state.submissions.push(structuredClone(state.submissions[0]));
  assert.equal(participantIds(state, 'normal').size, 3);
  assert.equal(publicDishes(state)[0].uniqueParticipantCount, 4);
});

test('new demand preserves confirmed and cancelled decisions but requires another review', () => {
  for (const decision of ['CONFIRMED', 'CANCELLED'] as const) {
    const state = example();
    const request: ReviewRequest = { expectedReviewVersion: state.reviewVersion, items: [decision === 'CONFIRMED'
      ? { itemId: 'item_normal', decision, plannedQuantity: 1.5, reason: '' }
      : { itemId: 'item_normal', decision, plannedQuantity: null, reason: '今天不做' }] };
    const reviewed = applyReview(state, request, now);
    const next = submit(reviewed, 'e', ['normal']);
    assert.equal(next.items[0].decision, decision);
    assert.equal(next.items[0].plannedQuantity, reviewed.items[0].plannedQuantity);
    assert.equal(next.items[0].lastReviewedParticipantCount, 3);
    assert.equal(needsReview(next.items[0]), true);
    assert.equal(participantIds(next, 'normal').size, 4);
    assert.throws(() => applyReview(next, request, now), error('REVIEW_VERSION_CONFLICT'));
    assert.equal(needsReview(applyReview(next, { ...request, expectedReviewVersion: next.reviewVersion }, now).items[0]), false);
  }
});

test('batch is all-or-nothing, validates duplicates and cross-session IDs', () => {
  const state = example();
  const before = structuredClone(state);
  const valid = confirm(state).items[0];
  const badRequests: ReviewRequest[] = [
    { expectedReviewVersion: state.reviewVersion, items: [valid, { itemId: 'item_oil', decision: 'CANCELLED', plannedQuantity: null, reason: ' ' }] },
    { expectedReviewVersion: state.reviewVersion, items: [valid, valid] },
    { expectedReviewVersion: state.reviewVersion, items: [valid, { ...valid, itemId: 'other_session_item' }] },
  ];
  for (const request of badRequests) {
    assert.throws(() => applyReview(state, request, now));
    assert.deepEqual(state, before);
  }
  const next = applyReview(state, { expectedReviewVersion: state.reviewVersion,
    items: [valid, { itemId: 'item_oil', decision: 'CANCELLED', plannedQuantity: null, reason: '不做' }] }, now);
  assert.equal(next.reviewVersion, state.reviewVersion + 1);
  assert.deepEqual(next.items.map(i => i.demandVersion), state.items.map(i => i.demandVersion));
});

test('quantity limits reject invalid values and accept one decimal boundaries', () => {
  const state = example();
  for (const q of [0, -1, 1000, 0.01, 1.25, NaN, Infinity]) {
    assert.throws(() => applyReview(state, { ...confirm(state), items: [{ ...confirm(state).items[0], decision: 'CONFIRMED', plannedQuantity: q }] }, now), error('VALIDATION_ERROR'));
  }
  for (const q of [0.1, 0.3, 1.5, 999.9]) {
    const result = applyReview(state, { ...confirm(state), items: [{ ...confirm(state).items[0], decision: 'CONFIRMED', plannedQuantity: q }] }, now);
    assert.equal(result.items[0].plannedQuantity, q);
  }
});

test('unchanged fresh review rejected, unselected rows preserved, stale version includes currentVersion', () => {
  const state = example();
  const next = applyReview(state, confirm(state), now);
  assert.deepEqual(next.items[1], state.items[1]);
  assert.throws(() => applyReview(next, confirm(next), now), error('VALIDATION_ERROR'));
  assert.throws(() => applyReview(next, confirm(state), now), (e: any) => {
    assert.equal(e.code, 'REVIEW_VERSION_CONFLICT');
    assert.deepEqual(e.details, { currentVersion: next.reviewVersion });
    return true;
  });
});

test('legacy note edit preserves reviewed demands and headcounts; same note is a no-op', () => {
  const state = example();
  const next = updateNote(state, 'b', { expectedVersion: 1, note: '不要葱' }, now);
  assert.deepEqual(next.items.map(i => i.demandVersion), state.items.map(i => i.demandVersion));
  assert.equal(next.reviewVersion, state.reviewVersion + 1);
  assert.equal(next.submissions[1].version, 2);
  assert.equal(publicDishes(next)[0].uniqueParticipantCount, 4);
  assert.deepEqual(updateNote(next, 'b', { expectedVersion: 2, note: '不要葱' }, now), next);
  assert.throws(() => updateNote(next, 'b', { expectedVersion: 1, note: '不要葱' }, now), error('VERSION_CONFLICT'));
});

test('snapshot is first per-session variant snapshot; future catalog edits do not rewrite history', () => {
  const state = submit(empty(), 'a', ['normal']);
  const next = submit(state, 'b', ['normal'], { dishName: '新菜名', variantName: '新版', portionDescription: '新规格' });
  assert.equal(next.items[0].dishName, '番茄炒蛋');
  assert.equal(next.items[0].variantName, 'normal');
  assert.equal(submit(empty(), 'a', ['normal'], { dishName: '新菜名' }).items[0].dishName, '新菜名');
});

test('submission selection validation is atomic and unavailable errors identify indices', () => {
  const state = empty();
  for (const overrides of [{ familyId: 'other' }, { dishDeleted: true }, { variantDeleted: true },
    { dishAvailable: false }, { variantAvailable: false }, { dishKind: 'TEMPORARY' as const, originSessionId: 'dinner' }]) {
    assert.throws(() => submit(state, 'a', ['normal'], overrides), (e: any) => {
      assert.equal(e.code, 'VARIANT_UNAVAILABLE');
      assert.deepEqual(e.details.fieldErrors, [{ field: 'variantIds[0]', message: 'VARIANT_UNAVAILABLE' }]);
      return true;
    });
    assert.deepEqual(state, empty());
  }
  for (const ids of [[], ['normal', 'normal'], Array.from({ length: 101 }, (_, i) => `v${i}`)]) {
    assert.throws(() => submit(state, 'a', ids), error('VALIDATION_ERROR'));
  }
});

test('one submission per member per meal, historical duplicate error has priority', () => {
  const state = submit(empty(), 'a', ['normal']);
  assert.throws(() => submit({ ...state, serviceDate: '2026-09-10' }, 'a', ['oil']), (e: any) => {
    assert.equal(e.code, 'ALREADY_SUBMITTED');
    assert.deepEqual(e.details, { resourceId: 'menu_a' });
    return true;
  });
  assert.equal(submit({ ...empty(), sessionId: 'dinner' }, 'a', ['oil']).submissions.length, 1);
});

test('Shanghai midnight changes write eligibility and does not use UTC date', () => {
  const midnight = new Date('2026-09-11T16:00:00.000Z');
  assert.equal(shanghaiDate(new Date(midnight.getTime() - 1)), '2026-09-11');
  assert.equal(shanghaiDate(midnight), '2026-09-12');
  assert.equal(submitBlockedReason('2026-09-11', false, midnight), 'DATE_READ_ONLY');
  assert.equal(submitBlockedReason('2026-09-11', true, midnight), 'ALREADY_SUBMITTED');
  const state = example();
  assert.throws(() => applyReview(state, confirm(state), midnight), error('DATE_READ_ONLY'));
  assert.throws(() => updateNote(state, 'a', { expectedVersion: 1, note: '' }, midnight), error('DATE_READ_ONLY'));
});

test('cart no-op versions, maximum size, submitted writes and clear version', () => {
  const context = { serviceDate: '2026-09-11', submitted: false, now };
  const cart = { version: 1, variantIds: [] };
  const added = changeCart(cart, 'normal', 'ADD', context);
  assert.deepEqual(added, { version: 2, variantIds: ['normal'] });
  assert.deepEqual(changeCart(added, 'normal', 'ADD', context), added);
  assert.deepEqual(changeCart(added, 'oil', 'REMOVE', context), added);
  assert.deepEqual(changeCart(added, 'normal', 'REMOVE', context), { version: 3, variantIds: [] });
  assert.deepEqual(clearSubmittedCart(cart), { version: 2, variantIds: [] });
  assert.deepEqual(changeCart(added, 'normal', 'REMOVE', { ...context, submitted: true }), { version: 3, variantIds: [] });
  assert.throws(() => changeCart(added, 'normal', 'ADD', { ...context, submitted: true, serviceDate: '2026-09-10' }), error('DATE_READ_ONLY'));
  assert.throws(() => changeCart({ version: 1, variantIds: Array.from({ length: 100 }, (_, i) => `v${i}`) }, 'extra', 'ADD', context), error('VALIDATION_ERROR'));
});

test('zero demand temporary item can be reviewed with zero recipients', () => {
  const state = empty();
  state.items.push(newDemandItem('item_normal', variant('normal', { dishKind: 'TEMPORARY', originSessionId: 'lunch' })));
  const next = applyReview(state, confirm(state), now);
  assert.equal(next.items[0].lastReviewedParticipantCount, 0);
  assert.equal(publicDishes(next)[0].uniqueParticipantCount, 0);
  assert.equal(planReview(state, confirm(state), effectsContext(state)).notifications.length, 0);
});

function effectsContext(state: MealState) {
  const session: Session = { id: state.sessionId, serviceDate: state.serviceDate, mealType: 'LUNCH',
    timezone: 'Asia/Shanghai', serverTime: now.toISOString(), canSubmit: false,
    submitBlockedReason: 'ALREADY_SUBMITTED', reviewVersion: state.reviewVersion };
  return { batchId: 'batch', actorMemberId: 'a', actorName: '管理员', session, now,
    activeMemberIds: new Set(['a', 'b', 'c']), channelEnabled: false, eligibleMemberIds: new Set(['a', 'b']) };
}

test('notification and audit plans contain detached public snapshots, no private notes', () => {
  const state = example();
  const request = confirm(state);
  const plan = planReview(state, request, effectsContext(state));
  assert.deepEqual(plan.notifications.map(n => [n.memberId, n.status, n.reasonCode]),
    ['a', 'b', 'c'].map(id => [id, 'SKIPPED', 'CHANNEL_DISABLED']));
  assert.equal(plan.audit.action, 'MENU_REVIEW');
  const serialized = JSON.stringify(plan.batch.snapshot);
  for (const forbidden of ['participants', 'note', 'demandVersion', 'reviewedDemandVersion', '少盐']) {
    assert.equal(serialized.includes(forbidden), false);
    assert.equal(JSON.stringify(plan.audit).includes(forbidden), false);
  }
  request.items[0].reason = 'later';
  plan.state.items[0].reason = 'later';
  assert.equal(plan.batch.snapshot.changes[0].reason, '');
  assert.equal(plan.batch.snapshot.menu.dishes[0].variants[0].reason, '');
  const enabled = planReview(state, confirm(state), { ...effectsContext(state), channelEnabled: true });
  assert.deepEqual(enabled.notifications.map(n => [n.status, n.reasonCode]), [['PENDING', null], ['PENDING', null], ['SKIPPED', 'NO_CONSENT']]);
});

test('uncertain delivery is UNKNOWN and terminal states cannot be automatically resent', () => {
  assert.equal(finishDelivery('PENDING', 'TIMEOUT'), 'UNKNOWN');
  assert.equal(finishDelivery('PENDING', 'SUCCESS'), 'SENT');
  assert.equal(finishDelivery('PENDING', 'PERMANENT_FAILURE'), 'FAILED');
  assert.equal(finishDelivery('PENDING', 'SKIP'), 'SKIPPED');
  for (const status of ['UNKNOWN', 'SENT', 'FAILED', 'SKIPPED'] as const) {
    assert.throws(() => finishDelivery(status, 'SUCCESS'), error('VALIDATION_ERROR'));
  }
});
