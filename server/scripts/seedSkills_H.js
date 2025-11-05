// scripts/seedSkills_H.js

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
// A list of 60 general and specific coaching-related skills starting with 'H'.
const dataToUpload = [
  // --- Business & Finance ---
  { name: 'Health Insurance', category: 'Business & Finance', translations: { de: 'Krankenversicherung', fr: 'Assurance maladie', es: 'Seguro de salud' } },
  { name: 'Healthcare Administration', category: 'Business & Finance', translations: { de: 'Gesundheitsverwaltung', fr: 'Administration de la santé', es: 'Administración de la salud' } },
  { name: 'Hedge Funds', category: 'Business & Finance', translations: { de: 'Hedgefonds', fr: 'Fonds spéculatifs', es: 'Fondos de cobertura' } },
  { name: 'Hiring', category: 'Business & Finance', translations: { de: 'Personalbeschaffung', fr: 'Recrutement', es: 'Contratación' } },
  { name: 'Hospitality', category: 'Business & Finance', translations: { de: 'Gastgewerbe', fr: 'Hôtellerie', es: 'Hostelería' } },
  { name: 'Hospitality Management', category: 'Business & Finance', translations: { de: 'Hotelmanagement', fr: 'Gestion hôtelière', es: 'Gestión hotelera' } },
  { name: 'Hotel Management', category: 'Business & Finance', translations: { de: 'Hotel-Management', fr: 'Gestion d\'hôtels', es: 'Gestión hotelera' } },
  { name: 'Human Resources (HR)', category: 'Business & Finance', translations: { de: 'Personalwesen (HR)', fr: 'Ressources humaines (RH)', es: 'Recursos humanos (RRHH)' } },
  { name: 'HubSpot', category: 'Business & Finance', translations: { de: 'HubSpot', fr: 'HubSpot', es: 'HubSpot' } },

  // --- Leadership & Management ---
  { name: 'Handling Difficult People', category: 'Leadership & Management', translations: { de: 'Umgang mit schwierigen Menschen', fr: 'Gestion des personnes difficiles', es: 'Manejo de personas difíciles' } },
  { name: 'Hazard Analysis', category: 'Leadership & Management', translations: { de: 'Gefahrenanalyse', fr: 'Analyse des risques', es: 'Análisis de peligros' } },
  { name: 'Headhunting', category: 'Leadership & Management', translations: { de: 'Headhunting', fr: 'Chasse de têtes', es: 'Caza de talentos' } },
  { name: 'Health and Safety Management', category: 'Leadership & Management', translations: { de: 'Arbeitsschutzmanagement', fr: 'Gestion de la santé et de la sécurité', es: 'Gestión de la salud y la seguridad' } },
  { name: 'High-Performance Teams', category: 'Leadership & Management', translations: { de: 'Hochleistungsteams', fr: 'Équipes à haute performance', es: 'Equipos de alto rendimiento' } },
  { name: 'Human Capital Management', category: 'Leadership & Management', translations: { de: 'Humankapitalmanagement', fr: 'Gestion du capital humain', es: 'Gestión del capital humano' } },
  { name: 'Hybrid Team Management', category: 'Leadership & Management', translations: { de: 'Management hybrider Teams', fr: 'Gestion d\'équipes hybrides', es: 'Gestión de equipos híbridos' } },

  // --- Communication & Interpersonal ---
  { name: 'Holding Space', category: 'Communication & Interpersonal', translations: { de: 'Raum halten', fr: 'Tenir l\'espace', es: 'Sostener el espacio' } },
  { name: 'Honesty', category: 'Communication & Interpersonal', translations: { de: 'Ehrlichkeit', fr: 'Honnêteté', es: 'Honestidad' } },
  { name: 'Hostmanship', category: 'Communication & Interpersonal', translations: { de: 'Gastfreundschaft', fr: 'Art d\'accueillir', es: 'Hostmanship' } },
  { name: 'Humor', category: 'Communication & Interpersonal', translations: { de: 'Humor', fr: 'Humour', es: 'Humor' } },
  { name: 'Human Relations', category: 'Communication & Interpersonal', translations: { de: 'Zwischenmenschliche Beziehungen', fr: 'Relations humaines', es: 'Relaciones humanas' } },
  { name: 'Hebrew', category: 'Communication & Interpersonal', translations: { de: 'Hebräisch', fr: 'Hébreu', es: 'Hebreo' } },
  { name: 'Harmonious Communication', category: 'Communication & Interpersonal', translations: { de: 'Harmonische Kommunikation', fr: 'Communication harmonieuse', es: 'Comunicación armoniosa' } },
  
  // --- Analytical & Technical ---
  { name: 'Hadoop', category: 'Analytical & Technical', translations: { de: 'Hadoop', fr: 'Hadoop', es: 'Hadoop' } },
  { name: 'Hardware', category: 'Analytical & Technical', translations: { de: 'Hardware', fr: 'Matériel informatique', es: 'Hardware' } },
  { name: 'Haskell', category: 'Analytical & Technical', translations: { de: 'Haskell', fr: 'Haskell', es: 'Haskell' } },
  { name: 'Hibernate (Java)', category: 'Analytical & Technical', translations: { de: 'Hibernate (Java)', fr: 'Hibernate (Java)', es: 'Hibernate (Java)' } },
  { name: 'High-Performance Computing (HPC)', category: 'Analytical & Technical', translations: { de: 'Hochleistungsrechnen (HPC)', fr: 'Calcul haute performance (HPC)', es: 'Computación de alto rendimiento (HPC)' } },
  { name: 'HTML', category: 'Analytical & Technical', translations: { de: 'HTML', fr: 'HTML', es: 'HTML' } },
  { name: 'HTML5', category: 'Analytical & Technical', translations: { de: 'HTML5', fr: 'HTML5', es: 'HTML5' } },
  { name: 'Hyper-V', category: 'Analytical & Technical', translations: { de: 'Hyper-V', fr: 'Hyper-V', es: 'Hyper-V' } },
  { name: 'Human-Centered Design', category: 'Analytical & Technical', translations: { de: 'Menschenzentriertes Design', fr: 'Conception centrée sur l\'humain', es: 'Diseño centrado en el ser humano' } },

  // --- Personal Development & Mindset ---
  { name: 'Habit Formation', category: 'Personal Development & Mindset', translations: { de: 'Gewohnheitsbildung', fr: 'Formation d\'habitudes', es: 'Formación de hábitos' } },
  { name: 'Happiness', category: 'Personal Development & Mindset', translations: { de: 'Glück', fr: 'Bonheur', es: 'Felicidad' } },
  { name:- 'Healthy Boundaries', category: 'Personal Development & Mindset', translations: { de: 'Gesunde Grenzen', fr: 'Limites saines', es: 'Límites saludables' } },
  { name: 'Heart-Centered Living', category: 'Personal Development & Mindset', translations: { de: 'Herzorientiertes Leben', fr: 'Vie centrée sur le cœur', es: 'Vida centrada en el corazón' } },
  { name: 'Higher Self Connection', category: 'Personal Development & Mindset', translations: { de: 'Verbindung zum höheren Selbst', fr: 'Connexion au Soi supérieur', es: 'Conexión con el Ser Superior' } },
  { name: 'Holistic Thinking', category: 'Personal Development & Mindset', translations: { de: 'Ganzheitliches Denken', fr: 'Pensée holistique', es: 'Pensamiento holístico' } },
  { name: 'Hope', category: 'Personal Development & Mindset', translations: { de: 'Hoffnung', fr: 'Espoir', es: 'Esperanza' } },
  { name: 'Humility', category: 'Personal Development & Mindset', translations: { de: 'Bescheidenheit', fr: 'Humilité', es: 'Humildad' } },
  { name: 'Honoring Values', category: 'Personal Development & Mindset', translations: { de: 'Werte achten', fr: 'Honorer ses valeurs', es: 'Honrar los valores' } },

  // --- Wellness & Creative Arts ---
  { name: 'Handicrafts', category: 'Wellness & Creative Arts', translations: { de: 'Handwerk', fr: 'Artisanat', es: 'Artesanía' } },
  { name: 'Handwriting Analysis (Graphology)', category: 'Wellness & Creative Arts', translations: { de: 'Handschriftenanalyse (Graphologie)', fr: 'Graphologie', es: 'Grafología' } },
  { name: 'Harmonica', category: 'Wellness & Creative Arts', translations: { de: 'Mundharmonika', fr: 'Harmonica', es: 'Armónica' } },
  { name: 'Hatha Yoga', category: 'Wellness & Creative Arts', translations: { de: 'Hatha-Yoga', fr: 'Hatha Yoga', es: 'Hatha Yoga' } },
  { name: 'Health Coaching', category: 'Wellness & Creative Arts', translations: { de: 'Gesundheitscoaching', fr: 'Coaching en santé', es: 'Coaching de salud' } },
  { name: 'Herbalism', category: 'Wellness & Creative Arts', translations: { de: 'Kräuterheilkunde', fr: 'Herboristerie', es: 'Herboristería' } },
  { name: 'Hiking', category: 'Wellness & Creative Arts', translations: { de: 'Wandern', fr: 'Randonnée', es: 'Senderismo' } },
  { name: 'Holistic Health', category: 'Wellness & Creative Arts', translations: { de: 'Ganzheitliche Gesundheit', fr: 'Santé holistique', es: 'Salud holística' } },
  { name: 'Home Decor', category: 'Wellness & Creative Arts', translations: { de: 'Heimdekoration', fr: 'Décoration d\'intérieur', es: 'Decoración del hogar' } },
  { name: 'Homeopathy', category: 'Wellness & Creative Arts', translations: { de: 'Homöopathie', fr: 'Homéopathie', es: 'Homeopatía' } },
  { name: 'Horseback Riding', category: 'Wellness & Creative Arts', translations: { de: 'Reiten', fr: 'Équitation', es: 'Equitación' } },
  { name: 'Horticulture', category: 'Wellness & Creative Arts', translations: { de: 'Gartenbau', fr: 'Horticulture', es: 'Horticultura' } },
  { name: 'Hypnotherapy', category: 'Wellness & Creative Arts', translations: { de: 'Hypnotherapie', fr: 'Hypnothérapie', es: 'Hipnoterapia' } },
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