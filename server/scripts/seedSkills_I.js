// scripts/seedSkills_I.js

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
// A list of 60 general and specific coaching-related skills starting with 'I'.
const dataToUpload = [
  // --- Business & Finance ---
  { name: 'Import/Export', category: 'Business & Finance', translations: { de: 'Import/Export', fr: 'Import/Export', es: 'Importación/Exportación' } },
  { name: 'Industrial Relations', category: 'Business & Finance', translations: { de: 'Arbeitsbeziehungen', fr: 'Relations industrielles', es: 'Relaciones laborales' } },
  { name: 'Innovation Management', category: 'Business & Finance', translations: { de: 'Innovationsmanagement', fr: 'Gestion de l\'innovation', es: 'Gestión de la innovación' } },
  { name: 'Insurance', category: 'Business & Finance', translations: { de: 'Versicherungswesen', fr: 'Assurance', es: 'Seguros' } },
  { name: 'Internal Audit', category: 'Business & Finance', translations: { de: 'Interne Revision', fr: 'Audit interne', es: 'Auditoría interna' } },
  { name: 'International Business', category: 'Business & Finance', translations: { de: 'Internationales Geschäft', fr: 'Commerce international', es: 'Negocios internacionales' } },
  { name: 'Inventory Management', category: 'Business & Finance', translations: { de: 'Bestandsmanagement', fr: 'Gestion des stocks', es: 'Gestión de inventario' } },
  { name: 'Investment Banking', category: 'Business & Finance', translations: { de: 'Investmentbanking', fr: 'Banque d\'investissement', es: 'Banca de inversión' } },
  { name: 'Investor Relations', category: 'Business & Finance', translations: { de: 'Investorenbeziehungen', fr: 'Relations avec les investisseurs', es: 'Relaciones con inversores' } },
  { name: 'Invoicing', category: 'Business & Finance', translations: { de: 'Rechnungsstellung', fr: 'Facturation', es: 'Facturación' } },

  // --- Leadership & Management ---
  { name: 'Incident Management', category: 'Leadership & Management', translations: { de: 'Störungsmanagement', fr: 'Gestion des incidents', es: 'Gestión de incidentes' } },
  { name: 'Influencing', category: 'Leadership & Management', translations: { de: 'Einflussnahme', fr: 'Influence', es: 'Influencia' } },
  { name: 'Inspiring Others', category: 'Leadership & Management', translations: { de: 'Andere inspirieren', fr: 'Inspirer les autres', es: 'Inspirar a otros' } },
  { name: 'Instructional Design', category: 'Leadership & Management', translations: { de: 'Lehrplangestaltung', fr: 'Conception pédagogique', es: 'Diseño instruccional' } },
  { name: 'Interviewing', category: 'Leadership & Management', translations: { de: 'Interviewführung', fr: 'Entretien', es: 'Entrevistas' } },
  { name: 'Implementation', category: 'Leadership & Management', translations: { de: 'Implementierung', fr: 'Mise en œuvre', es: 'Implementación' } },
  { name: 'Initiative', category: 'Leadership & Management', translations: { de: 'Initiative', fr: 'Initiative', es: 'Iniciativa' } },
  { name: 'Inspection', category: 'Leadership & Management', translations: { de: 'Inspektion', fr: 'Inspection', es: 'Inspección' } },

  // --- Communication & Interpersonal ---
  { name: 'Illustration', category: 'Communication & Interpersonal', translations: { de: 'Illustration', fr: 'Illustration', es: 'Ilustración' } },
  { name: 'Improvisation', category: 'Communication & Interpersonal', translations: { de: 'Improvisation', fr: 'Improvisation', es: 'Improvisación' } },
  { name: 'Information Synthesis', category: 'Communication & Interpersonal', translations: { de: 'Informationssynthese', fr: 'Synthèse de l\'information', es: 'Síntesis de información' } },
  { name: 'Integrity', category: 'Communication & Interpersonal', translations: { de: 'Integrität', fr: 'Intégrité', es: 'Integridad' } },
  { name: 'Intercultural Competence', category: 'Communication & Interpersonal', translations: { de: 'Interkulturelle Kompetenz', fr: 'Compétence interculturelle', es: 'Competencia intercultural' } },
  { name: 'Interpersonal Skills', category: 'Communication & Interpersonal', translations: { de: 'Zwischenmenschliche Fähigkeiten', fr: 'Compétences interpersonnelles', es: 'Habilidades interpersonales' } },
  { name: 'Interpreting', category: 'Communication & Interpersonal', translations: { de: 'Dolmetschen', fr: 'Interprétation', es: 'Interpretación' } },
  { name: 'Italian', category: 'Communication & Interpersonal', translations: { de: 'Italienisch', fr: 'Italien', es: 'Italiano' } },

  // --- Analytical & Technical ---
  { name: 'Information Architecture', category: 'Analytical & Technical', translations: { de: 'Informationsarchitektur', fr: 'Architecture de l\'information', es: 'Arquitectura de la información' } },
  { name: 'Information Security', category: 'Analytical & Technical', translations: { de: 'Informationssicherheit', fr: 'Sécurité de l\'information', es: 'Seguridad de la información' } },
  { name: 'Information Technology (IT)', category: 'Analytical & Technical', translations: { de: 'Informationstechnologie (IT)', fr: 'Technologie de l\'information (TI)', es: 'Tecnología de la información (TI)' } },
  { name: 'Infrastructure Management', category: 'Analytical & Technical', translations: { de: 'Infrastrukturmanagement', fr: 'Gestion des infrastructures', es: 'Gestión de infraestructuras' } },
  { name: 'Integration', category: 'Analytical & Technical', translations: { de: 'Integration', fr: 'Intégration', es: 'Integración' } },
  { name: 'IntelliJ IDEA', category: 'Analytical & Technical', translations: { de: 'IntelliJ IDEA', fr: 'IntelliJ IDEA', es: 'IntelliJ IDEA' } },
  { name: 'Internet of Things (IoT)', category: 'Analytical & Technical', translations: { de: 'Internet der Dinge (IoT)', fr: 'Internet des objets (IdO)', es: 'Internet de las cosas (IoT)' } },
  { name:- 'iOS Development', category: 'Analytical & Technical', translations: { de: 'iOS-Entwicklung', fr: 'Développement iOS', es: 'Desarrollo de iOS' } },
  { name: 'ITIL', category: 'Analytical & Technical', translations: { de: 'ITIL', fr: 'ITIL', es: 'ITIL' } },
  { name: 'Adobe InDesign', category: 'Analytical & Technical', translations: { de: 'Adobe InDesign', fr: 'Adobe InDesign', es: 'Adobe InDesign' } },
  { name: 'Adobe Illustrator', category: 'Analytical & Technical', translations: { de: 'Adobe Illustrator', fr: 'Adobe Illustrator', es: 'Adobe Illustrator' } },
  
  // --- Personal Development & Mindset ---
  { name: 'Imagination', category: 'Personal Development & Mindset', translations: { de: 'Vorstellungskraft', fr: 'Imagination', es: 'Imaginación' } },
  { name: 'Impulse Control', category: 'Personal Development & Mindset', translations: { de: 'Impulskontrolle', fr: 'Contrôle des impulsions', es: 'Control de impulsos' } },
  { name: 'Independence', category: 'Personal Development & Mindset', translations: { de: 'Unabhängigkeit', fr: 'Indépendance', es: 'Independencia' } },
  { name: 'Inner Child Work', category: 'Personal Development & Mindset', translations: { de: 'Arbeit mit dem inneren Kind', fr: 'Travail sur l\'enfant intérieur', es: 'Trabajo con el niño interior' } },
  { name: 'Inspiration', category: 'Personal Development & Mindset', translations: { de: 'Inspiration', fr: 'Inspiration', es: 'Inspiración' } },
  { name: 'Introspection', category: 'Personal Development & Mindset', translations: { de: 'Introspektion', fr: 'Introspection', es: 'Introspección' } },
  { name: 'Intuition', category: 'Personal Development & Mindset', translations: { de: 'Intuition', fr: 'Intuition', es: 'Intuición' } },
  { name: 'Investigative mindset', category: 'Personal Development & Mindset', translations: { de: 'Investigative Denkweise', fr: 'Esprit d\'investigation', es: 'Mentalidad investigadora' } },

  // --- Wellness & Creative Arts ---
  { name: 'Ice Skating', category: 'Wellness & Creative Arts', translations: { de: 'Eislaufen', fr: 'Patinage sur glace', es: 'Patinaje sobre hielo' } },
  { name: 'Ikebana', category: 'Wellness & Creative Arts', translations: { de: 'Ikebana', fr: 'Ikebana', es: 'Ikebana' } },
  { name: 'Improv Comedy', category: 'Wellness & Creative Arts', translations: { de: 'Impro-Comedy', fr: 'Comédie d\'improvisation', es: 'Comedia de improvisación' } },
  { name: 'Indian Cuisine', category: 'Wellness & Creative Arts', translations: { de: 'Indische Küche', fr: 'Cuisine indienne', es: 'Cocina india' } },
  { name: 'Instrumental Music', category: 'Wellness & Creative Arts', translations: { de: 'Instrumentalmusik', fr: 'Musique instrumentale', es: 'Música instrumental' } },
  { name: 'Integrative Health', category: 'Wellness & Creative Arts', translations: { de: 'Integrative Gesundheit', fr: 'Santé intégrative', es: 'Salud integrativa' } },
  { name: 'Interior Design', category: 'Wellness & Creative Arts', translations: { de: 'Innenarchitektur', fr: 'Design d\'intérieur', es: 'Diseño de interiores' } },
  { name: 'Iridology', category: 'Wellness & Creative Arts', translations: { de: 'Iridologie', fr: 'Iridologie', es: 'Iridología' } },
  { name: 'Ironman Training', category: 'Wellness & Creative Arts', translations: { de: 'Ironman-Training', fr: 'Entraînement Ironman', es: 'Entrenamiento Ironman' } },
  { name: 'Infrared Sauna', category: 'Wellness & Creative Arts', translations: { de: 'Infrarotsauna', fr: 'Sauna infrarouge', es: 'Sauna de infrarrojos' } },
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