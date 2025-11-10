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

// A helper to read JSON files from our data directory
const readDataFile = async (filename) => {
  const filePath = path.resolve(__dirname, '..', 'data', filename);
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data);
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

    // --- STEP 1: Handle SessionTypes (Special case, preserving IDs) ---
    console.log('\n--- Seeding SessionTypes ---');
    await SessionType.deleteMany({});
    const sessionTypesData = await readDataFile('sessiontypes.json');
    await SessionType.insertMany(sessionTypesData);
    const sessionTypeTranslations = [];
    for (const doc of sessionTypesData) {
      if (doc.translations) {
        sessionTypeTranslations.push({
          key: `sessiontypes_${doc._id}`,
          listType: 'sessiontypes',
          translations: doc.translations
        });
        delete doc.translations;
      }
    }
    if (sessionTypeTranslations.length > 0) {
      await Translation.insertMany(sessionTypeTranslations);
      console.log(`✅ Created ${sessionTypeTranslations.length} corresponding translations for SessionTypes.`);
    }
    console.log(`✅ Successfully seeded ${sessionTypesData.length} SessionTypes.`);

    // --- STEP 2: Handle all other collections with embedded translations ---
    const seedPlan = [
      { model: CoachingStyle, name: 'coachingstyles', file: 'coachingstyles.json' },
      { model: EducationLevel, name: 'educationlevels', file: 'educationlevels.json' },
      { model: Language, name: 'languages', file: 'languages.json' },
      { model: Skill, name: 'skills', file: 'skills.json' },
      { model: SkillLevel, name: 'skilllevels', file: 'skilllevels.json' },
      { model: Specialty, name: 'specialties', file: 'specialties.json' },
    ];
    
    // Clean all translations before we start generating new ones
    await Translation.deleteMany({});
    console.log('\n🧹 Cleared existing translations.');

    for (const item of seedPlan) {
      console.log(`\n--- Seeding ${item.name} ---`);
      await item.model.deleteMany({});
      const data = await readDataFile(item.file);
      
      const translationsToInsert = [];
      duplicateLogs[item.name] = [];

      for (const doc of data) {
        try {
          const embeddedTranslations = doc.translations;
          delete doc.translations;

          const newDoc = await item.model.create(doc);

          if (embeddedTranslations) {
            translationsToInsert.push({
              key: `${item.name}_${newDoc._id}`,
              listType: item.name,
              translations: embeddedTranslations,
            });
          }
        } catch (error) {
          if (error.code === 11000) {
            duplicateLogs[item.name].push(doc.name);
          } else {
            throw error;
          }
        }
      }

      console.log(`✅ Successfully seeded ${data.length - duplicateLogs[item.name].length} of ${data.length} ${item.name}.`);

      // After creating all main docs, insert all their translations in one go
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
      console.log('✅ No duplicate keys were found.');
    }

    console.log('\n--- STAGING DATABASE SEEDING COMPLETE ---');

  } catch (error) {
    console.error('\n❌ An error occurred during the seed process:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

seedDatabase();