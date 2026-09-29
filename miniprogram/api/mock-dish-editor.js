// Local demonstration only. Implement exact routes so variant writes cannot create a dish.
module.exports = function mockDishEditor(db, familyId, url, method, data) {
  const match = url.match(/^\/families\/[^/]+\/admin\/dishes\/([^/?]+)(?:\/variants(?:\/([^/?]+))?)?(?:\?.*)?$/);
  if (!match || url.includes('/promote')) return null;
  const dish = (db.dishes[familyId] || []).find(d => d.id === match[1]);
  if (!dish) return { error: { code: 'NOT_FOUND', message: '菜品不存在' } };
  const isVariant = url.includes('/variants');
  if (method === 'GET' && !isVariant) return { data: JSON.parse(JSON.stringify(dish)) };
  if (isVariant && method === 'POST' && !match[2]) {
    const variant = { ...data, id: 'v_' + Date.now(), version: 1, deletedAt: null };
    dish.variants.push(variant); dish.version++;
    return { data: variant };
  }
  const target = isVariant ? dish.variants.find(v => v.id === match[2]) : dish;
  if (!target) return { error: { code: 'NOT_FOUND', message: '规格不存在' } };
  if (method === 'PATCH' || method === 'DELETE') {
    const expected = method === 'PATCH' ? data.expectedVersion : Number((url.match(/expectedVersion=(\d+)/) || [])[1]);
    if (expected !== target.version) return { error: { code: 'VERSION_CONFLICT', message: '版本已更新，请重新载入' } };
    if (method === 'DELETE') target.deletedAt = new Date().toISOString();
    else {
      for (const key of ['name','description','isAvailable','portionDescription']) if (data[key] !== undefined) target[key] = data[key];
      if (!isVariant && data.imageFileId === null) target.image = null;
    }
    target.version++;
    if (isVariant) dish.version++;
    return { data: method === 'DELETE' ? {ok:true} : JSON.parse(JSON.stringify(target)) };
  }
  return null;
};
