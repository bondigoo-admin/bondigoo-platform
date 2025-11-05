// scripts/seedSkills_K.js

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
// A list of 60 general and specific coaching-related skills starting with 'K'.
const dataToUpload = [
  // --- Business & Finance ---
  { name: 'Kanban', category: 'Business & Finance', translations: { de: 'Kanban', fr: 'Kanban', es: 'Kanban' } },
  { name: 'Key Account Development', category: 'Business & Finance', translations: { de: 'Key-Account-Entwicklung', fr: 'Développement de comptes clés', es: 'Desarrollo de cuentas clave' } },
  { name: 'Key Account Management', category: 'Business & Finance', translations: { de: 'Key-Account-Management', fr: 'Gestion de comptes clés', es: 'Gestión de cuentas clave' } },
  { name: 'Key Performance Indicators (KPIs)', category: 'Business & Finance', translations: { de: 'Leistungskennzahlen (KPIs)', fr: 'Indicateurs clés de performance (KPI)', es: 'Indicadores clave de rendimiento (KPI)' } },
  { name: 'Knowledge Management', category: 'Business & Finance', translations: { de: 'Wissensmanagement', fr: 'Gestion des connaissances', es: 'Gestión del conocimiento' } },
  { name: 'Knowledge Process Outsourcing (KPO)', category: 'Business & Finance', translations: { de: 'Knowledge Process Outsourcing (KPO)', fr: 'Externalisation des processus de connaissance (KPO)', es: 'Externalización de procesos de conocimiento (KPO)' } },
  
  // --- Leadership & Management ---
  { name: 'Kick-off Meetings', category: 'Leadership & Management', translations: { de: 'Kick-off-Meetings', fr: 'Réunions de lancement', es: 'Reuniones de lanzamiento' } },
  { name: 'Knowledge Sharing', category: 'Leadership & Management', translations: { de: 'Wissensaustausch', fr: 'Partage des connaissances', es: 'Intercambio de conocimientos' } },
  { name: 'Knowledge Transfer', category: 'Leadership & Management', translations: { de: 'Wissenstransfer', fr: 'Transfert de connaissances', es: 'Transferencia de conocimientos' } },
  { name: 'Keynote Speaking', category: 'Leadership & Management', translations: { de: 'Keynote-Vorträge', fr: 'Discours principal', es: 'Ponencias magistrales' } },
  
  // --- Communication & Interpersonal ---
  { name: 'Keeping Confidences', category: 'Communication & Interpersonal', translations: { de: 'Vertraulichkeit wahren', fr: 'Garder les confidences', es: 'Guardar confidencias' } },
  { name: 'Kindness', category: 'Communication & Interpersonal', translations: { de: 'Freundlichkeit', fr: 'Gentillesse', es: 'Amabilidad' } },
  { name: 'Kinesthetic Communication', category: 'Communication & Interpersonal', translations: { de: 'Kinästhetische Kommunikation', fr: 'Communication kinesthésique', es: 'Comunicación kinestésica' } },
  
  // --- Analytical & Technical ---
  { name: 'Kernel Development', category: 'Analytical & Technical', translations: { de: 'Kernel-Entwicklung', fr: 'Développement de noyau', es: 'Desarrollo de kernel' } },
  { name: 'Keyboard Skills', category: 'Analytical & Technical', translations: { de: 'Tastaturschreiben', fr: 'Dactylographie', es: 'Habilidades con el teclado' } },
  { name: 'Keras', category: 'Analytical & Technical', translations: { de: 'Keras', fr: 'Keras', es: 'Keras' } },
  { name: 'KNIME', category: 'Analytical & Technical', translations: { de: 'KNIME', fr: 'KNIME', es: 'KNIME' } },
  { name: 'Kotlin', category: 'Analytical & Technical', translations: { de: 'Kotlin', fr: 'Kotlin', es: 'Kotlin' } },
  { name: 'Kubernetes', category: 'Analytical & Technical', translations: { de: 'Kubernetes', fr: 'Kubernetes', es: 'Kubernetes' } },
  { name: 'Keyword Research', category: 'Analytical & Technical', translations: { de: 'Keyword-Recherche', fr: 'Recherche de mots-clés', es: 'Investigación de palabras clave' } },
  
  // --- Personal Development & Mindset ---
  { name: 'Kaizen', category: 'Personal Development & Mindset', translations: { de: 'Kaizen', fr: 'Kaizen', es: 'Kaizen' } },
  { name: 'Keeping Commitments', category: 'Personal Development & Mindset', translations: { de: 'Zusagen einhalten', fr: 'Tenir ses engagements', es: 'Cumplir los compromisos' } },
  { name: 'Keeping an Open Mind', category: 'Personal Development & Mindset', translations: { de: 'Aufgeschlossenheit', fr: 'Garder l\'esprit ouvert', es: 'Mantener la mente abierta' } },
  { name: 'Knowing Your "Why"', category: 'Personal Development & Mindset', translations: { de: 'Das "Warum" kennen', fr: 'Connaître son "Pourquoi"', es: 'Conocer tu "Porqué"' } },
  { name: 'Knowledge Acquisition', category: 'Personal Development & Mindset', translations: { de: 'Wissenserwerb', fr: 'Acquisition de connaissances', es: 'Adquisición de conocimientos' } },
  { name: 'Kinship', category: 'Personal Development & Mindset', translations: { de: 'Verwandtschaft/Zugehörigkeit', fr: 'Parenté/Affinité', es: 'Afinidad/Parentesco' } },
  
  // --- Wellness & Creative Arts ---
  { name: 'K-pop Dance', category: 'Wellness & Creative Arts', translations: { de: 'K-Pop-Tanz', fr: 'Danse K-pop', es: 'Baile K-pop' } },
  { name: 'Karaoke', category: 'Wellness & Creative Arts', translations: { de: 'Karaoke', fr: 'Karaoké', es: 'Karaoke' } },
  { name: 'Karate', category: 'Wellness & Creative Arts', translations: { de: 'Karate', fr: 'Karaté', es: 'Karate' } },
  { name: 'Kayaking', category: 'Wellness & Creative Arts', translations: { de: 'Kajakfahren', fr: 'Kayak', es: 'Kayak' } },
  { name: 'Kefir Making', category: 'Wellness & Creative Arts', translations: { de: 'Kefir herstellen', fr: 'Fabrication de kéfir', es: 'Elaboración de kéfir' } },
  { name: 'Kettlebell Training', category: 'Wellness & Creative Arts', translations: { de: 'Kettlebell-Training', fr: 'Entraînement avec kettlebell', es: 'Entrenamiento con pesas rusas' } },
  { name: 'Kinesiology', category: 'Wellness & Creative Arts', translations: { de: 'Kinesiologie', fr: 'Kinésiologie', es: 'Kinesiología' } },
  { name: 'Kintsugi', category: 'Wellness & Creative Arts', translations: { de: 'Kintsugi', fr: 'Kintsugi', es: 'Kintsugi' } },
  { name: 'Kite Surfing', category: 'Wellness & Creative Arts', translations: { de: 'Kitesurfen', fr: 'Kitesurf', es: 'Kitesurf' } },
  { name: 'Kite Making', category: 'Wellness & Creative Arts', translations: { de: 'Drachenbau', fr: 'Fabrication de cerfs-volants', es: 'Fabricación de cometas' } },
  { name: 'Kneading', category: 'Wellness & Creative Arts', translations: { de: 'Kneten', fr: 'Pétrissage', es: 'Amasado' } },
  { name: 'Knife Skills', category: 'Wellness & Creative Arts', translations: { de: 'Messerfertigkeiten', fr: 'Techniques de couteau', es: 'Habilidades con el cuchillo' } },
  { name: 'Knitting', category: 'Wellness & Creative Arts', translations: { de: 'Stricken', fr: 'Tricot', es: 'Tejido de punto' } },
  { name: 'Knot Tying', category: 'Wellness & Creative Arts', translations: { de: 'Knotenknüpfen', fr: 'Nœuds', es: 'Hacer nudos' } },
  { name: 'Kombucha Brewing', category: 'Wellness & Creative Arts', translations: { de: 'Kombucha brauen', fr: 'Brassage de kombucha', es: 'Elaboración de kombucha' } },
  { name: 'Krav Maga', category: 'Wellness & Creative Arts', translations: { de: 'Krav Maga', fr: 'Krav Maga', es: 'Krav Magá' } },
  { name: 'Kundalini Yoga', category: 'Wellness & Creative Arts', translations: { de: 'Kundalini Yoga', fr: 'Kundalini Yoga', es: 'Kundalini Yoga' } },
  // Adding more to reach 60
  { name: 'Kickboxing', category: 'Wellness & Creative Arts', translations: { de: 'Kickboxen', fr: 'Kick-boxing', es: 'Kickboxing' } },
  { name: 'Kizomba', category: 'Wellness & Creative Arts', translations: { de: 'Kizomba', fr: 'Kizomba', es: 'Kizomba' } },
  { name: 'Knifemaking', category: 'Wellness & Creative Arts', translations: { de: 'Messerherstellung', fr: 'Coutellerie', es: 'Fabricación de cuchillos' } },
  { name: 'Kabbalah', category: 'Personal Development & Mindset', translations: { de: 'Kabbala', fr: 'Kabbale', es: 'Cábala' } },
  { name: 'Key Holding', category: 'Business & Finance', translations: { de: 'Schlüsselverwaltung', fr: 'Détention de clés', es: 'Custodia de llaves' } },
  { name: 'Knowledge Base Administration', category: 'Analytical & Technical', translations: { de: 'Wissensdatenbank-Administration', fr: 'Administration de base de connaissances', es: 'Administración de bases de conocimiento' } },
  { name: 'Kinesiology Taping', category: 'Wellness & Creative Arts', translations: { de: 'Kinesiologie-Taping', fr: 'Bandes de kinésiologie', es: 'Vendaje neuromuscular' } },
  { name: 'Keyboard Performance', category: 'Wellness & Creative Arts', translations: { de: 'Keyboard-Performance', fr: 'Jeu au clavier', es: 'Interpretación con teclado' } },
  { name: 'Kitchen Management', category: 'Business & Finance', translations: { de: 'Küchenmanagement', fr: 'Gestion de cuisine', es: 'Gestión de cocina' } },
  { name: 'Key Grip', category: 'Wellness & Creative Arts', translations: { de: 'Key Grip (Filmkulissen)', fr: 'Chef machiniste', es: 'Maquinista principal' } },
  { name:- 'Kenjutsu', category: 'Wellness & Creative Arts', translations: { de: 'Kenjutsu', fr: 'Kenjutsu', es: 'Kenjutsu' } },
  { name: 'Kung Fu', category: 'Wellness & Creative Arts', translations: { de: 'Kung Fu', fr: 'Kung Fu', es: 'Kung Fu' } },
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