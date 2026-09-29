// 自动化契约与业务验收测试脚本 (对照《验收场景-v1.md》)

const fs = require('fs');
const apiPath = fs.existsSync('./api/services.js') ? './api/' : '../miniprogram/api/';
const Services = require(apiPath + 'services.js');
const { setActiveFamily } = require(apiPath + 'request.js');

async function runAcceptanceTests() {
  console.log('====================================================');
  console.log('开始执行家庭点饭系统前端工程业务验收测试 (风格 C)');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, scenarioName) {
    if (condition) {
      console.log(`[PASS] ${scenarioName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${scenarioName}`);
      failed++;
    }
  }

  try {
    // 场景 1：登录与家庭
    const loginRes = await Services.login('mock_wx_code_123');
    assert(loginRes.token && loginRes.user.displayName === '张三', '场景1.1 微信登录换取 Token 与用户信息');

    const families = await Services.listMyFamilies();
    assert(families.length > 0 && families[0].role === 'ADMIN', '场景1.2 获取我的有效家庭列表');
    setActiveFamily(families[0].id, families[0].role);

    // 场景 2：餐次与菜品浏览
    const today = '2026-09-11';
    const session = await Services.ensureSession(families[0].id, today, 'LUNCH');
    assert(session.id === 'session_lunch_today' && session.reviewVersion === 7, '场景2.1 确保并建立当天午餐餐次 (GET-or-CREATE)');

    const dishesRes = await Services.listDishes(families[0].id, session.id);
    assert(dishesRes.items.length >= 3, '场景2.2 获取当餐可见菜品（含正式菜与临时菜）');

    // 场景 3：购物车集合式点选（无加减器）与提交
    const cartAfterAdd = await Services.addCartItem(families[0].id, session.id, 'variant_1');
    assert(cartAfterAdd.items.some(i => i.variantId === 'variant_1'), '场景3.1 集合式幂等添加单项版本到购物车');

    const pm = await Services.submitMenu(families[0].id, session.id, ['variant_1'], '少放盐');
    assert(pm.items.length === 1 && pm.note === '少放盐', '场景3.2 提交个人选菜与整体备注');

    const updatedPm = await Services.updateNote(families[0].id, session.id, '少放盐、多放点姜', pm.version);
    assert(updatedPm.note === '少放盐、多放点姜' && updatedPm.version === 2, '场景3.3 提交后独立更新备注');

    // 场景 4：家庭总菜单看板（去重人数统计与隐私保护）
    const familyMenu = await Services.getFamilyMenu(families[0].id, session.id);
    const hshr = familyMenu.dishes.find(d => d.name === '红烧肉');
    assert(hshr && hshr.uniqueParticipantCount === 4, '场景4.1 红烧肉展示后端去重人数（4人想吃，非3+2）');
    const hasNotes = JSON.stringify(familyMenu).includes('多放点姜');
    assert(!hasNotes, '场景4.2 家庭总菜单隐私保护：不泄露他人个人备注');

    // 场景 5：管理员审核核心工作台（红烧肉规范展示与原子决议）
    const review = await Services.getReview(families[0].id, session.id);
    const reviewHshr = review.dishes.find(d => d.name === '红烧肉');
    const v1 = reviewHshr.variants.find(v => v.name === '普通版');
    const v2 = reviewHshr.variants.find(v => v.name === '少油版');
    assert(v1.decision === 'CONFIRMED' && v1.needsReview === true, '场景5.1 普通版同时展示已确认标记与需复审标记');
    assert(v1.participants.length === 3 && v1.participants[0].note.length > 0, '场景5.2 普通版包含3人名单及展开个人备注');
    assert(v2.decision === 'UNREVIEWED' && v2.plannedQuantity === null, '场景5.3 少油版未审核且制作份数为空');

    // 批量原子决议
    const reviewRes = await Services.reviewMenu(families[0].id, session.id, review.session.reviewVersion, [
      { itemId: v1.itemId, decision: 'CONFIRMED', plannedQuantity: 1.5, reason: '' },
      { itemId: v2.itemId, decision: 'CONFIRMED', plannedQuantity: 1.0, reason: '' }
    ]);
    assert(reviewRes.review.session.reviewVersion === 8, '场景5.4 原子批量审核生效，版本号推进至 v8');

    // 场景 6：临时菜新增与转正
    const tempDish = await Services.createTemporaryDish(families[0].id, session.id, {
      name: '蒜蓉大闸蟹',
      description: '当餐采买鲜活大闸蟹',
      imageFileId: null,
      isAvailable: true,
      variants: [{ name: '清蒸大个', portionDescription: '公蟹4两', description: '', isAvailable: true }]
    });
    assert(tempDish.kind === 'TEMPORARY', '场景6.1 创建当餐临时菜');

    const promoted = await Services.promoteDish(families[0].id, tempDish.id, 1);
    assert(promoted.kind === 'PERMANENT' && promoted.version === 2, '场景6.2 临时菜转为常备正式菜');

    // 场景 7：成员与 24 小时邀请码
    const membersRes = await Services.listMembers(families[0].id);
    assert(membersRes.items.length >= 4, '场景7.1 查询家庭全部成员及状态');

    const invite = await Services.createInvite(families[0].id, 'MEMBER');
    assert(invite.code && invite.code.length >= 16, '场景7.2 成功生成 24 小时邀请码');

    const audits = await Services.listOperations(families[0].id, session.id);
    assert(audits.items.length > 0, '场景7.3 查询管理操作审计流水日志');

    console.log('\n====================================================');
    console.log(`验收测试结果：${passed} 项全部通过，${failed} 项失败`);
    console.log('====================================================');
  } catch (err) {
    console.error('测试异常中断:', err);
  }
}

runAcceptanceTests();