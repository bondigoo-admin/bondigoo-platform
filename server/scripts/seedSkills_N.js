// scripts/seedSkills_N.js

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
// A list of 60 general and specific coaching-related skills starting with 'N'.
const dataToUpload = [
  // --- Business & Finance ---
  { name: 'Negotiation', category: 'Business & Finance', translations: { de: 'Verhandlung', fr: 'Négociation', es: 'Negociación' } },
  { name: 'Needs Assessment', category: 'Business & Finance', translations: { de: 'Bedarfsanalyse', fr: 'Évaluation des besoins', es: 'Evaluación de necesidades' } },
  { name: 'Net Present Value (NPV)', category: 'Business & Finance', translations: { de: 'Kapitalwert (NPV)', fr: 'Valeur actuelle nette (VAN)', es: 'Valor actual neto (VAN)' } },
  { name: 'New Business Development', category: 'Business & Finance', translations: { de: 'Neugeschäftsentwicklung', fr: 'Développement de nouvelles affaires', es: 'Desarrollo de nuevos negocios' } },
  { name: 'New Market Entry', category: 'Business & Finance', translations: { de: 'Markteintritt in neue Märkte', fr: 'Entrée sur de nouveaux marchés', es: 'Entrada a nuevos mercados' } },
  { name: 'New Product Launch', category: 'Business & Finance', translations: { de: 'Einführung neuer Produkte', fr: 'Lancement de nouveaux produits', es: 'Lanzamiento de nuevos productos' } },
  { name: 'Newsletter Writing', category: 'Business & Finance', translations: { de: 'Verfassen von Newslettern', fr: 'Rédaction de newsletters', es: 'Redacción de boletines' } },
  { name: 'Non-Profit Management', category: 'Business & Finance', translations: { de: 'Management von Non-Profit-Organisationen', fr: 'Gestion d\'organismes sans but lucratif', es: 'Gestión de organizaciones sin fines de lucro' } },
  { name: 'Notary Public', category: 'Business & Finance', translations: { de: 'Notar', fr: 'Notaire public', es: 'Notario público' } },
  { name: 'Note-Taking', category: 'Business & Finance', translations: { de: 'Notizen machen', fr: 'Prise de notes', es: 'Toma de notas' } },

  // --- Leadership & Management ---
  { name: 'Navigating Change', category: 'Leadership & Management', translations: { de: 'Umgang mit Veränderungen', fr: 'Naviguer dans le changement', es: 'Navegar el cambio' } },
  { name: 'Navigating Corporate Politics', category: 'Leadership & Management', translations: { de: 'Umgang mit Unternehmenspolitik', fr: 'Naviguer dans la politique d\'entreprise', es: 'Navegar la política corporativa' } },
  { name: 'Negotiating Contracts', category: 'Leadership & Management', translations: { de: 'Vertragsverhandlungen', fr: 'Négociation de contrats', es: 'Negociación de contratos' } },
  { name: 'New Employee Onboarding', category: 'Leadership & Management', translations: { de: 'Einarbeitung neuer Mitarbeiter', fr: 'Intégration des nouveaux employés', es: 'Incorporación de nuevos empleados' } },
  { name: 'Norm Setting', category: 'Leadership & Management', translations: { de: 'Normenfestlegung', fr: 'Établissement de normes', es: 'Establecimiento de normas' } },
  { name: 'Nurturing Talent', category: 'Leadership & Management', translations: { de: 'Talentförderung', fr: 'Développement des talents', es: 'Fomentar el talento' } },

  // --- Communication & Interpersonal ---
  { name: 'Narration', category: 'Communication & Interpersonal', translations: { de: 'Erzählung', fr: 'Narration', es: 'Narración' } },
  { name: 'Narrative Storytelling', category: 'Communication & Interpersonal', translations: { de: 'Narratives Storytelling', fr: 'Narration narrative', es: 'Narrativa' } },
  { name: 'Networking', category: 'Communication & Interpersonal', translations: { de: 'Netzwerken', fr: 'Réseautage', es: 'Networking' } },
  { name: 'Neurolinguistic Programming (NLP)', category: 'Communication & Interpersonal', translations: { de: 'Neurolinguistisches Programmieren (NLP)', fr: 'Programmation neuro-linguistique (PNL)', es: 'Programación neurolingüística (PNL)' } },
  { name: 'Nonverbal Communication', category: 'Communication & Interpersonal', translations: { de: 'Nonverbale Kommunikation', fr: 'Communication non verbale', es: 'Comunicación no verbal' } },
  
  // --- Analytical & Technical ---
  { name: 'Natural Language Processing (NLP)', category: 'Analytical & Technical', translations: { de: 'Verarbeitung natürlicher Sprache (NLP)', fr: 'Traitement du langage naturel (NLP)', es: 'Procesamiento de lenguaje natural (PLN)' } },
  { name: 'Network Administration', category: 'Analytical & Technical', translations: { de: 'Netzwerkadministration', fr: 'Administration de réseau', es: 'Administración de redes' } },
  { name: 'Network Security', category: 'Analytical & Technical', translations: { de: 'Netzwerksicherheit', fr: 'Sécurité réseau', es: 'Seguridad de redes' } },
  { name: 'Next.js', category: 'Analytical & Technical', translations: { de: 'Next.js', fr: 'Next.js', es: 'Next.js' } },
  { name: 'Nginx', category: 'Analytical & Technical', translations: { de: 'Nginx', fr: 'Nginx', es: 'Nginx' } },
  { name: 'Node.js', category: 'Analytical & Technical', translations: { de: 'Node.js', fr: 'Node.js', es: 'Node.js' } },
  { name: 'NoSQL', category: 'Analytical & Technical', translations: { de: 'NoSQL', fr: 'NoSQL', es: 'NoSQL' } },
  { name: 'NumPy', category: 'Analytical & Technical', translations: { de: 'NumPy', fr: 'NumPy', es: 'NumPy' } },

  // --- Personal Development & Mindset ---
  { name: 'Navigating Life Transitions', category: 'Personal Development & Mindset', translations: { de: 'Lebensübergänge meistern', fr: 'Gérer les transitions de vie', es: 'Navegar transiciones de vida' } },
  { name: 'Navigating Uncertainty', category: 'Personal Development & Mindset', translations: { de: 'Umgang mit Unsicherheit', fr: 'Naviguer dans l\'incertitude', es: 'Navegar la incertidumbre' } },
  { name: 'Negative Thought Reframing', category: 'Personal Development & Mindset', translations: { de: 'Umdeutung negativer Gedanken', fr: 'Recadrage des pensées négatives', es: 'Reencuadre de pensamientos negativos' } },
  { name: 'Neuroplasticity', category: 'Personal Development & Mindset', translations: { de: 'Neuroplastizität', fr: 'Neuroplasticité', es: 'Neuroplasticidad' } },
  { name: 'New Habits Formation', category: 'Personal Development & Mindset', translations: { de: 'Bildung neuer Gewohnheiten', fr: 'Formation de nouvelles habitudes', es: 'Formación de nuevos hábitos' } },
  { name: '"No" - The Art of Saying It', category: 'Personal Development & Mindset', translations: { de: 'Die Kunst, "Nein" zu sagen', fr: 'L\'art de dire "Non"', es: 'El arte de decir "No"' } },
  { name: 'Nurturing Creativity', category: 'Personal Development & Mindset', translations: { de: 'Kreativität fördern', fr: 'Nourrir la créativité', es: 'Nutrir la creatividad' } },
  { name: 'Nurturing Self-Compassion', category: 'Personal Development & Mindset', translations: { de: 'Selbstmitgefühl pflegen', fr: 'Cultiver l\'auto-compassion', es: 'Cultivar la autocompasión' } },
  { name: 'Numerology', category: 'Personal Development & Mindset', translations: { de: 'Numerologie', fr: 'Numérologie', es: 'Numerología' } },
  { name: 'Neuro-Coaching', category: 'Personal Development & Mindset', translations: { de: 'Neuro-Coaching', fr: 'Neuro-coaching', es: 'Neurocoaching' } },
  { name: 'Nobility (as a value)', category: 'Personal Development & Mindset', translations: { de: 'Adel/Edelmut (als Wert)', fr: 'Noblesse (en tant que valeur)', es: 'Nobleza (como valor)' } },
  
  // --- Wellness & Creative Arts ---
  { name: 'Nail Art', category: 'Wellness & Creative Arts', translations: { de: 'Nagelkunst', fr: 'Art des ongles', es: 'Arte de uñas' } },
  { name: 'Natural Dyeing', category: 'Wellness & Creative Arts', translations: { de: 'Natürliches Färben', fr: 'Teinture naturelle', es: 'Teñido natural' } },
  { name: 'Natural Healing', category: 'Wellness & Creative Arts', translations: { de: 'Natürliche Heilung', fr: 'Guérison naturelle', es: 'Curación natural' } },
  { name: 'Nature Journaling', category: 'Wellness & Creative Arts', translations: { de: 'Natur-Tagebuch führen', fr: 'Journal de la nature', es: 'Diario de la naturaleza' } },
  { name: 'Nature Photography', category: 'Wellness & Creative Arts', translations: { de: 'Naturfotografie', fr: 'Photographie de nature', es: 'Fotografía de naturaleza' } },
  { name: 'Nature Therapy', category: 'Wellness & Creative Arts', translations: { de: 'Naturtherapie', fr: 'Thérapie par la nature', es: 'Terapia de naturaleza' } },
  { name: 'Naturopathy', category: 'Wellness & Creative Arts', translations: { de: 'Naturheilkunde', fr: 'Naturopathie', es: 'Naturopatía' } },
  { name: 'Needlepoint', category: 'Wellness & Creative Arts', translations: { de: 'Sticken', fr: 'Tapisserie à l\'aiguille', es: 'Bordado' } },
  { name: 'Neuroscience', category: 'Wellness & Creative Arts', translations: { de: 'Neurowissenschaften', fr: 'Neurosciences', es: 'Neurociencia' } },
  { name: 'Ninjutsu', category: 'Wellness & Creative Arts', translations: { de: 'Ninjutsu', fr: 'Ninjutsu', es: 'Ninjutsu' } },
  { name: 'Nordic Skiing', category: 'Wellness & Creative Arts', translations: { de: 'Skilanglauf', fr: 'Ski nordique', es: 'Esquí nórdico' } },
  { name: 'Nordic Walking', category: 'Wellness & Creative Arts', translations: { de: 'Nordic Walking', fr: 'Marche nordique', es: 'Marcha nórdica' } },
  { name: 'Novel Writing', category: 'Wellness & Creative Arts', translations: { de: 'Roman schreiben', fr: 'Écriture de roman', es: 'Escritura de novelas' } },
  { name: 'Nutrition', category: 'Wellness & Creative Arts', translations: { de: 'Ernährung', fr: 'Nutrition', es: 'Nutrición' } },
  { name: 'Nutritional Coaching', category: 'Wellness & Creative Arts', translations: { de: 'Ernährungscoaching', fr: 'Coaching nutritionnel', es: 'Coaching nutricional' } },
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