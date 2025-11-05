// scripts/seedSkills_P.js

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
// A list of 60 general and specific coaching-related skills starting with 'P'.
const dataToUpload = [
  // --- Leadership & Management ---
  { name: 'People Management', category: 'Leadership & Management', translations: { de: 'Personalmanagement', fr: 'Gestion du personnel', es: 'Gestión de personal' } },
  { name: 'Performance Management', category: 'Leadership & Management', translations: { de: 'Leistungsmanagement', fr: 'Gestion de la performance', es: 'Gestión del rendimiento' } },
  { name: 'Performance Reviews', category: 'Leadership & Management', translations: { de: 'Leistungsbeurteilungen', fr: 'Évaluations de performance', es: 'Evaluaciones de desempeño' } },
  { name: 'Planning', category: 'Leadership & Management', translations: { de: 'Planung', fr: 'Planification', es: 'Planificación' } },
  { name: 'Policy Development', category: 'Leadership & Management', translations: { de: 'Richtlinienentwicklung', fr: 'Élaboration de politiques', es: 'Desarrollo de políticas' } },
  { name: 'Problem Solving', category: 'Leadership & Management', translations: { de: 'Problemlösung', fr: 'Résolution de problèmes', es: 'Resolución de problemas' } },
  { name: 'Process Improvement', category: 'Leadership & Management', translations: { de: 'Prozessverbesserung', fr: 'Amélioration des processus', es: 'Mejora de procesos' } },
  { name: 'Program Management', category: 'Leadership & Management', translations: { de: 'Programmmanagement', fr: 'Gestion de programme', es: 'Gestión de programas' } },
  { name: 'Project Management', category: 'Leadership & Management', translations: { de: 'Projektmanagement', fr: 'Gestion de projet', es: 'Gestión de proyectos' } },
  { name: 'Public Speaking', category: 'Leadership & Management', translations: { de: 'Öffentliches Reden', fr: 'Prise de parole en public', es: 'Hablar en público' } },
  { name: 'Partnership Management', category: 'Leadership & Management', translations: { de: 'Partnermanagement', fr: 'Gestion des partenariats', es: 'Gestión de alianzas' } },

  // --- Business & Finance ---
  { name: 'Payroll Management', category: 'Business & Finance', translations: { de: 'Lohn- und Gehaltsabrechnung', fr: 'Gestion de la paie', es: 'Gestión de nóminas' } },
  { name: 'Pitching', category: 'Business & Finance', translations: { de: 'Pitchen', fr: 'Pitcher', es: 'Presentar' } },
  { name: 'Portfolio Management', category: 'Business & Finance', translations: { de: 'Portfoliomanagement', fr: 'Gestion de portefeuille', es: 'Gestión de carteras' } },
  { name: 'Pricing Strategy', category: 'Business & Finance', translations: { de: 'Preisstrategie', fr: 'Stratégie de tarification', es: 'Estrategia de precios' } },
  { name: 'Private Equity', category: 'Business & Finance', translations: { de: 'Private Equity', fr: 'Capital-investissement', es: 'Capital privado' } },
  { name: 'Procurement', category: 'Business & Finance', translations: { de: 'Beschaffung', fr: 'Approvisionnement', es: 'Adquisiciones' } },
  { name: 'Product Development', category: 'Business & Finance', translations: { de: 'Produktentwicklung', fr: 'Développement de produits', es: 'Desarrollo de productos' } },
  { name: 'Product Launch', category: 'Business & Finance', translations: { de: 'Produkteinführung', fr: 'Lancement de produit', es: 'Lanzamiento de producto' } },
  { name: 'Product Management', category: 'Business & Finance', translations: { de: 'Produktmanagement', fr: 'Gestion de produits', es: 'Gestión de productos' } },
  { name: 'Product Marketing', category: 'Business & Finance', translations: { de: 'Produktmarketing', fr: 'Marketing de produits', es: 'Marketing de productos' } },
  { name: 'Profit and Loss (P&L) Management', category: 'Business & Finance', translations: { de: 'GuV-Management', fr: 'Gestion des profits et pertes (P&L)', es: 'Gestión de pérdidas y ganancias (P&G)' } },
  { name: 'Proposal Writing', category: 'Business & Finance', translations: { de: 'Angebotserstellung', fr: 'Rédaction de propositions', es: 'Redacción de propuestas' } },
  { name: 'Public Relations (PR)', category: 'Business & Finance', translations: { de: 'Öffentlichkeitsarbeit (PR)', fr: 'Relations publiques (RP)', es: 'Relaciones públicas (RRPP)' } },

  // --- Communication & Interpersonal ---
  { name: 'Patience', category: 'Communication & Interpersonal', translations: { de: 'Geduld', fr: 'Patience', es: 'Paciencia' } },
  { name: 'Persuasion', category: 'Communication & Interpersonal', translations: { de: 'Überzeugungskraft', fr: 'Persuasion', es: 'Persuasión' } },
  { name: 'Presentation Skills', category: 'Communication & Interpersonal', translations: { de: 'Präsentationsfähigkeiten', fr: 'Compétences en présentation', es: 'Habilidades de presentación' } },
  { name: 'Podcasting', category: 'Communication & Interpersonal', translations: { de: 'Podcasting', fr: 'Podcasting', es: 'Podcasting' } },
  { name: 'Proofreading', category: 'Communication & Interpersonal', translations: { de: 'Korrekturlesen', fr: 'Relecture', es: 'Corrección de pruebas' } },

  // --- Analytical & Technical ---
  { name: 'Pandas (Python Library)', category: 'Analytical & Technical', translations: { de: 'Pandas (Python-Bibliothek)', fr: 'Pandas (Bibliothèque Python)', es: 'Pandas (Biblioteca de Python)' } },
  { name:- 'Penetration Testing', category: 'Analytical & Technical', translations: { de: 'Penetrationstests', fr: 'Test d\'intrusion', es: 'Pruebas de penetración' } },
  { name: 'PHP', category: 'Analytical & Technical', translations: { de: 'PHP', fr: 'PHP', es: 'PHP' } },
  { name: 'PostgreSQL', category: 'Analytical & Technical', translations: { de: 'PostgreSQL', fr: 'PostgreSQL', es: 'PostgreSQL' } },
  { name: 'Power BI', category: 'Analytical & Technical', translations: { de: 'Power BI', fr: 'Power BI', es: 'Power BI' } },
  { name: 'Prototyping', category: 'Analytical & Technical', translations: { de: 'Prototyping', fr: 'Prototypage', es: 'Creación de prototipos' } },
  { name: 'Python (Programming Language)', category: 'Analytical & Technical', translations: { de: 'Python (Programmiersprache)', fr: 'Python (Langage de programmation)', es: 'Python (Lenguaje de programación)' } },

  // --- Personal Development & Mindset ---
  { name: 'Passion', category: 'Personal Development & Mindset', translations: { de: 'Leidenschaft', fr: 'Passion', es: 'Pasión' } },
  { name: 'Peak Performance', category: 'Personal Development & Mindset', translations: { de: 'Höchstleistung', fr: 'Performance de pointe', es: 'Rendimiento máximo' } },
  { name: 'Perseverance', category: 'Personal Development & Mindset', translations: { de: 'Ausdauer', fr: 'Persévérance', es: 'Perseverancia' } },
  { name: 'Personal Branding', category: 'Personal Development & Mindset', translations: { de: 'Personal Branding', fr: 'Marque personnelle', es: 'Marca personal' } },
  { name: 'Personal Development', category: 'Personal Development & Mindset', translations: { de: 'Persönlichkeitsentwicklung', fr: 'Développement personnel', es: 'Desarrollo personal' } },
  { name: 'Personal Finance', category: 'Personal Development & Mindset', translations: { de: 'Persönliche Finanzen', fr: 'Finances personnelles', es: 'Finanzas personales' } },
  { name: 'Perspective Taking', category: 'Personal Development & Mindset', translations: { de: 'Perspektivenübernahme', fr: 'Prise de perspective', es: 'Toma de perspectiva' } },
  { name: 'Positive Psychology', category: 'Personal Development & Mindset', translations: { de: 'Positive Psychologie', fr: 'Psychologie positive', es: 'Psicología positiva' } },
  { name: 'Presence', category: 'Personal Development & Mindset', translations: { de: 'Präsenz', fr: 'Présence', es: 'Presencia' } },
  { name: 'Prioritization', category: 'Personal Development & Mindset', translations: { de: 'Priorisierung', fr: 'Priorisation', es: 'Priorización' } },
  { name: 'Productivity', category: 'Personal Development & Mindset', translations: { de: 'Produktivität', fr: 'Productivité', es: 'Productividad' } },
  { name: 'Purpose Discovery', category: 'Personal Development & Mindset', translations: { de: 'Sinnfindung', fr: 'Découverte de son but', es: 'Descubrimiento del propósito' } },

  // --- Wellness & Creative Arts ---
  { name: 'Painting', category: 'Wellness & Creative Arts', translations: { de: 'Malen', fr: 'Peinture', es: 'Pintura' } },
  { name: 'Palmistry', category: 'Wellness & Creative Arts', translations: { de: 'Handlesen', fr: 'Chiromancie', es: 'Quiromancia' } },
  { name: 'Parkour', category: 'Wellness & Creative Arts', translations: { de: 'Parkour', fr: 'Parkour', es: 'Parkour' } },
  { name: 'Philosophy', category: 'Wellness & Creative Arts', translations: { de: 'Philosophie', fr: 'Philosophie', es: 'Filosofía' } },
  { name: 'Photography', category: 'Wellness & Creative Arts', translations: { de: 'Fotografie', fr: 'Photographie', es: 'Fotografía' } },
  { name: 'Physiotherapy', category: 'Wellness & Creative Arts', translations: { de: 'Physiotherapie', fr: 'Physiothérapie', es: 'Fisioterapia' } },
  { name: 'Pilates', category: 'Wellness & Creative Arts', translations: { de: 'Pilates', fr: 'Pilates', es: 'Pilates' } },
  { name: 'Piano', category: 'Wellness & Creative Arts', translations: { de: 'Klavier', fr: 'Piano', es: 'Piano' } },
  { name: 'Poetry', category: 'Wellness & Creative Arts', translations: { de: 'Dichtung', fr: 'Poésie', es: 'Poesía' } },
  { name: 'Pottery', category: 'Wellness & Creative Arts', translations: { de: 'Töpferei', fr: 'Poterie', es: 'Alfarería' } },
  { name: 'Psychology', category: 'Wellness & Creative Arts', translations: { de: 'Psychologie', fr: 'Psychologie', es: 'Psicología' } },
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