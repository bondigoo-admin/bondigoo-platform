// scripts/seedCoachingStyles.js

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const CoachingStyle = require('../models/CoachingStyle');
const Translation = require('../models/Translation');

const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is not defined in your environment variables.');
  process.exit(1);
}

// --- DATA TO UPLOAD ---
// A list of common coaching styles and methodologies.
const dataToUpload = [
  {
    name: 'Directive',
    description: 'The coach leads the session, provides advice, and gives clear instructions and strategies.',
    translations: { de: 'Direktiv', fr: 'Directif', es: 'Directivo' },
  },
  {
    name: 'Non-Directive',
    description: 'The coach acts as a facilitator, helping the client to find their own solutions through questioning and reflection.',
    translations: { de: 'Nicht-Direktiv', fr: 'Non-directif', es: 'No directivo' },
  },
  {
    name: 'Solution-Focused',
    description: 'Concentrates on finding solutions in the present and exploring future hopes rather than focusing on past problems.',
    translations: { de: 'Lösungsorientiert', fr: 'Orienté solutions', es: 'Enfocado en soluciones' },
  },
  {
    name: 'Transformational',
    description: 'Aims to produce fundamental changes in the client\'s perspective, beliefs, and behaviors.',
    translations: { de: 'Transformational', fr: 'Transformationnel', es: 'Transformacional' },
  },
  {
    name: 'Systemic',
    description: 'Views the client within the context of their various systems (family, work, social) and addresses the interplay between them.',
    translations: { de: 'Systemisch', fr: 'Systémique', es: 'Sistémico' },
  },
  {
    name: 'Holistic',
    description: 'Considers the whole person—mind, body, and spirit—to achieve balance and well-being.',
    translations: { de: 'Ganzheitlich', fr: 'Holistique', es: 'Holístico' },
  },
  {
    name: 'Cognitive Behavioral Coaching (CBC)',
    description: 'Uses cognitive and behavioral techniques to help clients change unhelpful thinking patterns and behaviors.',
    translations: { de: 'Kognitives Verhaltenstraining (CBC)', fr: 'Coaching cognitivo-comportemental (CCC)', es: 'Coaching cognitivo-conductual (CCC)' },
  },
  {
    name: 'Mindfulness-Based',
    description: 'Integrates mindfulness practices to enhance self-awareness, presence, and emotional regulation.',
    translations: { de: 'Achtsamkeitsbasiert', fr: 'Basé sur la pleine conscience', es: 'Basado en mindfulness' },
  },
  {
    name: 'Performance-Oriented',
    description: 'Focuses on improving a specific skill or achieving a measurable performance goal.',
    translations: { de: 'Leistungsorientiert', fr: 'Orienté performance', es: 'Orientado al rendimiento' },
  },
  {
    name: 'Values-Based',
    description: 'Helps clients identify their core values and align their actions and goals with what is most important to them.',
    translations: { de: 'Wertebasiert', fr: 'Basé sur les valeurs', es: 'Basado en valores' },
  },
  {
    name: 'Strengths-Based',
    description: 'Focuses on identifying and leveraging the client\'s inherent strengths to achieve their goals.',
    translations: { de: 'Stärkenorientiert', fr: 'Basé sur les forces', es: 'Basado en fortalezas' },
  },
  {
    name: 'Challenging',
    description: 'The coach actively challenges the client\'s assumptions and comfort zones to provoke new insights and growth.',
    translations: { de: 'Herausfordernd', fr: 'Challengeant', es: 'Desafiante' },
  },
];


const seedCoachingStyles = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of dataToUpload) {
      let style = await CoachingStyle.findOne({ name: item.name });

      if (style) {
        // --- UPDATE PATH ---
        console.log(`Synchronizing existing style: "${item.name}"...`);
        style.description = item.description; // Ensure description is up-to-date
        await style.save();

      } else {
        // --- CREATE PATH ---
        console.log(`Creating new style: "${item.name}"...`);
        style = new CoachingStyle({
          name: item.name,
          description: item.description,
        });
        await style.save();
        createdCount++;
      }

      // Find and update the translation, or create it if it's missing.
      await Translation.updateOne(
        { key: `coachingStyles_${style._id}` },
        {
          $set: {
            listType: 'coachingStyles',
            translations: item.translations,
          }
        },
        { upsert: true }
      );
      if (createdCount === 0) updatedCount++;
      console.log(`  - Synchronized translation for "${item.name}".`);
    }

    console.log(`\nSeed complete. Created: ${createdCount}, Synchronized: ${updatedCount + createdCount > 0 ? updatedCount : dataToUpload.length}.`);
  } catch (error) {
    console.error('An error occurred during the seed process:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

// --- Run the Seeder ---
seedCoachingStyles();