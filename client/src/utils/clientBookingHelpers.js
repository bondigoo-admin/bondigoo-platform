import moment from 'moment-timezone';

export const checkAvailability = (slot, settings) => {
  if (!settings || !settings.workingHours) {
    console.error('Settings or working hours are not available');
    return false;
  }

  const slotStart = new Date(slot.start);
  const slotEnd = new Date(slot.end);
  const dayOfWeek = slotStart.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  const workingHours = settings.workingHours[dayOfWeek];
  if (!workingHours || !workingHours.start || !workingHours.end) {
    return false;
  }

  const [workStartHour, workStartMinute] = workingHours.start.split(':').map(Number);
  const [workEndHour, workEndMinute] = workingHours.end.split(':').map(Number);

  const workStart = new Date(slotStart);
  workStart.setHours(workStartHour, workStartMinute, 0, 0);

  const workEnd = new Date(slotStart);
  workEnd.setHours(workEndHour, workEndMinute, 0, 0);

  return slotStart >= workStart && slotEnd <= workEnd;
};