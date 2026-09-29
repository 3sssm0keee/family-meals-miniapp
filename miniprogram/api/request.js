// 核心网络请求层：契约校验、自动令牌注入、幂等键管理、统一响应解析与 Mock 拦截

const CONFIG = require('../config.js');
const util = require('../utils/util.js');
const mockDB = require('./mockData.js');
const transport = require('./transport.js');

// 运行时存储
let authGeneration = 0;
let currentToken = CONFIG.USE_MOCK ? mockDB.token : null;
let activeFamilyId = CONFIG.USE_MOCK ? 'fam_1' : null;
let currentRole = CONFIG.USE_MOCK ? 'ADMIN' : null; // 默认当前角色
let currentMemberId = CONFIG.USE_MOCK ? 'm1' : null;  // 当前成员 ID（支持多成员切换）
let currentMemberName = CONFIG.USE_MOCK ? '张三' : '';

function setAuthToken(token) {
  if (currentToken !== token) authGeneration++;
  currentToken = token;
  transport.setToken(token);
}

function setActiveFamily(familyId, role) {
  activeFamilyId = familyId;
  currentRole = role || null;
}

function getActiveFamily() {
  return { familyId: activeFamilyId, role: currentRole };
}

function setCurrentMember(memberId, memberName, role = 'MEMBER') {
  if (!CONFIG.USE_MOCK) return;
  currentMemberId = memberId;
  currentMemberName = memberName;
  currentRole = role || null;
  mockDB.currentUser = {
    id: `user_${memberId}`,
    displayName: memberName
  };
  const fam = mockDB.families.find(f => f.id === activeFamilyId);
  if (fam) {
    fam.memberId = memberId;
    if (role) fam.role = role;
  }
}

function getCurrentMember() {
  if (!CONFIG.USE_MOCK) {
    const app = typeof getApp === 'function' ? getApp() : null;
    const state = app && app.globalData || {};
    const family = state.activeFamily, user = state.currentUser;
    return {memberId: family ? family.memberId : null, memberName: user ? user.displayName : '', role: family ? family.role : null};
  }
  return { memberId: currentMemberId, memberName: currentMemberName, role: currentRole };
}

/**
 * 统一网络请求
 */
function request(options) {
  const {
    url,
    method = 'GET',
    data = null,
    headers = {},
    idempotencyKey = null,
    silent = false
  } = options;

  // 1. 若开启 MOCK 模式，直接交由 Mock 处理器执行业务契约
  if (CONFIG.USE_MOCK) {
    return handleMockRequest(url, method, data, idempotencyKey);
  }

  return transport.send(options);
}

/**
 * Mock 请求分发中心（完整模拟后端原子业务与状态变更）
 */
