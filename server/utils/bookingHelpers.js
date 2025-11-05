const moment = require('moment');
const Booking = require('../models/Booking');
const { logger } = require('../utils/logger');

exports.checkAvailability = (slot, availability) => {
  return availability.some(availableSlot => {
    const slotStart = moment(slot.start);
    const slotEnd = moment(slot.end);
    const availableStart = moment(availableSlot.start);
    const availableEnd = moment(availableSlot.end);

    return slotStart.isSameOrAfter(availableStart) && 
           slotEnd.isSameOrBefore(availableEnd) &&
           (availableSlot.recurringPattern === 'none' || 
            (slotStart.isBefore(availableSlot.recurringEndDate) &&
             (availableSlot.recurringPattern === 'daily' ||
              (availableSlot.recurringPattern === 'weekly' && slotStart.day() === availableStart.day()) ||
              (availableSlot.recurringPattern === 'biweekly' && 
               slotStart.diff(availableStart, 'weeks') % 2 === 0 && 
               slotStart.day() === availableStart.day()) ||
              (availableSlot.recurringPattern === 'monthly' && slotStart.date() === availableStart.date())
             )
            )
           );
  });
};

async function hasConflictingBooking(coachId, slotStart, slotEnd, excludeBookingId, mongoSession) {
  const conflictingBooking = await Booking.findOne({
    coach: coachId,
    _id: { $ne: excludeBookingId },
    isAvailability: false,
    status: { $in: ['confirmed', 'pending_payment', 'rescheduled_pending_attendee_actions', 'scheduled', 'firm_booked'] },
    start: { $lt: slotEnd },
    end: { $gt: slotStart },
  }).session(mongoSession).lean();
  return !!conflictingBooking;
}

async function getEncompassingAvailability(coachId, slotStart, slotEnd, mongoSession) {
  return Booking.findOne({
    coach: coachId,
    isAvailability: true,
    status: 'confirmed',
    start: { $lte: slotStart },
    end: { $gte: slotEnd },
  }).session(mongoSession);
}

exports.checkCoachSlotAvailability = async (coachId, slotStart, slotEnd, excludeBookingId, mongoSession) => {
  logger.debug('[checkCoachSlotAvailability] Checking availability', { coachId, slotStart, slotEnd, excludeBookingId });

  const conflict = await hasConflictingBooking(coachId, slotStart, slotEnd, excludeBookingId, mongoSession);
  if (conflict) {
    logger.info('[checkCoachSlotAvailability] Slot conflicts with an existing booking.', { coachId, slotStart, slotEnd });
    return false;
  }
  logger.debug('[checkCoachSlotAvailability] No conflicting bookings found.', { coachId, slotStart, slotEnd });

  const encompassingAvailability = await getEncompassingAvailability(coachId, slotStart, slotEnd, mongoSession);
  if (encompassingAvailability) {
    logger.info('[checkCoachSlotAvailability] Slot is covered by general availability.', { coachId, slotStart, slotEnd, availabilityId: encompassingAvailability._id });
    return true;
  }

  logger.info('[checkCoachSlotAvailability] Slot is not covered by any general availability.', { coachId, slotStart, slotEnd });
  return false;
};

exports.restoreAvailabilityForBooking = async (bookingDoc, coachSettings, mongoSession) => {
  logger.debug('[restoreAvailabilityForBooking] Restoring availability for booking', { bookingId: bookingDoc._id, coachId: bookingDoc.coach });
  const newAvailabilitySlot = new Booking({
    coach: bookingDoc.coach,
    sessionType: bookingDoc.sessionType,
    start: bookingDoc.start,
    end: bookingDoc.end,
    timezone: bookingDoc.timezone,
    title: bookingDoc.isAvailability ? bookingDoc.title : 'Verfügbarkeit (Freigegeben)',
    isAvailability: true,
    status: 'confirmed',
    availableForInstantBooking: bookingDoc.metadata?.availabilitySettings?.availableForInstantBooking ?? coachSettings?.availabilityManagement?.defaultInstantBooking ?? false,
    firmBookingThreshold: bookingDoc.metadata?.availabilitySettings?.firmBookingThreshold ?? coachSettings?.availabilityManagement?.defaultFirmThreshold ?? 24,
    recurringPattern: bookingDoc.metadata?.availabilitySettings?.recurringPattern ?? 'none',
    price: null,
    metadata: {
      restoredFromReschedule: bookingDoc._id,
      restoredAt: new Date(),
      sourceAvailabilitySettings: bookingDoc.metadata?.availabilitySettings
    }
  });

  await newAvailabilitySlot.save({ session: mongoSession });
  logger.info('[restoreAvailabilityForBooking] New availability slot created', { newSlotId: newAvailabilitySlot._id, originalBookingId: bookingDoc._id });
  return newAvailabilitySlot;
};

