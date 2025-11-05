// scripts/seedSkills_X.js

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
// A list of 60 general and specific coaching-related skills starting with 'X'.
const dataToUpload = [
  // --- Analytical & Technical ---
  { name: 'X-Ray Analysis', category: 'Analytical & Technical', translations: { de: 'Röntgenanalyse', fr: 'Analyse par rayons X', es: 'Análisis de rayos X' } },
  { name: 'X-Ray Crystallography', category: 'Analytical & Technical', translations: { de: 'Röntgenkristallographie', fr: 'Cristallographie aux rayons X', es: 'Cristalografía de rayos X' } },
  { name: 'X-Ray Fluorescence (XRF) Analysis', category: 'Analytical & Technical', translations: { de: 'Röntgenfluoreszenzanalyse (RFA)', fr: 'Analyse par fluorescence X (XRF)', es: 'Análisis por fluorescencia de rayos X (XRF)' } },
  { name: 'X-ray Interpretation', category: 'Analytical & Technical', translations: { de: 'Röntgenbildinterpretation', fr: 'Interprétation des rayons X', es: 'Interpretación de rayos X' } },
  { name: 'Xamarin', category: 'Analytical & Technical', translations: { de: 'Xamarin', fr: 'Xamarin', es: 'Xamarin' } },
  { name: 'XAML', category: 'Analytical & Technical', translations: { de: 'XAML', fr: 'XAML', es: 'XAML' } },
  { name: 'Xen Virtualization', category: 'Analytical & Technical', translations: { de: 'Xen-Virtualisierung', fr: 'Virtualisation Xen', es: 'Virtualización Xen' } },
  { name: 'Xcode', category: 'Analytical & Technical', translations: { de: 'Xcode', fr: 'Xcode', es: 'Xcode' } },
  { name: 'XHTML', category: 'Analytical & Technical', translations: { de: 'XHTML', fr: 'XHTML', es: 'XHTML' } },
  { name: 'XML', category: 'Analytical & Technical', translations: { de: 'XML', fr: 'XML', es: 'XML' } },
  { name: 'XML Schema Design', category: 'Analytical & Technical', translations: { de: 'XML-Schema-Design', fr: 'Conception de schémas XML', es: 'Diseño de esquemas XML' } },
  { name: 'XML-RPC', category: 'Analytical & Technical', translations: { de: 'XML-RPC', fr: 'XML-RPC', es: 'XML-RPC' } },
  { name: 'XPath', category: 'Analytical & Technical', translations: { de: 'XPath', fr: 'XPath', es: 'XPath' } },
  { name: 'XQuery', category: 'Analytical & Technical', translations: { de: 'XQuery', fr: 'XQuery', es: 'XQuery' } },
  { name: 'XSLT', category: 'Analytical & Technical', translations: { de: 'XSLT', fr: 'XSLT', es: 'XSLT' } },
  { name: 'XSS (Cross-Site Scripting) Prevention', category: 'Analytical & Technical', translations: { de: 'XSS-Prävention', fr: 'Prévention du XSS (Cross-Site Scripting)', es: 'Prevención de XSS (Cross-Site Scripting)' } },

  // --- Business & Finance ---
  { name: 'XBRL (eXtensible Business Reporting Language)', category: 'Business & Finance', translations: { de: 'XBRL', fr: 'XBRL', es: 'XBRL' } },
  { name: 'Xero (Accounting Software)', category: 'Business & Finance', translations: { de: 'Xero (Buchhaltungssoftware)', fr: 'Xero (Logiciel de comptabilité)', es: 'Xero (Software de contabilidad)' } },
  { name: 'Xerox Machine Operation', category: 'Business & Finance', translations: { de: 'Bedienung von Xerox-Geräten', fr: 'Utilisation de photocopieurs Xerox', es: 'Operación de máquinas Xerox' } },
  { name: 'X-Matrix (Hoshin Kanri)', category: 'Business & Finance', translations: { de: 'X-Matrix (Hoshin Kanri)', fr: 'Matrice X (Hoshin Kanri)', es: 'Matriz X (Hoshin Kanri)' } },

  // --- Leadership & Management ---
  { name: 'X-Functional Team Leadership', category: 'Leadership & Management', translations: { de: 'Cross-funktionale Teamführung', fr: 'Leadership d\'équipe interfonctionnelle', es: 'Liderazgo de equipos multifuncionales' } },
  { name: 'Xenodochial Leadership', category: 'Leadership & Management', translations: { de: 'Xenodochiale Führung (gastfreundlich)', fr: 'Leadership xénodoque (hospitalier)', es: 'Liderazgo xenódico (hospitalario)' } },
  { name: 'Extreme Programming (XP) Leadership', category: 'Leadership & Management', translations: { de: 'Extreme Programming (XP) Führung', fr: 'Leadership Extreme Programming (XP)', es: 'Liderazgo de programación Extrema (XP)' } },

  // --- Communication & Interpersonal ---
  { name: 'Xenial Communication', category: 'Communication & Interpersonal', translations: { de: 'Gastfreundliche Kommunikation', fr: 'Communication xéniale', es: 'Comunicación hospitalaria' } },
  { name: 'Xenoglossy (study of)', category: 'Communication & Interpersonal', translations: { de: 'Xenoglossie (Studium von)', fr: 'Xénoglossie (étude de)', es: 'Xenoglosia (estudio de)' } },
  
  // --- Personal Development & Mindset ---
  { name: 'X-Factor Identification', category: 'Personal Development & Mindset', translations: { de: 'Identifizierung des X-Faktors', fr: 'Identification du facteur X', es: 'Identificación del factor X' } },
  { name: 'Xenocentrism Awareness', category: 'Personal Development & Mindset', translations: { de: 'Bewusstsein für Xenozentrismus', fr: 'Conscience du xénocentrisme', es: 'Conciencia del xenocentrismo' } },
  { name: 'Xenophilia', category: 'Personal Development & Mindset', translations: { de: 'Xenophilie', fr: 'Xénophilie', es: 'Xenofilia' } },
  { name: 'Xenophobia Awareness', category: 'Personal Development & Mindset', translations: { de: 'Bewusstsein für Xenophobie', fr: 'Sensibilisation à la xénophobie', es: 'Conciencia de la xenofobia' } },
  { name: 'Exam Preparation', category: 'Personal Development & Mindset', translations: { de: 'Prüfungsvorbereitung', fr: 'Préparation aux examens', es: 'Preparación para exámenes' } },
  { name: 'Excellence (pursuit of)', category: 'Personal Development & Mindset', translations: { de: 'Streben nach Exzellenz', fr: 'Poursuite de l\'excellence', es: 'Búsqueda de la excelencia' } },
  { name: 'Exploration (personal)', category: 'Personal Development & Mindset', translations: { de: 'Persönliche Exploration', fr: 'Exploration personnelle', es: 'Exploración personal' } },
  { name: 'Expressing Gratitude', category: 'Personal Development & Mindset', translations: { de: 'Dankbarkeit ausdrücken', fr: 'Exprimer sa gratitude', es: 'Expresar gratitud' } },

  // --- Wellness & Creative Arts ---
  { name: 'Xeranthemum Cultivation', category: 'Wellness & Creative Arts', translations: { de: 'Anbau von Strohblumen', fr: 'Culture de xéranthèmes', es: 'Cultivo de siemprevivas' } },
  { name: 'Xeriscaping', category: 'Wellness & Creative Arts', translations: { de: 'Xeriscaping', fr: 'Xériscaping', es: 'Xerojardinería' } },
  { name: 'Xerography (Art)', category: 'Wellness & Creative Arts', translations: { de: 'Xerographie (Kunst)', fr: 'Xérographie (Art)', es: 'Xerografía (Arte)' } },
  { name: 'Xiphos Sword Fighting', category: 'Wellness & Creative Arts', translations: { de: 'Xiphos-Schwertkampf', fr: 'Combat à l\'épée xiphos', es: 'Lucha con espada xifos' } },
  { name: 'Xylography', category: 'Wellness & Creative Arts', translations: { de: 'Xylographie', fr: 'Xylographie', es: 'Xilografía' } },
  { name: 'Xylophone Playing', category: 'Wellness & Creative Arts', translations: { de: 'Xylophon spielen', fr: 'Jeu du xylophone', es: 'Tocar el xilófono' } },
  { name: 'Xylorimba Playing', category: 'Wellness & Creative Arts', translations: { de: 'Xylorimba spielen', fr: 'Jeu du xylorimba', es: 'Tocar la xilorimba' } },
  { name: 'Xylotomy (Wood Study)', category: 'Wellness & Creative Arts', translations: { de: 'Xylotomie (Holzkunde)', fr: 'Xylotomie (Étude du bois)', es: 'Xilotomía (Estudio de la madera)' } },
  { name: 'Xenobiology (Creative)', category: 'Wellness & Creative Arts', translations: { de: 'Xenobiologie (Kreativ)', fr: 'Xénobiologie (Créatif)', es: 'Xenobiología (Creativa)' } },
  { name: 'Xenoculture Studies', category: 'Wellness & Creative Arts', translations: { de: 'Studium fremder Kulturen', fr: 'Études des cultures étrangères', es: 'Estudios de xenoculturas' } },
  { name: 'Xenon Lighting Design', category: 'Wellness & Creative Arts', translations: { de: 'Xenon-Lichtdesign', fr: 'Conception d\'éclairage au xénon', es: 'Diseño de iluminación de xenón' } },
  { name: 'Xerophyte Identification', category: 'Wellness & Creative Arts', translations: { de: 'Identifizierung von Xerophyten', fr: 'Identification des xérophytes', es: 'Identificación de xerófitas' } },
  { name: 'X-Plane Simulation', category: 'Wellness & Creative Arts', translations: { de: 'X-Plane-Simulation', fr: 'Simulation sur X-Plane', es: 'Simulación en X-Plane' } },
  { name: 'Extreme Sports', category: 'Wellness & Creative Arts', translations: { de: 'Extremsport', fr: 'Sports extrêmes', es: 'Deportes extremos' } },
  { name: 'Xylothemelum (Woodwind Instrument)', category: 'Wellness & Creative Arts', translations: { de: 'Xylothemelum (Holzblasinstrument)', fr: 'Xylothemelum (Instrument à vent)', es: 'Xylothemelum (Instrumento de viento)' } },
  { name: 'Xyston (Lance) Training', category: 'Wellness & Creative Arts', translations: { de: 'Xyston-Lanzentraining', fr: 'Entraînement au xyston (lance)', es: 'Entrenamiento con xyston (lanza)' } },
  { name: 'Xenarthra Study', category: 'Wellness & Creative Arts', translations: { de: 'Studium der Nebengelenktiere', fr: 'Étude des xénarthres', es: 'Estudio de los Xenarthra' } },
  { name: 'Xenotransplantation (Ethical Study)', category: 'Wellness & Creative Arts', translations: { de: 'Xenotransplantation (Ethische Studie)', fr: 'Xénotransplantation (Étude éthique)', es: 'Xenotrasplante (Estudio ético)' } },
  { name: 'Xiphias (Swordfish) Tracking', category: 'Wellness & Creative Arts', translations: { de: 'Schwertfisch-Tracking', fr: 'Suivi de l\'espadon (Xiphias)', es: 'Seguimiento del pez espada (Xiphias)' } },
  { name: 'Xenopus (Frog) Husbandry', category: 'Wellness & Creative Arts', translations: { de: 'Haltung von Krallenfröschen', fr: 'Élevage de xénopes', es: 'Cuidado de ranas Xenopus' } },
  { name: 'Experimental Art', category: 'Wellness & Creative Arts', translations: { de: 'Experimentelle Kunst', fr: 'Art expérimental', es: 'Arte experimental' } },
  { name: 'Experimental Music', category: 'Wellness & Creative Arts', translations: { de: 'Experimentelle Musik', fr: 'Musique expérimentale', es: 'Música experimental' } },
  { name: 'Exercise Physiology', category: 'Wellness & Creative Arts', translations: { de: 'Trainingsphysiologie', fr: 'Physiologie de l\'exercice', es: 'Fisiología del ejercicio' } },
  { name: 'Experiential Travel', category: 'Wellness & Creative Arts', translations: { de: 'Erlebnisreisen', fr: 'Voyage expérientiel', es: 'Viaje experiencial' } },
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