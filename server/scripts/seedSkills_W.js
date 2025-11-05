// scripts/seedSkills_W.js

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
// A list of 60 general and specific coaching-related skills starting with 'W'.
const dataToUpload = [
  // --- Leadership & Management ---
  { name: 'Workforce Planning', category: 'Leadership & Management', translations: { de: 'Personalplanung', fr: 'Planification de la main-d\'œuvre', es: 'Planificación de la fuerza laboral' } },
  { name: 'Workplace Culture Development', category: 'Leadership & Management', translations: { de: 'Entwicklung der Arbeitsplatzkultur', fr: 'Développement de la culture d\'entreprise', es: 'Desarrollo de la cultura laboral' } },
  { name: 'Workplace Safety', category: 'Leadership & Management', translations: { de: 'Arbeitssicherheit', fr: 'Sécurité au travail', es: 'Seguridad en el lugar de trabajo' } },
  { name: 'Workshop Facilitation', category: 'Leadership & Management', translations: { de: 'Workshop-Moderation', fr: 'Animation d\'atelier', es: 'Facilitación de talleres' } },
  { name: 'Workload Management', category: 'Leadership & Management', translations: { de: 'Arbeitslastmanagement', fr: 'Gestion de la charge de travail', es: 'Gestión de la carga de trabajo' } },
  { name: 'Winning Mindset', category: 'Leadership & Management', translations: { de: 'Gewinnermentalität', fr: 'État d\'esprit de gagnant', es: 'Mentalidad ganadora' } },
  { name: 'Workplace Mediation', category: 'Leadership & Management', translations: { de: 'Mediation am Arbeitsplatz', fr: 'Médiation en milieu de travail', es: 'Mediación laboral' } },
  { name: 'Welcoming Feedback', category: 'Leadership & Management', translations: { de: 'Feedback willkommen heißen', fr: 'Accueillir le feedback', es: 'Acoger la retroalimentación' } },

  // --- Business & Finance ---
  { name: 'Warehouse Management', category: 'Business & Finance', translations: { de: 'Lagerverwaltung', fr: 'Gestion d\'entrepôt', es: 'Gestión de almacenes' } },
  { name: 'Wealth Management', category: 'Business & Finance', translations: { de: 'Vermögensverwaltung', fr: 'Gestion de patrimoine', es: 'Gestión de patrimonio' } },
  { name: 'Web Analytics', category: 'Business & Finance', translations: { de: 'Webanalyse', fr: 'Analyse Web', es: 'Analítica web' } },
  { name: 'Website Optimization', category: 'Business & Finance', translations: { de: 'Webseitenoptimierung', fr: 'Optimisation de site web', es: 'Optimización de sitios web' } },
  { name: 'Wholesale', category: 'Business & Finance', translations: { de: 'Großhandel', fr: 'Vente en gros', es: 'Venta al por mayor' } },
  { name: 'Workflow Management', category: 'Business & Finance', translations: { de: 'Workflow-Management', fr: 'Gestion des flux de travail', es: 'Gestión de flujos de trabajo' } },
  { name: 'Working Capital Management', category: 'Business & Finance', translations: { de: 'Working-Capital-Management', fr: 'Gestion du fonds de roulement', es: 'Gestión del capital de trabajo' } },
  { name: 'Workers\' Compensation', category: 'Business & Finance', translations: { de: 'Arbeitsunfallversicherung', fr: 'Indemnisation des accidents du travail', es: 'Compensación para trabajadores' } },
  { name: 'Web Content Writing', category: 'Business & Finance', translations: { de: 'Schreiben von Webinhalten', fr: 'Rédaction de contenu web', es: 'Redacción de contenido web' } },

  // --- Communication & Interpersonal ---
  { name: 'Written Communication', category: 'Communication & Interpersonal', translations: { de: 'Schriftliche Kommunikation', fr: 'Communication écrite', es: 'Comunicación escrita' } },
  { name: 'Whiteboarding', category: 'Communication & Interpersonal', translations: { de: 'Whiteboarding', fr: 'Utilisation du tableau blanc', es: 'Uso de la pizarra blanca' } },
  { name: 'Warmth', category: 'Communication & Interpersonal', translations: { de: 'Herzlichkeit', fr: 'Chaleur', es: 'Calidez' } },
  { name: 'Winning Trust', category: 'Communication & Interpersonal', translations: { de: 'Vertrauen gewinnen', fr: 'Gagner la confiance', es: 'Ganar confianza' } },
  { name: 'Webinar Hosting', category: 'Communication & Interpersonal', translations: { de: 'Webinar-Moderation', fr: 'Animation de webinaires', es: 'Anfitrión de seminarios web' } },

  // --- Analytical & Technical ---
  { name: 'Web Design', category: 'Analytical & Technical', translations: { de: 'Webdesign', fr: 'Conception Web', es: 'Diseño web' } },
  { name: 'Web Development', category: 'Analytical & Technical', translations: { de: 'Webentwicklung', fr: 'Développement Web', es: 'Desarrollo web' } },
  { name: 'WordPress', category: 'Analytical & Technical', translations: { de: 'WordPress', fr: 'WordPress', es: 'WordPress' } },
  { name: 'Windows Server', category: 'Analytical & Technical', translations: { de: 'Windows Server', fr: 'Windows Server', es: 'Windows Server' } },
  { name: 'Wireframing', category: 'Analytical & Technical', translations: { de: 'Wireframing', fr: 'Wireframing', es: 'Creación de wireframes' } },
  { name: 'Wix', category: 'Analytical & Technical', translations: { de: 'Wix', fr: 'Wix', es: 'Wix' } },
  
  // --- Personal Development & Mindset ---
  { name: 'Well-being', category: 'Personal Development & Mindset', translations: { de: 'Wohlbefinden', fr: 'Bien-être', es: 'Bienestar' } },
  { name: 'Wholehearted Living', category: 'Personal Development & Mindset', translations: { de: 'Ganzherziges Leben', fr: 'Vivre pleinement', es: 'Vivir con todo el corazón' } },
  { name: 'Willpower', category: 'Personal Development & Mindset', translations: { de: 'Willenskraft', fr: 'Volonté', es: 'Fuerza de voluntad' } },
  { name: 'Wisdom', category: 'Personal Development & Mindset', translations: { de: 'Weisheit', fr: 'Sagesse', es: 'Sabiduría' } },
  { name: 'Working with Your Inner Critic', category: 'Personal Development & Mindset', translations: { de: 'Arbeit mit dem inneren Kritiker', fr: 'Travailler avec son critique intérieur', es: 'Trabajar con el crítico interno' } },
  { name: 'Worthiness', category: 'Personal Development & Mindset', translations: { de: 'Wertgefühl', fr: 'Sentiment de valeur', es: 'Valía personal' } },
  { name: 'Worry Management', category: 'Personal Development & Mindset', translations: { de: 'Sorgenmanagement', fr: 'Gestion des soucis', es: 'Gestión de la preocupación' } },
  { name: 'Willingness', category: 'Personal Development & Mindset', translations: { de: 'Bereitschaft', fr: 'Volonté', es: 'Disposición' } },
  { name: 'Work-Life Integration', category: 'Personal Development & Mindset', translations: { de: 'Work-Life-Integration', fr: 'Intégration vie pro-vie perso', es: 'Integración vida-trabajo' } },

  // --- Wellness & Creative Arts ---
  { name: 'Walking', category: 'Wellness & Creative Arts', translations: { de: 'Gehen', fr: 'Marche', es: 'Caminar' } },
  { name: 'Wakeboarding', category: 'Wellness & Creative Arts', translations: { de: 'Wakeboarden', fr: 'Wakeboard', es: 'Wakeboard' } },
  { name: 'Watercolor Painting', category: 'Wellness & Creative Arts', translations: { de: 'Aquarellmalerei', fr: 'Peinture à l\'aquarelle', es: 'Pintura de acuarela' } },
  { name: 'Water Polo', category: 'Wellness & Creative Arts', translations: { de: 'Wasserball', fr: 'Water-polo', es: 'Waterpolo' } },
  { name: 'Weaving', category: 'Wellness & Creative Arts', translations: { de: 'Weben', fr: 'Tissage', es: 'Tejer' } },
  { name: 'Weightlifting', category: 'Wellness & Creative Arts', translations: { de: 'Gewichtheben', fr: 'Haltérophilie', es: 'Levantamiento de pesas' } },
  { name: 'Welding', category: 'Wellness & Creative Arts', translations: { de: 'Schweißen', fr: 'Soudage', es: 'Soldadura' } },
  { name: 'Whittling', category: 'Wellness & Creative Arts', translations: { de: 'Schnitzen', fr: 'Taillage de bois', es: 'Tallado de madera' } },
  { name: 'Windsurfing', category: 'Wellness & Creative Arts', translations: { de: 'Windsurfen', fr: 'Planche à voile', es: 'Windsurf' } },
  { name: 'Wine Tasting', category: 'Wellness & Creative Arts', translations: { de: 'Weinprobe', fr: 'Dégustation de vin', es: 'Cata de vinos' } },
  { name: 'Woodworking', category: 'Wellness & Creative Arts', translations: { de: 'Holzbearbeitung', fr: 'Travail du bois', es: 'Carpintería' } },
  { name: 'Writing', category: 'Wellness & Creative Arts', translations: { de: 'Schreiben', fr: 'Écriture', es: 'Escritura' } },
  { name: 'Wicca', category: 'Wellness & Creative Arts', translations: { de: 'Wicca', fr: 'Wicca', es: 'Wicca' } },
  { name: 'Wellness Coaching', category: 'Wellness & Creative Arts', translations: { de: 'Wellness-Coaching', fr: 'Coaching bien-être', es: 'Coaching de bienestar' } },
  { name: 'Wilderness Survival', category: 'Wellness & Creative Arts', translations: { de: 'Überleben in der Wildnis', fr: 'Survie en milieu sauvage', es: 'Supervivencia en la naturaleza' } },
  { name: 'Worldbuilding', category: 'Wellness & Creative Arts', translations: { de: 'Weltenbau', fr: 'Création de mondes', es: 'Creación de mundos' } },
  { name: 'Waltz', category: 'Wellness & Creative Arts', translations: { de: 'Walzer', fr: 'Valse', es: 'Vals' } },
  { name: 'Water Skiing', category: 'Wellness & Creative Arts', translations: { de: 'Wasserskifahren', fr: 'Ski nautique', es: 'Esquí acuático' } },
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