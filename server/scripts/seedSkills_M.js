// scripts/seedSkills_M.js

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
// A list of 60 general and specific coaching-related skills starting with 'M'.
const dataToUpload = [
  // --- Leadership & Management ---
  { name: 'Management', category: 'Leadership & Management', translations: { de: 'Management', fr: 'Gestion', es: 'Gestión' } },
  { name: 'Management Consulting', category: 'Leadership & Management', translations: { de: 'Unternehmensberatung', fr: 'Conseil en gestion', es: 'Consultoría de gestión' } },
  { name: 'Managing Budgets', category: 'Leadership & Management', translations: { de: 'Budgetverwaltung', fr: 'Gestion de budgets', es: 'Gestión de presupuestos' } },
  { name: 'Managing Conflict', category: 'Leadership & Management', translations: { de: 'Konfliktmanagement', fr: 'Gestion des conflits', es: 'Manejo de conflictos' } },
  { name: 'Managing Remote Teams', category: 'Leadership & Management', translations: { de: 'Führung von Remote-Teams', fr: 'Gestion d\'équipes à distance', es: 'Gestión de equipos remotos' } },
  { name: 'Managing Up', category: 'Leadership & Management', translations: { de: 'Führen von Vorgesetzten', fr: 'Gérer son supérieur', es: 'Gestionar hacia arriba' } },
  { name: 'Meeting Facilitation', category: 'Leadership & Management', translations: { de: 'Moderation von Besprechungen', fr: 'Animation de réunions', es: 'Facilitación de reuniones' } },
  { name: 'Mentoring', category: 'Leadership & Management', translations: { de: 'Mentoring', fr: 'Mentorat', es: 'Mentoría' } },
  { name: 'Motivational Leadership', category: 'Leadership & Management', translations: { de: 'Motivierende Führung', fr: 'Leadership motivationnel', es: 'Liderazgo motivacional' } },
  { name: 'Matrix Management', category: 'Leadership & Management', translations: { de: 'Matrix-Management', fr: 'Gestion matricielle', es: 'Gestión matricial' } },
  
  // --- Business & Finance ---
  { name: 'Market Analysis', category: 'Business & Finance', translations: { de: 'Marktanalyse', fr: 'Analyse de marché', es: 'Análisis de mercado' } },
  { name: 'Market Research', category: 'Business & Finance', translations: { de: 'Marktforschung', fr: 'Étude de marché', es: 'Investigación de mercado' } },
  { name: 'Marketing', category: 'Business & Finance', translations: { de: 'Marketing', fr: 'Marketing', es: 'Marketing' } },
  { name: 'Marketing Strategy', category: 'Business & Finance', translations: { de: 'Marketingstrategie', fr: 'Stratégie marketing', es: 'Estrategia de marketing' } },
  { name: 'Media Planning', category: 'Business & Finance', translations: { de: 'Mediaplanung', fr: 'Planification média', es: 'Planificación de medios' } },
  { name: 'Merchandising', category: 'Business & Finance', translations: { de: 'Merchandising', fr: 'Merchandising', es: 'Merchandising' } },
  { name: 'Mergers & Acquisitions (M&A)', category: 'Business & Finance', translations: { de: 'Fusionen und Übernahmen (M&A)', fr: 'Fusions et acquisitions (M&A)', es: 'Fusiones y adquisiciones (M&A)' } },
  { name: 'Microsoft Excel', category: 'Business & Finance', translations: { de: 'Microsoft Excel', fr: 'Microsoft Excel', es: 'Microsoft Excel' } },
  { name: 'Microsoft Office', category: 'Business & Finance', translations: { de: 'Microsoft Office', fr: 'Microsoft Office', es: 'Microsoft Office' } },
  { name: 'Microsoft PowerPoint', category: 'Business & Finance', translations: { de: 'Microsoft PowerPoint', fr: 'Microsoft PowerPoint', es: 'Microsoft PowerPoint' } },
  { name: 'Microsoft Project', category: 'Business & Finance', translations: { de: 'Microsoft Project', fr: 'Microsoft Project', es: 'Microsoft Project' } },
  { name: 'Money Management', category: 'Business & Finance', translations: { de: 'Geldmanagement', fr: 'Gestion de l\'argent', es: 'Administración del dinero' } },
  { name: 'Monetization', category: 'Business & Finance', translations: { de: 'Monetarisierung', fr: 'Monétisation', es: 'Monetización' } },
  
  // --- Communication & Interpersonal ---
  { name: 'Media Relations', category: 'Communication & Interpersonal', translations: { de: 'Medienarbeit', fr: 'Relations avec les médias', es: 'Relaciones con los medios' } },
  { name: 'Media Training', category: 'Communication & Interpersonal', translations: { de: 'Medientraining', fr: 'Formation aux médias', es: 'Entrenamiento de medios' } },
  { name: 'Moderating', category: 'Communication & Interpersonal', translations: { de: 'Moderieren', fr: 'Modération', es: 'Moderación' } },
  { name: 'Motivational Speaking', category: 'Communication & Interpersonal', translations: { de: 'Motivationsvorträge', fr: 'Discours de motivation', es: 'Discursos de motivación' } },
  { name: 'Multitasking', category: 'Communication & Interpersonal', translations: { de: 'Multitasking', fr: 'Multitâche', es: 'Multitarea' } },
  
  // --- Analytical & Technical ---
  { name: 'Machine Learning', category: 'Analytical & Technical', translations: { de: 'Maschinelles Lernen', fr: 'Apprentissage automatique', es: 'Aprendizaje automático' } },
  { name: 'MATLAB', category: 'Analytical & Technical', translations: { de: 'MATLAB', fr: 'MATLAB', es: 'MATLAB' } },
  { name: 'Maven', category: 'Analytical & Technical', translations: { de: 'Maven', fr: 'Maven', es: 'Maven' } },
  { name: 'Microservices', category: 'Analytical & Technical', translations: { de: 'Microservices', fr: 'Microservices', es: 'Microservicios' } },
  { name: 'Mobile Application Development', category: 'Analytical & Technical', translations: { de: 'Entwicklung mobiler Anwendungen', fr: 'Développement d\'applications mobiles', es: 'Desarrollo de aplicaciones móviles' } },
  { name: 'MongoDB', category: 'Analytical & Technical', translations: { de: 'MongoDB', fr: 'MongoDB', es: 'MongoDB' } },
  { name: 'MySQL', category: 'Analytical & Technical', translations: { de: 'MySQL', fr: 'MySQL', es: 'MySQL' } },
  
  // --- Personal Development & Mindset ---
  { name: 'Manifestation', category: 'Personal Development & Mindset', translations: { de: 'Manifestation', fr: 'Manifestation', es: 'Manifestación' } },
  { name: 'Meaning and Purpose', category: 'Personal Development & Mindset', translations: { de: 'Sinn und Zweck', fr: 'Sens et but', es: 'Sentido y propósito' } },
  { name: 'Memory Improvement', category: 'Personal Development & Mindset', translations: { de: 'Gedächtnisverbesserung', fr: 'Amélioration de la mémoire', es: 'Mejora de la memoria' } },
  { name: 'Mental Fortitude', category: 'Personal Development & Mindset', translations: { de: 'Mentale Stärke', fr: 'Force mentale', es: 'Fortaleza mental' } },
  { name: 'Mind Mapping', category: 'Personal Development & Mindset', translations: { de: 'Mind Mapping', fr: 'Mind mapping', es: 'Mapas mentales' } },
  { name: 'Mindfulness', category: 'Personal Development & Mindset', translations: { de: 'Achtsamkeit', fr: 'Pleine conscience', es: 'Atención plena' } },
  { name: 'Mindset Coaching', category: 'Personal Development & Mindset', translations: { de: 'Mindset-Coaching', fr: 'Coaching de l\'état d\'esprit', es: 'Coaching de mentalidad' } },
  { name: 'Motivation', category: 'Personal Development & Mindset', translations: { de: 'Motivation', fr: 'Motivation', es: 'Motivación' } },
  { name: 'Morning Routines', category: 'Personal Development & Mindset', translations: { de: 'Morgenroutinen', fr: 'Routines matinales', es: 'Rutinas matutinas' } },
  
  // --- Wellness & Creative Arts ---
  { name: 'Macrame', category: 'Wellness & Creative Arts', translations: { de: 'Makramee', fr: 'Macramé', es: 'Macramé' } },
  { name: 'Makeup Artistry', category: 'Wellness & Creative Arts', translations: { de: 'Maskenbildnerei', fr: 'Maquillage artistique', es: 'Maquillaje artístico' } },
  { name: 'Martial Arts', category: 'Wellness & Creative Arts', translations: { de: 'Kampfkunst', fr: 'Arts martiaux', es: 'Artes marciales' } },
  { name: 'Massage Therapy', category: 'Wellness & Creative Arts', translations: { de: 'Massagetherapie', fr: 'Massothérapie', es: 'Masoterapia' } },
  { name: 'Meal Planning', category: 'Wellness & Creative Arts', translations: { de: 'Essensplanung', fr: 'Planification des repas', es: 'Planificación de comidas' } },
  { name: 'Meditation', category: 'Wellness & Creative Arts', translations: { de: 'Meditation', fr: 'Méditation', es: 'Meditación' } },
  { name: 'Meditation Instruction', category: 'Wellness & Creative Arts', translations: { de: 'Meditationsanleitung', fr: 'Instruction à la méditation', es: 'Instrucción de meditación' } },
  { name: 'Mineralogy', category: 'Wellness & Creative Arts', translations: { de: 'Mineralogie', fr: 'Minéralogie', es: 'Mineralogía' } },
  { name: 'Model Building', category: 'Wellness & Creative Arts', translations: { de: 'Modellbau', fr: 'Modélisme', es: 'Modelismo' } },
  { name: 'Mountaineering', category: 'Wellness & Creative Arts', translations: { de: 'Bergsteigen', fr: 'Alpinisme', es: 'Montañismo' } },
  { name: 'Music Composition', category: 'Wellness & Creative Arts', translations: { de: 'Musikkomposition', fr: 'Composition musicale', es: 'Composición musical' } },
  { name: 'Music Production', category: 'Wellness & Creative Arts', translations: { de: 'Musikproduktion', fr: 'Production musicale', es: 'Producción musical' } },
  { name: 'Music Theory', category: 'Wellness & Creative Arts', translations: { de: 'Musiktheorie', fr: 'Théorie de la musique', es: 'Teoría musical' } },
  { name: 'Mythology', category: 'Wellness & Creative Arts', translations: { de: 'Mythologie', fr: 'Mythologie', es: 'Mitología' } },
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