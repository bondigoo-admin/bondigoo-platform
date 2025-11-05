/**
 * @file server/services/DurationCalculationService.js
 * @description A service to handle the hierarchical calculation of program, module, and lesson durations.
 * This service ensures that durations are accurately rolled up from lessons to modules, and from modules to the parent program,
 * while respecting any manual overrides set by the coach.
 */

const mongoose = require('mongoose');
const Program = require('../models/Program');
const Module = require('../models/Module');
const Lesson = require('../models/Lesson');
const { logger } = require('../utils/logger');

/**
 * Recalculates all durations for a given program, cascading from lessons up to the program level.
 * This function respects the 'isOverridden' flag at the module and program levels.
 * It operates within a database transaction to ensure atomicity.
 *
 * @param {string} programId The MongoDB ObjectId of the program to recalculate.
 * @returns {Promise<void>} A promise that resolves when the recalculation and saving are complete.
 * @throws {Error} Throws an error if the program is not found or if there's a database issue.
 */
const recalculateAndSaveProgramDurations = async (programId) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  logger.info(`[DurationService] Starting duration recalculation for program: ${programId}`);

  try {
    const program = await Program.findById(programId)
      .populate({
        path: 'modules',
        populate: {
          path: 'lessons',
          select: 'contentDuration estimatedCompletionTime'
        }
      })
      .session(session);

    if (!program) {
      throw new Error(`[DurationService] Program with ID ${programId} not found.`);
    }

    let programContentMinutes = 0;
    let programCompletionMinutes = 0;
    const savePromises = [];

    // Phase 1: Recalculate all modules based on their lessons
    for (const module of program.modules) {
      let moduleContentMinutes = 0;
      let moduleCompletionMinutes = 0;

      // Calculate the sum of durations from all lessons within this module
      for (const lesson of module.lessons) {
        moduleContentMinutes += lesson.contentDuration?.minutes || 0;
        moduleCompletionMinutes += lesson.estimatedCompletionTime?.minutes || 0;
      }

      // Update the module's duration ONLY if it's not manually overridden
      if (!module.contentDuration.isOverridden) {
        module.contentDuration.minutes = moduleContentMinutes;
      }
      if (!module.estimatedCompletionTime.isOverridden) {
        module.estimatedCompletionTime.minutes = moduleCompletionMinutes;
      }
      
      // If the module was modified, add its save operation to our promises
      if (module.isModified()) {
        logger.info(`[DurationService] Module '${module.title}' updated. Content: ${module.contentDuration.minutes}m, Completion: ${module.estimatedCompletionTime.minutes}m`);
        savePromises.push(module.save({ session }));
      }
    }

    // Phase 2: Recalculate program totals based on the (potentially updated) modules
    for (const module of program.modules) {
      programContentMinutes += module.contentDuration.minutes;
      programCompletionMinutes += module.estimatedCompletionTime.minutes;
    }

    // Update the program's duration ONLY if it's not manually overridden
    if (!program.contentDuration.isOverridden) {
      program.contentDuration.minutes = programContentMinutes;
    }
    if (!program.estimatedCompletionTime.isOverridden) {
      program.estimatedCompletionTime.minutes = programCompletionMinutes;
    }

    // If the program itself was modified, add its save operation
    if (program.isModified()) {
        logger.info(`[DurationService] Program '${program.title}' updated. Content: ${program.contentDuration.minutes}m, Completion: ${program.estimatedCompletionTime.minutes}m`);
        savePromises.push(program.save({ session }));
    }

    // Execute all save operations concurrently
    if (savePromises.length > 0) {
        logger.info(`[DurationService] Committing ${savePromises.length} document updates.`);
        await Promise.all(savePromises);
    } else {
        logger.info(`[DurationService] No duration updates were necessary for program: ${programId}`);
    }

    await session.commitTransaction();
    logger.info(`[DurationService] Successfully completed and committed duration recalculation for program: ${programId}`);

  } catch (error) {
    logger.error(`[DurationService] Error during duration recalculation for program ${programId}. Transaction aborted.`, {
      error: error.message,
      stack: error.stack
    });
    await session.abortTransaction();
    // Re-throw the error so the calling context (e.g., controller) can handle it if needed
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = {
  recalculateAndSaveProgramDurations,
};