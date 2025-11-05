// scripts/seedSkills_O.js

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
// A list of 60 general and specific coaching-related skills starting with 'O'.
const dataToUpload = [
  // --- Leadership & Management ---
  { name: 'Objective Setting', category: 'Leadership & Management', translations: { de: 'Zielsetzung', fr: 'Définition d\'objectifs', es: 'Establecimiento de objetivos' } },
  { name: 'OKR (Objectives and Key Results)', category: 'Leadership & Management', translations: { de: 'OKR (Objectives and Key Results)', fr: 'OKR (Objectifs et résultats clés)', es: 'OKR (Objetivos y resultados clave)' } },
  { name: 'Onboarding', category: 'Leadership & Management', translations: { de: 'Onboarding', fr: 'Intégration', es: 'Incorporación' } },
  { name: 'Operational Excellence', category: 'Leadership & Management', translations: { de: 'Operationelle Exzellenz', fr: 'Excellence opérationnelle', es: 'Excelencia operacional' } },
  { name: 'Operational Planning', category: 'Leadership & Management', translations: { de: 'Operative Planung', fr: 'Planification opérationnelle', es: 'Planificación operativa' } },
  { name: 'Operations Management', category: 'Leadership & Management', translations: { de: 'Betriebsmanagement', fr: 'Gestion des opérations', es: 'Gestión de operaciones' } },
  { name: 'Orchestration', category: 'Leadership & Management', translations: { de: 'Orchestrierung', fr: 'Orchestration', es: 'Orquestación' } },
  { name: 'Organizational Design', category: 'Leadership & Management', translations: { de: 'Organisationsgestaltung', fr: 'Conception organisationnelle', es: 'Diseño organizacional' } },
  { name: 'Organizational Development', category: 'Leadership & Management', translations: { de: 'Organisationsentwicklung', fr: 'Développement organisationnel', es: 'Desarrollo organizacional' } },
  { name: 'Organizational Leadership', category: 'Leadership & Management', translations: { de: 'Organisatorische Führung', fr: 'Leadership organisationnel', es: 'Liderazgo organizacional' } },
  { name: 'Overseeing Projects', category: 'Leadership & Management', translations: { de: 'Projektüberwachung', fr: 'Supervision de projets', es: 'Supervisión de proyectos' } },

  // --- Business & Finance ---
  { name: 'Office Administration', category: 'Business & Finance', translations: { de: 'Büroorganisation', fr: 'Administration de bureau', es: 'Administración de oficinas' } },
  { name: 'Omnichannel Retail', category: 'Business & Finance', translations: { de: 'Omnichannel-Einzelhandel', fr: 'Commerce de détail omnicanal', es: 'Comercio minorista omnicanal' } },
  { name: 'Online Advertising', category: 'Business & Finance', translations: { de: 'Online-Werbung', fr: 'Publicité en ligne', es: 'Publicidad en línea' } },
  { name: 'Online Marketing', category: 'Business & Finance', translations: { de: 'Online-Marketing', fr: 'Marketing en ligne', es: 'Marketing en línea' } },
  { name: 'Operating Budgets', category: 'Business & Finance', translations: { de: 'Betriebsbudgets', fr: 'Budgets de fonctionnement', es: 'Presupuestos operativos' } },
  { name: 'Options Trading', category: 'Business & Finance', translations: { de: 'Optionshandel', fr: 'Négociation d\'options', es: 'Comercio de opciones' } },
  { name: 'Order Fulfillment', category: 'Business & Finance', translations: { de: 'Auftragsabwicklung', fr: 'Exécution des commandes', es: 'Cumplimiento de pedidos' } },
  { name: 'Outsourcing', category: 'Business & Finance', translations: { de: 'Auslagerung', fr: 'Externalisation', es: 'Subcontratación' } },

  // --- Communication & Interpersonal ---
  { name: 'Objection Handling', category: 'Communication & Interpersonal', translations: { de: 'Einwandbehandlung', fr: 'Gestion des objections', es: 'Manejo de objeciones' } },
  { name: 'Offering Feedback', category: 'Communication & Interpersonal', translations: { de: 'Feedback geben', fr: 'Donner du feedback', es: 'Ofrecer retroalimentación' } },
  { name: 'Open Communication', category: 'Communication & Interpersonal', translations: { de: 'Offene Kommunikation', fr: 'Communication ouverte', es: 'Comunicación abierta' } },
  { name: 'Oral Communication', category: 'Communication & Interpersonal', translations: { de: 'Mündliche Kommunikation', fr: 'Communication orale', es: 'Comunicación oral' } },
  { name: 'Oratory', category: 'Communication & Interpersonal', translations: { de: 'Redekunst', fr: 'Art oratoire', es: 'Oratoria' } },
  { name: 'Online Presence Management', category: 'Communication & Interpersonal', translations: { de: 'Management der Online-Präsenz', fr: 'Gestion de la présence en ligne', es: 'Gestión de la presencia en línea' } },

  // --- Analytical & Technical ---
  { name: 'Object-Oriented Programming (OOP)', category: 'Analytical & Technical', translations: { de: 'Objektorientierte Programmierung (OOP)', fr: 'Programmation orientée objet (POO)', es: 'Programación orientada a objetos (POO)' } },
  { name: 'Objective-C', category: 'Analytical & Technical', translations: { de: 'Objective-C', fr: 'Objective-C', es: 'Objective-C' } },
  { name: 'Open Source Software', category: 'Analytical & Technical', translations: { de: 'Open-Source-Software', fr: 'Logiciel open source', es: 'Software de código abierto' } },
  { name: 'OpenCV', category: 'Analytical & Technical', translations: { de: 'OpenCV', fr: 'OpenCV', es: 'OpenCV' } },
  { name: 'Operating Systems', category: 'Analytical & Technical', translations: { de: 'Betriebssysteme', fr: 'Systèmes d\'exploitation', es: 'Sistemas operativos' } },
  { name: 'Optimization', category: 'Analytical & Technical', translations: { de: 'Optimierung', fr: 'Optimisation', es: 'Optimización' } },
  { name: 'Oracle Database', category: 'Analytical & Technical', translations: { de: 'Oracle-Datenbank', fr: 'Base de données Oracle', es: 'Base de datos Oracle' } },
  { name: 'Optical Character Recognition (OCR)', category: 'Analytical & Technical', translations: { de: 'Optische Zeichenerkennung (OCR)', fr: 'Reconnaissance optique de caractères (ROC)', es: 'Reconocimiento óptico de caracteres (OCR)' } },

  // --- Personal Development & Mindset ---
  { name: 'Observational Skills', category: 'Personal Development & Mindset', translations: { de: 'Beobachtungsgabe', fr: 'Capacité d\'observation', es: 'Habilidades de observación' } },
  { name: 'Ontology', category: 'Personal Development & Mindset', translations: { de: 'Ontologie', fr: 'Ontologie', es: 'Ontología' } },
  { name: 'Open-mindedness', category: 'Personal Development & Mindset', translations: { de: 'Aufgeschlossenheit', fr: 'Ouverture d\'esprit', es: 'Mente abierta' } },
  { name: 'Optimism', category: 'Personal Development & Mindset', translations: { de: 'Optimismus', fr: 'Optimisme', es: 'Optimismo' } },
  { name: 'Orderliness', category: 'Personal Development & Mindset', translations: { de: 'Ordentlichkeit', fr: 'Ordre', es: 'Orden' } },
  { name: 'Organizational Skills', category: 'Personal Development & Mindset', translations: { de: 'Organisationsfähigkeit', fr: 'Compétences organisationnelles', es: 'Habilidades de organización' } },
  { name: 'Originality', category: 'Personal Development & Mindset', translations: { de: 'Originalität', fr: 'Originalité', es: 'Originalidad' } },
  { name: 'Overcoming Obstacles', category: 'Personal Development & Mindset', translations: { de: 'Überwindung von Hindernissen', fr: 'Surmonter les obstacles', es: 'Superación de obstáculos' } },
  { name: 'Overcoming Procrastination', category: 'Personal Development & Mindset', translations: { de: 'Überwindung von Prokrastination', fr: 'Vaincre la procrastination', es: 'Superar la procrastinación' } },
  { name: 'Ownership', category: 'Personal Development & Mindset', translations: { de: 'Eigenverantwortung', fr: 'Prise de responsabilité', es: 'Responsabilidad' } },

  // --- Wellness & Creative Arts ---
  { name: 'Oceanography', category: 'Wellness & Creative Arts', translations: { de: 'Ozeanographie', fr: 'Océanographie', es: 'Oceanografía' } },
  { name: 'Oil Painting', category: 'Wellness & Creative Arts', translations: { de: 'Ölmalerei', fr: 'Peinture à l\'huile', es: 'Pintura al óleo' } },
  { name: 'Orchestra Conducting', category: 'Wellness & Creative Arts', translations: { de: 'Orchesterdirigieren', fr: 'Direction d\'orchestre', es: 'Dirección de orquesta' } },
  { name: 'Organic Gardening', category: 'Wellness & Creative Arts', translations: { de: 'Biogärtnern', fr: 'Jardinage biologique', es: 'Jardinería orgánica' } },
  { name: 'Organizing Spaces', category: 'Wellness & Creative Arts', translations: { de: 'Räume organisieren', fr: 'Organisation d\'espaces', es: 'Organización de espacios' } },
  { name: 'Origami', category: 'Wellness & Creative Arts', translations: { de: 'Origami', fr: 'Origami', es: 'Origami' } },
  { name: 'Orienteering', category: 'Wellness & Creative Arts', translations: { de: 'Orientierungslauf', fr: 'Course d\'orientation', es: 'Orientación' } },
  { name: 'Ornithology', category: 'Wellness & Creative Arts', translations: { de: 'Ornithologie', fr: 'Ornithologie', es: 'Ornitología' } },
  { name: 'Osteopathy', category: 'Wellness & Creative Arts', translations: { de: 'Osteopathie', fr: 'Ostéopathie', es: 'Osteopatía' } },
  { name: 'Outdoor Survival', category: 'Wellness & Creative Arts', translations: { de: 'Überleben in der Wildnis', fr: 'Survie en plein air', es: 'Supervivencia al aire libre' } },
  { name: 'Online Gaming', category: 'Wellness & Creative Arts', translations: { de: 'Online-Gaming', fr: 'Jeu en ligne', es: 'Juegos en línea' } },
  { name: 'Opera Singing', category: 'Wellness & Creative Arts', translations: { de: 'Operngesang', fr: 'Chant d\'opéra', es: 'Canto de ópera' } },
  { name: 'Oenology (Wine Study)', category: 'Wellness & Creative Arts', translations: { de: 'Önologie (Weinlehre)', fr: 'Œnologie (Étude du vin)', es: 'Enología (Estudio del vino)' } },
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