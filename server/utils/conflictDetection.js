const moment = require('moment');

exports.checkForConflicts = (sessions) => {
  const conflicts = [];

  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const session1 = sessions[i];
      const session2 = sessions[j];

      const start1 = moment(session1.start);
      const end1 = moment(session1.end);
      const start2 = moment(session2.start);
      const end2 = moment(session2.end);

      if (
        (start1.isSameOrAfter(start2) && start1.isBefore(end2)) ||
        (end1.isAfter(start2) && end1.isSameOrBefore(end2)) ||
        (start1.isSameOrBefore(start2) && end1.isSameOrAfter(end2))
      ) {
        conflicts.push({ session1, session2 });
      }
    }
  }

  return conflicts;
};