// scripts/seedSkills_G.js

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
// A list of 60 general and specific coaching-related skills starting with 'G'.
const dataToUpload = [
  // --- Business & Finance ---
  { name: 'Go-to-Market Strategy', category: 'Business & Finance', translations: { de: 'Go-to-Market-Strategie', fr: 'Stratégie de mise en marché', es: 'Estrategia de salida al mercado' } },
  { name: 'Government', category: 'Business & Finance', translations: { de: 'Regierung', fr: 'Gouvernement', es: 'Gobierno' } },
  { name: 'Government Contracting', category: 'Business & Finance', translations: { de: 'Öffentliche Auftragsvergabe', fr: 'Contrats publics', es: 'Contratación pública' } },
  { name: 'Grant Writing', category: 'Business & Finance', translations: { de: 'Antragstellung (Fördermittel)', fr: 'Rédaction de demandes de subvention', es: 'Redacción de subvenciones' } },
  { name: 'Gross Margin', category: 'Business & Finance', translations: { de: 'Bruttomarge', fr: 'Marge brute', es: 'Margen bruto' } },
  { name: 'Growth Hacking', category: 'Business & Finance', translations: { de: 'Growth Hacking', fr: 'Growth Hacking', es: 'Growth Hacking' } },
  { name: 'Growth Strategies', category: 'Business & Finance', translations: { de: 'Wachstumsstrategien', fr: 'Stratégies de croissance', es: 'Estrategias de crecimiento' } },
  { name: 'Global Business Development', category: 'Business & Finance', translations: { de: 'Globale Geschäftsentwicklung', fr: 'Développement commercial mondial', es: 'Desarrollo de negocio global' } },
  { name: 'General Ledger (GL)', category: 'Business & Finance', translations: { de: 'Hauptbuch (GL)', fr: 'Grand livre (GL)', es: 'Libro mayor (GL)' } },
  { name: 'Global Sourcing', category: 'Business & Finance', translations: { de: 'Globale Beschaffung', fr: 'Approvisionnement mondial', es: 'Abastecimiento global' } },

  // --- Leadership & Management ---
  { name: 'Giving Feedback', category: 'Leadership & Management', translations: { de: 'Feedback geben', fr: 'Donner du feedback', es: 'Dar retroalimentación' } },
  { name: 'Goal Setting', category: 'Leadership & Management', translations: { de: 'Zielsetzung', fr: 'Définition d\'objectifs', es: 'Establecimiento de metas' } },
  { name: 'Governance', category: 'Leadership & Management', translations: { de: 'Governance', fr: 'Gouvernance', es: 'Gobernanza' } },
  { name: 'Grievance Handling', category: 'Leadership & Management', translations: { de: 'Beschwerdemanagement', fr: 'Gestion des griefs', es: 'Manejo de quejas' } },
  { name: 'Group Coaching', category: 'Leadership & Management', translations: { de: 'Gruppencoaching', fr: 'Coaching de groupe', es: 'Coaching grupal' } },
  { name: 'Group Dynamics', category: 'Leadership & Management', translations: { de: 'Gruppendynamik', fr: 'Dynamique de groupe', es: 'Dinámica de grupos' } },
  { name: 'Group Facilitation', category: 'Leadership & Management', translations: { de: 'Gruppenmoderation', fr: 'Animation de groupe', es: 'Facilitación de grupos' } },
  { name: 'Guidance', category: 'Leadership & Management', translations: { de: 'Anleitung', fr: 'Orientation', es: 'Orientación' } },
  { name: 'Global Leadership', category: 'Leadership & Management', translations: { de: 'Globale Führung', fr: 'Leadership mondial', es: 'Liderazgo global' } },
  { name: 'General Management', category: 'Leadership & Management', translations: { de: 'Allgemeines Management', fr: 'Gestion générale', es: 'Gerencia general' } },

  // --- Communication & Interpersonal ---
  { name: 'German', category: 'Communication & Interpersonal', translations: { de: 'Deutsch', fr: 'Allemand', es: 'Alemán' } },
  { name: 'Grammar', category: 'Communication & Interpersonal', translations: { de: 'Grammatik', fr: 'Grammaire', es: 'Gramática' } },
  { name: 'Guest Relations', category: 'Communication & Interpersonal', translations: { de: 'Gästebetreuung', fr: 'Relations avec les clients', es: 'Relaciones con los huéspedes' } },
  { name: 'Generational Communication', category: 'Communication & Interpersonal', translations: { de: 'Generationenübergreifende Kommunikation', fr: 'Communication intergénérationnelle', es: 'Comunicación intergeneracional' } },
  
  // --- Analytical & Technical ---
  { name: 'Game Design', category: 'Analytical & Technical', translations: { de: 'Spieldesign', fr: 'Conception de jeux', es: 'Diseño de juegos' } },
  { name: 'Game Development', category: 'Analytical & Technical', translations: { de: 'Spieleentwicklung', fr: 'Développement de jeux', es: 'Desarrollo de videojuegos' } },
  { name: 'Geographic Information Systems (GIS)', category: 'Analytical & Technical', translations: { de: 'Geoinformationssysteme (GIS)', fr: 'Systèmes d\'information géographique (SIG)', es: 'Sistemas de información geográfica (SIG)' } },
  { name: 'Git', category: 'Analytical & Technical', translations: { de: 'Git', fr: 'Git', es: 'Git' } },
  { name: 'GitHub', category: 'Analytical & Technical', translations: { de: 'GitHub', fr: 'GitHub', es: 'GitHub' } },
  { name: 'Google Analytics', category: 'Analytical & Technical', translations: { de: 'Google Analytics', fr: 'Google Analytics', es: 'Google Analytics' } },
  { name: 'Google Cloud Platform (GCP)', category: 'Analytical & Technical', translations: { de: 'Google Cloud Platform (GCP)', fr: 'Google Cloud Platform (GCP)', es: 'Google Cloud Platform (GCP)' } },
  { name: 'Google Workspace', category: 'Analytical & Technical', translations: { de: 'Google Workspace', fr: 'Google Workspace', es: 'Google Workspace' } },
  { name: 'Graphic Design', category: 'Analytical & Technical', translations: { de: 'Grafikdesign', fr: 'Conception graphique', es: 'Diseño gráfico' } },
  
  // --- Personal Development & Mindset ---
  { name: 'Generosity', category: 'Personal Development & Mindset', translations: { de: 'Großzügigkeit', fr: 'Générosité', es: 'Generosidad' } },
  { name: 'Goal Achievement', category: 'Personal Development & Mindset', translations: { de: 'Zielerreichung', fr: 'Atteinte des objectifs', es: 'Logro de metas' } },
  { name: 'Grace', category: 'Personal Development & Mindset', translations: { de: 'Anmut', fr: 'Grâce', es: 'Gracia' } },
  { name: 'Gratitude', category: 'Personal Development & Mindset', translations: { de: 'Dankbarkeit', fr: 'Gratitude', es: 'Gratitud' } },
  { name: 'Grit', category: 'Personal Development & Mindset', translations: { de: 'Durchhaltevermögen', fr: 'Courage', es: 'Determinación' } },
  { name: 'Grounding Techniques', category: 'Personal Development & Mindset', translations: { de: 'Erdungstechniken', fr: 'Techniques d\'ancrage', es: 'Técnicas de enraizamiento' } },
  { name: 'Growth Mindset', category: 'Personal Development & Mindset', translations: { de: 'Wachstumsorientierung', fr: 'Mentalité de croissance', es: 'Mentalidad de crecimiento' } },
  { name: 'Grief Work', category: 'Personal Development & Mindset', translations: { de: 'Trauerarbeit', fr: 'Travail de deuil', es: 'Trabajo de duelo' } },
  { name: 'Good Judgment', category: 'Personal Development & Mindset', translations: { de: 'Gutes Urteilsvermögen', fr: 'Bon jugement', es: 'Buen juicio' } },

  // --- Wellness & Creative Arts ---
  { name: 'Gardening', category: 'Wellness & Creative Arts', translations: { de: 'Gartenarbeit', fr: 'Jardinage', es: 'Jardinería' } },
  { name: 'Genealogy', category: 'Wellness & Creative Arts', translations: { de: 'Genealogie', fr: 'Généalogie', es: 'Genealogía' } },
  { name: 'Glassblowing', category: 'Wellness & Creative Arts', translations: { de: 'Glasbläserei', fr: 'Soufflage de verre', es: 'Soplado de vidrio' } },
  { name: 'Golf', category: 'Wellness & Creative Arts', translations: { de: 'Golf', fr: 'Golf', es: 'Golf' } },
  { name: 'Gourmet Cooking', category: 'Wellness & Creative Arts', translations: { de: 'Gourmetküche', fr: 'Cuisine gastronomique', es: 'Cocina gourmet' } },
  { name: 'Guitar', category: 'Wellness & Creative Arts', translations: { de: 'Gitarre', fr: 'Guitare', es: 'Guitarra' } },
  { name: 'Gymnastics', category: 'Wellness & Creative Arts', translations: { de: 'Turnen', fr: 'Gymnastique', es: 'Gimnasia' } },
  { name: 'Gaming', category: 'Wellness & Creative Arts', translations: { de: 'Gaming', fr: 'Jeux vidéo', es: 'Videojuegos' } },
  { name: 'Gemology', category: 'Wellness & Creative Arts', translations: { de: 'Gemmologie', fr: 'Gemmologie', es: 'Gemología' } },
  { name: 'Gong Bath', category: 'Wellness & Creative Arts', translations: { de: 'Gong-Bad', fr: 'Bain de gong', es: 'Baño de gong' } },
  { name: 'Graffiti Art', category: 'Wellness & Creative Arts', translations: { de: 'Graffiti-Kunst', fr: 'Art du graffiti', es: 'Arte del graffiti' } },
  { name: 'Guest Speaking', category: 'Wellness & Creative Arts', translations: { de: 'Gastvorträge', fr: 'Conférence invitée', es: 'Oratoria invitada' } },
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