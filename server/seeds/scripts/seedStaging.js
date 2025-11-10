// File: server/seeds/scripts/seedStaging.js

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const fs = require('fs').promises;

// --- IMPORTANT ---
// Load staging environment variables
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.staging') });

// Import all required models
const CoachingStyle = require('../../models/CoachingStyle');
const EducationLevel = require('../../models/EducationLevel');
const Language = require('../../models/Language');
const SessionType = require('../../models/SessionType');
const Skill = require('../../models/Skill');
const SkillLevel = require('../../models/SkillLevel');
const Specialty = require('../../models/Specialty');
const Translation = require('../../models/Translation');
const ProgramCategory = require('../../models/ProgramCategory'); // Added ProgramCategory

// A helper to read JSON files from our data directory
const readDataFile = async (filename) => {
  const filePath = path.resolve(__dirname, '..', 'data', filename);
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading data file: ${filename}`, error);
    throw error;
  }
};

const seedDatabase = async () => {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not defined in .env.staging');
    process.exit(1);
  }

  const duplicateLogs = {};
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('Successfully connected to Staging MongoDB.');

    // Clean all collections before seeding to ensure a fresh start
    console.log('\n🧹 Clearing all relevant collections...');
    await Promise.all([
      CoachingStyle.deleteMany({}),
      EducationLevel.deleteMany({}),
      Language.deleteMany({}),
      SessionType.deleteMany({}),
      Skill.deleteMany({}),
      SkillLevel.deleteMany({}),
      Specialty.deleteMany({}),
      ProgramCategory.deleteMany({}),
      Translation.deleteMany({}),
    ]);
    console.log('✅ All collections cleared.');

    // --- STEP 1: Handle SessionTypes (Special case to preserve hardcoded IDs) ---
    console.log('\n--- Seeding SessionTypes ---');
    const sessionTypesData = await readDataFile('sessiontypes.json');
    const sessionTypeTranslations = [];
    const sessionTypesToInsert = sessionTypesData.map(doc => {
      if (doc.translations) {
        sessionTypeTranslations.push({
          key: `sessiontypes_${doc._id}`,
          listType: 'sessiontypes',
          translations: doc.translations
        });
        // Create a new object without the translations field for insertion
        const { translations, ...rest } = doc;
        return rest;
      }
      return doc;
    });

    await SessionType.insertMany(sessionTypesToInsert);
    console.log(`✅ Successfully seeded ${sessionTypesToInsert.length} SessionTypes.`);
    if (sessionTypeTranslations.length > 0) {
      await Translation.insertMany(sessionTypeTranslations);
      console.log(`✅ Created ${sessionTypeTranslations.length} corresponding translations for SessionTypes.`);
    }

    // --- STEP 2: Handle all other collections by generating new IDs ---
    const seedPlan = [
      { model: CoachingStyle, name: 'coachingstyles', file: 'coachingstyles.json' },
      { model: EducationLevel, name: 'educationlevels', file: 'educationlevels.json' },
      { model: Language, name: 'languages', file: 'languages.json' },
      { model: Skill, name: 'skills', file: 'skills.json' },
      { model: SkillLevel, name: 'skilllevels', file: 'skilllevels.json' },
      { model: Specialty, name: 'specialties', file: 'specialties.json' },
    ];

    for (const item of seedPlan) {
      console.log(`\n--- Seeding ${item.name} ---`);
      const data = await readDataFile(item.file);
      
      const translationsToInsert = [];
      duplicateLogs[item.name] = [];
      let successfulInserts = 0;

      for (const doc of data) {
        try {
          const embeddedTranslations = doc.translations;
          delete doc.translations; // Remove translation from the object before creating the main document

          // Create the main document, which generates a new _id
          const newDoc = await item.model.create(doc);
          successfulInserts++;

          // If there were translations, prepare them with the new _id
          if (embeddedTranslations) {
            translationsToInsert.push({
              key: `${item.name}_${newDoc._id}`,
              listType: item.name,
              translations: embeddedTranslations,
            });
          }
        } catch (error) {
          if (error.code === 11000) { // Handle duplicate key errors gracefully
            duplicateLogs[item.name].push(doc.name || JSON.stringify(doc));
          } else {
            // For other errors, re-throw to stop the script
            throw error;
          }
        }
      }

      console.log(`✅ Successfully seeded ${successfulInserts} of ${data.length} documents for ${item.name}.`);

      // After creating all main docs for this collection, insert all their translations in one batch
      if (translationsToInsert.length > 0) {
        await Translation.insertMany(translationsToInsert);
        console.log(`✅ Created ${translationsToInsert.length} corresponding translations.`);
      }
    }

    console.log('\n--- Duplicate Key Summary ---');
    let duplicatesFound = false;
    for (const [collectionName, duplicates] of Object.entries(duplicateLogs)) {
      if (duplicates.length > 0) {
        duplicatesFound = true;
        console.log(`🟡 Skipped ${duplicates.length} duplicate(s) in '${collectionName}':`);
        duplicates.forEach(name => console.log(`   - ${name}`));
      }
    }
    if (!duplicatesFound) {
      console.log('✅ No duplicate keys were found during seeding.');
    }

    console.log('\n--- STAGING DATABASE SEEDING COMPLETE ---');

  } catch (error) {
    console.error('\n❌ An error occurred during the main seed process:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

seedDatabase();