function handleMockRequest(url, method, data, idempotencyKey) {
  return new Promise((resolve, reject) => {
    // 模拟 150ms 真实网络延时
    setTimeout(() => {
      const m = method.toUpperCase();
      const dishResult = require('./mock-dish-editor.js')(mockDB, activeFamilyId, url, m, data);
      if (dishResult) {
        if (dishResult.error) reject(dishResult.error); else resolve(dishResult.data);
        return;
      }
      // 1. 用户与认证
      if (url === '/auth/login' && m === 'POST') {
        resolve({
          token: mockDB.token,
          expiresAt: mockDB.expiresAt,
          user: mockDB.currentUser
        });
        return;
      }
      if (url === '/me' && m === 'GET') {
        resolve(mockDB.currentUser);
        return;
      }
      if (url === '/me' && m === 'PATCH') {
        mockDB.currentUser.displayName = data.displayName;
        resolve(mockDB.currentUser);
        return;
      }
      if (url === '/me/families' && m === 'GET') {
        resolve(mockDB.families);
        return;
      }
      if (url === '/families' && m === 'POST') {
        const newFam = {
          id: `fam_${Date.now()}`,
          name: data.name,
          memberId: `m_${Date.now()}`,
          role: 'ADMIN'
        };
        mockDB.families.push(newFam);
        resolve(newFam);
        return;
      }

      // 2. 餐次 (ensureSession) — 返回当前成员的提交状态
      if (url.endsWith('/meal-sessions') && m === 'POST') {
        const baseSession = (data && data.mealType === 'DINNER') ? mockDB.sessions.session_dinner_today : mockDB.sessions.session_lunch_today;
        // 合并当前成员的提交状态
        const memberStateKey = `${baseSession.id}_${currentMemberId}`;
        const memberState = (mockDB.memberSubmitState || {})[memberStateKey];
        const session = Object.assign({}, baseSession);
        if (memberState) {
          session.canSubmit = memberState.canSubmit;
          session.submitBlockedReason = memberState.submitBlockedReason;
        }
        resolve(session);
        return;
      }
      if (url.includes('/meal-sessions') && m === 'GET' && !url.includes('/menu') && !url.includes('/cart') && !url.includes('/personal-menu') && !url.includes('/review')) {
        resolve([mockDB.sessions.session_lunch_today, mockDB.sessions.session_dinner_today]);
        return;
      }

      // 3. 菜品浏览 (Member)
      if (url.includes('/dishes') && m === 'GET' && !url.includes('/admin')) {
        const allDishes = mockDB.dishes[activeFamilyId] || [];
        const availableDishes = allDishes.filter(d => d.isAvailable && !d.deletedAt);
        resolve({
          items: availableDishes,
          page: 1,
          pageSize: 20,
          total: availableDishes.length
        });
        return;
      }

      // 4. 管理员菜品列表
      if (url.includes('/admin/dishes') && m === 'GET') {
        const allDishes = mockDB.dishes[activeFamilyId] || [];
        resolve({
          items: allDishes,
          page: 1,
          pageSize: 20,
          total: allDishes.length
        });
        return;
      }

      // 5. 购物车操作（集合式幂等添加与移除）— 按成员隔离
      if (url.includes('/cart/items/') && m === 'PUT') {
        const parts = url.split('/');
        const variantId = parts[parts.length - 1];
        const cartKey = `session_lunch_today_${currentMemberId}`;
        if (!mockDB.carts[cartKey]) {
          mockDB.carts[cartKey] = { sessionId: 'session_lunch_today', version: 1, items: [] };
        }
        const cart = mockDB.carts[cartKey];
        if (!cart.items.find(i => i.variantId === variantId)) {
          let foundDish = null;
          let foundVariant = null;
          (mockDB.dishes[activeFamilyId] || []).forEach(d => {
            const v = d.variants.find(item => item.id === variantId);
            if (v) {
              foundDish = d;
              foundVariant = v;
            }
          });
          if (foundDish && foundVariant) {
            cart.items.push({
              dishId: foundDish.id,
              variantId: foundVariant.id,
              dishName: foundDish.name,
              variantName: foundVariant.name,
              portionDescription: foundVariant.portionDescription,
              image: foundDish.image,
              isSelectable: true,
              unavailableReason: null
            });
          }
        }
        resolve(cart);
        return;
      }
      if (url.includes('/cart/items/') && m === 'DELETE') {
        const parts = url.split('/');
        const variantId = parts[parts.length - 1];
        const cartKey = `session_lunch_today_${currentMemberId}`;
        if (!mockDB.carts[cartKey]) {
          mockDB.carts[cartKey] = { sessionId: 'session_lunch_today', version: 1, items: [] };
        }
        const cart = mockDB.carts[cartKey];
        cart.items = cart.items.filter(i => i.variantId !== variantId);
        resolve(cart);
        return;
      }
      if (url.includes('/cart') && m === 'GET') {
        const cartKey = `session_lunch_today_${currentMemberId}`;
        if (!mockDB.carts[cartKey]) {
          mockDB.carts[cartKey] = { sessionId: 'session_lunch_today', version: 1, items: [] };
        }
        resolve(mockDB.carts[cartKey]);
        return;
      }

      // 6. 个人点餐提交（支持首次提交与审核取消后的重新点餐）— 按成员隔离
      if (url.includes('/personal-menu') && m === 'POST') {
        const variantIds = data.variantIds || [];
        const memberId = currentMemberId;
        const memberName = currentMemberName;
        const pmKey = `session_lunch_today_${memberId}`;

        const items = variantIds.map(vId => {
          let dishId = 'dish_1';
          let dName = '红烧肉';
          let vName = '普通版';
          let portion = '一份约供两人分享';
          (mockDB.dishes[activeFamilyId] || []).forEach(d => {
            const v = d.variants.find(item => item.id === vId);
            if (v) {
              dishId = d.id;
              dName = d.name;
              vName = v.name;
              portion = v.portionDescription;
            }
          });
          return {
            dishId,
            variantId: vId,
            dishName: dName,
            variantName: vName,
            portionDescription: portion,
            decision: 'UNREVIEWED',
            needsReview: true,
            plannedQuantity: null,
            unit: 'PORTION',
            reason: ''
          };
        });

        const existingPm = mockDB.personalMenus[pmKey];
        const version = existingPm ? existingPm.version + 1 : 1;
        const personalMenu = {
          id: existingPm ? existingPm.id : `pm_${Date.now()}`,
          sessionId: 'session_lunch_today',
          submittedAt: new Date().toISOString(),
          note: data.note !== undefined ? data.note : (existingPm ? existingPm.note : ''),
          version,
          items
        };
        mockDB.personalMenus[pmKey] = personalMenu;

        // 清空该成员的购物车
        const cartKey = `session_lunch_today_${memberId}`;
        if (mockDB.carts[cartKey]) {
          mockDB.carts[cartKey].items = [];
        }

        // 同步更新管理员审核视图中的需求
        const rev = mockDB.reviews['session_lunch_today'];
        if (rev) {
          rev.dishes.forEach(d => {
            d.variants.forEach(v => {
              const isSelected = variantIds.includes(v.variantId);
              const pIdx = v.participants.findIndex(p => p.memberId === memberId);
              if (isSelected && pIdx === -1) {
                v.participants.push({ memberId, displayName: memberName, note: personalMenu.note });
                v.participantCount = v.participants.length;
                v.needsReview = true;
                v.demandVersion += 1;
                v.decision = 'UNREVIEWED';
                v.reason = '';
              } else if (!isSelected && pIdx !== -1) {
                v.participants.splice(pIdx, 1);
                v.participantCount = v.participants.length;
                v.demandVersion += 1;
              }
            });
            const allMembers = new Set();
            d.variants.forEach(v => {
              v.participants.forEach(p => allMembers.add(p.memberId));
            });
            d.uniqueParticipantCount = allMembers.size;
          });
        }

        // 标记该成员已提交（per-member）
        if (!mockDB.memberSubmitState) mockDB.memberSubmitState = {};
        mockDB.memberSubmitState[`session_lunch_today_${memberId}`] = { canSubmit: false, submitBlockedReason: 'ALREADY_SUBMITTED' };
        resolve(personalMenu);
        return;
      }
      if (url.includes('/personal-menu/note') && m === 'PATCH') {
        const pmKey = `session_lunch_today_${currentMemberId}`;
        const pm = mockDB.personalMenus[pmKey];
        if (pm) {
          pm.note = data.note;
          pm.version += 1;
          resolve(pm);
        } else {
          reject({ code: 'NOT_FOUND', message: '未找到个人提交' });
        }
        return;
      }
      if (url.includes('/personal-menu') && m === 'GET') {
        const pmKey = `session_lunch_today_${currentMemberId}`;
        const pm = mockDB.personalMenus[pmKey];
        if (pm && pm.items) {
          const rev = mockDB.reviews['session_lunch_today'];
          if (rev) {
            pm.items.forEach(item => {
              rev.dishes.forEach(d => {
                const v = d.variants.find(variant => variant.variantId === item.variantId);
                if (v) {
                  item.decision = v.decision;
                  item.plannedQuantity = v.plannedQuantity;
                  item.reason = v.reason || '';
                  item.needsReview = v.needsReview;
                }
              });
            });
          }
        }
        resolve(pm || null);
        return;
      }

      // 7. 家庭总菜单 (看板)
      if (url.includes('/menu') && m === 'GET') {
        const rev = mockDB.reviews['session_lunch_today'];
        // 家庭菜单结构对齐 Menu
        const menuDishes = rev.dishes.map(d => ({
          dishId: d.dishId,
          name: d.name,
          kind: d.kind,
          uniqueParticipantCount: d.uniqueParticipantCount,
          variants: d.variants.map(v => ({
            itemId: v.itemId,
            variantId: v.variantId,
            name: v.name,
            portionDescription: v.portionDescription,
            participantCount: v.participantCount,
            decision: v.decision,
            needsReview: v.needsReview,
            plannedQuantity: v.plannedQuantity,
            unit: v.unit,
            reason: v.reason
          }))
        }));
        resolve({
          session: rev.session,
          dishes: menuDishes
        });
        return;
      }

      // 8. 管理员审核视图 (getReview & reviewMenu)
      if (url.includes('/admin/meal-sessions/') && url.includes('/review') && m === 'GET') {
        resolve(mockDB.reviews['session_lunch_today']);
        return;
      }
      if (url.includes('/admin/meal-sessions/') && url.includes('/review') && m === 'POST') {
        const rev = mockDB.reviews['session_lunch_today'];
        if (data.expectedReviewVersion !== rev.session.reviewVersion) {
          // 409 乐观锁冲突
          reject({
            code: 'REVIEW_VERSION_CONFLICT',
            message: '审核版本已更新，请核对最新数据后重新提交',
            details: { currentVersion: rev.session.reviewVersion }
          });
          return;
        }
        // 更新 items
        data.items.forEach(decisionItem => {
          rev.dishes.forEach(d => {
            const v = d.variants.find(variant => variant.itemId === decisionItem.itemId);
            if (v) {
              v.decision = decisionItem.decision;
              v.plannedQuantity = decisionItem.plannedQuantity;
              v.reason = decisionItem.reason || '';
              v.needsReview = false;
              v.lastReviewedParticipantCount = v.participantCount;
              v.reviewedDemandVersion = v.demandVersion;
            }
          });
        });
        rev.session.reviewVersion += 1;

        // 审核完成后，检查是否有被取消项 → 如有，重新开放受影响成员的提交权限
        let hasCancelledVariants = false;
        rev.dishes.forEach(d => {
          d.variants.forEach(v => {
            if (v.decision === 'CANCELLED') {
              hasCancelledVariants = true;
              if (v.participants && v.participants.length > 0) {
                v.participants.forEach(p => {
                  if (!mockDB.memberSubmitState) mockDB.memberSubmitState = {};
                  mockDB.memberSubmitState[`session_lunch_today_${p.memberId}`] = {
                    canSubmit: true,
                    submitBlockedReason: null
                  };
                });
              }
            }
          });
        });
        if (hasCancelledVariants) {
          mockDB.sessions.session_lunch_today.canSubmit = true;
          mockDB.sessions.session_lunch_today.submitBlockedReason = null;
        }

        resolve({
          batchId: `batch_${Date.now()}`,
          review: rev,
          notificationRecordCount: 4
        });
        return;
      }

      // 9. 临时菜创建与转正式菜
      if (url.includes('/temporary-dishes') && m === 'POST') {
        const newDish = {
          id: `dish_temp_${Date.now()}`,
          name: data.name,
          description: data.description,
          image: null,
          isAvailable: true,
          kind: 'TEMPORARY',
          originSessionId: 'session_lunch_today',
          version: 1,
          deletedAt: null,
          variants: (data.variants || []).map((v, idx) => ({
            id: `variant_temp_${Date.now()}_${idx}`,
            name: v.name,
            portionDescription: v.portionDescription,
            description: v.description || '',
            isAvailable: true,
            version: 1,
            deletedAt: null
          }))
        };
        (mockDB.dishes[activeFamilyId] = mockDB.dishes[activeFamilyId] || []).unshift(newDish);
        // 并为当餐生成未审核项
        const rev = mockDB.reviews['session_lunch_today'];
        if (rev) {
          rev.dishes.push({
            dishId: newDish.id,
            name: newDish.name,
            kind: 'TEMPORARY',
            uniqueParticipantCount: 0,
            variants: newDish.variants.map(v => ({
              itemId: `item_${v.id}`,
              variantId: v.id,
              name: v.name,
              portionDescription: v.portionDescription,
              participantCount: 0,
              decision: 'UNREVIEWED',
              needsReview: true,
              plannedQuantity: null,
              unit: 'PORTION',
              reason: '',
              participants: [],
              lastReviewedParticipantCount: 0,
              demandVersion: 1,
              reviewedDemandVersion: 0
            }))
          });
        }
        resolve(newDish);
        return;
      }
      if (url.includes('/promote') && m === 'POST') {
        const parts = url.split('/');
        const dishId = parts[parts.indexOf('dishes') + 1];
        const d = (mockDB.dishes[activeFamilyId] || []).find(item => item.id === dishId);
        if (d) {
          d.kind = 'PERMANENT';
          d.version += 1;
          resolve(d);
        } else {
          reject({ code: 'NOT_FOUND', message: '菜品未找到' });
        }
        return;
      }

      // 10. 成员管理
      if (url.includes('/admin/members') && m === 'GET') {
        const list = mockDB.members[activeFamilyId] || [];
        resolve({
          items: list,
          page: 1,
          pageSize: 20,
          total: list.length
        });
        return;
      }
      if (url.includes('/admin/invites') && m === 'POST') {
        const invite = {
          id: `inv_${Date.now()}`,
          role: data.role || 'MEMBER',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          status: 'ACTIVE',
          redemptionCount: 0,
          code: `inv_code_${Date.now()}_secret`
        };
        mockDB.invites.unshift(invite);
        resolve(invite);
        return;
      }
      if (url.includes('/admin/invites') && m === 'GET') {
        resolve({
          items: mockDB.invites,
          page: 1,
          pageSize: 20,
          total: mockDB.invites.length
        });
        return;
      }
      if (url.includes('/invites/redeem') && m === 'POST') {
        resolve({
          family: mockDB.families[0],
          alreadyJoined: false
        });
        return;
      }

      // 11. 审计与菜品管理
      if (url.includes('/admin/operations') && m === 'GET') {
        resolve({
          items: mockDB.operations,
          page: 1,
          pageSize: 20,
          total: mockDB.operations.length
        });
        return;
      }
      if (url.includes('/admin/dishes') && m === 'POST') {
        const newDish = {
          id: `dish_${Date.now()}`,
          name: data.name,
          description: data.description || '',
          category: data.category || '家常菜',
          tag: data.tag || '推荐',
          image: data.image || (data.imageUrl ? { fileId: `file_${Date.now()}`, url: data.imageUrl } : { fileId: `file_${Date.now()}`, url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600' }),
          isAvailable: true,
          kind: 'PERMANENT',
          originSessionId: null,
          version: 1,
          deletedAt: null,
          variants: (data.variants || []).map((v, idx) => ({
            id: v.id || `variant_${Date.now()}_${idx}`,
            name: v.name,
            portionDescription: v.portionDescription || '一份供两人分享',
            description: v.description || '',
            isAvailable: true,
            version: 1,
            deletedAt: null
          }))
        };
        (mockDB.dishes[activeFamilyId] = mockDB.dishes[activeFamilyId] || []).push(newDish);
        resolve(newDish);
        return;
      }
      if (url.includes('/admin/dishes/') && m === 'PATCH') {
        const parts = url.split('/');
        const dishId = parts[parts.length - 1];
        const dishes = mockDB.dishes[activeFamilyId] || [];
        const dish = dishes.find(d => d.id === dishId);
        if (dish) {
          if (data.name !== undefined) dish.name = data.name;
          if (data.description !== undefined) dish.description = data.description;
          if (data.category !== undefined) dish.category = data.category;
          if (data.tag !== undefined) dish.tag = data.tag;
          if (data.image !== undefined) dish.image = data.image;
          if (data.imageUrl !== undefined) {
            dish.image = { fileId: `file_${Date.now()}`, url: data.imageUrl };
          }
          if (data.variants && Array.isArray(data.variants)) {
            dish.variants = data.variants.map((v, idx) => ({
              id: v.id || `variant_${Date.now()}_${idx}`,
              name: v.name,
              portionDescription: v.portionDescription || '一份供两人分享',
              description: v.description || '',
              isAvailable: true,
              version: v.version || 1,
              deletedAt: null
            }));
          }
          dish.version = (dish.version || 1) + 1;
        }
        resolve(dish || { ok: true });
        return;
      }

      // 默认通配
      resolve({ ok: true });
    }, 150);
  });
}

module.exports = {
  getAuthGeneration: () => authGeneration,
  request,
  setAuthToken,
  setActiveFamily,
  getActiveFamily,
  setCurrentMember,
  getCurrentMember
};