const createSplitAvailabilitySlots = (originalSlotDoc, newStart, newEnd) => {
  const originalSlot = originalSlotDoc.toObject({ virtuals: false });
  delete originalSlot._id;
  delete originalSlot.id;

  const newSlotsData = [];
  const momentOriginalStart = moment(originalSlot.start);
  const momentOriginalEnd = moment(originalSlot.end);
  const momentNewStart = moment(newStart);
  const momentNewEnd = moment(newEnd);

  if (momentNewStart.isAfter(momentOriginalStart)) {
    newSlotsData.push({
      ...originalSlot,
      start: originalSlot.start,
      end: newStart,
      metadata: {
          ...(originalSlot.metadata || {}),
          splitFrom: originalSlotDoc._id,
          splitAction: 'carve_before'
      }
    });
  }

  if (momentNewEnd.isBefore(momentOriginalEnd)) {
    newSlotsData.push({
      ...originalSlot,
      start: newEnd,
      end: originalSlot.end,
      metadata: {
          ...(originalSlot.metadata || {}),
          splitFrom: originalSlotDoc._id,
          splitAction: 'carve_after'
      }
    });
  }
  return newSlotsData.map(data => new Booking(data));
};


exports.occupyAvailabilityForNewBookingTime = async (coachId, newStart, newEnd, bookingToUpdate, mongoSession) => {
  logger.debug('[occupyAvailabilityForNewBookingTime] Occupying availability for new booking time', { coachId, newStart, newEnd, bookingIdToUpdate: bookingToUpdate._id });

  const encompassingAvailabilitySlot = await Booking.findOne({
    coach: coachId,
    isAvailability: true,
    status: 'confirmed',
    start: { $lte: newStart },
    end: { $gte: newEnd },
  }).session(mongoSession);

  if (!encompassingAvailabilitySlot) {
    logger.error('[occupyAvailabilityForNewBookingTime] No encompassing availability slot found. This should have been caught by checkCoachSlotAvailability.', { coachId, newStart, newEnd });
    throw new Error('No encompassing general availability slot found to occupy.');
  }
  logger.info('[occupyAvailabilityForNewBookingTime] Found encompassing availability slot', { availabilityId: encompassingAvailabilitySlot._id });

  const splitSlots = createSplitAvailabilitySlots(encompassingAvailabilitySlot, newStart, newEnd);

  await Booking.findByIdAndDelete(encompassingAvailabilitySlot._id, { session: mongoSession });
  logger.debug('[occupyAvailabilityForNewBookingTime] Deleted original encompassing availability slot', { availabilityId: encompassingAvailabilitySlot._id });

  if (splitSlots.length > 0) {
    await Booking.insertMany(splitSlots, { session: mongoSession });
    logger.info('[occupyAvailabilityForNewBookingTime] Inserted new split availability slots', { count: splitSlots.length, ids: splitSlots.map(s => s._id) });
  }

  bookingToUpdate.metadata = bookingToUpdate.metadata || {};
  bookingToUpdate.metadata.originalAvailability = encompassingAvailabilitySlot._id;
  bookingToUpdate.metadata.availabilitySettings = {
      availableForInstantBooking: encompassingAvailabilitySlot.availableForInstantBooking,
      firmBookingThreshold: encompassingAvailabilitySlot.firmBookingThreshold,
      recurringPattern: encompassingAvailabilitySlot.recurringPattern,
  };

  logger.info('[occupyAvailabilityForNewBookingTime] Successfully occupied availability and updated booking metadata', { bookingIdToUpdate: bookingToUpdate._id, originalAvailabilityId: encompassingAvailabilitySlot._id });
  return true;
};

