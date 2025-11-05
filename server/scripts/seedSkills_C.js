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
// A list of 60 general and specific coaching-related skills starting with 'C'.
const dataToUpload = [
  // --- Business & Finance ---
  { name: 'Change Management', category: 'Business & Finance', translations: { de: 'Veränderungsmanagement', fr: 'Gestion du changement', es: 'Gestión del cambio' } },
  { name: 'Client Relations', category: 'Business & Finance', translations: { de: 'Kundenbeziehungen', fr: 'Relations clients', es: 'Relaciones con clientes' } },
  { name: 'Competitive Analysis', category: 'Business & Finance', translations: { de: 'Wettbewerbsanalyse', fr: 'Analyse concurrentielle', es: 'Análisis competitivo' } },
  { name: 'Consulting', category: 'Business & Finance', translations: { de: 'Beratung', fr: 'Conseil', es: 'Consultoría' } },
  { name: 'Content Marketing', category: 'Business & Finance', translations: { de: 'Content-Marketing', fr: 'Marketing de contenu', es: 'Marketing de contenidos' } },
  { name: 'Contract Negotiation', category: 'Business & Finance', translations: { de: 'Vertragsverhandlungen', fr: 'Négociation de contrats', es: 'Negociación de contratos' } },
  { name: 'Corporate Communications', category: 'Business & Finance', translations: { de: 'Unternehmenskommunikation', fr: 'Communication d\'entreprise', es: 'Comunicaciones corporativas' } },
  { name: 'Corporate Finance', category: 'Business & Finance', translations: { de: 'Unternehmensfinanzierung', fr: 'Finance d\'entreprise', es: 'Finanzas corporativas' } },
  { name: 'Cost Management', category: 'Business & Finance', translations: { de: 'Kostenmanagement', fr: 'Gestion des coûts', es: 'Gestión de costos' } },
  { name: 'Customer Relationship Management (CRM)', category: 'Business & Finance', translations: { de: 'Kundenbeziehungsmanagement (CRM)', fr: 'Gestion de la relation client (CRM)', es: 'Gestión de la relación con el cliente (CRM)' } },
  { name: 'Customer Service', category: 'Business & Finance', translations: { de: 'Kundenservice', fr: 'Service client', es: 'Servicio al cliente' } },
  { name: 'Customer Experience (CX)', category: 'Business & Finance', translations: { de: 'Kundenerlebnis (CX)', fr: 'Expérience client (CX)', es: 'Experiencia del cliente (CX)' } },

  // --- Leadership & Management ---
  { name: 'Career Development', category: 'Leadership & Management', translations: { de: 'Karriereentwicklung', fr: 'Développement de carrière', es: 'Desarrollo de carrera' } },
  { name: 'Coaching', category: 'Leadership & Management', translations: { de: 'Coaching', fr: 'Coaching', es: 'Coaching' } },
  { name: 'Collaboration', category: 'Leadership & Management', translations: { de: 'Zusammenarbeit', fr: 'Collaboration', es: 'Colaboración' } },
  { name: 'Conflict Management', category: 'Leadership & Management', translations: { de: 'Konfliktmanagement', fr: 'Gestion des conflits', es: 'Gestión de conflictos' } },
  { name: 'Continuous Improvement', category: 'Leadership & Management', translations: { de: 'Kontinuierliche Verbesserung', fr: 'Amélioration continue', es: 'Mejora continua' } },
  { name: 'Corporate Governance', category: 'Leadership & Management', translations: { de: 'Unternehmensführung', fr: 'Gouvernance d\'entreprise', es: 'Gobierno corporativo' } },
  { name: 'Cross-functional Team Leadership', category: 'Leadership & Management', translations: { de: 'Führung funktionsübergreifender Teams', fr: 'Leadership d\'équipes interfonctionnelles', es: 'Liderazgo de equipos multifuncionales' } },
  { name: 'Culture Change', category: 'Leadership & Management', translations: { de: 'Kulturwandel', fr: 'Changement culturel', es: 'Cambio cultural' } },

  // --- Communication & Interpersonal ---
  { name: 'Clarity', category: 'Communication & Interpersonal', translations: { de: 'Klarheit', fr: 'Clarté', es: 'Claridad' } },
  { name: 'Communication', category: 'Communication & Interpersonal', translations: { de: 'Kommunikation', fr: 'Communication', es: 'Comunicación' } },
  { name: 'Compassion', category: 'Communication & Interpersonal', translations: { de: 'Mitgefühl', fr: 'Compassion', es: 'Compasión' } },
  { name: 'Confidence', category: 'Communication & Interpersonal', translations: { de: 'Selbstvertrauen', fr: 'Confiance en soi', es: 'Confianza' } },
  { name: 'Creative Thinking', category: 'Communication & Interpersonal', translations: { de: 'Kreatives Denken', fr: 'Pensée créative', es: 'Pensamiento creativo' } },
  { name: 'Critical Thinking', category: 'Communication & Interpersonal', translations: { de: 'Kritisches Denken', fr: 'Esprit critique', es: 'Pensamiento crítico' } },
  { name: 'Cross-Cultural Communication', category: 'Communication & Interpersonal', translations: { de: 'Interkulturelle Kommunikation', fr: 'Communication interculturelle', es: 'Comunicación intercultural' } },

  // --- Analytical & Technical ---
  { name: 'C++', category: 'Analytical & Technical', translations: { de: 'C++', fr: 'C++', es: 'C++' } },
  { name: 'C#', category: 'Analytical & Technical', translations: { de: 'C#', fr: 'C#', es: 'C#' } },
  { name: 'Cloud Computing', category: 'Analytical & Technical', translations: { de: 'Cloud Computing', fr: 'Cloud Computing', es: 'Computación en la nube' } },
  { name: 'Coding', category: 'Analytical & Technical', translations: { de: 'Programmieren', fr: 'Codage', es: 'Codificación' } },
  { name: 'Computer Science', category: 'Analytical & Technical', translations: { de: 'Informatik', fr: 'Informatique', es: 'Ciencias de la computación' } },
  { name: 'Content Management Systems (CMS)', category: 'Analytical & Technical', translations: { de: 'Content-Management-Systeme (CMS)', fr: 'Systèmes de gestion de contenu (CMS)', es: 'Sistemas de gestión de contenidos (CMS)' } },
  { name: 'Cryptography', category: 'Analytical & Technical', translations: { de: 'Kryptographie', fr: 'Cryptographie', es: 'Criptografía' } },
  { name: 'Cybersecurity', category: 'Analytical & Technical', translations: { de: 'Cybersicherheit', fr: 'Cybersécurité', es: 'Ciberseguridad' } },
  { name: 'Cascading Style Sheets (CSS)', category: 'Analytical & Technical', translations: { de: 'Cascading Style Sheets (CSS)', fr: 'Feuilles de style en cascade (CSS)', es: 'Hojas de estilo en cascada (CSS)' } },
  
  // --- Personal Development & Mindset ---
  { name: 'Calmness', category: 'Personal Development & Mindset', translations: { de: 'Gelassenheit', fr: 'Calme', es: 'Calma' } },
  { name: 'Capacity Building', category: 'Personal Development & Mindset', translations: { de: 'Kapazitätsaufbau', fr: 'Renforcement des capacités', es: 'Desarrollo de capacidades' } },
  { name: 'Cognitive Restructuring', category: 'Personal Development & Mindset', translations: { de: 'Kognitive Umstrukturierung', fr: 'Restructuration cognitive', es: 'Reestructuración cognitiva' } },
  { name: 'Commitment', category: 'Personal Development & Mindset', translations: { de: 'Engagement', fr: 'Engagement', es: 'Compromiso' } },
  { name: 'Consciousness', category: 'Personal Development & Mindset', translations: { de: 'Bewusstsein', fr: 'Conscience', es: 'Conciencia' } },
  { name: 'Courage', category: 'Personal Development & Mindset', translations: { de: 'Mut', fr: 'Courage', es: 'Coraje' } },
  { name: 'Creativity', category: 'Personal Development & Mindset', translations: { de: 'Kreativität', fr: 'Créativité', es: 'Creatividad' } },
  { name: 'Curiosity', category: 'Personal Development & Mindset', translations: { de: 'Neugier', fr: 'Curiosité', es: 'Curiosidad' } },
  
  // --- Wellness & Creative Arts ---
  { name: 'Calligraphy', category: 'Wellness & Creative Arts', translations: { de: 'Kalligraphie', fr: 'Calligraphie', es: 'Caligrafía' } },
  { name: 'Camping', category: 'Wellness & Creative Arts', translations: { de: 'Camping', fr: 'Camping', es: 'Camping' } },
  { name: 'Ceramics', category: 'Wellness & Creative Arts', translations: { de: 'Keramik', fr: 'Céramique', es: 'Cerámica' } },
  { name: 'Chakra Balancing', category: 'Wellness & Creative Arts', translations: { de: 'Chakrenausgleich', fr: 'Équilibrage des chakras', es: 'Equilibrio de chakras' } },
  { name: 'Cinema', category: 'Wellness & Creative Arts', translations: { de: 'Kino', fr: 'Cinéma', es: 'Cine' } },
  { name: 'Climbing', category: 'Wellness & Creative Arts', translations: { de: 'Klettern', fr: 'Escalade', es: 'Escalada' } },
  { name: 'Cooking', category: 'Wellness & Creative Arts', translations: { de: 'Kochen', fr: 'Cuisine', es: 'Cocina' } },
  { name: 'Crafting', category: 'Wellness & Creative Arts', translations: { de: 'Handwerken', fr: 'Artisanat', es: 'Artesanía' } },
  { name: 'Creative Writing', category: 'Wellness & Creative Arts', translations: { de: 'Kreatives Schreiben', fr: 'Écriture créative', es: 'Escritura creativa' } },
  { name: 'Crochet', category: 'Wellness & Creative Arts', translations: { de: 'Häkeln', fr: 'Crochet', es: 'Croché' } },
  { name: 'Crystal Healing', category: 'Wellness & Creative Arts', translations: { de: 'Kristallheilung', fr: 'Lithothérapie', es: 'Cristaloterapia' } },
  { name: 'Cycling', category: 'Wellness & Creative Arts', translations: { de: 'Radfahren', fr: 'Cyclisme', es: 'Ciclismo' } },
  { name: 'Cognitive Behavioral Therapy (CBT) techniques', category: 'Wellness & Creative Arts', translations: { de: 'Techniken der kognitiven Verhaltenstherapie (KVT)', fr: 'Techniques de thérapie cognitivo-comportementale (TCC)', es: 'Técnicas de terapia cognitivo-conductual (TCC)' } },
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