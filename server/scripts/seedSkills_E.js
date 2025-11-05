// scripts/seedSkills_E.js

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
// A list of 60 general and specific coaching-related skills starting with 'E'.
const dataToUpload = [
  // --- Business & Finance ---
  { name: 'E-commerce', category: 'Business & Finance', translations: { de: 'E-Commerce', fr: 'E-commerce', es: 'Comercio electrónico' } },
  { name: 'Economics', category: 'Business & Finance', translations: { de: 'Wirtschaftswissenschaften', fr: 'Économie', es: 'Economía' } },
  { name: 'Entrepreneurship', category: 'Business & Finance', translations: { de: 'Unternehmertum', fr: 'Entrepreneuriat', es: 'Emprendimiento' } },
  { name: 'Event Planning', category: 'Business & Finance', translations: { de: 'Veranstaltungsplanung', fr: 'Planification d\'événements', es: 'Planificación de eventos' } },
  { name: 'Executive Management', category: 'Business & Finance', translations: { de: 'Geschäftsführung', fr: 'Direction générale', es: 'Dirección ejecutiva' } },
  { name: 'Expense Reports', category: 'Business & Finance', translations: { de: 'Spesenabrechnungen', fr: 'Notes de frais', es: 'Informes de gastos' } },
  { name: 'Export', category: 'Business & Finance', translations: { de: 'Export', fr: 'Exportation', es: 'Exportación' } },
  { name: 'Enterprise Resource Planning (ERP)', category: 'Business & Finance', translations: { de: 'Enterprise Resource Planning (ERP)', fr: 'Progiciel de gestion intégré (ERP)', es: 'Planificación de recursos empresariales (ERP)' } },
  { name: 'Event Marketing', category: 'Business & Finance', translations: { de: 'Event-Marketing', fr: 'Marketing événementiel', es: 'Marketing de eventos' } },
  { name: 'Email Marketing', category: 'Business & Finance', translations: { de: 'E-Mail-Marketing', fr: 'Marketing par e-mail', es: 'Email marketing' } },

  // --- Leadership & Management ---
  { name: 'Employee Engagement', category: 'Leadership & Management', translations: { de: 'Mitarbeiterengagement', fr: 'Engagement des employés', es: 'Compromiso de los empleados' } },
  { name: 'Employee Relations', category: 'Leadership & Management', translations: { de: 'Mitarbeiterbeziehungen', fr: 'Relations avec les employés', es: 'Relaciones laborales' } },
  { name: 'Empowerment', category: 'Leadership & Management', translations: { de: 'Ermächtigung', fr: 'Autonomisation', es: 'Empoderamiento' } },
  { name: 'Executive Coaching', category: 'Leadership & Management', translations: { de: 'Führungskräfte-Coaching', fr: 'Coaching de dirigeants', es: 'Coaching ejecutivo' } },
  { name: 'Executive Presence', category: 'Leadership & Management', translations: { de: 'Souveränes Auftreten', fr: 'Présence exécutive', es: 'Presencia ejecutiva' } },
  { name: 'Event Management', category: 'Leadership & Management', translations: { de: 'Veranstaltungsmanagement', fr: 'Gestion d\'événements', es: 'Gestión de eventos' } },
  { name: 'Evaluation', category: 'Leadership & Management', translations: { de: 'Evaluierung', fr: 'Évaluation', es: 'Evaluación' } },
  { name: 'Emergency Management', category: 'Leadership & Management', translations: { de: 'Notfallmanagement', fr: 'Gestion des urgences', es: 'Gestión de emergencias' } },
  
  // --- Communication & Interpersonal ---
  { name: 'Editing', category: 'Communication & Interpersonal', translations: { de: 'Redaktion', fr: 'Rédaction', es: 'Edición' } },
  { name: 'Eloquence', category: 'Communication & Interpersonal', translations: { de: 'Beredsamkeit', fr: 'Éloquence', es: 'Elocuencia' } },
  { name: 'Empathy', category: 'Communication & Interpersonal', translations: { de: 'Empathie', fr: 'Empathie', es: 'Empatía' } },
  { name: 'Encouragement', category: 'Communication & Interpersonal', translations: { de: 'Ermutigung', fr: 'Encouragement', es: 'Ánimo' } },
  { name: 'English', category: 'Communication & Interpersonal', translations: { de: 'Englisch', fr: 'Anglais', es: 'Inglés' } },
  { name: 'Explaining', category: 'Communication & Interpersonal', translations: { de: 'Erklären', fr: 'Explication', es: 'Explicación' } },
  { name: 'Etiquette', category: 'Communication & Interpersonal', translations: { de: 'Etikette', fr: 'Étiquette', es: 'Etiqueta' } },
  { name: 'Expression', category: 'Communication & Interpersonal', translations: { de: 'Ausdruck', fr: 'Expression', es: 'Expresión' } },

  // --- Analytical & Technical ---
  { name: 'Engineering', category: 'Analytical & Technical', translations: { de: 'Ingenieurwesen', fr: 'Ingénierie', es: 'Ingeniería' } },
  { name: 'Electrical Engineering', category: 'Analytical & Technical', translations: { de: 'Elektrotechnik', fr: 'Génie électrique', es: 'Ingeniería eléctrica' } },
  { name: 'Electronics', category: 'Analytical & Technical', translations: { de: 'Elektronik', fr: 'Électronique', es: 'Electrónica' } },
  { name: 'ETL (Extract, Transform, Load)', category: 'Analytical & Technical', translations: { de: 'ETL (Extrahieren, Transformieren, Laden)', fr: 'ETL (Extraire, Transformer, Charger)', es: 'ETL (Extraer, Transformar, Cargar)' } },
  { name: 'E-learning', category: 'Analytical & Technical', translations: { de: 'E-Learning', fr: 'E-learning', es: 'E-learning' } },
  { name: 'Eclipse', category: 'Analytical & Technical', translations: { de: 'Eclipse', fr: 'Eclipse', es: 'Eclipse' } },
  { name: 'Embedded Systems', category: 'Analytical & Technical', translations: { de: 'Eingebettete Systeme', fr: 'Systèmes embarqués', es: 'Sistemas embebidos' } },
  { name: 'Encryption', category: 'Analytical & Technical', translations: { de: 'Verschlüsselung', fr: 'Chiffrement', es: 'Cifrado' } },
  
  // --- Personal Development & Mindset ---
  { name: 'Emotional Intelligence', category: 'Personal Development & Mindset', translations: { de: 'Emotionale Intelligenz', fr: 'Intelligence émotionnelle', es: 'Inteligencia emocional' } },
  { name: 'Emotional Regulation', category: 'Personal Development & Mindset', translations: { de: 'Emotionsregulation', fr: 'Régulation émotionnelle', es: 'Regulación emocional' } },
  { name: 'Energy Management', category: 'Personal Development & Mindset', translations: { de: 'Energiemanagement', fr: 'Gestion de l\'énergie', es: 'Gestión de la energía' } },
  { name: 'Endurance', category: 'Personal Development & Mindset', translations: { de: 'Ausdauer', fr: 'Endurance', es: 'Resistencia' } },
  { name: 'Enthusiasm', category: 'Personal Development & Mindset', translations: { de: 'Enthusiasmus', fr: 'Enthousiasme', es: 'Entusiasmo' } },
  { name: 'Existential Coaching', category: 'Personal Development & Mindset', translations: { de: 'Existenzielles Coaching', fr: 'Coaching existentiel', es: 'Coaching existencial' } },
  { name: 'Exploration', category: 'Personal Development & Mindset', translations: { de: 'Erkundung', fr: 'Exploration', es: 'Exploración' } },
  { name: 'Efficiency', category: 'Personal Development & Mindset', translations: { de: 'Effizienz', fr: 'Efficacité', es: 'Eficiencia' } },

  // --- Wellness & Creative Arts ---
  { name: 'Energy Healing', category: 'Wellness & Creative Arts', translations: { de: 'Energieheilung', fr: 'Guérison énergétique', es: 'Sanación energética' } },
  { name: 'Engraving', category: 'Wellness & Creative Arts', translations: { de: 'Gravur', fr: 'Gravure', es: 'Grabado' } },
  { name: 'Environmentalism', category: 'Wellness & Creative Arts', translations: { de: 'Umweltschutz', fr: 'Écologisme', es: 'Ecologismo' } },
  { name: 'Equestrianism', category: 'Wellness & Creative Arts', translations: { de: 'Reitsport', fr: 'Équitation', es: 'Equitación' } },
  { name: 'Essential Oils', category: 'Wellness & Creative Arts', translations: { de: 'Ätherische Öle', fr: 'Huiles essentielles', es: 'Aceites esenciales' } },
  { name: 'Etching', category: 'Wellness & Creative Arts', translations: { de: 'Radierung', fr: 'Gravure à l\'eau-forte', es: 'Aguafuerte' } },
  { name: 'Exercise', category: 'Wellness & Creative Arts', translations: { de: 'Bewegung', fr: 'Exercice', es: 'Ejercicio' } },
  { name: 'Ergonomics', category: 'Wellness & Creative Arts', translations: { de: 'Ergonomie', fr: 'Ergonomie', es: 'Ergonomía' } },
  { name: 'Embroidery', category: 'Wellness & Creative Arts', translations: { de: 'Stickerei', fr: 'Broderie', es: 'Bordado' } },
  { name: 'Electronic Music Production', category: 'Wellness & Creative Arts', translations: { de: 'Produktion elektronischer Musik', fr: 'Production de musique électronique', es: 'Producción de música electrónica' } },
  { name: 'Exhibition Curation', category: 'Wellness & Creative Arts', translations: { de: 'Ausstellungskuration', fr: 'Commissariat d\'exposition', es: 'Curaduría de exposiciones' } },
  { name: 'Ecology', category: 'Wellness & Creative Arts', translations: { de: 'Ökologie', fr: 'Écologie', es: 'Ecología' } },
  { name: 'Enneagram', category: 'Wellness & Creative Arts', translations: { de: 'Enneagramm', fr: 'Ennéagramme', es: 'Eneagrama' } },
  { name: 'Event Photography', category: 'Wellness & Creative Arts', translations: { de: 'Veranstaltungsfotografie', fr: 'Photographie événementielle', es: 'Fotografía de eventos' } },
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