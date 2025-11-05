// scripts/seedSkills_J.js

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
// A list of general and specific coaching-related skills starting with 'J'.
const dataToUpload = [
  // --- Business & Finance ---
  { name: 'Jira', category: 'Business & Finance', translations: { de: 'Jira', fr: 'Jira', es: 'Jira' } },
  { name: 'Job Analysis', category: 'Business & Finance', translations: { de: 'Jobanalyse', fr: 'Analyse de poste', es: 'Análisis de puestos' } },
  { name: 'Job Costing', category: 'Business & Finance', translations: { de: 'Auftragskalkulation', fr: 'Calcul des coûts par commande', es: 'Costeo por trabajos' } },
  { name: 'Job Description Writing', category: 'Business & Finance', translations: { de: 'Verfassen von Stellenbeschreibungen', fr: 'Rédaction de descriptions de poste', es: 'Redacción de descripciones de puestos' } },
  { name: 'Job Rotation Programs', category: 'Business & Finance', translations: { de: 'Job-Rotationsprogramme', fr: 'Programmes de rotation des postes', es: 'Programas de rotación de puestos' } },
  { name: 'Job Shadowing', category: 'Business & Finance', translations: { de: 'Job Shadowing (Hospitation)', fr: 'Observation en milieu de travail', es: 'Observación de puestos de trabajo' } },
  { name: 'Joint Ventures', category: 'Business & Finance', translations: { de: 'Joint Ventures', fr: 'Coentreprises', es: 'Empresas conjuntas' } },
  { name: 'Journal Entries', category: 'Business & Finance', translations: { de: 'Buchungssätze', fr: 'Écritures de journal', es: 'Asientos contables' } },
  { name: 'Journalism', category: 'Business & Finance', translations: { de: 'Journalismus', fr: 'Journalisme', es: 'Periodismo' } },
  { name: 'Just-in-Time (JIT) Manufacturing', category: 'Business & Finance', translations: { de: 'Just-in-Time (JIT) Fertigung', fr: 'Production juste-à-temps (JAT)', es: 'Producción justo a tiempo (JIT)' } },
  
  // --- Leadership & Management ---
  { name: 'Job Crafting', category: 'Leadership & Management', translations: { de: 'Job Crafting', fr: 'Job crafting', es: 'Job crafting' } },
  { name: 'Job Design', category: 'Leadership & Management', translations: { de: 'Arbeitsgestaltung', fr: 'Conception de poste', es: 'Diseño de puestos' } },
  { name: 'Joint Problem Solving', category: 'Leadership & Management', translations: { de: 'Gemeinsame Problemlösung', fr: 'Résolution de problèmes conjointe', es: 'Resolución conjunta de problemas' } },
  { name: 'Judgment', category: 'Leadership & Management', translations: { de: 'Urteilsvermögen', fr: 'Jugement', es: 'Juicio' } },
  { name: 'Judicial Process', category: 'Leadership & Management', translations: { de: 'Gerichtsverfahren', fr: 'Processus judiciaire', es: 'Proceso judicial' } },
  { name: 'Juggling Multiple Projects', category: 'Leadership & Management', translations: { de: 'Jonglieren mehrerer Projekte', fr: 'Jongler avec plusieurs projets', es: 'Malabarismo con múltiples proyectos' } },
  { name: 'Just Culture Implementation', category: 'Leadership & Management', translations: { de: 'Implementierung einer Just-Kultur', fr: 'Mise en place d\'une culture juste', es: 'Implementación de una cultura justa' } },

  // --- Communication & Interpersonal ---
  { name: 'Japanese', category: 'Communication & Interpersonal', translations: { de: 'Japanisch', fr: 'Japonais', es: 'Japonés' } },
  { name: 'Jargon-Free Communication', category: 'Communication & Interpersonal', translations: { de: 'Jargonfreie Kommunikation', fr: 'Communication sans jargon', es: 'Comunicación sin jerga' } },
  { name: 'Joke Telling', category: 'Communication & Interpersonal', translations: { de: 'Witzeerzählen', fr: 'Raconter des blagues', es: 'Contar chistes' } },
  { name: 'Journalistic Writing', category: 'Communication & Interpersonal', translations: { de: 'Journalistisches Schreiben', fr: 'Écriture journalistique', es: 'Escritura periodística' } },

  // --- Analytical & Technical ---
  { name: 'Java', category: 'Analytical & Technical', translations: { de: 'Java', fr: 'Java', es: 'Java' } },
  { name: 'JavaScript', category: 'Analytical & Technical', translations: { de: 'JavaScript', fr: 'JavaScript', es: 'JavaScript' } },
  { name: 'Jasmine Framework', category: 'Analytical & Technical', translations: { de: 'Jasmine Framework', fr: 'Framework Jasmine', es: 'Framework Jasmine' } },
  { name: 'Jenkins', category: 'Analytical & Technical', translations: { de: 'Jenkins', fr: 'Jenkins', es: 'Jenkins' } },
  { name: 'Jest', category: 'Analytical & Technical', translations: { de: 'Jest', fr: 'Jest', es: 'Jest' } },
  { name: 'JMeter', category: 'Analytical & Technical', translations: { de: 'JMeter', fr: 'JMeter', es: 'JMeter' } },
  { name: 'jQuery', category: 'Analytical & Technical', translations: { de: 'jQuery', fr: 'jQuery', es: 'jQuery' } },
  { name: 'JQL (Jira Query Language)', category: 'Analytical & Technical', translations: { de: 'JQL (Jira Query Language)', fr: 'JQL (Jira Query Language)', es: 'JQL (Jira Query Language)' } },
  { name: 'JSON', category: 'Analytical & Technical', translations: { de: 'JSON', fr: 'JSON', es: 'JSON' } },
  { name: 'JSON Web Tokens (JWT)', category: 'Analytical & Technical', translations: { de: 'JSON Web Tokens (JWT)', fr: 'Jetons Web JSON (JWT)', es: 'Tokens Web JSON (JWT)' } },
  { name: 'JSP (JavaServer Pages)', category: 'Analytical & Technical', translations: { de: 'JSP (JavaServer Pages)', fr: 'JSP (JavaServer Pages)', es: 'JSP (JavaServer Pages)' } },
  { name: 'JUnit', category: 'Analytical & Technical', translations: { de: 'JUnit', fr: 'JUnit', es: 'JUnit' } },
  { name: 'Jupyter Notebooks', category: 'Analytical & Technical', translations: { de: 'Jupyter Notebooks', fr: 'Cahiers Jupyter', es: 'Cuadernos Jupyter' } },
  
  // --- Personal Development & Mindset ---
  { name: 'Joining Communities', category: 'Personal Development & Mindset', translations: { de: 'Gemeinschaften beitreten', fr: 'Rejoindre des communautés', es: 'Unirse a comunidades' } },
  { name: 'Journey Mapping', category: 'Personal Development & Mindset', translations: { de: 'Journey Mapping', fr: 'Cartographie du parcours', es: 'Mapeo del viaje' } },
  { name: 'Joy', category: 'Personal Development & Mindset', translations: { de: 'Freude', fr: 'Joie', es: 'Alegría' } },
  { name: 'Joyful Living', category: 'Personal Development & Mindset', translations: { de: 'Freudvolles Leben', fr: 'Vivre dans la joie', es: 'Vida alegre' } },
  { name: 'Judgment Detox', category: 'Personal Development & Mindset', translations: { de: 'Urteils-Detox', fr: 'Détox du jugement', es: 'Desintoxicación del juicio' } },
  { name: 'Justice (as a value)', category: 'Personal Development & Mindset', translations: { de: 'Gerechtigkeit (als Wert)', fr: 'Justice (en tant que valeur)', es: 'Justicia (como valor)' } },
  { name: 'Joviality', category: 'Personal Development & Mindset', translations: { de: 'Frohsinn', fr: 'Jovialité', es: 'Jovialidad' } },

  // --- Wellness & Creative Arts ---
  { name: 'Jam Sessions (Music)', category: 'Wellness & Creative Arts', translations: { de: 'Jam-Sessions (Musik)', fr: 'Jam sessions (musique)', es: 'Jam sessions (música)' } },
  { name: 'Japanese Calligraphy (Shodo)', category: 'Wellness & Creative Arts', translations: { de: 'Japanische Kalligraphie (Shodo)', fr: 'Calligraphie japonaise (Shodo)', es: 'Caligrafía japonesa (Shodo)' } },
  { name: 'Japanese Cuisine', category: 'Wellness & Creative Arts', translations: { de: 'Japanische Küche', fr: 'Cuisine japonaise', es: 'Cocina japonesa' } },
  { name: 'Jazz Dance', category: 'Wellness & Creative Arts', translations: { de: 'Jazztanz', fr: 'Danse jazz', es: 'Danza jazz' } },
  { name: 'Jazz Music', category: 'Wellness & Creative Arts', translations: { de: 'Jazzmusik', fr: 'Musique de jazz', es: 'Música de jazz' } },
  { name: 'Jet Skiing', category: 'Wellness & Creative Arts', translations: { de: 'Jetski fahren', fr: 'Jet ski', es: 'Moto acuática' } },
  { name: 'Jewelry Making', category: 'Wellness & Creative Arts', translations: { de: 'Schmuckherstellung', fr: 'Création de bijoux', es: 'Fabricación de joyas' } },
  { name: 'Jigsaw Puzzles', category: 'Wellness & Creative Arts', translations: { de: 'Puzzles', fr: 'Puzzles', es: 'Rompecabezas' } },
  { name: 'Jiu-Jitsu', category: 'Wellness & Creative Arts', translations: { de: 'Jiu-Jitsu', fr: 'Jiu-jitsu', es: 'Jiu-jitsu' } },
  { name: 'Jive Dancing', category: 'Wellness & Creative Arts', translations: { de: 'Jive-Tanz', fr: 'Danse Jive', es: 'Baile Jive' } },
  { name: 'Jogging', category: 'Wellness & Creative Arts', translations: { de: 'Joggen', fr: 'Jogging', es: 'Trote' } },
  { name: 'Journaling', category: 'Wellness & Creative Arts', translations: { de: 'Tagebuchschreiben', fr: 'Tenue d\'un journal', es: 'Escribir un diario' } },
  { name: 'Judo', category: 'Wellness & Creative Arts', translations: { de: 'Judo', fr: 'Judo', es: 'Judo' } },
  { name: 'Juicing', category: 'Wellness & Creative Arts', translations: { de: 'Entsaften', fr: 'Extraction de jus', es: 'Extracción de jugos' } },
  { name: 'Juggling', category: 'Wellness & Creative Arts', translations: { de: 'Jonglieren', fr: 'Jonglerie', es: 'Malabarismo' } },
  { name: 'Jump Rope', category: 'Wellness & Creative Arts', translations: { de: 'Seilspringen', fr: 'Corde à sauter', es: 'Salto de cuerda' } },
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