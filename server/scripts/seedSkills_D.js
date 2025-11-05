// scripts/seedSkills_D.js

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
// A list of 60 general and specific coaching-related skills starting with 'D'.
const dataToUpload = [
  // --- Business & Finance ---
  { name: 'Data Analysis', category: 'Business & Finance', translations: { de: 'Datenanalyse', fr: 'Analyse de données', es: 'Análisis de datos' } },
  { name: 'Deal Negotiation', category: 'Business & Finance', translations: { de: 'Vertragsverhandlungen', fr: 'Négociation de contrats', es: 'Negociación de acuerdos' } },
  { name: 'Debt Collection', category: 'Business & Finance', translations: { de: 'Inkasso', fr: 'Recouvrement de créances', es: 'Cobro de deudas' } },
  { name: 'Digital Marketing', category: 'Business & Finance', translations: { de: 'Digitales Marketing', fr: 'Marketing numérique', es: 'Marketing digital' } },
  { name: 'Digital Strategy', category: 'Business & Finance', translations: { de: 'Digitale Strategie', fr: 'Stratégie numérique', es: 'Estrategia digital' } },
  { name: 'Digital Transformation', category: 'Business & Finance', translations: { de: 'Digitale Transformation', fr: 'Transformation numérique', es: 'Transformación digital' } },
  { name: 'Direct Marketing', category: 'Business & Finance', translations: { de: 'Direktmarketing', fr: 'Marketing direct', es: 'Marketing directo' } },
  { name: 'Direct Sales', category: 'Business & Finance', translations: { de: 'Direktvertrieb', fr: 'Vente directe', es: 'Ventas directas' } },
  { name: 'Due Diligence', category: 'Business & Finance', translations: { de: 'Due Diligence', fr: 'Due diligence', es: 'Due diligence' } },
  { name: 'Dynamics 365', category: 'Business & Finance', translations: { de: 'Dynamics 365', fr: 'Dynamics 365', es: 'Dynamics 365' } },

  // --- Leadership & Management ---
  { name: 'Decision-Making', category: 'Leadership & Management', translations: { de: 'Entscheidungsfindung', fr: 'Prise de décision', es: 'Toma de decisiones' } },
  { name: 'Delegation', category: 'Leadership & Management', translations: { de: 'Delegation', fr: 'Délégation', es: 'Delegación' } },
  { name: 'Developing Others', category: 'Leadership & Management', translations: { de: 'Mitarbeiterentwicklung', fr: 'Développement des autres', es: 'Desarrollo de otros' } },
  { name: 'Dispute Resolution', category: 'Leadership & Management', translations: { de: 'Streitbeilegung', fr: 'Résolution des litiges', es: 'Resolución de disputas' } },
  { name: 'Diversity & Inclusion', category: 'Leadership & Management', translations: { de: 'Vielfalt & Inklusion', fr: 'Diversité et inclusion', es: 'Diversidad e inclusión' } },
  { name: 'Driving Results', category: 'Leadership & Management', translations: { de: 'Ergebnisorientierung', fr: 'Orientation résultats', es: 'Impulso de resultados' } },
  { name: 'Department Management', category: 'Leadership & Management', translations: { de: 'Abteilungsleitung', fr: 'Gestion de département', es: 'Gestión de departamentos' } },
  
  // --- Communication & Interpersonal ---
  { name: 'Debate', category: 'Communication & Interpersonal', translations: { de: 'Debatte', fr: 'Débat', es: 'Debate' } },
  { name: 'Demonstration', category: 'Communication & Interpersonal', translations: { de: 'Demonstration', fr: 'Démonstration', es: 'Demostración' } },
  { name: 'Diplomacy', category: 'Communication & Interpersonal', translations: { de: 'Diplomatie', fr: 'Diplomatie', es: 'Diplomacia' } },
  { name: 'Directing', category: 'Communication & Interpersonal', translations: { de: 'Regie', fr: 'Mise en scène', es: 'Dirección' } },
  { name: 'Documentation', category: 'Communication & Interpersonal', translations: { de: 'Dokumentation', fr: 'Documentation', es: 'Documentación' } },
  { name: 'Drafting', category: 'Communication & Interpersonal', translations: { de: 'Entwerfen', fr: 'Rédaction', es: 'Redacción' } },

  // --- Analytical & Technical ---
  { name: 'Data Entry', category: 'Analytical & Technical', translations: { de: 'Dateneingabe', fr: 'Saisie de données', es: 'Entrada de datos' } },
  { name: 'Data Mining', category: 'Analytical & Technical', translations: { de: 'Data-Mining', fr: 'Exploration de données', es: 'Minería de datos' } },
  { name: 'Data Modeling', category: 'Analytical & Technical', translations: { de: 'Datenmodellierung', fr: 'Modélisation de données', es: 'Modelado de datos' } },
  { name: 'Data Science', category: 'Analytical & Technical', translations: { de: 'Datenwissenschaft', fr: 'Science des données', es: 'Ciencia de datos' } },
  { name: 'Data Visualization', category: 'Analytical & Technical', translations: { de: 'Datenvisualisierung', fr: 'Visualisation de données', es: 'Visualización de datos' } },
  { name: 'Database Administration', category: 'Analytical & Technical', translations: { de: 'Datenbankadministration', fr: 'Administration de bases de données', es: 'Administración de bases de datos' } },
  { name: 'Debugging', category: 'Analytical & Technical', translations: { de: 'Debugging', fr: 'Débogage', es: 'Depuración' } },
  { name: 'Design Thinking', category: 'Analytical & Technical', translations: { de: 'Design Thinking', fr: 'Design thinking', es: 'Design thinking' } },
  { name: 'DevOps', category: 'Analytical & Technical', translations: { de: 'DevOps', fr: 'DevOps', es: 'DevOps' } },
  { name: 'Docker', category: 'Analytical & Technical', translations: { de: 'Docker', fr: 'Docker', es: 'Docker' } },
  
  // --- Personal Development & Mindset ---
  { name: 'Daily Planning', category: 'Personal Development & Mindset', translations: { de: 'Tagesplanung', fr: 'Planification quotidienne', es: 'Planificación diaria' } },
  { name: 'Decluttering', category: 'Personal Development & Mindset', translations: { de: 'Entrümpeln', fr: 'Désencombrement', es: 'Organizar y despejar' } },
  { name: 'Dedication', category: 'Personal Development & Mindset', translations: { de: 'Hingabe', fr: 'Dévouement', es: 'Dedicación' } },
  { name: 'Dependability', category: 'Personal Development & Mindset', translations: { de: 'Zuverlässigkeit', fr: 'Fiabilité', es: 'Confiabilidad' } },
  { name: 'Detachment', category: 'Personal Development & Mindset', translations: { de: 'Loslösung', fr: 'Détachement', es: 'Desapego' } },
  { name: 'Determination', category: 'Personal Development & Mindset', translations: { de: 'Entschlossenheit', fr: 'Détermination', es: 'Determinación' } },
  { name: 'Diligence', category: 'Personal Development & Mindset', translations: { de: 'Sorgfalt', fr: 'Diligence', es: 'Diligencia' } },
  { name: 'Discipline', category: 'Personal Development & Mindset', translations: { de: 'Disziplin', fr: 'Discipline', es: 'Disciplina' } },
  { name: 'Dream Analysis', category: 'Personal Development & Mindset', translations: { de: 'Traumanalyse', fr: 'Analyse des rêves', es: 'Análisis de sueños' } },

  // --- Wellness & Creative Arts ---
  { name: 'Dancing', category: 'Wellness & Creative Arts', translations: { de: 'Tanzen', fr: 'Danse', es: 'Baile' } },
  { name: 'Dietetics', category: 'Wellness & Creative Arts', translations: { de: 'Diätetik', fr: 'Diététique', es: 'Dietética' } },
  { name: 'Diving', category: 'Wellness & Creative Arts', translations: { de: 'Tauchen', fr: 'Plongée', es: 'Buceo' } },
  { name: 'DJing', category: 'Wellness & Creative Arts', translations: { de: 'DJing', fr: 'DJing', es: 'DJing' } },
  { name: 'Dog Training', category: 'Wellness & Creative Arts', translations: { de: 'Hundetraining', fr: 'Dressage de chiens', es: 'Entrenamiento de perros' } },
  { name: 'Dowsing', category: 'Wellness & Creative Arts', translations: { de: 'Wünschelrutengehen', fr: 'Radiesthésie', es: 'Radiestesia' } },
  { name: 'Drama', category: 'Wellness & Creative Arts', translations: { de: 'Schauspiel', fr: 'Théâtre', es: 'Drama' } },
  { name: 'Drawing', category: 'Wellness & Creative Arts', translations: { de: 'Zeichnen', fr: 'Dessin', es: 'Dibujo' } },
  { name: 'Dressmaking', category: 'Wellness & Creative Arts', translations: { de: 'Schneiderei', fr: 'Couture', es: 'Corte y confección' } },
  { name: 'Drumming', category: 'Wellness & Creative Arts', translations: { de: 'Schlagzeugspielen', fr: 'Batterie', es: 'Tocar la batería' } },
  { name: 'Dyeing', category: 'Wellness & Creative Arts', translations: { de: 'Färben', fr: 'Teinture', es: 'Teñido' } },
  { name: 'Design', category: 'Wellness & Creative Arts', translations: { de: 'Design', fr: 'Design', es: 'Diseño' } },
  { name: 'Digital Art', category: 'Wellness & Creative Arts', translations: { de: 'Digitale Kunst', fr: 'Art numérique', es: 'Arte digital' } },
  { name: 'Digital Photography', category: 'Wellness & Creative Arts', translations: { de: 'Digitale Fotografie', fr: 'Photographie numérique', es: 'Fotografía digital' } },
  { name: 'DIY Projects', category: 'Wellness & Creative Arts', translations: { de: 'Heimwerkerprojekte', fr: 'Projets de bricolage', es: 'Proyectos de bricolaje' } },
  { name: 'Dog Walking', category: 'Wellness & Creative Arts', translations: { de: 'Hundeausführen', fr: 'Promenade de chiens', es: 'Paseo de perros' } },
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