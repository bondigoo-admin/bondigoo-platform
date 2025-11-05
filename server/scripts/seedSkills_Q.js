// scripts/seedSkills_Q.js

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
// A list of 60 general and specific coaching-related skills starting with 'Q'.
const dataToUpload = [
  // --- Business & Finance ---
  { name: 'Qualitative Research', category: 'Business & Finance', translations: { de: 'Qualitative Forschung', fr: 'Recherche qualitative', es: 'Investigación cualitativa' } },
  { name: 'Quality Assurance', category: 'Business & Finance', translations: { de: 'Qualitätssicherung', fr: 'Assurance qualité', es: 'Aseguramiento de la calidad' } },
  { name: 'Quality Auditing', category: 'Business & Finance', translations: { de: 'Qualitätsaudit', fr: 'Audit qualité', es: 'Auditoría de calidad' } },
  { name: 'Quality Control', category: 'Business & Finance', translations: { de: 'Qualitätskontrolle', fr: 'Contrôle qualité', es: 'Control de calidad' } },
  { name: 'Quality Management', category: 'Business & Finance', translations: { de: 'Qualitätsmanagement', fr: 'Gestion de la qualité', es: 'Gestión de la calidad' } },
  { name: 'Quality Management Systems (QMS)', category: 'Business & Finance', translations: { de: 'Qualitätsmanagementsysteme (QMS)', fr: 'Systèmes de management de la qualité (SMQ)', es: 'Sistemas de gestión de calidad (SGC)' } },
  { name: 'Quantitative Analysis', category: 'Business & Finance', translations: { de: 'Quantitative Analyse', fr: 'Analyse quantitative', es: 'Análisis cuantitativo' } },
  { name: 'Quantitative Finance', category: 'Business & Finance', translations: { de: 'Quantitative Finanzwirtschaft', fr: 'Finance quantitative', es: 'Finanzas cuantitativas' } },
  { name: 'Quantitative Risk Analysis', category: 'Business & Finance', translations: { de: 'Quantitative Risikoanalyse', fr: 'Analyse quantitative des risques', es: 'Análisis cuantitativo de riesgos' } },
  { name: 'Quarterly Business Reviews (QBRs)', category: 'Business & Finance', translations: { de: 'Vierteljährliche Geschäftsüberprüfungen (QBRs)', fr: 'Revues d\'affaires trimestrielles (QBR)', es: 'Revisiones trimestrales de negocio (QBR)' } },
  { name: 'Quarterly Forecasting', category: 'Business & Finance', translations: { de: 'Quartalsweise Prognose', fr: 'Prévisions trimestrielles', es: 'Previsiones trimestrales' } },
  { name: 'Quarterly Planning', category: 'Business & Finance', translations: { de: 'Quartalsplanung', fr: 'Planification trimestrielle', es: 'Planificación trimestral' } },
  { name: 'Query Letter Writing', category: 'Business & Finance', translations: { de: 'Verfassen von Anfragebriefen', fr: 'Rédaction de lettres de requête', es: 'Redacción de cartas de consulta' } },
  { name: 'QuickBooks', category: 'Business & Finance', translations: { de: 'QuickBooks', fr: 'QuickBooks', es: 'QuickBooks' } },
  { name: 'Quotation Generation', category: 'Business & Finance', translations: { de: 'Angebotserstellung', fr: 'Génération de devis', es: 'Generación de cotizaciones' } },

  // --- Leadership & Management ---
  { name: 'Questioning the Status Quo', category: 'Leadership & Management', translations: { de: 'Den Status Quo hinterfragen', fr: 'Remettre en question le statu quo', es: 'Cuestionar el statu quo' } },
  { name: 'Quick Decision Making', category: 'Leadership & Management', translations: { de: 'Schnelle Entscheidungsfindung', fr: 'Prise de décision rapide', es: 'Toma de decisiones rápida' } },
  { name: 'Quiet Leadership', category: 'Leadership & Management', translations: { de: 'Stille Führung', fr: 'Leadership tranquille', es: 'Liderazgo silencioso' } },
  { name: 'Quota Setting', category: 'Leadership & Management', translations: { de: 'Quotensetzung', fr: 'Fixation de quotas', es: 'Establecimiento de cuotas' } },
  { name: 'Quality Improvement Leadership', category: 'Leadership & Management', translations: { de: 'Führung bei Qualitätsverbesserungen', fr: 'Leadership en amélioration de la qualité', es: 'Liderazgo en la mejora de la calidad' } },
  
  // --- Communication & Interpersonal ---
  { name: 'Question and Answer (Q&A) Session Moderation', category: 'Communication & Interpersonal', translations: { de: 'Moderation von Frage-Antwort-Runden', fr: 'Modération de sessions de questions-réponses (Q&R)', es: 'Moderación de sesiones de preguntas y respuestas (P&R)' } },
  { name: 'Question Framing', category: 'Communication & Interpersonal', translations: { de: 'Fragengestaltung', fr: 'Cadrage des questions', es: 'Formulación de preguntas' } },
  { name: 'Questioning Skills', category: 'Communication & Interpersonal', translations: { de: 'Fragetechniken', fr: 'Compétences en questionnement', es: 'Habilidades para preguntar' } },
  { name: 'Quick Thinking', category: 'Communication & Interpersonal', translations: { de: 'Schnelles Denken', fr: 'Réflexion rapide', es: 'Pensamiento rápido' } },
  { name: 'Quick-wittedness', category: 'Communication & Interpersonal', translations: { de: 'Schlagfertigkeit', fr: 'Vivacité d\'esprit', es: 'Agudeza mental' } },
  
  // --- Analytical & Technical ---
  { name: 'Qlik Sense', category: 'Analytical & Technical', translations: { de: 'Qlik Sense', fr: 'Qlik Sense', es: 'Qlik Sense' } },
  { name: 'Qualtrics', category: 'Analytical & Technical', translations: { de: 'Qualtrics', fr: 'Qualtrics', es: 'Qualtrics' } },
  { name: 'Quantum Computing', category: 'Analytical & Technical', translations: { de: 'Quantencomputing', fr: 'Informatique quantique', es: 'Computación cuántica' } },
  { name: 'Querying Databases', category: 'Analytical & Technical', translations: { de: 'Datenbankabfragen', fr: 'Interrogation de bases de données', es: 'Consulta de bases de datos' } },
  { name: 'Query Optimization', category: 'Analytical & Technical', translations: { de: 'Abfrageoptimierung', fr: 'Optimisation de requêtes', es: 'Optimización de consultas' } },
  
  // --- Personal Development & Mindset ---
  { name: 'Quest for Excellence', category: 'Personal Development & Mindset', translations: { de: 'Streben nach Exzellenz', fr: 'Quête d\'excellence', es: 'Búsqueda de la excelencia' } },
  { name: 'Quest for Knowledge', category: 'Personal Development & Mindset', translations: { de: 'Wissensdurst', fr: 'Quête de connaissances', es: 'Búsqueda de conocimiento' } },
  { name: 'Quest for Meaning', category: 'Personal Development & Mindset', translations: { de: 'Sinnsuche', fr: 'Quête de sens', es: 'Búsqueda de sentido' } },
  { name: 'Questioning Assumptions', category: 'Personal Development & Mindset', translations: { de: 'Annahmen hinterfragen', fr: 'Questionnement des hypothèses', es: 'Cuestionamiento de supuestos' } },
  { name: 'Questioning Limiting Beliefs', category: 'Personal Development & Mindset', translations: { de: 'Limitierende Glaubenssätze hinterfragen', fr: 'Remettre en question les croyances limitantes', es: 'Cuestionar creencias limitantes' } },
  { name: 'Quiet Confidence', category: 'Personal Development & Mindset', translations: { de: 'Stilles Selbstvertrauen', fr: 'Confiance tranquille', es: 'Confianza serena' } },
  { name: 'Quiet Contemplation', category: 'Personal Development & Mindset', translations: { de: 'Stille Betrachtung', fr: 'Contemplation silencieuse', es: 'Contemplación silenciosa' } },
  { name: 'Quiet Reflection', category: 'Personal Development & Mindset', translations: { de: 'Stille Reflexion', fr: 'Réflexion tranquille', es: 'Reflexión serena' } },
  { name: 'Quietude', category: 'Personal Development & Mindset', translations: { de: 'Ruhe', fr: 'Quiétude', es: 'Quietud' } },
  { name: 'Quality of Life Enhancement', category: 'Personal Development & Mindset', translations: { de: 'Verbesserung der Lebensqualität', fr: 'Amélioration de la qualité de vie', es: 'Mejora de la calidad de vida' } },
  { name: 'Quality (as a value)', category: 'Personal Development & Mindset', translations: { de: 'Qualität (als Wert)', fr: 'Qualité (en tant que valeur)', es: 'Calidad (como valor)' } },
  { name: 'Quest Planning', category: 'Personal Development & Mindset', translations: { de: 'Quest-Planung', fr: 'Planification de quête', es: 'Planificación de misiones personales' } },
  
  // --- Wellness & Creative Arts ---
  { name: 'Qigong', category: 'Wellness & Creative Arts', translations: { de: 'Qigong', fr: 'Qi Gong', es: 'Qigong' } },
  { name: 'Qi Gong Instruction', category: 'Wellness & Creative Arts', translations: { de: 'Qigong-Anleitung', fr: 'Instruction de Qi Gong', es: 'Instrucción de Qigong' } },
  { name: 'Quantum Healing', category: 'Wellness & Creative Arts', translations: { de: 'Quantenheilung', fr: 'Guérison quantique', es: 'Sanación cuántica' } },
  { name: 'Quantum Physics (as a study)', category: 'Wellness & Creative Arts', translations: { de: 'Quantenphysik (als Studie)', fr: 'Physique quantique (comme étude)', es: 'Física cuántica (como estudio)' } },
  { name: 'Quilling', category: 'Wellness & Creative Arts', translations: { de: 'Quilling', fr: 'Quilling', es: 'Filigrana de papel' } },
  { name: 'Quilting', category: 'Wellness & Creative Arts', translations: { de: 'Quilten', fr: 'Matelassage', es: 'Acolchado' } },
  { name: 'Quilt Design', category: 'Wellness & Creative Arts', translations: { de: 'Quilt-Design', fr: 'Conception de quilts', es: 'Diseño de edredones' } },
  { name: 'Quinoa Cooking', category: 'Wellness & Creative Arts', translations: { de: 'Quinoa kochen', fr: 'Cuisine du quinoa', es: 'Cocina con quinua' } },
  { name: 'Quick Sketching', category: 'Wellness & Creative Arts', translations: { de: 'Schnelles Skizzieren', fr: 'Croquis rapide', es: 'Bocetos rápidos' } },
  { name: 'Quivertree Photography', category: 'Wellness & Creative Arts', translations: { de: 'Köcherbaum-Fotografie', fr: 'Photographie de kokerboom', es: 'Fotografía de árboles carcaj' } },
  { name: 'Quadrille (Dance)', category: 'Wellness & Creative Arts', translations: { de: 'Quadrille (Tanz)', fr: 'Quadrille (Danse)', es: 'Cuadrilla (Baile)' } },
  { name: 'Quad Biking', category: 'Wellness & Creative Arts', translations: { de: 'Quad fahren', fr: 'Quad', es: 'Paseo en cuatrimoto' } },
  { name: 'Quarry Exploration', category: 'Wellness & Creative Arts', translations: { de: 'Steinbrucherkundung', fr: 'Exploration de carrière', es: 'Exploración de canteras' } },
  { name: 'Quoits (Game)', category: 'Wellness & Creative Arts', translations: { de: 'Quoits (Spiel)', fr: 'Jeu de palets', es: 'Tejo (Juego)' } },
  { name: 'Quantity Surveying', category: 'Business & Finance', translations: { de: 'Mengenermittlung', fr: 'Métré', es: 'Medición de obras' } },
  { name: 'Quorum Sensing (Biology)', category: 'Analytical & Technical', translations: { de: 'Quorum Sensing (Biologie)', fr: 'Quorum sensing (Biologie)', es: 'Percepción de quórum (Biología)' } },
  { name: 'QuarkXPress', category: 'Analytical & Technical', translations: { de: 'QuarkXPress', fr: 'QuarkXPress', es: 'QuarkXPress' } },
  { name: 'Qigong Massage', category: 'Wellness & Creative Arts', translations: { de: 'Qigong-Massage', fr: 'Massage Qi Gong', es: 'Masaje Qigong' } },
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