const coalesceAndRestoreAvailability = async (bookingToRestore, mongoSession) => {
  const coachId = bookingToRestore.coach._id || bookingToRestore.coach;
  const sessionTypeId = bookingToRestore.sessionType._id || bookingToRestore.sessionType;
  const { start, end } = bookingToRestore;

  logger.debug('[coalesceAndRestoreAvailability] Starting merge for cancelled booking', { bookingId: bookingToRestore._id, coachId, start, end });

  const adjacentSlots = await Booking.find({
    coach: coachId,
    isAvailability: true,
    status: 'confirmed',
    $or: [
      { end: new Date(start) },
      { start: new Date(end) }
    ]
  }).session(mongoSession);

  logger.debug('[coalesceAndRestoreAvailability] Found adjacent availability slots', { count: adjacentSlots.length, ids: adjacentSlots.map(s => s._id) });

  let mergedStart = start;
  let mergedEnd = end;
  const slotsToDelete = [];
  let propertiesToInherit = {
      availableForInstantBooking: bookingToRestore.metadata?.availabilitySettings?.availableForInstantBooking ?? false,
      firmBookingThreshold: bookingToRestore.metadata?.availabilitySettings?.firmBookingThreshold ?? 24,
      recurringPattern: bookingToRestore.metadata?.availabilitySettings?.recurringPattern ?? 'none',
      price: null,
      title: bookingToRestore.title || 'Verfügbarkeit',
  };

  if (adjacentSlots.length > 0) {
    const beforeSlot = adjacentSlots.find(slot => new Date(slot.end).getTime() === new Date(start).getTime());
    if (beforeSlot) {
      mergedStart = beforeSlot.start;
      slotsToDelete.push(beforeSlot._id);
      propertiesToInherit = {
          availableForInstantBooking: beforeSlot.availableForInstantBooking,
          firmBookingThreshold: beforeSlot.firmBookingThreshold,
          recurringPattern: beforeSlot.recurringPattern,
          price: beforeSlot.price,
          title: beforeSlot.title,
      };
      logger.debug('[coalesceAndRestoreAvailability] Merging with slot before', { beforeSlotId: beforeSlot._id, newMergedStart: mergedStart });
    }

    const afterSlot = adjacentSlots.find(slot => new Date(slot.start).getTime() === new Date(end).getTime());
    if (afterSlot) {
      mergedEnd = afterSlot.end;
      slotsToDelete.push(afterSlot._id);
      logger.debug('[coalesceAndRestoreAvailability] Merging with slot after', { afterSlotId: afterSlot._id, newMergedEnd: mergedEnd });
    }
  }

  if (slotsToDelete.length > 0) {
    await Booking.deleteMany({ _id: { $in: slotsToDelete } }).session(mongoSession);
    logger.debug('[coalesceAndRestoreAvailability] Deleted fragmented slots', { deletedIds: slotsToDelete });
  }

  const newMergedAvailabilitySlot = new Booking({
    coach: coachId,
    sessionType: sessionTypeId,
    start: mergedStart,
    end: mergedEnd,
    timezone: bookingToRestore.timezone,
    isAvailability: true,
    status: 'confirmed',
    ...propertiesToInherit,
    metadata: {
      restoredAndCoalescedFrom: bookingToRestore._id,
      restoredAt: new Date(),
      coalescedSlots: slotsToDelete
    }
  });

  await newMergedAvailabilitySlot.save({ session: mongoSession });
  logger.info('[coalesceAndRestoreAvailability] Successfully created new merged availability slot', { newSlotId: newMergedAvailabilitySlot._id, originalBookingId: bookingToRestore._id, finalStart: mergedStart, finalEnd: mergedEnd, deletedCount: slotsToDelete.length });
  
  return newMergedAvailabilitySlot;
};

exports.coalesceAndRestoreAvailability = coalesceAndRestoreAvailability;