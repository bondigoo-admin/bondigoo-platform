// scripts/seedSkills_F.js

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
// A list of 60 general and specific coaching-related skills starting with 'F'.
const dataToUpload = [
  // --- Business & Finance ---
  { name: 'Facilities Management', category: 'Business & Finance', translations: { de: 'Gebäudemanagement', fr: 'Gestion des installations', es: 'Gestión de instalaciones' } },
  { name: 'Finance', category: 'Business & Finance', translations: { de: 'Finanzen', fr: 'Finance', es: 'Finanzas' } },
  { name: 'Financial Analysis', category: 'Business & Finance', translations: { de: 'Finanzanalyse', fr: 'Analyse financière', es: 'Análisis financiero' } },
  { name: 'Financial Modeling', category: 'Business & Finance', translations: { de: 'Finanzmodellierung', fr: 'Modélisation financière', es: 'Modelado financiero' } },
  { name: 'Financial Planning', category: 'Business & Finance', translations: { de: 'Finanzplanung', fr: 'Planification financière', es: 'Planificación financiera' } },
  { name: 'Financial Reporting', category: 'Business & Finance', translations: { de: 'Finanzberichterstattung', fr: 'Rapports financiers', es: 'Informes financieros' } },
  { name: 'Forecasting', category: 'Business & Finance', translations: { de: 'Prognoseerstellung', fr: 'Prévisions', es: 'Previsión' } },
  { name: 'Franchising', category: 'Business & Finance', translations: { de: 'Franchising', fr: 'Franchisage', es: 'Franquicias' } },
  { name: 'Fundraising', category: 'Business & Finance', translations: { de: 'Mittelbeschaffung', fr: 'Collecte de fonds', es: 'Recaudación de fondos' } },
  { name: 'Foreign Exchange (FX)', category: 'Business & Finance', translations: { de: 'Devisenhandel (FX)', fr: 'Change (FX)', es: 'Mercado de divisas (FX)' } },

  // --- Leadership & Management ---
  { name: 'Facilitation', category: 'Leadership & Management', translations: { de: 'Moderation', fr: 'Animation', es: 'Facilitación' } },
  { name: 'Feedback', category: 'Leadership & Management', translations: { de: 'Feedback', fr: 'Feedback', es: 'Retroalimentación' } },
  { name: 'Fleet Management', category: 'Leadership & Management', translations: { de: 'Fuhrparkmanagement', fr: 'Gestion de flotte', es: 'Gestión de flotas' } },
  { name: 'Follow-up Skills', category: 'Leadership & Management', translations: { de: 'Nachverfolgungskompetenz', fr: 'Compétences de suivi', es: 'Habilidades de seguimiento' } },
  { name: 'Framing', category: 'Leadership & Management', translations: { de: 'Framing', fr: 'Cadrage', es: 'Encuadre' } },
  { name: 'Future Pacing', category: 'Leadership & Management', translations: { de: 'Future Pacing', fr: 'Ancrage futur', es: 'Pase al futuro' } },
  { name: 'Firing', category: 'Leadership & Management', translations: { de: 'Entlassung', fr: 'Licenciement', es: 'Despido' } },

  // --- Communication & Interpersonal ---
  { name: 'Face-to-Face Communication', category: 'Communication & Interpersonal', translations: { de: 'Persönliche Kommunikation', fr: 'Communication en face à face', es: 'Comunicación cara a cara' } },
  { name: 'Fact-checking', category: 'Communication & Interpersonal', translations: { de: 'Faktenprüfung', fr: 'Vérification des faits', es: 'Verificación de hechos' } },
  { name: 'Filmmaking', category: 'Communication & Interpersonal', translations: { de: 'Filmemachen', fr: 'Réalisation de films', es: 'Cinematografía' } },
  { name: 'First Impressions', category: 'Communication & Interpersonal', translations: { de: 'Erster Eindruck', fr: 'Premières impressions', es: 'Primeras impresiones' } },
  { name: 'French', category: 'Communication & Interpersonal', translations: { de: 'Französisch', fr: 'Français', es: 'Francés' } },

  // --- Analytical & Technical ---
  { name: 'Figma', category: 'Analytical & Technical', translations: { de: 'Figma', fr: 'Figma', es: 'Figma' } },
  { name: 'File Systems', category: 'Analytical & Technical', translations: { de: 'Dateisysteme', fr: 'Systèmes de fichiers', es: 'Sistemas de archivos' } },
  { name: 'Final Cut Pro', category: 'Analytical & Technical', translations: { de: 'Final Cut Pro', fr: 'Final Cut Pro', es: 'Final Cut Pro' } },
  { name: 'Firebase', category: 'Analytical & Technical', translations: { de: 'Firebase', fr: 'Firebase', es: 'Firebase' } },
  { name: 'Firewalls', category: 'Analytical & Technical', translations: { de: 'Firewalls', fr: 'Pare-feu', es: 'Firewalls' } },
  { name: 'Firmware', category: 'Analytical & Technical', translations: { de: 'Firmware', fr: 'Firmware', es: 'Firmware' } },
  { name: 'Front-End Development', category: 'Analytical & Technical', translations: { de: 'Front-End-Entwicklung', fr: 'Développement front-end', es: 'Desarrollo front-end' } },
  
  // --- Personal Development & Mindset ---
  { name: 'Fairness', category: 'Personal Development & Mindset', translations: { de: 'Fairness', fr: 'Équité', es: 'Justicia' } },
  { name: 'Fear Management', category: 'Personal Development & Mindset', translations: { de: 'Angstbewältigung', fr: 'Gestion de la peur', es: 'Gestión del miedo' } },
  { name: 'Flexibility', category: 'Personal Development & Mindset', translations: { de: 'Flexibilität', fr: 'Flexibilité', es: 'Flexibilidad' } },
  { name: 'Flow State', category: 'Personal Development & Mindset', translations: { de: 'Flow-Zustand', fr: 'État de flow', es: 'Estado de flujo' } },
  { name: 'Focus', category: 'Personal Development & Mindset', translations: { de: 'Fokus', fr: 'Concentration', es: 'Enfoque' } },
  { name: 'Forgiveness', category: 'Personal Development & Mindset', translations: { de: 'Vergebung', fr: 'Pardon', es: 'Perdón' } },
  { name: 'Fortitude', category: 'Personal Development & Mindset', translations: { de: 'Stärke', fr: 'Force d\'âme', es: 'Fortaleza' } },
  { name: 'Frugality', category: 'Personal Development & Mindset', translations: { de: 'Sparsamkeit', fr: 'Frugalité', es: 'Frugalidad' } },
  { name: 'Fulfillment', category: 'Personal Development & Mindset', translations: { de: 'Erfüllung', fr: 'Épanouissement', es: 'Realización' } },
  { name: 'Friendship', category: 'Personal Development & Mindset', translations: { de: 'Freundschaft', fr: 'Amitié', es: 'Amistad' } },
  
  // --- Wellness & Creative Arts ---
  { name: 'Farming', category: 'Wellness & Creative Arts', translations: { de: 'Landwirtschaft', fr: 'Agriculture', es: 'Agricultura' } },
  { name: 'Fashion Design', category: 'Wellness & Creative Arts', translations: { de: 'Modedesign', fr: 'Stylisme de mode', es: 'Diseño de moda' } },
  { name: 'Felting', category: 'Wellness & Creative Arts', translations: { de: 'Filzen', fr: 'Feutrage', es: 'Fieltrado' } },
  { name: 'Fencing', category: 'Wellness & Creative Arts', translations: { de: 'Fechten', fr: 'Escrime', es: 'Esgrima' } },
  { name: 'Feng Shui', category: 'Wellness & Creative Arts', translations: { de: 'Feng Shui', fr: 'Feng Shui', es: 'Feng Shui' } },
  { name: 'Fermentation', category: 'Wellness & Creative Arts', translations: { de: 'Fermentation', fr: 'Fermentation', es: 'Fermentación' } },
  { name: 'Fiction Writing', category: 'Wellness & Creative Arts', translations: { de: 'Belletristik', fr: 'Écriture de fiction', es: 'Escritura de ficción' } },
  { name: 'Figure Skating', category: 'Wellness & Creative Arts', translations: { de: 'Eiskunstlauf', fr: 'Patinage artistique', es: 'Patinaje artístico' } },
  { name: 'Film Criticism', category: 'Wellness & Creative Arts', translations: { de: 'Filmkritik', fr: 'Critique de cinéma', es: 'Crítica de cine' } },
  { name: 'Fishing', category: 'Wellness & Creative Arts', translations: { de: 'Angeln', fr: 'Pêche', es: 'Pesca' } },
  { name: 'Fitness', category: 'Wellness & Creative Arts', translations: { de: 'Fitness', fr: 'Fitness', es: 'Fitness' } },
  { name: 'Floristry', category: 'Wellness & Creative Arts', translations: { de: 'Floristik', fr: 'Art floral', es: 'Floristería' } },
  { name: 'Flower Arranging', category: 'Wellness & Creative Arts', translations: { de: 'Blumenarrangement', fr: 'Arrangement floral', es: 'Arreglos florales' } },
  { name: 'Flute', category: 'Wellness & Creative Arts', translations: { de: 'Flöte', fr: 'Flûte', es: 'Flauta' } },
  { name: 'Food & Beverage', category: 'Wellness & Creative Arts', translations: { de: 'Essen & Trinken', fr: 'Restauration', es: 'Alimentos y bebidas' } },
  { name: 'Foraging', category: 'Wellness & Creative Arts', translations: { de: 'Sammeln (Nahrung)', fr: 'Cueillette', es: 'Recolección' } },
  { name: 'Furniture Design', category: 'Wellness & Creative Arts', translations: { de: 'Möbeldesign', fr: 'Conception de meubles', es: 'Diseño de muebles' } },
  { name: 'Freediving', category: 'Wellness & Creative Arts', translations: { de: 'Freitauchen', fr: 'Apnée', es: 'Apnea' } },
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