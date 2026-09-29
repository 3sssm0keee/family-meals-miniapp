import type { AppendRequest, NoteUpdate, SubmitRequest } from '../../../docs/contracts/frontend-types.js';
import type { MealState, Snapshot } from '../family-menu/domain.js';
import { newDemandItem, requireRule, requireToday, requireText, requireId, requireVersion } from '../family-menu/domain.js';

export interface AvailableVariant extends Snapshot {
  familyId: string;
  dishDeleted: boolean;
  variantDeleted: boolean;
  dishAvailable: boolean;
  variantAvailable: boolean;
  originSessionId: string | null;
}
export function isSelectable(variant: AvailableVariant, familyId: string, sessionId: string): boolean {
  return variant.familyId === familyId && !variant.dishDeleted && !variant.variantDeleted &&
    variant.dishAvailable && variant.variantAvailable &&
    (variant.dishKind === 'PERMANENT' || variant.originSessionId === sessionId);
}
export interface SubmitContext {
  familyId: string;
  memberId: string;
  personalMenuId: string;
  now: Date;
  // IDs allocated by the adapter; no database or randomness hidden in domain logic.
  newItemIds: ReadonlyMap<string, string>;
  variants: ReadonlyMap<string, AvailableVariant>;
}

// The body is the complete selection; cart state deliberately is not an input.
export function submitMenu(state: MealState, request: SubmitRequest, context: SubmitContext): MealState {
  const existing = state.submissions.find(s => s.memberId === context.memberId);
  requireRule(!existing, 'ALREADY_SUBMITTED', existing ? { resourceId: existing.id } : {});
  requireToday(state.serviceDate, context.now);
  requireText(request.note, 500);
  requireRule(Array.isArray(request.variantIds) && request.variantIds.length > 0 && request.variantIds.length <= 100);
  requireRule(new Set(request.variantIds).size === request.variantIds.length);
  request.variantIds.forEach(requireId);
  const fieldErrors: { field: string; message: string }[] = [];
  request.variantIds.forEach((id, index) => {
    const variant = context.variants.get(id);
    if (!variant || variant.variantId !== id || !isSelectable(variant, context.familyId, state.sessionId)) {
      fieldErrors.push({ field: `variantIds[${index}]`, message: 'VARIANT_UNAVAILABLE' });
    }
  });
  requireRule(fieldErrors.length === 0, 'VARIANT_UNAVAILABLE', { fieldErrors });
  const next = structuredClone(state);
  for (const id of request.variantIds) {
    const item = next.items.find(i => i.variantId === id);
    if (item) item.demandVersion += 1;
    else {
      const allocated = context.newItemIds.get(id);
      requireRule(allocated, 'VALIDATION_ERROR');
      requireId(allocated);
      requireRule(!next.items.some(i => i.id === allocated));
      const variant = context.variants.get(id)!;
      // Explicit snapshot allowlist, without catalog availability or family fields.
      next.items.push(newDemandItem(allocated, { dishId: variant.dishId, variantId: id,
        dishName: variant.dishName, variantName: variant.variantName,
        portionDescription: variant.portionDescription, dishKind: variant.dishKind }));
    }
  }
  next.submissions.push({ id: context.personalMenuId, memberId: context.memberId,
    submittedAt: context.now.toISOString(), note: request.note, version: 1, variantIds: [...request.variantIds] });
  next.reviewVersion += 1;
  return next;
}

// Append is a delta, not replacement. Reuse initial demand validation/snapshot logic
// while retaining the original submission identity, timestamp and note.
export function appendMenu(state: MealState, request: AppendRequest, context: SubmitContext): MealState {
  requireToday(state.serviceDate, context.now);
  const existing = state.submissions.find(s => s.memberId === context.memberId);
  requireRule(existing, 'NOT_FOUND');
  requireVersion(request.expectedVersion);
  requireRule(request.expectedVersion === existing.version, 'VERSION_CONFLICT', { currentVersion: existing.version });
  requireRule(Array.isArray(request.variantIds) && request.variantIds.length > 0 && request.variantIds.length <= 100);
  requireRule(new Set(request.variantIds).size === request.variantIds.length);
  request.variantIds.forEach(requireId);
  const added = request.variantIds.filter(id => !existing.variantIds.includes(id));
  requireRule(existing.variantIds.length + added.length <= 100);
  if (!added.length) return structuredClone(state);
  // Report indices in the original request, including any existing selections.
  const fieldErrors = request.variantIds.flatMap((id, index) => {
    if (existing.variantIds.includes(id)) return [];
    const variant = context.variants.get(id);
    return !variant || variant.variantId !== id || !isSelectable(variant, context.familyId, state.sessionId)
      ? [{ field: `variantIds[${index}]`, message: 'VARIANT_UNAVAILABLE' }] : [];
  });
  requireRule(fieldErrors.length === 0, 'VARIANT_UNAVAILABLE', { fieldErrors });
  const next = submitMenu({ ...state, submissions: state.submissions.filter(s => s.memberId !== context.memberId) },
    { variantIds: added, note: existing.note }, { ...context, personalMenuId: existing.id });
  next.submissions = state.submissions.map(s => structuredClone(s.memberId === context.memberId
    ? { ...existing, version: existing.version + 1, variantIds: [...existing.variantIds, ...added] } : s));
  return next;
}

export function updateNote(state: MealState, memberId: string, request: NoteUpdate, now: Date): MealState {
  requireToday(state.serviceDate, now);
  const menu = state.submissions.find(s => s.memberId === memberId);
  requireRule(menu, 'NOT_FOUND');
  requireVersion(request.expectedVersion);
  requireRule(request.expectedVersion === menu.version, 'VERSION_CONFLICT', { currentVersion: menu.version });
  requireText(request.note, 500);
  const next = structuredClone(state);
  if (menu.note === request.note) return next;
  const nextMenu = next.submissions.find(s => s.memberId === memberId)!;
  nextMenu.note = request.note;
  nextMenu.version += 1;
  next.reviewVersion += 1;
  return next;
}
