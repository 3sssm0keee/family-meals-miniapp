// 端到端测试：未点菜角色（小明）做补充点菜，随后管理员（张三）审核新需求的完整闭环

const {
  request,
  setCurrentMember,
  getCurrentMember,
  setActiveFamily
} = require('./api/request.js');
const Services = require('./api/services.js');
const mockDB = require('./api/mockData.js');

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ✅ ${msg}`); }
  else { fail++; console.log(`  ❌ FAIL: ${msg}`); }
}

async function runTest() {
  console.log('\n======================================================');
  console.log('测试场景：未点菜成员【小明】补充点菜与管理员审核联动');
  console.log('======================================================');

  setActiveFamily('fam_1', 'ADMIN');

  // --- Step 1: 验证初始成员与状态 ---
  console.log('\n--- Step 1: 验证初始成员数据 ---');
  const famMembers = mockDB.members['fam_1'];
  const hasM5 = famMembers.some(m => m.id === 'm5' && m.displayName === '小明');
  assert(hasM5, '家庭成员列表中包含未点菜角色：m5 (小明)');

  // 初始为 m1 张三
  setCurrentMember('m1', '张三', 'ADMIN');
  const cur1 = getCurrentMember();
  assert(cur1.memberId === 'm1' && cur1.role === 'ADMIN', '当前用户为张三 (ADMIN)');

  // 张三完成当餐首次点单提交
  await Services.submitMenu('fam_1', 'session_lunch_today', ['variant_1'], '少放盐');
  const pmZhang = await Services.getPersonalMenu('fam_1', 'session_lunch_today');
  assert(pmZhang && pmZhang.items && pmZhang.items.length > 0, '张三完成首次选菜提交 (已点菜)');

  // --- Step 2: 切换到未点菜角色【小明】---
  console.log('\n--- Step 2: 切换到角色【小明】---');
  setCurrentMember('m5', '小明', 'MEMBER');
  const cur2 = getCurrentMember();
  assert(cur2.memberId === 'm5' && cur2.role === 'MEMBER', '成功切换当前用户为 小明 (MEMBER)');

  const sessionMing = await Services.ensureSession('fam_1', '2026-09-11', 'LUNCH');
  assert(sessionMing.canSubmit === true, '小明当餐 canSubmit = true（允许点餐）');
  assert(sessionMing.submitBlockedReason === null, '小明当餐 submitBlockedReason = null');

  const pmMing = await Services.getPersonalMenu('fam_1', 'session_lunch_today');
  assert(pmMing === null, '小明当餐个人点单初始为空（未点菜）');

  // --- Step 3: 小明进行选菜并加入购物车 ---
  console.log('\n--- Step 3: 小明选菜加购 ---');
  // 选菜：红烧肉-少油版 (variant_2)
  await Services.addCartItem('fam_1', 'session_lunch_today', 'variant_2');

  const cartMing = await Services.getCart('fam_1', 'session_lunch_today');
  assert(cartMing.items.length === 1, '小明购物车中有 1 道菜品');
  assert(cartMing.items.some(i => i.variantId === 'variant_2'), '包含红烧肉（少油版）');

  // --- Step 4: 小明提交补充点菜 ---
  console.log('\n--- Step 4: 小明提交补充点单 ---');
  const submittedPm = await Services.submitMenu(
    'fam_1',
    'session_lunch_today',
    ['variant_2'],
    '小明不吃辣，米饭多一点'
  );
  assert(submittedPm && submittedPm.items.length === 1, '小明提交成功，生成个人点单');
  assert(submittedPm.note === '小明不吃辣，米饭多一点', '备注正确记录');

  // 提交后购物车应清空
  const emptyCart = await Services.getCart('fam_1', 'session_lunch_today');
  assert(emptyCart.items.length === 0, '提交后小明购物车自动清空');

  // 检查小明的 session 状态变更为已提交
  const afterSession = await Services.ensureSession('fam_1', '2026-09-11', 'LUNCH');
  assert(afterSession.canSubmit === false, '小明提交后当餐锁定 canSubmit = false');
  assert(afterSession.submitBlockedReason === 'ALREADY_SUBMITTED', '锁定原因: ALREADY_SUBMITTED');

  // --- Step 5: 切换回掌勺管理员【张三】查看审核联动 ---
  console.log('\n--- Step 5: 管理员张三查看审核数据（验证补充点单联动）---');
  setCurrentMember('m1', '张三', 'ADMIN');
  const reviewData = await Services.getReview('fam_1', 'session_lunch_today');

  // 检查红烧肉 (dish_1) 少油版 (variant_2) 是否包含了小明
  const hshr = reviewData.dishes.find(d => d.dishId === 'dish_1');
  const shaoyou = hshr.variants.find(v => v.variantId === 'variant_2');
  const mingInShaoyou = shaoyou.participants.some(p => p.memberId === 'm5');
  assert(mingInShaoyou, '红烧肉少油版中已包含小明！');
  assert(shaoyou.needsReview === true, '红烧肉少油版标记为 needsReview = true (有新增待审核)');
  console.log(`  → 红烧肉少油版当前点单人数: ${shaoyou.participantCount}人`);

  // --- Step 6: 管理员审核小明的新增需求 ---
  console.log('\n--- Step 6: 管理员审核确认补充菜品 ---');
  const currentVer = reviewData.session.reviewVersion;
  const reviewResult = await Services.reviewMenu('fam_1', 'session_lunch_today', currentVer, [
    {
      itemId: shaoyou.itemId,
      decision: 'CONFIRMED',
      plannedQuantity: 2.0,
      reason: ''
    }
  ]);
  assert(reviewResult && reviewResult.review, '管理员批量公布决议成功');
  assert(reviewResult.review.session.reviewVersion === currentVer + 1, '审核版本自增 +1');

  // --- Step 7: 切换回小明验证决议同步 ---
  console.log('\n--- Step 7: 验证小明端接收到最新决议 ---');
  setCurrentMember('m5', '小明', 'MEMBER');
  const finalPmMing = await Services.getPersonalMenu('fam_1', 'session_lunch_today');
  const mingShaoyou = finalPmMing.items.find(i => i.variantId === 'variant_2');
  assert(mingShaoyou.decision === 'CONFIRMED', '小明个人菜单中红烧肉少油版显示【已确认】');
  assert(mingShaoyou.plannedQuantity === 2.0, '制作份数更新为 2.0 份');

  console.log('\n======================================================');
  console.log(`总计测试: ${pass + fail} 项, 通过: ${pass}, 失败: ${fail}`);
  if (fail === 0) {
    console.log('🎉 补充点菜全流程测试 100% 通过！');
  } else {
    console.log('⚠️ 有测试失败');
  }
}

runTest().catch(console.error);
