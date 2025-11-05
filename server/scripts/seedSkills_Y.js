// scripts/seedSkills_Y.js

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
// A list of 60 general and specific coaching-related skills starting with 'Y'.
const dataToUpload = [
  // --- Wellness & Creative Arts ---
  { name: 'Yoga', category: 'Wellness & Creative Arts', translations: { de: 'Yoga', fr: 'Yoga', es: 'Yoga' } },
  { name: 'Yoga Instruction', category: 'Wellness & Creative Arts', translations: { de: 'Yoga-Unterricht', fr: 'Enseignement du yoga', es: 'Instrucción de yoga' } },
  { name: 'Yoga Nidra', category: 'Wellness & Creative Arts', translations: { de: 'Yoga Nidra', fr: 'Yoga Nidra', es: 'Yoga Nidra' } },
  { name: 'Yoga Therapy', category: 'Wellness & Creative Arts', translations: { de: 'Yogatherapie', fr: 'Yoga thérapie', es: 'Terapia de yoga' } },
  { name: 'Yin Yoga', category: 'Wellness & Creative Arts', translations: { de: 'Yin Yoga', fr: 'Yin Yoga', es: 'Yin Yoga' } },
  { name: 'Yachting', category: 'Wellness & Creative Arts', translations: { de: 'Segelsport', fr: 'Yachting', es: 'Navegación en yate' } },
  { name: 'Yarn Crafts', category: 'Wellness & Creative Arts', translations: { de: 'Garnhandwerk', fr: 'Artisanat du fil', es: 'Artesanías con hilo' } },
  { name: 'Yodeling', category: 'Wellness & Creative Arts', translations: { de: 'Jodeln', fr: 'Yodel', es: 'Canto a la tirolesa' } },
  { name: 'Youth Sports Coaching', category: 'Wellness & Creative Arts', translations: { de: 'Jugendsport-Coaching', fr: 'Coaching sportif pour les jeunes', es: 'Entrenamiento deportivo juvenil' } },
  { name: 'Yard Games', category: 'Wellness & Creative Arts', translations: { de: 'Gartenspiele', fr: 'Jeux de jardin', es: 'Juegos de jardín' } },
  { name: 'Yo-yo Tricks', category: 'Wellness & Creative Arts', translations: { de: 'Yo-Yo-Tricks', fr: 'Figures de yo-yo', es: 'Trucos de yo-yo' } },
  { name: 'Yarrow Identification', category: 'Wellness & Creative Arts', translations: { de: 'Schafgarbe-Identifizierung', fr: 'Identification de l\'achillée millefeuille', es: 'Identificación de milenrama' } },
  { name: 'Yueqin Playing', category: 'Wellness & Creative Arts', translations: { de: 'Yueqin spielen', fr: 'Jeu du yueqin', es: 'Tocar el yueqin' } },
  
  // --- Leadership & Management ---
  { name: 'Yearly Business Planning', category: 'Leadership & Management', translations: { de: 'Jährliche Geschäftsplanung', fr: 'Planification commerciale annuelle', es: 'Planificación empresarial anual' } },
  { name: 'Year-End Reporting', category: 'Leadership & Management', translations: { de: 'Jahresendberichterstattung', fr: 'Rapports de fin d\'année', es: 'Informes de fin de año' } },
  { name: 'Yield Management', category: 'Leadership & Management', translations: { de: 'Ertragsmanagement', fr: 'Gestion du rendement', es: 'Gestión del rendimiento' } },
  { name: 'Youth Leadership Development', category: 'Leadership & Management', translations: { de: 'Entwicklung von Führungsqualitäten bei Jugendlichen', fr: 'Développement du leadership chez les jeunes', es: 'Desarrollo de liderazgo juvenil' } },
  { name: 'Youth Mentoring', category: 'Leadership & Management', translations: { de: 'Jugend-Mentoring', fr: 'Mentorat pour les jeunes', es: 'Mentoría para jóvenes' } },
  { name: 'Youth Program Management', category: 'Leadership & Management', translations: { de: 'Management von Jugendprogrammen', fr: 'Gestion de programmes pour la jeunesse', es: 'Gestión de programas juveniles' } },

  // --- Business & Finance ---
  { name: 'Year-End Closing', category: 'Business & Finance', translations: { de: 'Jahresabschluss', fr: 'Clôture de fin d\'année', es: 'Cierre de fin de año' } },
  { name: 'Yield Curve Analysis', category: 'Business & Finance', translations: { de: 'Zinsstrukturkurvenanalyse', fr: 'Analyse de la courbe des taux', es: 'Análisis de la curva de rendimiento' } },
  { name: 'Yelp for Business', category: 'Business & Finance', translations: { de: 'Yelp für Unternehmen', fr: 'Yelp pour les entreprises', es: 'Yelp para empresas' } },
  { name: 'YouTube Marketing', category: 'Business & Finance', translations: { de: 'YouTube-Marketing', fr: 'Marketing sur YouTube', es: 'Marketing en YouTube' } },
  { name: 'Youth Entrepreneurship', category: 'Business & Finance', translations: { de: 'Jugendunternehmertum', fr: 'Entrepreneuriat des jeunes', es: 'Emprendimiento juvenil' } },
  
  // --- Communication & Interpersonal ---
  { name: 'Youth Communication', category: 'Communication & Interpersonal', translations: { de: 'Kommunikation mit Jugendlichen', fr: 'Communication avec les jeunes', es: 'Comunicación con jóvenes' } },
  { name: 'Yes-And (Improv Technique)', category: 'Communication & Interpersonal', translations: { de: 'Ja-Und (Impro-Technik)', fr: 'Oui-Et (Technique d\'impro)', es: 'Sí-Y (Técnica de improvisación)' } },
  { name: 'Yielding the Floor', category: 'Communication & Interpersonal', translations: { de: 'Das Wort übergeben', fr: 'Céder la parole', es: 'Ceder la palabra' } },
  { name: 'You-Attitude in Writing', category: 'Communication & Interpersonal', translations: { de: 'Du-Haltung im Schreiben', fr: 'Attitude centrée sur le lecteur', es: 'Actitud "Usted" en la escritura' } },

  // --- Analytical & Technical ---
  { name: 'YAML', category: 'Analytical & Technical', translations: { de: 'YAML', fr: 'YAML', es: 'YAML' } },
  { name: 'Yarn (Package Manager)', category: 'Analytical & Technical', translations: { de: 'Yarn (Paketmanager)', fr: 'Yarn (Gestionnaire de paquets)', es: 'Yarn (Gestor de paquetes)' } },
  { name: 'Yocto Project', category: 'Analytical & Technical', translations: { de: 'Yocto-Projekt', fr: 'Projet Yocto', es: 'Proyecto Yocto' } },
  { name: 'YUI Library', category: 'Analytical & Technical', translations: { de: 'YUI-Bibliothek', fr: 'Bibliothèque YUI', es: 'Biblioteca YUI' } },
  { name: 'Yandex Metrica', category: 'Analytical & Technical', translations: { de: 'Yandex Metrica', fr: 'Yandex Metrica', es: 'Yandex Metrica' } },
  { name: 'YARA', category: 'Analytical & Technical', translations: { de: 'YARA', fr: 'YARA', es: 'YARA' } },
  
  // --- Personal Development & Mindset ---
  { name: 'Year-End Reflection', category: 'Personal Development & Mindset', translations: { de: 'Jahresrückblick', fr: 'Réflexion de fin d\'année', es: 'Reflexión de fin de año' } },
  { name: 'Yearly Goal Setting', category: 'Personal Development & Mindset', translations: { de: 'Jährliche Zielsetzung', fr: 'Définition des objectifs annuels', es: 'Establecimiento de metas anuales' } },
  { name: 'Yearning for Growth', category: 'Personal Development & Mindset', translations: { de: 'Sehnsucht nach Wachstum', fr: 'Désir de croissance', es: 'Anhelo de crecimiento' } },
  { name: '"Your Why" Discovery', category: 'Personal Development & Mindset', translations: { de: 'Das "eigene Warum" entdecken', fr: 'Découverte de son "Pourquoi"', es: 'Descubrimiento de "Tu Porqué"' } },
  { name: 'Yielding to What Is', category: 'Personal Development & Mindset', translations: { de: 'Sich dem fügen, was ist', fr: 'S\'abandonner à ce qui est', es: 'Rendirse a lo que es' } },
  { name: 'Youthfulness (Mindset)', category: 'Personal Development & Mindset', translations: { de: 'Jugendlichkeit (Denkweise)', fr: 'Jeunesse d\'esprit', es: 'Mentalidad juvenil' } },
  { name: 'Yielding Control', category: 'Personal Development & Mindset', translations: { de: 'Kontrolle abgeben', fr: 'Céder le contrôle', es: 'Ceder el control' } },
  { name: 'Yugen (Japanese aesthetic)', category: 'Personal Development & Mindset', translations: { de: 'Yugen (Japanische Ästhetik)', fr: 'Yugen (Esthétique japonaise)', es: 'Yugen (Estética japonesa)' } },
  { name: 'Year-long Projects', category: 'Personal Development & Mindset', translations: { de: 'Jahresprojekte', fr: 'Projets d\'un an', es: 'Proyectos de un año' } },
  { name: 'Year Compass', category: 'Personal Development & Mindset', translations: { de: 'Jahreskompass', fr: 'Boussole de l\'année', es: 'Brújula del año' } },
  // Adding more to reach 60
  { name: 'Yagi Antenna Design', category: 'Analytical & Technical', translations: { de: 'Yagi-Antennen-Design', fr: 'Conception d\'antenne Yagi', es: 'Diseño de antena Yagi' } },
  { name: 'Yeast Cultivation', category: 'Wellness & Creative Arts', translations: { de: 'Hefezüchtung', fr: 'Culture de levure', es: 'Cultivo de levadura' } },
  { name: 'Youth Work', category: 'Leadership & Management', translations: { de: 'Jugendarbeit', fr: 'Travail de jeunesse', es: 'Trabajo juvenil' } },
  { name: 'Yiddish (Language)', category: 'Wellness & Creative Arts', translations: { de: 'Jiddisch (Sprache)', fr: 'Yiddish (Langue)', es: 'Yidis (Idioma)' } },
  { name: 'Yoruba (Language)', category: 'Wellness & Creative Arts', translations: { de: 'Yoruba (Sprache)', fr: 'Yoruba (Langue)', es: 'Yoruba (Idioma)' } },
  { name: 'Yurt Building', category: 'Wellness & Creative Arts', translations: { de: 'Jurtenbau', fr: 'Construction de yourtes', es: 'Construcción de yurtas' } },
  { name: 'Yielding to a Higher Power', category: 'Personal Development & Mindset', translations: { de: 'Sich einer höheren Macht hingeben', fr: 'S\'en remettre à une puissance supérieure', es: 'Rendirse a un poder superior' } },
  { name: 'Yard Maintenance', category: 'Wellness & Creative Arts', translations: { de: 'Gartenpflege', fr: 'Entretien du jardin', es: 'Mantenimiento del jardín' } },
  { name: 'Yarn Bombing', category: 'Wellness & Creative Arts', translations: { de: 'Guerilla-Stricken', fr: 'Yarn bombing', es: 'Bombardeo de hilo' } },
  { name: 'Yacht Design', category: 'Wellness & Creative Arts', translations: { de: 'Yachtdesign', fr: 'Conception de yachts', es: 'Diseño de yates' } },
  { name: 'Yakisoba Making', category: 'Wellness & Creative Arts', translations: { de: 'Yakisoba zubereiten', fr: 'Préparation de yakisoba', es: 'Elaboración de yakisoba' } },
  { name: 'Youth Advocacy', category: 'Leadership & Management', translations: { de: 'Jugendvertretung', fr: 'Plaidoyer pour la jeunesse', es: 'Defensa de la juventud' } },
  { name: 'Youth Justice', category: 'Leadership & Management', translations: { de: 'Jugendgerichtsbarkeit', fr: 'Justice des mineurs', es: 'Justicia juvenil' } },
  { name: 'YouTube Channel Management', category: 'Business & Finance', translations: { de: 'YouTube-Kanal-Management', fr: 'Gestion de chaîne YouTube', es: 'Gestión de canales de YouTube' } },
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