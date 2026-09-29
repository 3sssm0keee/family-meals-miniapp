// Keep uncertain deletion outcomes across page instances in this app process.
const uncertain = new Set();
const key = (userId, familyId, dishId, version) =>
  JSON.stringify([userId, familyId, dishId, version]);
module.exports = {
  has: (userId, familyId, dishId, version) =>
    uncertain.has(key(userId, familyId, dishId, version)),
  mark: (userId, familyId, dishId, version) =>
    uncertain.add(key(userId, familyId, dishId, version)),
  clear: (userId, familyId, dishId, version) =>
    uncertain.delete(key(userId, familyId, dishId, version))
};
