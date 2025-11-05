// scripts/seedSkills_R.js

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
// A list of 60 general and specific coaching-related skills starting with 'R'.
const dataToUpload = [
  // --- Leadership & Management ---
  { name: 'Recruiting', category: 'Leadership & Management', translations: { de: 'Personalbeschaffung', fr: 'Recrutement', es: 'Reclutamiento' } },
  { name: 'Relationship Building', category: 'Leadership & Management', translations: { de: 'Beziehungsaufbau', fr: 'Établissement de relations', es: 'Construcción de relaciones' } },
  { name: 'Remote Team Management', category: 'Leadership & Management', translations: { de: 'Management von Remote-Teams', fr: 'Gestion d\'équipes à distance', es: 'Gestión de equipos remotos' } },
  { name: 'Reporting', category: 'Leadership & Management', translations: { de: 'Berichterstattung', fr: 'Rapports', es: 'Elaboración de informes' } },
  { name: 'Resource Allocation', category: 'Leadership & Management', translations: { de: 'Ressourcenzuweisung', fr: 'Allocation de ressources', es: 'Asignación de recursos' } },
  { name: 'Resource Management', category: 'Leadership & Management', translations: { de: 'Ressourcenmanagement', fr: 'Gestion des ressources', es: 'Gestión de recursos' } },
  { name: 'Restructuring', category: 'Leadership & Management', translations: { de: 'Umstrukturierung', fr: 'Restructuration', es: 'Reestructuración' } },
  { name: 'Retention Strategies', category: 'Leadership & Management', translations: { de: 'Mitarbeiterbindungsstrategien', fr: 'Stratégies de rétention', es: 'Estrategias de retención' } },
  { name: 'Risk Management', category: 'Leadership & Management', translations: { de: 'Risikomanagement', fr: 'Gestion des risques', es: 'Gestión de riesgos' } },
  { name: 'Resolving Conflicts', category: 'Leadership & Management', translations: { de: 'Konfliktlösung', fr: 'Résolution de conflits', es: 'Resolución de conflictos' } },

  // --- Business & Finance ---
  { name: 'Real Estate', category: 'Business & Finance', translations: { de: 'Immobilien', fr: 'Immobilier', es: 'Bienes raíces' } },
  { name: 'Records Management', category: 'Business & Finance', translations: { de: 'Aktenverwaltung', fr: 'Gestion de documents', es: 'Gestión de registros' } },
  { name: 'Regulatory Affairs', category: 'Business & Finance', translations: { de: 'Regulierungsangelegenheiten', fr: 'Affaires réglementaires', es: 'Asuntos regulatorios' } },
  { name: 'Regulatory Compliance', category: 'Business & Finance', translations: { de: 'Einhaltung von Vorschriften', fr: 'Conformité réglementaire', es: 'Cumplimiento normativo' } },
  { name: 'Requirements Gathering', category: 'Business & Finance', translations: { de: 'Anforderungserhebung', fr: 'Collecte des exigences', es: 'Recopilación de requisitos' } },
  { name: 'Research', category: 'Business & Finance', translations: { de: 'Forschung', fr: 'Recherche', es: 'Investigación' } },
  { name: 'Retail', category: 'Business & Finance', translations: { de: 'Einzelhandel', fr: 'Vente au détail', es: 'Venta al por menor' } },
  { name: 'Revenue Analysis', category: 'Business & Finance', translations: { de: 'Umsatzanalyse', fr: 'Analyse des revenus', es: 'Análisis de ingresos' } },
  { name: 'Revenue Growth', category: 'Business & Finance', translations: { de: 'Umsatzwachstum', fr: 'Croissance des revenus', es: 'Crecimiento de ingresos' } },
  { name: 'Risk Analysis', category: 'Business & Finance', translations: { de: 'Risikoanalyse', fr: 'Analyse des risques', es: 'Análisis de riesgos' } },
  { name: 'ROI Analysis', category: 'Business & Finance', translations: { de: 'ROI-Analyse', fr: 'Analyse du ROI', es: 'Análisis del ROI' } },
  
  // --- Communication & Interpersonal ---
  { name: 'Rapport Building', category: 'Communication & Interpersonal', translations: { de: 'Rapport aufbauen', fr: 'Création de rapports', es: 'Creación de compenetración' } },
  { name: 'Reading Body Language', category: 'Communication & Interpersonal', translations: { de: 'Körpersprache lesen', fr: 'Lecture du langage corporel', es: 'Leer el lenguaje corporal' } },
  { name: 'Receiving Feedback', category: 'Communication & Interpersonal', translations: { de: 'Feedback erhalten', fr: 'Recevoir du feedback', es: 'Recibir retroalimentación' } },
  { name: 'Report Writing', category: 'Communication & Interpersonal', translations: { de: 'Berichte schreiben', fr: 'Rédaction de rapports', es: 'Redacción de informes' } },
  { name: 'Respect', category: 'Communication & Interpersonal', translations: { de: 'Respekt', fr: 'Respect', es: 'Respeto' } },
  { name: 'Responsiveness', category: 'Communication & Interpersonal', translations: { de: 'Reaktionsfähigkeit', fr: 'Réactivité', es: 'Capacidad de respuesta' } },
  { name: 'Rhetoric', category: 'Communication & Interpersonal', translations: { de: 'Rhetorik', fr: 'Rhétorique', es: 'Retórica' } },

  // --- Analytical & Technical ---
  { name: 'R (Programming Language)', category: 'Analytical & Technical', translations: { de: 'R (Programmiersprache)', fr: 'R (Langage de programmation)', es: 'R (Lenguaje de programación)' } },
  { name: 'React.js', category: 'Analytical & Technical', translations: { de: 'React.js', fr: 'React.js', es: 'React.js' } },
  { name: 'Redux.js', category: 'Analytical & Technical', translations: { de: 'Redux.js', fr: 'Redux.js', es: 'Redux.js' } },
  { name: 'Requirements Analysis', category: 'Analytical & Technical', translations: { de: 'Anforderungsanalyse', fr: 'Analyse des exigences', es: 'Análisis de requerimientos' } },
  { name: 'Responsive Design', category: 'Analytical & Technical', translations: { de: 'Responsives Design', fr: 'Conception réactive', es: 'Diseño responsivo' } },
  { name: 'REST APIs', category: 'Analytical & Technical', translations: { de: 'REST-APIs', fr: 'API REST', es: 'APIs REST' } },
  { name: 'Reverse Engineering', category: 'Analytical & Technical', translations: { de: 'Reverse Engineering', fr: 'Ingénierie inverse', es: 'Ingeniería inversa' } },
  { name: 'Robotics', category: 'Analytical & Technical', translations: { de: 'Robotik', fr: 'Robotique', es: 'Robótica' } },
  { name: 'Ruby', category: 'Analytical & Technical', translations: { de: 'Ruby', fr: 'Ruby', es: 'Ruby' } },
  { name: 'Ruby on Rails', category: 'Analytical & Technical', translations: { de: 'Ruby on Rails', fr: 'Ruby on Rails', es: 'Ruby on Rails' } },
  { name: 'Rust (Programming Language)', category: 'Analytical & Technical', translations: { de: 'Rust (Programmiersprache)', fr: 'Rust (Langage de programmation)', es: 'Rust (Lenguaje de programación)' } },

  // --- Personal Development & Mindset ---
  { name: 'Radical Candor', category: 'Personal Development & Mindset', translations: { de: 'Radikale Offenheit', fr: 'Franchise radicale', es: 'Franqueza radical' } },
  { name: 'Radical Forgiveness', category: 'Personal Development & Mindset', translations: { de: 'Radikale Vergebung', fr: 'Pardon radical', es: 'Perdón radical' } },
  { name: 'Rational Thinking', category: 'Personal Development & Mindset', translations: { de: 'Rationales Denken', fr: 'Pensée rationnelle', es: 'Pensamiento racional' } },
  { name: 'Reflection', category: 'Personal Development & Mindset', translations: { de: 'Reflexion', fr: 'Réflexion', es: 'Reflexión' } },
  { name: 'Reframing', category: 'Personal Development & Mindset', translations: { de: 'Umdeutung', fr: 'Recadrage', es: 'Reencuadre' } },
  { name: 'Relationship Coaching', category: 'Personal Development & Mindset', translations: { de: 'Beziehungscoaching', fr: 'Coaching relationnel', es: 'Coaching de relaciones' } },
  { name: 'Resilience', category: 'Personal Development & Mindset', translations: { de: 'Resilienz', fr: 'Résilience', es: 'Resiliencia' } },
  { name: 'Resourcefulness', category: 'Personal Development & Mindset', translations: { de: 'Einfallsreichtum', fr: 'Ingéniosité', es: 'Ingenio' } },
  { name: 'Responsibility', category: 'Personal Development & Mindset', translations: { de: 'Verantwortung', fr: 'Responsabilité', es: 'Responsabilidad' } },
  { name: 'Ritual Creation', category: 'Personal Development & Mindset', translations: { de: 'Ritualgestaltung', fr: 'Création de rituels', es: 'Creación de rituales' } },

  // --- Wellness & Creative Arts ---
  { name: 'Rafting', category: 'Wellness & Creative Arts', translations: { de: 'Rafting', fr: 'Rafting', es: 'Rafting' } },
  { name: 'Reading', category: 'Wellness & Creative Arts', translations: { de: 'Lesen', fr: 'Lecture', es: 'Lectura' } },
  { name: 'Reflexology', category: 'Wellness & Creative Arts', translations: { de: 'Reflexzonenmassage', fr: 'Réflexologie', es: 'Reflexología' } },
  { name: 'Reiki', category: 'Wellness & Creative Arts', translations: { de: 'Reiki', fr: 'Reiki', es: 'Reiki' } },
  { name: 'Relaxation Techniques', category: 'Wellness & Creative Arts', translations: { de: 'Entspannungstechniken', fr: 'Techniques de relaxation', es: 'Técnicas de relajación' } },
  { name: 'Restorative Yoga', category: 'Wellness & Creative Arts', translations: { de: 'Restoratives Yoga', fr: 'Yoga réparateur', es: 'Yoga restaurativo' } },
  { name: 'Rock Climbing', category: 'Wellness & Creative Arts', translations: { de: 'Klettern', fr: 'Escalade', es: 'Escalada en roca' } },
  { name: 'Roller Skating', category: 'Wellness & Creative Arts', translations: { de: 'Rollschuhlaufen', fr: 'Patinage à roulettes', es: 'Patinaje sobre ruedas' } },
  { name: 'Rowing', category: 'Wellness & Creative Arts', translations: { de: 'Rudern', fr: 'Aviron', es: 'Remo' } },
  { name: 'Running', category: 'Wellness & Creative Arts', translations: { de: 'Laufen', fr: 'Course à pied', es: 'Correr' } },
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