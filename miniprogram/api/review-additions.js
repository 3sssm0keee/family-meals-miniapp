// Version values remain internal; only genuine demand increases show a user-facing label.
const snapshots = new Map();
module.exports = function hasReviewAdditions(familyId, review) {
  if (typeof review.hasTemporaryAdditions === 'boolean') return review.hasTemporaryAdditions;
  const key = familyId + ':' + review.session.id;
  const variants = (review.dishes || []).reduce((all, d) => all.concat(d.variants || []), []);
  const previous = snapshots.get(key);
  const hasReviewed = variants.some(v => v.reviewedDemandVersion > 0);
  const added = variants.some(v => v.needsReview && (
    (v.reviewedDemandVersion > 0 && v.demandVersion > v.reviewedDemandVersion && v.participantCount > v.lastReviewedParticipantCount) ||
    (previous && previous.hasReviewed && !previous.ids.has(v.itemId))
  ));
  // Keep the prior set until additions have been reviewed, so polling cannot erase the notice.
  if (!added) snapshots.set(key, {hasReviewed, ids: new Set(variants.map(v => v.itemId))});
  return added;
};
