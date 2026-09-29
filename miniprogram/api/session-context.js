const Services = require('./services.js');

function capture(app) {
  const g = app.globalData;
  return {
    userId: g.currentUser && g.currentUser.id,
    familyId: g.activeFamily && g.activeFamily.id,
    sessionId: g.currentSession && g.currentSession.id,
    revision: g.sessionRevision || 0
  };
}

function sameIdentity(app, context) {
  const now = capture(app);
  return !!context && now.userId === context.userId && now.familyId === context.familyId;
}

function sameScope(app, context) {
  return sameIdentity(app, context) && capture(app).revision === context.revision;
}

function isCurrent(app, context) {
  return sameScope(app, context) && !!context.sessionId && capture(app).sessionId === context.sessionId;
}

function invalidate(app) {
  app.globalData.sessionRevision = (app.globalData.sessionRevision || 0) + 1;
  app.globalData.currentSession = null;
}

async function select(app, serviceDate, mealType) {
  invalidate(app);
  app.globalData.selectedMealType = mealType;
  const context = capture(app);
  if (!context.familyId) throw new Error('请先选择家庭');
  const session = await Services.ensureSession(context.familyId, serviceDate, mealType);
  if (!sameScope(app, context)) return null;
  if (!session || !session.id || (session.mealType && session.mealType !== mealType) ||
      (session.serviceDate && session.serviceDate !== serviceDate)) throw new Error('餐次载入不一致，请重试');
  app.globalData.currentSession = session;
  return session;
}

// A page's loaded data and every write must belong to the same current identity
// and meal. Revision also rejects a late response after switching away and back.
module.exports = { capture, sameIdentity, sameScope, isCurrent, invalidate, select };
