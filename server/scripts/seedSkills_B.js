// scripts/seedSkills_B.js

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const Skill = require('../models/Skill');
const Translation = require('../models/Translation');

const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is not defined in your environment variables.');
  process.exit(1);
}

// --- DATA TO UPLOAD ---
// A list of 60 general and specific coaching-related skills starting with 'B'.
const dataToUpload = [
  // --- Business & Finance ---
  { name: 'Banking', category: 'Business & Finance', translations: { de: 'Bankwesen', fr: 'Banque', es: 'Banca' } },
  { name: 'Bookkeeping', category: 'Business & Finance', translations: { de: 'Buchführung', fr: 'Comptabilité', es: 'Teneduría de libros' } },
  { name: 'Brand Management', category: 'Business & Finance', translations: { de: 'Markenmanagement', fr: 'Gestion de la marque', es: 'Gestión de marca' } },
  { name: 'Branding', category: 'Business & Finance', translations: { de: 'Markenbildung', fr: 'Branding', es: 'Branding' } },
  { name: 'Budgeting', category: 'Business & Finance', translations: { de: 'Budgetierung', fr: 'Budgétisation', es: 'Presupuestación' } },
  { name: 'Business Acumen', category: 'Business & Finance', translations: { de: 'Geschäftssinn', fr: 'Sens des affaires', es: 'Visión para los negocios' } },
  { name: 'Business Analysis', category: 'Business & Finance', translations: { de: 'Geschäftsanalyse', fr: 'Analyse d\'affaires', es: 'Análisis de negocios' } },
  { name: 'Business Development', category: 'Business & Finance', translations: { de: 'Geschäftsentwicklung', fr: 'Développement commercial', es: 'Desarrollo de negocios' } },
  { name: 'Business Planning', category: 'Business & Finance', translations: { de: 'Geschäftsplanung', fr: 'Planification d\'entreprise', es: 'Planificación de negocios' } },
  { name: 'Business-to-Business (B2B)', category: 'Business & Finance', translations: { de: 'Business-to-Business (B2B)', fr: 'Business-to-Business (B2B)', es: 'Business-to-Business (B2B)' } },
  { name: 'Business Process Improvement', category: 'Business & Finance', translations: { de: 'Verbesserung von Geschäftsprozessen', fr: 'Amélioration des processus métier', es: 'Mejora de procesos de negocio' } },
  { name: 'Business Strategy', category: 'Business & Finance', translations: { de: 'Geschäftsstrategie', fr: 'Stratégie d\'entreprise', es: 'Estrategia de negocios' } },

  // --- Leadership & Management ---
  { name: 'Benchmarking', category: 'Leadership & Management', translations: { de: 'Benchmarking', fr: 'Benchmarking', es: 'Benchmarking' } },
  { name: 'Board Development', category: 'Leadership & Management', translations: { de: 'Vorstandsentwicklung', fr: 'Développement du conseil d\'administration', es: 'Desarrollo de juntas directivas' } },
  { name: 'Brainstorming Facilitation', category: 'Leadership & Management', translations: { de: 'Brainstorming-Moderation', fr: 'Animation de brainstorming', es: 'Facilitación de lluvia de ideas' } },
  { name: 'Building Teams', category: 'Leadership & Management', translations: { de: 'Teambildung', fr: 'Constitution d\'équipes', es: 'Creación de equipos' } },
  
  // --- Communication & Interpersonal ---
  { name: 'Blogging', category: 'Communication & Interpersonal', translations: { de: 'Bloggen', fr: 'Blogging', es: 'Blogging' } },
  { name: 'Body Language', category: 'Communication & Interpersonal', translations: { de: 'Körpersprache', fr: 'Langage corporel', es: 'Lenguaje corporal' } },
  { name: 'Briefing', category: 'Communication & Interpersonal', translations: { de: 'Einweisung', fr: 'Briefing', es: 'Briefing' } },
  { name: 'Broadcasting', category: 'Communication & Interpersonal', translations: { de: 'Rundfunk', fr: 'Radiodiffusion', es: 'Radiodifusión' } },
  { name: 'Building Rapport', category: 'Communication & Interpersonal', translations: { de: 'Beziehungsaufbau', fr: 'Établissement de relations', es: 'Creación de compenetración' } },
  
  // --- Analytical & Technical ---
  { name: 'Back-End Web Development', category: 'Analytical & Technical', translations: { de: 'Back-End-Webentwicklung', fr: 'Développement web back-end', es: 'Desarrollo web back-end' } },
  { name: 'Big Data Analytics', category: 'Analytical & Technical', translations: { de: 'Big-Data-Analyse', fr: 'Analyse du Big Data', es: 'Análisis de Big Data' } },
  { name: 'Bioinformatics', category: 'Analytical & Technical', translations: { de: 'Bioinformatik', fr: 'Bio-informatique', es: 'Bioinformática' } },
  { name: 'Blockchain', category: 'Analytical & Technical', translations: { de: 'Blockchain', fr: 'Blockchain', es: 'Blockchain' } },
  { name: 'Business Intelligence (BI)', category: 'Analytical & Technical', translations: { de: 'Business Intelligence (BI)', fr: 'Informatique décisionnelle (BI)', es: 'Inteligencia de negocios (BI)' } },
  { name: 'Bootstrap', category: 'Analytical & Technical', translations: { de: 'Bootstrap', fr: 'Bootstrap', es: 'Bootstrap' } },

  // --- Personal Development & Mindset ---
  { name: 'Balance', category: 'Personal Development & Mindset', translations: { de: 'Gleichgewicht', fr: 'Équilibre', es: 'Equilibrio' } },
  { name: 'Behavioral Change', category: 'Personal Development & Mindset', translations: { de: 'Verhaltensänderung', fr: 'Changement de comportement', es: 'Cambio de comportamiento' } },
  { name: 'Belief Systems', category: 'Personal Development & Mindset', translations: { de: 'Glaubenssysteme', fr: 'Systèmes de croyances', es: 'Sistemas de creencias' } },
  { name: 'Biohacking', category: 'Personal Development & Mindset', translations: { de: 'Biohacking', fr: 'Biohacking', es: 'Biohacking' } },
  { name: 'Boundary Setting', category: 'Personal Development & Mindset', translations: { de: 'Grenzen setzen', fr: 'Définition des limites', es: 'Establecimiento de límites' } },
  { name: 'Burnout Prevention', category: 'Personal Development & Mindset', translations: { de: 'Burnout-Prävention', fr: 'Prévention de l\'épuisement professionnel', es: 'Prevención del burnout' } },
  { name: 'Building Confidence', category: 'Personal Development & Mindset', translations: { de: 'Selbstvertrauen aufbauen', fr: 'Renforcement de la confiance', es: 'Construcción de confianza' } },
  { name: 'Breaking Habits', category: 'Personal Development & Mindset', translations: { de: 'Gewohnheiten durchbrechen', fr: 'Rompre les habitudes', es: 'Romper hábitos' } },
  { name: 'Bravery', category: 'Personal Development & Mindset', translations: { de: 'Mut', fr: 'Bravoure', es: 'Valentía' } },

  // --- Wellness & Creative Arts ---
  { name: 'Baking', category: 'Wellness & Creative Arts', translations: { de: 'Backen', fr: 'Pâtisserie', es: 'Repostería' } },
  { name: 'Ballet', category: 'Wellness & Creative Arts', translations: { de: 'Ballett', fr: 'Ballet', es: 'Ballet' } },
  { name: 'Bartending', category: 'Wellness & Creative Arts', translations: { de: 'Barkeepern', fr: 'Barman', es: 'Coctelería' } },
  { name: 'Bass Guitar', category: 'Wellness & Creative Arts', translations: { de: 'Bassgitarre', fr: 'Guitare basse', es: 'Bajo' } },
  { name: 'Belly Dance', category: 'Wellness & Creative Arts', translations: { de: 'Bauchtanz', fr: 'Danse du ventre', es: 'Danza del vientre' } },
  { name: 'Body Positivity', category: 'Wellness & Creative Arts', translations: { de: 'Körperpositivität', fr: 'Positivité corporelle', es: 'Positividad corporal' } },
  { name: 'Bodywork', category: 'Wellness & Creative Arts', translations: { de: 'Körperarbeit', fr: 'Travail corporel', es: 'Trabajo corporal' } },
  { name: 'Botany', category: 'Wellness & Creative Arts', translations: { de: 'Botanik', fr: 'Botanique', es: 'Botánica' } },
  { name: 'Boxing', category: 'Wellness & Creative Arts', translations: { de: 'Boxen', fr: 'Boxe', es: 'Boxeo' } },
  { name: 'Breathwork', category: 'Wellness & Creative Arts', translations: { de: 'Atemarbeit', fr: 'Travail respiratoire', es: 'Trabajo de respiración' } },
  { name: 'Brewing', category: 'Wellness & Creative Arts', translations: { de: 'Brauen', fr: 'Brassage', es: 'Elaboración de cerveza' } },
  { name: 'Barre', category: 'Wellness & Creative Arts', translations: { de: 'Barre-Workout', fr: 'Barre', es: 'Barre' } },
  { name: 'Biophilic Design', category: 'Wellness & Creative Arts', translations: { de: 'Biophiles Design', fr: 'Design biophilique', es: 'Diseño biofílico' } },
  { name: 'Ballroom Dancing', category: 'Wellness & Creative Arts', translations: { de: 'Gesellschaftstanz', fr: 'Danse de salon', es: 'Baile de salón' } },
  { name: 'Beatmaking', category: 'Wellness & Creative Arts', translations: { de: 'Beatmaking', fr: 'Beatmaking', es: 'Creación de ritmos' } },
  { name: 'Bird Watching', category: 'Wellness & Creative Arts', translations: { de: 'Vogelbeobachtung', fr: 'Observation des oiseaux', es: 'Observación de aves' } },
  { name: 'Backpacking', category: 'Wellness & Creative Arts', translations: { de: 'Rucksackreisen', fr: 'Randonnée avec sac à dos', es: 'Mochilero' } },
  { name: 'Boating', category: 'Wellness & Creative Arts', translations: { de: 'Bootfahren', fr: 'Navigation de plaisance', es: 'Navegación' } },
  { name: 'Bonsai', category: 'Wellness & Creative Arts', translations: { de: 'Bonsai', fr: 'Bonsaï', es: 'Bonsái' } },
  { name: 'Bookbinding', category: 'Wellness & Creative Arts', translations: { de: 'Buchbinderei', fr: 'Reliure', es: 'Encuadernación' } },
];


