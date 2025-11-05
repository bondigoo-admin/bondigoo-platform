const mongoose = require('mongoose');
const User = require('../models/User');
const Coach = require('../models/Coach');

/**
 * Takes an array of coach User IDs and returns a Map where the key is the
 * user ID and the value is the fully enriched Canonical Coach DTO.
 * This is the single source of truth for constructing coach data for the frontend.
 * @param {string[]} coachUserIds - An array of user IDs for users with the 'coach' role.
 * @returns {Promise<Map<string, object>>} A promise that resolves to a Map of enriched coach data.
 */
exports.getEnrichedCoachDataMap = async (coachUserIds) => {
  if (!coachUserIds || coachUserIds.length === 0) {
    return new Map();
  }

  // 1. Fetch all necessary documents in parallel
  const [coachUsers, coachProfiles] = await Promise.all([
    User.find({ _id: { $in: coachUserIds } }).select('firstName lastName profilePicture role status').lean(),
    Coach.find({ user: { $in: coachUserIds } }).select('user profilePicture').lean()
  ]);

  // 2. Create an efficient lookup map for coach-specific profiles
  const coachProfileMap = new Map(
    coachProfiles.map(p => [p.user.toString(), p])
  );

  // 3. Construct the final, canonical DTO for each coach
  const enrichedCoachMap = new Map();
  for (const user of coachUsers) {
    const coachProfile = coachProfileMap.get(user._id.toString());
    
    enrichedCoachMap.set(user._id.toString(), {
      // Base fields from User model
      ...user,
      // Add the critical coachProfilePicture field from the Coach model
      coachProfilePicture: coachProfile?.profilePicture || null
    });
  }

  return enrichedCoachMap;
};