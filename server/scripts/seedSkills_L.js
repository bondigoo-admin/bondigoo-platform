// scripts/seedSkills_L.js

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
// A list of 60 general and specific coaching-related skills starting with 'L'.
const dataToUpload = [
  // --- Leadership & Management ---
  { name: 'Leadership', category: 'Leadership & Management', translations: { de: 'Führung', fr: 'Leadership', es: 'Liderazgo' } },
  { name: 'Leadership Development', category: 'Leadership & Management', translations: { de: 'Führungskräfteentwicklung', fr: 'Développement du leadership', es: 'Desarrollo de liderazgo' } },
  { name: 'Leading Change', category: 'Leadership & Management', translations: { de: 'Wandel führen', fr: 'Conduite du changement', es: 'Liderar el cambio' } },
  { name: 'Leading Meetings', category: 'Leadership & Management', translations: { de: 'Besprechungen leiten', fr: 'Animer des réunions', es: 'Dirigir reuniones' } },
  { name: 'Leading Teams', category: 'Leadership & Management', translations: { de: 'Teamführung', fr: 'Direction d\'équipes', es: 'Liderazgo de equipos' } },
  { name: 'Lean Management', category: 'Leadership & Management', translations: { de: 'Lean Management', fr: 'Gestion Lean', es: 'Gestión Lean' } },
  { name: 'Lean Six Sigma', category: 'Leadership & Management', translations: { de: 'Lean Six Sigma', fr: 'Lean Six Sigma', es: 'Lean Six Sigma' } },
  { name: 'Learning & Development', category: 'Leadership & Management', translations: { de: 'Lernen und Entwicklung', fr: 'Apprentissage et développement', es: 'Aprendizaje y desarrollo' } },
  { name: 'Long-Term Planning', category: 'Leadership & Management', translations: { de: 'Langfristige Planung', fr: 'Planification à long terme', es: 'Planificación a largo plazo' } },
  { name: 'Labor Relations', category: 'Leadership & Management', translations: { de: 'Arbeitsbeziehungen', fr: 'Relations de travail', es: 'Relaciones laborales' } },

  // --- Business & Finance ---
  { name: 'Legal Compliance', category: 'Business & Finance', translations: { de: 'Rechtskonformität', fr: 'Conformité légale', es: 'Cumplimiento legal' } },
  { name: 'Legal Research', category: 'Business & Finance', translations: { de: 'Juristische Recherche', fr: 'Recherche juridique', es: 'Investigación legal' } },
  { name: 'Legal Writing', category: 'Business & Finance', translations: { de: 'Juristisches Schreiben', fr: 'Rédaction juridique', es: 'Redacción jurídica' } },
  { name: 'Lease Negotiation', category: 'Business & Finance', translations: { de: 'Mietvertragsverhandlung', fr: 'Négociation de bail', es: 'Negociación de arrendamiento' } },
  { name: 'Leveraged Buyouts (LBO)', category: 'Business & Finance', translations: { de: 'Fremdfinanzierte Übernahmen (LBO)', fr: 'Rachat par endettement (LBO)', es: 'Compra apalancada (LBO)' } },
  { name: 'License Management', category: 'Business & Finance', translations: { de: 'Lizenzmanagement', fr: 'Gestion des licences', es: 'Gestión de licencias' } },
  { name: 'LinkedIn Profile Optimization', category: 'Business & Finance', translations: { de: 'LinkedIn-Profiloptimierung', fr: 'Optimisation du profil LinkedIn', es: 'Optimización del perfil de LinkedIn' } },
  { name: 'Litigation', category: 'Business & Finance', translations: { de: 'Prozessführung', fr: 'Contentieux', es: 'Litigio' } },
  { name: 'Loan Processing', category: 'Business & Finance', translations: { de: 'Kreditbearbeitung', fr: 'Traitement des prêts', es: 'Procesamiento de préstamos' } },
  { name: 'Logistics', category: 'Business & Finance', translations: { de: 'Logistik', fr: 'Logistique', es: 'Logística' } },
  { name: 'Logistics Management', category: 'Business & Finance', translations: { de: 'Logistikmanagement', fr: 'Gestion de la logistique', es: 'Gestión de logística' } },
  { name: 'Loss Prevention', category: 'Business & Finance', translations: { de: 'Verlustprävention', fr: 'Prévention des pertes', es: 'Prevención de pérdidas' } },
  { name: 'Loyalty Programs', category: 'Business & Finance', translations: { de: 'Treueprogramme', fr: 'Programmes de fidélité', es: 'Programas de lealtad' } },
  
  // --- Communication & Interpersonal ---
  { name: 'Listening Skills', category: 'Communication & Interpersonal', translations: { de: 'Zuhörkompetenz', fr: 'Compétences d\'écoute', es: 'Habilidades de escucha' } },
  { name: 'Language Translation', category: 'Communication & Interpersonal', translations: { de: 'Sprachübersetzung', fr: 'Traduction linguistique', es: 'Traducción de idiomas' } },
  { name: 'Lobbying', category: 'Communication & Interpersonal', translations: { de: 'Lobbyarbeit', fr: 'Lobbying', es: 'Cabildeo' } },
  { name: 'Loom (Software)', category: 'Communication & Interpersonal', translations: { de: 'Loom (Software)', fr: 'Loom (Logiciel)', es: 'Loom (Software)' } },

  // --- Analytical & Technical ---
  { name: 'Large-Scale System Design', category: 'Analytical & Technical', translations: { de: 'Design großer Systeme', fr: 'Conception de systèmes à grande échelle', es: 'Diseño de sistemas a gran escala' } },
  { name: 'Laravel', category: 'Analytical & Technical', translations: { de: 'Laravel', fr: 'Laravel', es: 'Laravel' } },
  { name: 'LaTeX', category: 'Analytical & Technical', translations: { de: 'LaTeX', fr: 'LaTeX', es: 'LaTeX' } },
  { name: 'Level Design', category: 'Analytical & Technical', translations: { de: 'Leveldesign', fr: 'Conception de niveaux', es: 'Diseño de niveles' } },
  { name: 'Linux', category: 'Analytical & Technical', translations: { de: 'Linux', fr: 'Linux', es: 'Linux' } },
  { name: 'Live Streaming', category: 'Analytical & Technical', translations: { de: 'Live-Streaming', fr: 'Diffusion en direct', es: 'Transmisión en vivo' } },
  { name: 'Load Testing', category: 'Analytical & Technical', translations: { de: 'Lasttests', fr: 'Test de charge', es: 'Pruebas de carga' } },
  { name: 'Local SEO', category: 'Analytical & Technical', translations: { de: 'Lokale SEO', fr: 'SEO local', es: 'SEO local' } },
  { name: 'Log Analysis', category: 'Analytical & Technical', translations: { de: 'Protokollanalyse', fr: 'Analyse des logs', es: 'Análisis de registros' } },
  { name: 'Logic', category: 'Analytical & Technical', translations: { de: 'Logik', fr: 'Logique', es: 'Lógica' } },
  { name: 'Low-Code Development', category: 'Analytical & Technical', translations: { de: 'Low-Code-Entwicklung', fr: 'Développement low-code', es: 'Desarrollo de bajo código' } },

  // --- Personal Development & Mindset ---
  { name: 'Learning Agility', category: 'Personal Development & Mindset', translations: { de: 'Lernagilität', fr: 'Agilité d\'apprentissage', es: 'Agilidad de aprendizaje' } },
  { name: 'Legacy Building', category: 'Personal Development & Mindset', translations: { de: 'Aufbau eines Vermächtnisses', fr: 'Création d\'un héritage', es: 'Construcción de un legado' } },
  { name: 'Letting Go', category: 'Personal Development & Mindset', translations: { de: 'Loslassen', fr: 'Lâcher prise', es: 'Dejar ir' } },
  { name: 'Life Balance', category: 'Personal Development & Mindset', translations: { de: 'Lebensbalance', fr: 'Équilibre de vie', es: 'Equilibrio de vida' } },
  { name: 'Life Coaching', category: 'Personal Development & Mindset', translations: { de: 'Life Coaching', fr: 'Coaching de vie', es: 'Coaching de vida' } },
  { name: 'Life Design', category: 'Personal Development & Mindset', translations: { de: 'Lebensgestaltung', fr: 'Conception de vie', es: 'Diseño de vida' } },
  { name: 'Lifelong Learning', category: 'Personal Development & Mindset', translations: { de: 'Lebenslanges Lernen', fr: 'Apprentissage tout au long de la vie', es: 'Aprendizaje permanente' } },
  { name: 'Lightheartedness', category: 'Personal Development & Mindset', translations: { de: 'Unbeschwertheit', fr: 'Légèreté', es: 'Despreocupación' } },
  { name: 'Limiting Beliefs Identification', category: 'Personal Development & Mindset', translations: { de: 'Identifizierung limitierender Glaubenssätze', fr: 'Identification des croyances limitantes', es: 'Identificación de creencias limitantes' } },
  { name: 'Listening to Intuition', category: 'Personal Development & Mindset', translations: { de: 'Auf die Intuition hören', fr: 'Écouter son intuition', es: 'Escuchar la intuición' } },
  { name: 'Living with Purpose', category: 'Personal Development & Mindset', translations: { de: 'Zielgerichtet leben', fr: 'Vivre avec un but', es: 'Vivir con propósito' } },
  { name: 'Love (as a value)', category: 'Personal Development & Mindset', translations: { de: 'Liebe (als Wert)', fr: 'Amour (en tant que valeur)', es: 'Amor (como valor)' } },

  // --- Wellness & Creative Arts ---
  { name: 'Landscape Painting', category: 'Wellness & Creative Arts', translations: { de: 'Landschaftsmalerei', fr: 'Peinture de paysage', es: 'Pintura de paisajes' } },
  { name: 'Laser Cutting', category: 'Wellness & Creative Arts', translations: { de: 'Laserschneiden', fr: 'Découpe laser', es: 'Corte por láser' } },
  { name: 'Laughter Yoga', category: 'Wellness & Creative Arts', translations: { de: 'Lachyoga', fr: 'Yoga du rire', es: 'Yoga de la risa' } },
  { name: 'Latte Art', category: 'Wellness & Creative Arts', translations: { de: 'Latte Art', fr: 'Art du latte', es: 'Arte latte' } },
  { name: 'Leatherworking', category: 'Wellness & Creative Arts', translations: { de: 'Lederverarbeitung', fr: 'Travail du cuir', es: 'Marroquinería' } },
  { name: 'LEGO Building', category: 'Wellness & Creative Arts', translations: { de: 'LEGO bauen', fr: 'Construction de LEGO', es: 'Construcción con LEGO' } },
  { name: 'Lighting Design', category: 'Wellness & Creative Arts', translations: { de: 'Lichtdesign', fr: 'Conception d\'éclairage', es: 'Diseño de iluminación' } },
  { name: 'Lindy Hop', category: 'Wellness & Creative Arts', translations: { de: 'Lindy Hop', fr: 'Lindy Hop', es: 'Lindy Hop' } },
  { name: 'Lucid Dreaming', category: 'Wellness & Creative Arts', translations: { de: 'Klares Träumen', fr: 'Rêve lucide', es: 'Sueño lúcido' } },
  { name: 'Lyric Writing', category: 'Wellness & Creative Arts', translations: { de: 'Songtextschreiben', fr: 'Écriture de paroles', es: 'Escritura de letras de canciones' } },
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