const seedSkills = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    let createdCount = 0;
    let synchronizedCount = 0;

    for (const item of dataToUpload) {
      let skill = await Skill.findOne({ name: item.name });

      if (skill) {
        // --- UPDATE PATH ---
        let needsSave = false;
        if (skill.category !== item.category) {
            skill.category = item.category;
            needsSave = true;
        }
        
        if (needsSave) {
            await skill.save();
            console.log(`Synchronizing category for existing skill: "${item.name}"...`);
        }
        synchronizedCount++;

      } else {
        // --- CREATE PATH ---
        console.log(`Creating new skill: "${item.name}"...`);
        skill = new Skill({
          name: item.name,
          category: item.category,
        });
        await skill.save();
        createdCount++;
      }

      // Find and update the translation, or create it if it's missing.
      await Translation.updateOne(
        { key: `skills_${skill._id}` },
        {
          $set: {
            listType: 'skills',
            translations: item.translations,
          }
        },
        { upsert: true }
      );
      console.log(`  - Synchronized translation for "${item.name}".`);
    }

    console.log(`\nSeed complete. Created: ${createdCount}, Synchronized: ${synchronizedCount}.`);
  } catch (error) {
    console.error('An error occurred during the seed process:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

// --- Run the Seeder ---
seedSkills();