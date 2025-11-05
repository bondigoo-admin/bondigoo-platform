// scripts/seedSkills_U.js

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
// A list of 60 general and specific coaching-related skills starting with 'U'.
const dataToUpload = [
  // --- Business & Finance ---
  { name: 'Underwriting', category: 'Business & Finance', translations: { de: 'Kreditprüfung', fr: 'Souscription', es: 'Suscripción de seguros' } },
  { name: 'Unit Economics', category: 'Business & Finance', translations: { de: 'Unit Economics', fr: 'Économie unitaire', es: 'Economía de la unidad' } },
  { name: 'User Acceptance Testing (UAT)', category: 'Business & Finance', translations: { de: 'Benutzerakzeptanztests (UAT)', fr: 'Tests d\'acceptation par l\'utilisateur (UAT)', es: 'Pruebas de aceptación del usuario (UAT)' } },
  { name: 'User Experience (UX)', category: 'Business & Finance', translations: { de: 'Benutzererfahrung (UX)', fr: 'Expérience utilisateur (UX)', es: 'Experiencia de usuario (UX)' } },
  { name: 'User Experience (UX) Research', category: 'Business & Finance', translations: { de: 'UX-Forschung', fr: 'Recherche sur l\'expérience utilisateur (UX)', es: 'Investigación de experiencia de usuario (UX)' } },
  { name: 'User Interface (UI) Design', category: 'Business & Finance', translations: { de: 'Benutzeroberflächendesign (UI)', fr: 'Conception d\'interface utilisateur (UI)', es: 'Diseño de interfaz de usuario (UI)' } },
  { name: 'User Journey Mapping', category: 'Business & Finance', translations: { de: 'User Journey Mapping', fr: 'Cartographie du parcours utilisateur', es: 'Mapeo del viaje del usuario' } },
  { name: 'User Onboarding', category: 'Business & Finance', translations: { de: 'Benutzer-Onboarding', fr: 'Intégration des utilisateurs', es: 'Incorporación de usuarios' } },
  { name: 'User Personas', category: 'Business & Finance', translations: { de: 'Benutzer-Personas', fr: 'Personas utilisateur', es: 'Personas de usuario' } },
  { name: 'User Research', category: 'Business & Finance', translations: { de: 'Benutzerforschung', fr: 'Recherche utilisateur', es: 'Investigación de usuarios' } },
  { name: 'User Retention', category: 'Business & Finance', translations: { de: 'Benutzerbindung', fr: 'Rétention des utilisateurs', es: 'Retención de usuarios' } },
  { name: 'User-Centered Design', category: 'Business & Finance', translations: { de: 'Benutzerzentriertes Design', fr: 'Conception centrée sur l\'utilisateur', es: 'Diseño centrado en el usuario' } },
  { name: 'Usability Testing', category: 'Business & Finance', translations: { de: 'Usability-Tests', fr: 'Test d\'utilisabilité', es: 'Pruebas de usabilidad' } },
  { name: 'Utility Management', category: 'Business & Finance', translations: { de: 'Versorgungsmanagement', fr: 'Gestion des services publics', es: 'Gestión de servicios públicos' } },
  { name: 'Usage Analytics', category: 'Business & Finance', translations: { de: 'Nutzungsanalyse', fr: 'Analyse d\'utilisation', es: 'Análisis de uso' } },

  // --- Leadership & Management ---
  { name: 'Unifying Teams', category: 'Leadership & Management', translations: { de: 'Teams vereinen', fr: 'Unir les équipes', es: 'Unificar equipos' } },
  { name: 'Unlocking Potential', category: 'Leadership & Management', translations: { de: 'Potenzial freisetzen', fr: 'Libérer le potentiel', es: 'Desbloquear el potencial' } },
  { name: 'Understanding Business Needs', category: 'Leadership & Management', translations: { de: 'Geschäftsanforderungen verstehen', fr: 'Comprendre les besoins de l\'entreprise', es: 'Comprender las necesidades del negocio' } },
  { name: 'Understanding Team Dynamics', category: 'Leadership & Management', translations: { de: 'Teamdynamik verstehen', fr: 'Comprendre la dynamique d\'équipe', es: 'Comprender la dinámica del equipo' } },
  { name: 'Union Negotiation', category: 'Leadership & Management', translations: { de: 'Gewerkschaftsverhandlungen', fr: 'Négociation syndicale', es: 'Negociación sindical' } },
  { name: 'Unit Management', category: 'Leadership & Management', translations: { de: 'Einheitenmanagement', fr: 'Gestion d\'unité', es: 'Gestión de unidades' } },
  { name: 'Upward Management', category: 'Leadership & Management', translations: { de: 'Führung nach oben', fr: 'Gestion ascendante', es: 'Gestión ascendente' } },
  { name: 'User Advocacy', category: 'Leadership & Management', translations: { de: 'Benutzervertretung', fr: 'Défense des utilisateurs', es: 'Defensa del usuario' } },
  { name: 'Utilizing Resources Effectively', category: 'Leadership & Management', translations: { de: 'Ressourcen effektiv nutzen', fr: 'Utiliser efficacement les ressources', es: 'Utilizar los recursos eficazmente' } },
  { name: 'Unconventional Leadership', category: 'Leadership & Management', translations: { de: 'Unkonventionelle Führung', fr: 'Leadership non conventionnel', es: 'Liderazgo no convencional' } },

  // --- Communication & Interpersonal ---
  { name: 'Understanding Others', category: 'Communication & Interpersonal', translations: { de: 'Andere verstehen', fr: 'Comprendre les autres', es: 'Comprender a los demás' } },
  { name: 'Use of Silence', category: 'Communication & Interpersonal', translations: { de: 'Einsatz von Stille', fr: 'Utilisation du silence', es: 'Uso del silencio' } },
  { name: 'Unbiased Communication', category: 'Communication & Interpersonal', translations: { de: 'Unvoreingenommene Kommunikation', fr: 'Communication impartiale', es: 'Comunicación imparcial' } },
  { name: 'Up-front Communication', category: 'Communication & Interpersonal', translations: { de: 'Offene Kommunikation', fr: 'Communication franche', es: 'Comunicación directa' } },
  { name: 'Using Analogies', category: 'Communication & Interpersonal', translations: { de: 'Analogien verwenden', fr: 'Utiliser des analogies', es: 'Uso de analogías' } },

  // --- Analytical & Technical ---
  { name: 'UML (Unified Modeling Language)', category: 'Analytical & Technical', translations: { de: 'UML (Unified Modeling Language)', fr: 'UML (Unified Modeling Language)', es: 'UML (Lenguaje Unificado de Modelado)' } },
  { name: 'UNIX', category: 'Analytical & Technical', translations: { de: 'UNIX', fr: 'UNIX', es: 'UNIX' } },
  { name: 'Unit Testing', category: 'Analytical & Technical', translations: { de: 'Unit-Tests', fr: 'Test unitaire', es: 'Pruebas unitarias' } },
  { name: 'Unreal Engine', category: 'Analytical & Technical', translations: { de: 'Unreal Engine', fr: 'Unreal Engine', es: 'Unreal Engine' } },
  { name: 'User Stories', category: 'Analytical & Technical', translations: { de: 'User Stories', fr: 'User stories', es: 'Historias de usuario' } },
  { name: 'Unity (Game Engine)', category: 'Analytical & Technical', translations: { de: 'Unity (Game Engine)', fr: 'Unity (Moteur de jeu)', es: 'Unity (Motor de videojuegos)' } },
  { name: 'UI Automation', category: 'Analytical & Technical', translations: { de: 'UI-Automatisierung', fr: 'Automatisation de l\'interface utilisateur', es: 'Automatización de la interfaz de usuario' } },
  
  // --- Personal Development & Mindset ---
  { name: 'Uncertainty Tolerance', category: 'Personal Development & Mindset', translations: { de: 'Unsicherheitstoleranz', fr: 'Tolérance à l\'incertitude', es: 'Tolerancia a la incertidumbre' } },
  { name: 'Unconditional Self-Acceptance', category: 'Personal Development & Mindset', translations: { de: 'Bedingungslose Selbstakzeptanz', fr: 'Acceptation inconditionnelle de soi', es: 'Autoaceptación incondicional' } },
  { name: 'Uncovering Blind Spots', category: 'Personal Development & Mindset', translations: { de: 'Blinde Flecken aufdecken', fr: 'Découvrir les angles morts', es: 'Descubrir puntos ciegos' } },
  { name: 'Understanding Emotions', category: 'Personal Development & Mindset', translations: { de: 'Emotionen verstehen', fr: 'Comprendre les émotions', es: 'Comprender las emociones' } },
  { name: 'Uniqueness (as a value)', category: 'Personal Development & Mindset', translations: { de: 'Einzigartigkeit (als Wert)', fr: 'Unicité (en tant que valeur)', es: 'Singularidad (como valor)' } },
  { name: 'Unlearning', category: 'Personal Development & Mindset', translations: { de: 'Verlernen', fr: 'Désapprentissage', es: 'Desaprender' } },
  { name: 'Unleashing Creativity', category: 'Personal Development & Mindset', translations: { de: 'Kreativität entfesseln', fr: 'Libérer la créativité', es: 'Desatar la creatividad' } },
  { name: 'Unplugging', category: 'Personal Development & Mindset', translations: { de: 'Abschalten', fr: 'Déconnexion', es: 'Desconectarse' } },
  { name: 'Unwavering Focus', category: 'Personal Development & Mindset', translations: { de: 'Unerschütterlicher Fokus', fr: 'Concentration inébranlable', es: 'Enfoque inquebrantable' } },
  { name: 'Upgrading Beliefs', category: 'Personal Development & Mindset', translations: { de: 'Glaubenssätze verbessern', fr: 'Mettre à jour ses croyances', es: 'Actualizar creencias' } },
  
  // --- Wellness & Creative Arts ---
  { name: 'Ukulele', category: 'Wellness & Creative Arts', translations: { de: 'Ukulele', fr: 'Ukulélé', es: 'Ukelele' } },
  { name: 'Ultimate Frisbee', category: 'Wellness & Creative Arts', translations: { de: 'Ultimate Frisbee', fr: 'Ultimate Frisbee', es: 'Ultimate Frisbee' } },
  { name: 'Unicycling', category: 'Wellness & Creative Arts', translations: { de: 'Einradfahren', fr: 'Monocycle', es: 'Monociclismo' } },
  { name: 'Underwater Photography', category: 'Wellness & Creative Arts', translations: { de: 'Unterwasserfotografie', fr: 'Photographie sous-marine', es: 'Fotografía submarina' } },
  { name: 'Upholstery', category: 'Wellness & Creative Arts', translations: { de: 'Polstern', fr: 'Rembourrage', es: 'Tapicería' } },
  { name: 'Upcycling', category: 'Wellness & Creative Arts', translations: { de: 'Upcycling', fr: 'Surcyclage', es: 'Suprarreciclaje' } },
  { name: 'Urban Exploration', category: 'Wellness & Creative Arts', translations: { de: 'Urbane Erkundung', fr: 'Exploration urbaine', es: 'Exploración urbana' } },
  { name: 'Urban Gardening', category: 'Wellness & Creative Arts', translations: { de: 'Urban Gardening', fr: 'Jardinage urbain', es: 'Jardinería urbana' } },
  { name: 'Urban Sketching', category: 'Wellness & Creative Arts', translations: { de: 'Urban Sketching', fr: 'Croquis urbain', es: 'Dibujo urbano' } },
  { name: 'Ukrainian (Language)', category: 'Wellness & Creative Arts', translations: { de: 'Ukrainisch (Sprache)', fr: 'Ukrainien (Langue)', es: 'Ucraniano (Idioma)' } },
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