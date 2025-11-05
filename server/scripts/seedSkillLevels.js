// REPLACE THE ENTIRE FILE CONTENT WITH THIS:
// scripts/seedSkillLevels.js

const path = require('path');
const dotenv = require('dotenv');
const mongoose =require('mongoose');
const SkillLevel = require('../models/SkillLevel');
const Translation = require('../models/Translation');

const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is not defined in your environment variables.');
  process.exit(1);
}

const skillLevelsToSeed = [
  { name: 'All Levels', code: 'all', level: 0, description: 'Suitable for all, from beginners to experts.', icon: 'LayoutGrid', color: 'slate-500', translations: { de: 'Alle Niveaus', fr: 'Tous les niveaux', es: 'Todos los niveles' } },
  { name: 'Novice', code: 'novice', level: 1, description: 'Assumes no prior knowledge.', icon: 'Circle', color: 'gray-400', translations: { de: 'Einsteiger', fr: 'Novice', es: 'Novato' } },
  { name: 'Beginner', code: 'beginner', level: 2, description: 'Has basic knowledge and can perform simple tasks with guidance.', icon: 'ChevronsRight', color: 'sky-500', translations: { de: 'Anfänger', fr: 'Débutant', es: 'Principiante' } },
  { name: 'Intermediate', code: 'intermediate', level: 3, description: 'Can work independently on most tasks.', icon: 'TrendingUp', color: 'emerald-500', translations: { de: 'Mittelstufe', fr: 'Intermédiaire', es: 'Intermedio' } },
  { name: 'Proficient', code: 'proficient', level: 4, description: 'Comfortable with complex tasks and can troubleshoot.', icon: 'Award', color: 'indigo-500', translations: { de: 'Kompetent', fr: 'Compétent', es: 'Competente' } },
  { name: 'Advanced', code: 'advanced', level: 5, description: 'Possesses deep knowledge and can teach or mentor others.', icon: 'Star', color: 'amber-500', translations: { de: 'Fortgeschritten', fr: 'Avancé', es: 'Avanzado' } },
  { name: 'Expert', code: 'expert', level: 6, description: 'Recognized as an authority and innovates.', icon: 'Crown', color: 'rose-600', translations: { de: 'Experte', fr: 'Expert', es: 'Experto' } }
];

const seedSkillLevels = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    let createdCount = 0;
    let updatedCount = 0;

    for (const levelData of skillLevelsToSeed) {
      const { translations, ...levelDetails } = levelData;
      
      let skillLevel = await SkillLevel.findOne({ code: levelDetails.code });

      if (skillLevel) {
        Object.assign(skillLevel, levelDetails);
        await skillLevel.save();
        updatedCount++;
        console.log(`Updated skill level: "${levelData.name}"`);
      } else {
        skillLevel = new SkillLevel(levelDetails);
        await skillLevel.save();
        createdCount++;
        console.log(`Created new skill level: "${levelData.name}"`);
      }

      await Translation.updateOne(
        { key: `skillLevels_${skillLevel._id}` },
        {
          $set: {
            listType: 'skillLevels',
            translations: translations,
          }
        },
        { upsert: true }
      );
      console.log(`  - Synchronized translation for "${levelData.name}".`);
    }

    console.log(`\nSeed complete. Created: ${createdCount}, Updated: ${updatedCount}.`);
  } catch (error) {
    console.error('An error occurred during the skill level seed process:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

seedSkillLevels();