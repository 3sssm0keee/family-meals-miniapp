import { requireRule, requireToday, requireId } from '../family-menu/domain.js';

export interface CartState { version: number; variantIds: string[] }
export interface CartContext { serviceDate: string; submitted: boolean; now: Date }

export function changeCart(cart: CartState, variantId: string, action: 'ADD' | 'REMOVE', context: CartContext): CartState {
  requireToday(context.serviceDate, context.now);
  requireId(variantId);
  requireRule(action === 'ADD' || action === 'REMOVE');
  const exists = cart.variantIds.includes(variantId);
  if ((action === 'ADD') === exists) return structuredClone(cart);
  requireRule(action !== 'ADD' || cart.variantIds.length < 100);
  return { version: cart.version + 1, variantIds: action === 'ADD'
    ? [...cart.variantIds, variantId] : cart.variantIds.filter(id => id !== variantId) };
}

// Successful submission increments even an already-empty cart's version.
export function clearSubmittedCart(cart: CartState): CartState {
  return { version: cart.version + 1, variantIds: [] };
}
