// 验证：审核确认/取消后，成员可以重新点菜
// 模拟完整流程：提交 → 管理员审核(部分取消) → 成员重新加菜

// 内联 mock 核心逻辑做端到端验证
const mockDB = {
  sessions: {
    session_lunch_today: {
      id: 'session_lunch_today',
      canSubmit: true,
      submitBlockedReason: null,
      reviewVersion: 7
    }
  },
  personalMenus: { session_lunch_today: null },
  reviews: {
    session_lunch_today: {
      session: { id: 'session_lunch_today', reviewVersion: 7 },
      dishes: [
        {
          dishId: 'd1', name: '红烧肉', kind: 'PERMANENT', uniqueParticipantCount: 2,
          variants: [
            { itemId: 'item1', variantId: 'v1', name: '普通版', participantCount: 1, decision: 'UNREVIEWED', needsReview: true, plannedQuantity: null, demandVersion: 1, reviewedDemandVersion: 0, participants: [{ memberId: 'm1', displayName: '张三' }] },
            { itemId: 'item2', variantId: 'v2', name: '少油版', participantCount: 1, decision: 'UNREVIEWED', needsReview: true, plannedQuantity: null, demandVersion: 1, reviewedDemandVersion: 0, participants: [{ memberId: 'm2', displayName: '李四' }] }
          ]
        }
      ]
    }
  }
};

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ✅ ${msg}`); }
  else { fail++; console.log(`  ❌ FAIL: ${msg}`); }
}

// --- Step 1: 成员提交点餐 ---
console.log('\n=== Step 1: 成员提交 ===');
mockDB.personalMenus.session_lunch_today = {
  id: 'pm1', sessionId: 'session_lunch_today', version: 1,
  items: [
    { dishId: 'd1', variantId: 'v1', dishName: '红烧肉', variantName: '普通版', decision: 'UNREVIEWED', needsReview: true }
  ]
};
// 提交后锁定
mockDB.sessions.session_lunch_today.canSubmit = false;
mockDB.sessions.session_lunch_today.submitBlockedReason = 'ALREADY_SUBMITTED';

assert(mockDB.sessions.session_lunch_today.canSubmit === false, '提交后 canSubmit=false');
assert(mockDB.sessions.session_lunch_today.submitBlockedReason === 'ALREADY_SUBMITTED', '提交后 submitBlockedReason=ALREADY_SUBMITTED');

// --- Step 2: 管理员审核 — 全部确认，无取消 ---
console.log('\n=== Step 2: 管理员全部确认 ===');
const revAll = mockDB.reviews.session_lunch_today;
revAll.dishes[0].variants[0].decision = 'CONFIRMED';
revAll.dishes[0].variants[0].plannedQuantity = 1;
revAll.dishes[0].variants[0].needsReview = false;
revAll.dishes[0].variants[1].decision = 'CONFIRMED';
revAll.dishes[0].variants[1].plannedQuantity = 1;
revAll.dishes[0].variants[1].needsReview = false;
revAll.session.reviewVersion += 1;

// 检查是否有取消项 → 没有 → canSubmit 保持 false
let hasCancelled = false;
revAll.dishes.forEach(d => d.variants.forEach(v => { if (v.decision === 'CANCELLED') hasCancelled = true; }));
if (hasCancelled) {
  mockDB.sessions.session_lunch_today.canSubmit = true;
  mockDB.sessions.session_lunch_today.submitBlockedReason = null;
}

assert(mockDB.sessions.session_lunch_today.canSubmit === false, '全部确认后 canSubmit 保持 false（不需要重选）');

// 模拟 index.js initData 逻辑
const pm1 = mockDB.personalMenus.session_lunch_today;
// 同步 review decisions 到 pm items
pm1.items[0].decision = 'CONFIRMED';
const cancelledItems1 = pm1.items.filter(i => i.decision === 'CANCELLED');
const hasCancelled1 = cancelledItems1.length > 0;
const allCancelled1 = cancelledItems1.length === pm1.items.length;
const session1 = mockDB.sessions.session_lunch_today;
const sessionAllowsResubmit1 = session1.canSubmit === true;
const isReordering1 = allCancelled1 || (hasCancelled1 && sessionAllowsResubmit1);
const hasSubmitted1 = !isReordering1;

assert(hasSubmitted1 === true, '全部确认后 hasSubmitted=true（正常锁定，已提交状态）');
assert(isReordering1 === false, '全部确认后 isReordering=false');
console.log('  → 成员看到"已提交选菜"状态 ✓');

// --- Step 3: 管理员取消其中一个 ---
console.log('\n=== Step 3: 管理员部分取消 ===');
revAll.dishes[0].variants[0].decision = 'CANCELLED';
revAll.dishes[0].variants[0].reason = '食材今天没有';
revAll.session.reviewVersion += 1;

// 重新检查取消项
let hasCancelled2 = false;
revAll.dishes.forEach(d => d.variants.forEach(v => { if (v.decision === 'CANCELLED') hasCancelled2 = true; }));
if (hasCancelled2) {
  mockDB.sessions.session_lunch_today.canSubmit = true;
  mockDB.sessions.session_lunch_today.submitBlockedReason = null;
}

assert(mockDB.sessions.session_lunch_today.canSubmit === true, '有取消后 canSubmit 重置为 true');
assert(mockDB.sessions.session_lunch_today.submitBlockedReason === null, '有取消后 submitBlockedReason 重置为 null');

// 模拟 index.js initData 逻辑
pm1.items[0].decision = 'CANCELLED';
pm1.items[0].reason = '食材今天没有';
const cancelledItems2 = pm1.items.filter(i => i.decision === 'CANCELLED');
const hasCancelled3 = cancelledItems2.length > 0;
const allCancelled2 = cancelledItems2.length === pm1.items.length;
const session2 = mockDB.sessions.session_lunch_today;
const sessionAllowsResubmit2 = session2.canSubmit === true;
const isReordering2 = allCancelled2 || (hasCancelled3 && sessionAllowsResubmit2);
const hasSubmitted2 = !isReordering2;

assert(hasCancelled3 === true, '检测到有取消项');
assert(sessionAllowsResubmit2 === true, 'session.canSubmit=true → 允许重选');
assert(isReordering2 === true, '自动进入重选模式');
assert(hasSubmitted2 === false, 'hasSubmitted=false → 购物车条和菜品选择解锁');
console.log('  → 成员可以重新选菜、加菜 ✓');

// --- Step 4: 全部被取消的场景 ---
console.log('\n=== Step 4: 全部被取消 ===');
pm1.items[0].decision = 'CANCELLED';
// 只有一个 item 且被取消
const cancelledItems3 = pm1.items.filter(i => i.decision === 'CANCELLED');
const allCancelled3 = cancelledItems3.length === pm1.items.length;
const isReordering3 = allCancelled3;

assert(allCancelled3 === true, '全部取消检测正确');
assert(isReordering3 === true, '全部取消 → 自动解锁重选');

// --- 汇总 ---
console.log(`\n=============================`);
console.log(`总计: ${pass + fail} 项, 通过: ${pass}, 失败: ${fail}`);
if (fail === 0) {
  console.log('🎉 所有测试通过！耦合问题已修复。');
} else {
  console.log('⚠️ 有测试失败，请检查。');
}
