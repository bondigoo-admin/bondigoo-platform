// scripts/seedSkills_T.js

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
// A list of 60 general and specific coaching-related skills starting with 'T'.
const dataToUpload = [
  // --- Leadership & Management ---
  { name: 'Talent Acquisition', category: 'Leadership & Management', translations: { de: 'Talentakquise', fr: 'Acquisition de talents', es: 'Adquisición de talento' } },
  { name: 'Talent Management', category: 'Leadership & Management', translations: { de: 'Talentmanagement', fr: 'Gestion des talents', es: 'Gestión del talento' } },
  { name: 'Task Management', category: 'Leadership & Management', translations: { de: 'Aufgabenmanagement', fr: 'Gestion des tâches', es: 'Gestión de tareas' } },
  { name: 'Team Building', category: 'Leadership & Management', translations: { de: 'Teambildung', fr: 'Consolidation d\'équipe', es: 'Creación de equipos' } },
  { name: 'Team Leadership', category: 'Leadership & Management', translations: { de: 'Teamführung', fr: 'Leadership d\'équipe', es: 'Liderazgo de equipos' } },
  { name: 'Teamwork', category: 'Leadership & Management', translations: { de: 'Teamarbeit', fr: 'Travail d\'équipe', es: 'Trabajo en equipo' } },
  { name: 'Time Management', category: 'Leadership & Management', translations: { de: 'Zeitmanagement', fr: 'Gestion du temps', es: 'Gestión del tiempo' } },
  { name: 'Total Quality Management (TQM)', category: 'Leadership & Management', translations: { de: 'Umfassendes Qualitätsmanagement (TQM)', fr: 'Gestion de la qualité totale (TQM)', es: 'Gestión de la calidad total (TQM)' } },
  { name: 'Training & Development', category: 'Leadership & Management', translations: { de: 'Schulung und Entwicklung', fr: 'Formation et développement', es: 'Formación y desarrollo' } },
  { name: 'Transformational Leadership', category: 'Leadership & Management', translations: { de: 'Transformationale Führung', fr: 'Leadership transformationnel', es: 'Liderazgo transformacional' } },
  { name: 'Troubleshooting', category: 'Leadership & Management', translations: { de: 'Fehlerbehebung', fr: 'Dépannage', es: 'Solución de problemas' } },

  // --- Business & Finance ---
  { name: 'Tableau', category: 'Business & Finance', translations: { de: 'Tableau', fr: 'Tableau', es: 'Tableau' } },
  { name: 'Tax Law', category: 'Business & Finance', translations: { de: 'Steuerrecht', fr: 'Droit fiscal', es: 'Derecho fiscal' } },
  { name: 'Tax Preparation', category: 'Business & Finance', translations: { de: 'Steuererklärung', fr: 'Préparation des déclarations de revenus', es: 'Preparación de impuestos' } },
  { name: 'Technical Recruiting', category: 'Business & Finance', translations: { de: 'Technisches Recruiting', fr: 'Recrutement technique', es: 'Reclutamiento técnico' } },
  { name: 'Territory Management', category: 'Business & Finance', translations: { de: 'Gebietsmanagement', fr: 'Gestion de territoire', es: 'Gestión de territorio' } },
  { name: 'Trading', category: 'Business & Finance', translations: { de: 'Handel', fr: 'Trading', es: 'Trading' } },
  { name: 'Transaction Coordination', category: 'Business & Finance', translations: { de: 'Transaktionskoordination', fr: 'Coordination des transactions', es: 'Coordinación de transacciones' } },
  { name: 'Treasury Management', category: 'Business & Finance', translations: { de: 'Treasury-Management', fr: 'Gestion de trésorerie', es: 'Gestión de tesorería' } },
  { name: 'Trend Analysis', category: 'Business & Finance', translations: { de: 'Trendanalyse', fr: 'Analyse des tendances', es: 'Análisis de tendencias' } },
  
  // --- Communication & Interpersonal ---
  { name: 'Teaching', category: 'Communication & Interpersonal', translations: { de: 'Lehren', fr: 'Enseignement', es: 'Enseñanza' } },
  { name: 'Telephone Etiquette', category: 'Communication & Interpersonal', translations: { de: 'Telefonknigge', fr: 'Étiquette téléphonique', es: 'Etiqueta telefónica' } },
  { name: 'Telling Stories', category: 'Communication & Interpersonal', translations: { de: 'Geschichten erzählen', fr: 'Raconter des histoires', es: 'Contar historias' } },
  { name: 'Tone of Voice', category: 'Communication & Interpersonal', translations: { de: 'Tonfall', fr: 'Ton de la voix', es: 'Tono de voz' } },
  { name: 'Translation', category: 'Communication & Interpersonal', translations: { de: 'Übersetzung', fr: 'Traduction', es: 'Traducción' } },
  { name: 'Transparency', category: 'Communication & Interpersonal', translations: { de: 'Transparenz', fr: 'Transparence', es: 'Transparencia' } },

  // --- Analytical & Technical ---
  { name: 'Technical Support', category: 'Analytical & Technical', translations: { de: 'Technischer Support', fr: 'Support technique', es: 'Soporte técnico' } },
  { name: 'Technical Writing', category: 'Analytical & Technical', translations: { de: 'Technische Redaktion', fr: 'Rédaction technique', es: 'Redacción técnica' } },
  { name: 'TensorFlow', category: 'Analytical & Technical', translations: { de: 'TensorFlow', fr: 'TensorFlow', es: 'TensorFlow' } },
  { name: 'Terraform', category: 'Analytical & Technical', translations: { de: 'Terraform', fr: 'Terraform', es: 'Terraform' } },
  { name: 'Test Automation', category: 'Analytical & Technical', translations: { de: 'Testautomatisierung', fr: 'Automatisation des tests', es: 'Automatización de pruebas' } },
  { name: 'Test-Driven Development (TDD)', category: 'Analytical & Technical', translations: { de: 'Testgetriebene Entwicklung (TDD)', fr: 'Développement piloté par les tests (TDD)', es: 'Desarrollo guiado por pruebas (TDD)' } },
  { name: 'TypeScript', category: 'Analytical & Technical', translations: { de: 'TypeScript', fr: 'TypeScript', es: 'TypeScript' } },
  { name: 'Typography', category: 'Analytical & Technical', translations: { de: 'Typografie', fr: 'Typographie', es: 'Tipografía' } },

  // --- Personal Development & Mindset ---
  { name: 'Tactfulness', category: 'Personal Development & Mindset', translations: { de: 'Taktgefühl', fr: 'Tact', es: 'Tacto' } },
  { name: 'Taking Initiative', category: 'Personal Development & Mindset', translations: { de: 'Eigeninitiative ergreifen', fr: 'Prise d\'initiative', es: 'Tomar la iniciativa' } },
  { name: 'Thought Leadership', category: 'Personal Development & Mindset', translations: { de: 'Vordenkerrolle', fr: 'Leadership éclairé', es: 'Liderazgo de pensamiento' } },
  { name: 'Time Blocking', category: 'Personal Development & Mindset', translations: { de: 'Zeitblockierung', fr: 'Blocage de temps', es: 'Bloqueo de tiempo' } },
  { name: 'Tolerance', category: 'Personal Development & Mindset', translations: { de: 'Toleranz', fr: 'Tolérance', es: 'Tolerancia' } },
  { name: 'Transactional Analysis', category: 'Personal Development & Mindset', translations: { de: 'Transaktionsanalyse', fr: 'Analyse transactionnelle', es: 'Análisis transaccional' } },
  { name: 'Transcendence', category: 'Personal Development & Mindset', translations: { de: 'Transzendenz', fr: 'Transcendance', es: 'Trascendencia' } },
  { name: 'Trust Building', category: 'Personal Development & Mindset', translations: { de: 'Vertrauensaufbau', fr: 'Établissement de la confiance', es: 'Construcción de confianza' } },
  { name: 'Truthfulness', category: 'Personal Development & Mindset', translations: { de: 'Wahrhaftigkeit', fr: 'Véracité', es: 'Veracidad' } },
  
  // --- Wellness & Creative Arts ---
  { name: 'Tai Chi', category: 'Wellness & Creative Arts', translations: { de: 'Tai-Chi', fr: 'Tai-chi', es: 'Tai Chi' } },
  { name: 'Tango', category: 'Wellness & Creative Arts', translations: { de: 'Tango', fr: 'Tango', es: 'Tango' } },
  { name: 'Tarot Reading', category: 'Wellness & Creative Arts', translations: { de: 'Tarotkartenlegen', fr: 'Lecture du tarot', es: 'Lectura del tarot' } },
  { name: 'Tattoo Design', category: 'Wellness & Creative Arts', translations: { de: 'Tattoo-Design', fr: 'Conception de tatouages', es: 'Diseño de tatuajes' } },
  { name: 'Tea Ceremony', category: 'Wellness & Creative Arts', translations: { de: 'Teezeremonie', fr: 'Cérémonie du thé', es: 'Ceremonia del té' } },
  { name: 'Tennis', category: 'Wellness & Creative Arts', translations: { de: 'Tennis', fr: 'Tennis', es: 'Tenis' } },
  { name: 'Textile Art', category: 'Wellness & Creative Arts', translations: { de: 'Textilkunst', fr: 'Art textile', es: 'Arte textil' } },
  { name: 'Theater', category: 'Wellness & Creative Arts', translations: { de: 'Theater', fr: 'Théâtre', es: 'Teatro' } },
  { name: 'Therapeutic Art', category: 'Wellness & Creative Arts', translations: { de: 'Therapeutische Kunst', fr: 'Art thérapeutique', es: 'Arte terapéutico' } },
  { name: 'Topiary', category: 'Wellness & Creative Arts', translations: { de: 'Formschnitt', fr: 'Art topiaire', es: 'Arte topiario' } },
  { name: 'Traditional Chinese Medicine (TCM)', category: 'Wellness & Creative Arts', translations: { de: 'Traditionelle Chinesische Medizin (TCM)', fr: 'Médecine traditionnelle chinoise (MTC)', es: 'Medicina tradicional china (MTC)' } },
  { name: 'Travel Photography', category: 'Wellness & Creative Arts', translations: { de: 'Reisefotografie', fr: 'Photographie de voyage', es: 'Fotografía de viajes' } },
  { name: 'Travel Planning', category: 'Wellness & Creative Arts', translations: { de: 'Reiseplanung', fr: 'Planification de voyage', es: 'Planificación de viajes' } },
  { name: 'Trekking', category: 'Wellness & Creative Arts', translations: { de: 'Trekking', fr: 'Trekking', es: 'Senderismo' } },
  { name: 'Thai Massage', category: 'Wellness & Creative Arts', translations: { de: 'Thaimassage', fr: 'Massage thaïlandais', es: 'Masaje tailandés' } },
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

seedSkills();