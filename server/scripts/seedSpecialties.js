// scripts/seedSpecialties.js

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const Specialty = require('../models/Specialty');
const Translation = require('../models/Translation');

const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is not defined in your environment variables.');
  process.exit(1);
}

// --- DATA TO UPLOAD ---
// A comprehensive list of specialties for a modern coaching platform.
const dataToUpload = [
  // --- Leadership & Management ---
  {
    name: 'Executive Coaching',
    translations: { de: 'Coaching für Führungskräfte', fr: 'Coaching de dirigeants', es: 'Coaching ejecutivo' },
  },
  {
    name: 'Leadership Development',
    translations: { de: 'Führungskräfteentwicklung', fr: 'Développement du leadership', es: 'Desarrollo de liderazgo' },
  },
  {
    name: 'Team Management & Building',
    translations: { de: 'Team-Management & Teambildung', fr: 'Gestion et constitution d\'équipe', es: 'Gestión y formación de equipos' },
  },
  {
    name: 'Conflict Resolution',
    translations: { de: 'Konfliktlösung', fr: 'Résolution de conflits', es: 'Resolución de conflictos' },
  },
  {
    name: 'Change Management',
    translations: { de: 'Veränderungsmanagement', fr: 'Gestion du changement', es: 'Gestión del cambio' },
  },
  {
    name: 'Strategic Planning',
    translations: { de: 'Strategische Planung', fr: 'Planification stratégique', es: 'Planificación estratégica' },
  },

  // --- Career & Professional Development ---
  {
    name: 'Career Transition',
    translations: { de: 'Berufliche Neuorientierung', fr: 'Transition de carrière', es: 'Transición de carrera' },
  },
  {
    name: 'Interview Skills',
    translations: { de: 'Interviewtraining', fr: 'Techniques d\'entretien', es: 'Habilidades para entrevistas' },
  },
  {
    name: 'Public Speaking',
    translations: { de: 'Öffentliches Reden', fr: 'Prise de parole en public', es: 'Hablar en público' },
  },
  {
    name: 'Negotiation Skills',
    translations: { de: 'Verhandlungsgeschick', fr: 'Techniques de négociation', es: 'Habilidades de negociación' },
  },
  {
    name: 'Professional Networking',
    translations: { de: 'Professionelles Networking', fr: 'Réseautage professionnel', es: 'Networking profesional' },
  },
  {
    name: 'Communication Skills',
    translations: { de: 'Kommunikationsfähigkeiten', fr: 'Compétences en communication', es: 'Habilidades de comunicación' },
  },

  // --- Personal Development & Well-being ---
  {
    name: 'Confidence Building',
    translations: { de: 'Stärkung des Selbstvertrauens', fr: 'Renforcement de la confiance en soi', es: 'Desarrollo de la confianza' },
  },
  {
    name: 'Stress Management',
    translations: { de: 'Stressbewältigung', fr: 'Gestion du stress', es: 'Manejo del estrés' },
  },
  {
    name: 'Work-Life Balance',
    translations: { de: 'Work-Life-Balance', fr: 'Équilibre vie pro-vie perso', es: 'Equilibrio vida-trabajo' },
  },
  {
    name: 'Mindfulness & Meditation',
    translations: { de: 'Achtsamkeit & Meditation', fr: 'Pleine conscience et méditation', es: 'Mindfulness y meditación' },
  },
  {
    name: 'Goal Setting',
    translations: { de: 'Zielsetzung', fr: 'Définition d\'objectifs', es: 'Establecimiento de metas' },
  },
  {
    name: 'Habit Formation',
    translations: { de: 'Gewohnheitsbildung', fr: 'Création d\'habitudes', es: 'Formación de hábitos' },
  },
  {
    name: 'Relationship Coaching',
    translations: { de: 'Beziehungscoaching', fr: 'Coaching relationnel', es: 'Coaching de relaciones' },
  },

  // --- Business & Entrepreneurship ---
  {
    name: 'Startup Coaching',
    translations: { de: 'Startup-Coaching', fr: 'Coaching de startup', es: 'Coaching para startups' },
  },
  {
    name: 'Business Strategy',
    translations: { de: 'Geschäftsstrategie', fr: 'Stratégie d\'entreprise', es: 'Estrategia de negocio' },
  },
  {
    name: 'Sales Coaching',
    translations: { de: 'Vertriebscoaching', fr: 'Coaching commercial', es: 'Coaching de ventas' },
  },
  {
    name: 'Marketing Strategy',
    translations: { de: 'Marketingstrategie', fr: 'Stratégie marketing', es: 'Estrategia de marketing' },
  },

  // --- Specific Skills & Performance ---
  {
    name: 'Performance Improvement',
    translations: { de: 'Leistungssteigerung', fr: 'Amélioration des performances', es: 'Mejora del rendimiento' },
  },
  {
    name: 'Productivity Coaching',
    translations: { de: 'Produktivitätscoaching', fr: 'Coaching en productivité', es: 'Coaching de productividad' },
  },
  {
    name: 'Creative Thinking',
    translations: { de: 'Kreatives Denken', fr: 'Pensée créative', es: 'Pensamiento creativo' },
  },
  {
    name: 'Emotional Intelligence',
    translations: { de: 'Emotionale Intelligenz', fr: 'Intelligence émotionnelle', es: 'Inteligencia emocional' },
  },
  {
    name: 'Time Management',
    translations: { de: 'Zeitmanagement', fr: 'Gestion du temps', es: 'Gestión del tiempo' },
  },
  {
    name: 'Career Development',
    translations: { de: 'Karriereentwicklung', fr: 'Développement de carrière', es: 'Desarrollo de carrera' },
  },
];

const seedSpecialties = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    let createdCount = 0;
    for (const item of dataToUpload) {
      const existingSpecialty = await Specialty.findOne({ name: item.name });

      if (existingSpecialty) {
        console.log(`Skipping existing specialty: "${item.name}"`);
        continue;
      }

      const newSpecialty = new Specialty({ name: item.name });
      await newSpecialty.save();

      const newTranslation = new Translation({
        key: `specialties_${newSpecialty._id}`,
        listType: 'specialties',
        translations: item.translations,
      });
      await newTranslation.save();

      console.log(`Successfully created: "${item.name}" and its translations.`);
      createdCount++;
    }

    console.log(`\nSeed complete. Created ${createdCount} new specialties and their translations.`);
  } catch (error) {
    console.error('An error occurred during the seed process:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

// --- Run the Seeder ---
seedSpecialties();