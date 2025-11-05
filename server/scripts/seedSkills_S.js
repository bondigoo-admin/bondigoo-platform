// scripts/seedSkills_S.js

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
// A list of 60 general and specific coaching-related skills starting with 'S'.
const dataToUpload = [
  // --- Leadership & Management ---
  { name: 'Scheduling', category: 'Leadership & Management', translations: { de: 'Terminplanung', fr: 'Planification', es: 'Programación' } },
  { name: 'Servant Leadership', category: 'Leadership & Management', translations: { de: 'Dienende Führung', fr: 'Leadership serviteur', es: 'Liderazgo de servicio' } },
  { name: 'Situational Leadership', category: 'Leadership & Management', translations: { de: 'Situative Führung', fr: 'Leadership situationnel', es: 'Liderazgo situacional' } },
  { name: 'Staff Development', category: 'Leadership & Management', translations: { de: 'Mitarbeiterentwicklung', fr: 'Développement du personnel', es: 'Desarrollo de personal' } },
  { name: 'Stakeholder Management', category: 'Leadership & Management', translations: { de: 'Stakeholder-Management', fr: 'Gestion des parties prenantes', es: 'Gestión de las partes interesadas' } },
  { name: 'Strategic Leadership', category: 'Leadership & Management', translations: { de: 'Strategische Führung', fr: 'Leadership stratégique', es: 'Liderazgo estratégico' } },
  { name: 'Strategic Planning', category: 'Leadership & Management', translations: { de: 'Strategische Planung', fr: 'Planification stratégique', es: 'Planificación estratégica' } },
  { name: 'Strategic Thinking', category: 'Leadership & Management', translations: { de: 'Strategisches Denken', fr: 'Pensée stratégique', es: 'Pensamiento estratégico' } },
  { name: 'Succession Planning', category: 'Leadership & Management', translations: { de: 'Nachfolgeplanung', fr: 'Planification de la relève', es: 'Planificación de la sucesión' } },
  { name: 'Supervisory Skills', category: 'Leadership & Management', translations: { de: 'Führungskompetenzen', fr: 'Compétences de supervision', es: 'Habilidades de supervisión' } },
  { name: 'Systems Thinking', category: 'Leadership & Management', translations: { de: 'Systemdenken', fr: 'Pensée systémique', es: 'Pensamiento sistémico' } },
  
  // --- Business & Finance ---
  { name: 'Sales', category: 'Business & Finance', translations: { de: 'Vertrieb', fr: 'Ventes', es: 'Ventas' } },
  { name: 'Sales Management', category: 'Business & Finance', translations: { de: 'Vertriebsleitung', fr: 'Gestion des ventes', es: 'Gestión de ventas' } },
  { name: 'Salesforce', category: 'Business & Finance', translations: { de: 'Salesforce', fr: 'Salesforce', es: 'Salesforce' } },
  { name:- 'SAP', category: 'Business & Finance', translations: { de: 'SAP', fr: 'SAP', es: 'SAP' } },
  { name: 'Search Engine Optimization (SEO)', category: 'Business & Finance', translations: { de: 'Suchmaschinenoptimierung (SEO)', fr: 'Optimisation pour les moteurs de recherche (SEO)', es: 'Optimización para motores de búsqueda (SEO)' } },
  { name: 'Social Media Marketing', category: 'Business & Finance', translations: { de: 'Social-Media-Marketing', fr: 'Marketing des médias sociaux', es: 'Marketing en redes sociales' } },
  { name: 'Software as a Service (SaaS)', category: 'Business & Finance', translations: { de: 'Software as a Service (SaaS)', fr: 'Logiciel en tant que service (SaaS)', es: 'Software como servicio (SaaS)' } },
  { name: 'Start-ups', category: 'Business & Finance', translations: { de: 'Start-ups', fr: 'Start-ups', es: 'Startups' } },
  { name: 'Stock Market Analysis', category: 'Business & Finance', translations: { de: 'Börsenanalyse', fr: 'Analyse boursière', es: 'Análisis del mercado de valores' } },
  { name: 'Strategic Sourcing', category: 'Business & Finance', translations: { de: 'Strategische Beschaffung', fr: 'Approvisionnement stratégique', es: 'Abastecimiento estratégico' } },
  { name: 'Supply Chain Management', category: 'Business & Finance', translations: { de: 'Lieferkettenmanagement', fr: 'Gestion de la chaîne d\'approvisionnement', es: 'Gestión de la cadena de suministro' } },

  // --- Communication & Interpersonal ---
  { name: 'Small Talk', category: 'Communication & Interpersonal', translations: { de: 'Small Talk', fr: 'Petite conversation', es: 'Charla trivial' } },
  { name: 'Social Skills', category: 'Communication & Interpersonal', translations: { de: 'Soziale Kompetenzen', fr: 'Compétences sociales', es: 'Habilidades sociales' } },
  { name: 'Speech Writing', category: 'Communication & Interpersonal', translations: { de: 'Redenschreiben', fr: 'Rédaction de discours', es: 'Redacción de discursos' } },
  { name: 'Storytelling', category: 'Communication & Interpersonal', translations: { de: 'Geschichtenerzählen', fr: 'Narration', es: 'Narración de historias' } },
  { name: 'Summarizing', category: 'Communication & Interpersonal', translations: { de: 'Zusammenfassen', fr: 'Résumer', es: 'Resumir' } },

  // --- Analytical & Technical ---
  { name: 'Scrum', category: 'Analytical & Technical', translations: { de: 'Scrum', fr: 'Scrum', es: 'Scrum' } },
  { name: 'Shell Scripting', category: 'Analytical & Technical', translations: { de: 'Shell-Skripting', fr: 'Scripting Shell', es: 'Scripting de shell' } },
  { name: 'Software Development', category: 'Analytical & Technical', translations: { de: 'Softwareentwicklung', fr: 'Développement de logiciels', es: 'Desarrollo de software' } },
  { name: 'Software Testing', category: 'Analytical & Technical', translations: { de: 'Softwaretests', fr: 'Test de logiciels', es: 'Pruebas de software' } },
  { name: 'SQL', category: 'Analytical & Technical', translations: { de: 'SQL', fr: 'SQL', es: 'SQL' } },
  { name: 'Statistical Analysis', category: 'Analytical & Technical', translations: { de: 'Statistische Analyse', fr: 'Analyse statistique', es: 'Análisis estadístico' } },
  { name: 'Statistics', category: 'Analytical & Technical', translations: { de: 'Statistik', fr: 'Statistiques', es: 'Estadística' } },
  { name: 'Swift (Programming Language)', category: 'Analytical & Technical', translations: { de: 'Swift (Programmiersprache)', fr: 'Swift (Langage de programmation)', es: 'Swift (Lenguaje de programación)' } },
  { name: 'System Administration', category: 'Analytical & Technical', translations: { de: 'Systemadministration', fr: 'Administration système', es: 'Administración de sistemas' } },

  // --- Personal Development & Mindset ---
  { name: 'Self-Awareness', category: 'Personal Development & Mindset', translations: { de: 'Selbstwahrnehmung', fr: 'Conscience de soi', es: 'Autoconciencia' } },
  { name: 'Self-Care', category: 'Personal Development & Mindset', translations: { de: 'Selbstfürsorge', fr: 'Soins personnels', es: 'Autocuidado' } },
  { name: 'Self-Confidence', category: 'Personal Development & Mindset', translations: { de: 'Selbstvertrauen', fr: 'Confiance en soi', es: 'Autoconfianza' } },
  { name: 'Self-Discipline', category: 'Personal Development & Mindset', translations: { de: 'Selbstdisziplin', fr: 'Autodiscipline', es: 'Autodisciplina' } },
  { name: 'Self-Esteem', category: 'Personal Development & Mindset', translations: { de: 'Selbstwertgefühl', fr: 'Estime de soi', es: 'Autoestima' } },
  { name: 'Self-Leadership', category: 'Personal Development & Mindset', translations: { de: 'Selbstführung', fr: 'Auto-leadership', es: 'Autoliderazgo' } },
  { name: 'Self-Reflection', category: 'Personal Development & Mindset', translations: { de: 'Selbstreflexion', fr: 'Autoréflexion', es: 'Autorreflexión' } },
  { name: 'Setting Boundaries', category: 'Personal Development & Mindset', translations: { de: 'Grenzen setzen', fr: 'Poser des limites', es: 'Establecer límites' } },
  { name: 'Shadow Work', category: 'Personal Development & Mindset', translations: { de: 'Schattenarbeit', fr: 'Travail de l\'ombre', es: 'Trabajo de sombras' } },
  { name: 'Spirituality', category: 'Personal Development & Mindset', translations: { de: 'Spiritualität', fr: 'Spiritualité', es: 'Espiritualidad' } },
  { name: 'Stress Management', category: 'Personal Development & Mindset', translations: { de: 'Stressbewältigung', fr: 'Gestion du stress', es: 'Gestión del estrés' } },
  { name: 'Somatic Coaching', category: 'Personal Development & Mindset', translations: { de: 'Somatisches Coaching', fr: 'Coaching somatique', es: 'Coaching somático' } },

  // --- Wellness & Creative Arts ---
  { name: 'Salsa Dancing', category: 'Wellness & Creative Arts', translations: { de: 'Salsa tanzen', fr: 'Danse salsa', es: 'Baile de salsa' } },
  { name: 'Sailing', category: 'Wellness & Creative Arts', translations: { de: 'Segeln', fr: 'Voile', es: 'Navegación a vela' } },
  { name: 'Scuba Diving', category: 'Wellness & Creative Arts', translations: { de: 'Gerätetauchen', fr: 'Plongée sous-marine', es: 'Buceo' } },
  { name: 'Sculpting', category: 'Wellness & Creative Arts', translations: { de: 'Bildhauerei', fr: 'Sculpture', es: 'Escultura' } },
  { name: 'Singing', category: 'Wellness & Creative Arts', translations: { de: 'Singen', fr: 'Chant', es: 'Canto' } },
  { name: 'Sketching', category: 'Wellness & Creative Arts', translations: { de: 'Skizzieren', fr: 'Esquisse', es: 'Dibujo de bocetos' } },
  { name: 'Skiing', category: 'Wellness & Creative Arts', translations: { de: 'Skifahren', fr: 'Ski', es: 'Esquí' } },
  { name: 'Songwriting', category: 'Wellness & Creative Arts', translations: { de: 'Songwriting', fr: 'Écriture de chansons', es: 'Composición de canciones' } },
  { name: 'Sound Healing', category: 'Wellness & Creative Arts', translations: { de: 'Klangheilung', fr: 'Guérison par le son', es: 'Sanación con sonido' } },
  { name: 'Surfing', category: 'Wellness & Creative Arts', translations: { de: 'Surfen', fr: 'Surf', es: 'Surf' } },
  { name: 'Swimming', category: 'Wellness & Creative Arts', translations: { de: 'Schwimmen', fr: 'Natation', es: 'Natación' } },
  { name: 'Shamanism', category: 'Wellness & Creative Arts', translations: { de: 'Schamanismus', fr: 'Chamanisme', es: 'Chamanismo' } },
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