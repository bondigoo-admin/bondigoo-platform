// scripts/seedSkills_Z.js

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
// A list of 60 general and specific coaching-related skills starting with 'Z'.
const dataToUpload = [
  // --- Business & Finance ---
  { name: 'Zero-Based Budgeting (ZBB)', category: 'Business & Finance', translations: { de: 'Nullbasierte Budgetierung (ZBB)', fr: 'Budget base zéro (BBZ)', es: 'Presupuesto base cero (PBC)' } },
  { name: 'Zoning Laws', category: 'Business & Finance', translations: { de: 'Baurecht', fr: 'Lois de zonage', es: 'Leyes de zonificación' } },
  { name: 'Zero-Sum Game Analysis', category: 'Business & Finance', translations: { de: 'Nullsummenspiel-Analyse', fr: 'Analyse de jeu à somme nulle', es: 'Análisis de juegos de suma cero' } },
  { name: 'Zip Code Analysis', category: 'Business & Finance', translations: { de: 'Postleitzahlenanalyse', fr: 'Analyse par code postal', es: 'Análisis de códigos postales' } },
  { name: 'Z-Score (Bankruptcy Prediction)', category: 'Business & Finance', translations: { de: 'Z-Score (Insolvenzprognose)', fr: 'Score Z (Prédiction de faillite)', es: 'Puntuación Z (Predicción de quiebra)' } },
  { name: 'Zendesk Administration', category: 'Business & Finance', translations: { de: 'Zendesk-Administration', fr: 'Administration de Zendesk', es: 'Administración de Zendesk' } },
  { name: 'Zoho CRM', category: 'Business & Finance', translations: { de: 'Zoho CRM', fr: 'Zoho CRM', es: 'Zoho CRM' } },
  { name: 'Zero-Click Search Strategy (SEO)', category: 'Business & Finance', translations: { de: 'Zero-Click-Suchstrategie (SEO)', fr: 'Stratégie de recherche sans clic (SEO)', es: 'Estrategia de búsqueda sin clic (SEO)' } },
  { name: 'Zero Trust Security Model', category: 'Business & Finance', translations: { de: 'Zero-Trust-Sicherheitsmodell', fr: 'Modèle de sécurité Zero Trust', es: 'Modelo de seguridad de confianza cero' } },
  { name: 'Zone Pricing', category: 'Business & Finance', translations: { de: 'Zonenpreisgestaltung', fr: 'Tarification par zone', es: 'Fijación de precios por zona' } },

  // --- Leadership & Management ---
  { name: 'Zero-Tolerance Policies', category: 'Leadership & Management', translations: { de: 'Null-Toleranz-Politik', fr: 'Politiques de tolérance zéro', es: 'Políticas de tolerancia cero' } },
  { name: 'Zone Management', category: 'Leadership & Management', translations: { de: 'Zonenmanagement', fr: 'Gestion de zone', es: 'Gestión de zonas' } },
  { name: 'Zero Defects Culture', category: 'Leadership & Management', translations: { de: 'Null-Fehler-Kultur', fr: 'Culture zéro défaut', es: 'Cultura de cero defectos' } },
  { name: 'Zero Latency Communication', category: 'Leadership & Management', translations: { de: 'Verzögerungsfreie Kommunikation', fr: 'Communication à latence nulle', es: 'Comunicación de latencia cero' } },
  { name: 'Zone Defense Strategy (Business)', category: 'Leadership & Management', translations: { de: 'Zonenverteidigungsstrategie (Wirtschaft)', fr: 'Stratégie de défense de zone (Affaires)', es: 'Estrategia de defensa zonal (Negocios)' } },
  { name: 'Zeal Cultivation in Teams', category: 'Leadership & Management', translations: { de: 'Förderung von Eifer in Teams', fr: 'Cultiver le zèle dans les équipes', es: 'Cultivo del celo en equipos' } },
  { name: 'Zone of Control Management', category: 'Leadership & Management', translations: { de: 'Management der Kontrollzone', fr: 'Gestion de la zone de contrôle', es: 'Gestión de la zona de control' } },
  { name: 'Zero-Based Decision Making', category: 'Leadership & Management', translations: { de: 'Nullbasierte Entscheidungsfindung', fr: 'Prise de décision à base zéro', es: 'Toma de decisiones con base cero' } },

  // --- Communication & Interpersonal ---
  { name: 'Zoom Meeting Facilitation', category: 'Communication & Interpersonal', translations: { de: 'Zoom-Meeting-Moderation', fr: 'Animation de réunions Zoom', es: 'Facilitación de reuniones de Zoom' } },
  { name: 'Zoom Etiquette', category: 'Communication & Interpersonal', translations: { de: 'Zoom-Etikette', fr: 'Étiquette sur Zoom', es: 'Etiqueta en Zoom' } },
  { name: 'Zeigarnik Effect (in communication)', category: 'Communication & Interpersonal', translations: { de: 'Zeigarnik-Effekt (in der Kommunikation)', fr: 'Effet Zeigarnik (en communication)', es: 'Efecto Zeigarnik (en la comunicación)' } },
  { name: 'Zero-based Communication (Clarity)', category: 'Communication & Interpersonal', translations: { de: 'Nullbasierte Kommunikation (Klarheit)', fr: 'Communication à base zéro (Clarté)', es: 'Comunicación de base cero (Claridad)' } },

  // --- Analytical & Technical ---
  { name: 'Z-test (Statistics)', category: 'Analytical & Technical', translations: { de: 'Z-Test (Statistik)', fr: 'Test Z (Statistiques)', es: 'Prueba Z (Estadística)' } },
  { name: 'Z-Wave (IoT Protocol)', category: 'Analytical & Technical', translations: { de: 'Z-Wave (IoT-Protokoll)', fr: 'Z-Wave (Protocole IoT)', es: 'Z-Wave (Protocolo IoT)' } },
  { name: 'ZFS (File System)', category: 'Analytical & Technical', translations: { de: 'ZFS (Dateisystem)', fr: 'ZFS (Système de fichiers)', es: 'ZFS (Sistema de archivos)' } },
  { name: 'ZBrush (3D Sculpting)', category: 'Analytical & Technical', translations: { de: 'ZBrush (3D-Modellierung)', fr: 'ZBrush (Sculpture 3D)', es: 'ZBrush (Escultura 3D)' } },
  { name: 'Zeplin (UI/UX)', category: 'Analytical & Technical', translations: { de: 'Zeplin (UI/UX)', fr: 'Zeplin (UI/UX)', es: 'Zeplin (UI/UX)' } },
  { name: 'Zabbix (Monitoring)', category: 'Analytical & Technical', translations: { de: 'Zabbix (Überwachung)', fr: 'Zabbix (Surveillance)', es: 'Zabbix (Monitoreo)' } },
  { name: 'Zigbee (IoT Protocol)', category: 'Analytical & Technical', translations: { de: 'Zigbee (IoT-Protokoll)', fr: 'Zigbee (Protocole IoT)', es: 'Zigbee (Protocolo IoT)' } },
  { name: 'Z-index (CSS)', category: 'Analytical & Technical', translations: { de: 'Z-index (CSS)', fr: 'Z-index (CSS)', es: 'Z-index (CSS)' } },
  { name: 'Zookeeper (Apache)', category: 'Analytical & Technical', translations: { de: 'Zookeeper (Apache)', fr: 'Zookeeper (Apache)', es: 'Zookeeper (Apache)' } },
  { name: 'Zig (Programming Language)', category: 'Analytical & Technical', translations: { de: 'Zig (Programmiersprache)', fr: 'Zig (Langage de programmation)', es: 'Zig (Lenguaje de programación)' } },
  { name: 'Zettlr', category: 'Analytical & Technical', translations: { de: 'Zettlr', fr: 'Zettlr', es: 'Zettlr' } },
  { name: 'Z-transform', category: 'Analytical & Technical', translations: { de: 'Z-Transformation', fr: 'Transformée en Z', es: 'Transformada Z' } },

  // --- Personal Development & Mindset ---
  { name: 'Zen', category: 'Personal Development & Mindset', translations: { de: 'Zen', fr: 'Zen', es: 'Zen' } },
  { name: 'Zest for Life', category: 'Personal Development & Mindset', translations: { de: 'Lebensfreude', fr: 'Joie de vivre', es: 'Entusiasmo por la vida' } },
  { name: 'Zone of Genius', category: 'Personal Development & Mindset', translations: { de: 'Zone der Genialität', fr: 'Zone de génie', es: 'Zona de genialidad' } },
  { name: 'Zero-Based Thinking', category: 'Personal Development & Mindset', translations: { de: 'Nullbasiertes Denken', fr: 'Pensée à base zéro', es: 'Pensamiento de base cero' } },
  { name: 'Zero Waste Living', category: 'Personal Development & Mindset', translations: { de: 'Zero-Waste-Lebensstil', fr: 'Mode de vie zéro déchet', es: 'Vida sin residuos' } },
  { name: 'Zen Coaching', category: 'Personal Development & Mindset', translations: { de: 'Zen-Coaching', fr: 'Coaching zen', es: 'Coaching zen' } },
  { name: 'Zen Philosophy', category: 'Personal Development & Mindset', translations: { de: 'Zen-Philosophie', fr: 'Philosophie zen', es: 'Filosofía zen' } },
  { name: 'Zone of Proximal Development', category: 'Personal Development & Mindset', translations: { de: 'Zone der proximalen Entwicklung', fr: 'Zone proximale de développement', es: 'Zona de desarrollo próximo' } },
  { name: 'Zeal', category: 'Personal Development & Mindset', translations: { de: 'Eifer', fr: 'Zèle', es: 'Celo' } },
  { name: 'Zenith Goal Setting', category: 'Personal Development & Mindset', translations: { de: 'Zenit-Zielsetzung', fr: 'Définition d\'objectifs zénith', es: 'Establecimiento de metas cenit' } },
  { name: 'Zeroing in on Priorities', category: 'Personal Development & Mindset', translations: { de: 'Auf Prioritäten konzentrieren', fr: 'Se concentrer sur les priorités', es: 'Centrarse en las prioridades' } },
  { name: 'Zealotry Awareness', category: 'Personal Development & Mindset', translations: { de: 'Bewusstsein für Fanatismus', fr: 'Conscience du zélotisme', es: 'Conciencia del fanatismo' } },
  { name: 'Zeitgeist Analysis', category: 'Personal Development & Mindset', translations: { de: 'Zeitgeistanalyse', fr: 'Analyse du Zeitgeist', es: 'Análisis del Zeitgeist' } },

  // --- Wellness & Creative Arts ---
  { name: 'Zumba', category: 'Wellness & Creative Arts', translations: { de: 'Zumba', fr: 'Zumba', es: 'Zumba' } },
  { name: 'Ziplining', category: 'Wellness & Creative Arts', translations: { de: 'Seilrutschen', fr: 'Tyrolienne', es: 'Tirolesa' } },
  { name: 'Zoology', category: 'Wellness & Creative Arts', translations: { de: 'Zoologie', fr: 'Zoologie', es: 'Zoología' } },
  { name: 'Zentangle', category: 'Wellness & Creative Arts', translations: { de: 'Zentangle', fr: 'Zentangle', es: 'Zentangle' } },
  { name: 'Zen Garden Design', category: 'Wellness & Creative Arts', translations: { de: 'Zen-Garten-Design', fr: 'Conception de jardin zen', es: 'Diseño de jardines zen' } },
  { name: 'Zither Playing', category: 'Wellness & Creative Arts', translations: { de: 'Zither spielen', fr: 'Jeu de la cithare', es: 'Tocar la cítara' } },
  { name: 'Zine Making', category: 'Wellness & Creative Arts', translations: { de: 'Zine-Herstellung', fr: 'Création de zines', es: 'Creación de fanzines' } },
  { name: 'Zouk (Dance)', category: 'Wellness & Creative Arts', translations: { de: 'Zouk (Tanz)', fr: 'Zouk (Danse)', es: 'Zouk (Baile)' } },
  { name: 'Zodiac Interpretation (Astrology)', category: 'Wellness & Creative Arts', translations: { de: 'Tierkreis-Interpretation (Astrologie)', fr: 'Interprétation du zodiaque (Astrologie)', es: 'Interpretación del zodíaco (Astrología)' } },
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