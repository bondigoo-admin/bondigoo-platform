// scripts/seedSkills_V.js

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
// A list of 60 general and specific coaching-related skills starting with 'V'.
const dataToUpload = [
  // --- Leadership & Management ---
  { name: 'Validating Others', category: 'Leadership & Management', translations: { de: 'Andere validieren', fr: 'Valider les autres', es: 'Validar a los demás' } },
  { name: 'Valuing Diversity', category: 'Leadership & Management', translations: { de: 'Vielfalt schätzen', fr: 'Valoriser la diversité', es: 'Valorar la diversidad' } },
  { name: 'Values-Based Leadership', category: 'Leadership & Management', translations: { de: 'Wertebasierte Führung', fr: 'Leadership basé sur les valeurs', es: 'Liderazgo basado en valores' } },
  { name: 'Vendor Management', category: 'Leadership & Management', translations: { de: 'Lieferantenmanagement', fr: 'Gestion des fournisseurs', es: 'Gestión de proveedores' } },
  { name: 'Vision Setting', category: 'Leadership & Management', translations: { de: 'Visionen entwickeln', fr: 'Définition de la vision', es: 'Establecimiento de la visión' } },
  { name: 'Visionary Leadership', category: 'Leadership & Management', translations: { de: 'Visionäre Führung', fr: 'Leadership visionnaire', es: 'Liderazgo visionario' } },
  { name: 'Virtual Team Leadership', category: 'Leadership & Management', translations: { de: 'Führung virtueller Teams', fr: 'Leadership d\'équipe virtuelle', es: 'Liderazgo de equipos virtuales' } },
  { name: 'Volunteer Management', category: 'Leadership & Management', translations: { de: 'Freiwilligenmanagement', fr: 'Gestion des bénévoles', es: 'Gestión de voluntarios' } },
  
  // --- Business & Finance ---
  { name: 'Valuation', category: 'Business & Finance', translations: { de: 'Bewertung', fr: 'Évaluation', es: 'Valoración' } },
  { name: 'Value Chain Analysis', category: 'Business & Finance', translations: { de: 'Wertkettenanalyse', fr: 'Analyse de la chaîne de valeur', es: 'Análisis de la cadena de valor' } },
  { name: 'Value Engineering', category: 'Business & Finance', translations: { de: 'Wertanalyse', fr: 'Ingénierie de la valeur', es: 'Ingeniería de valor' } },
  { name: 'Value Proposition', category: 'Business & Finance', translations: { de: 'Wertversprechen', fr: 'Proposition de valeur', es: 'Propuesta de valor' } },
  { name: 'VAT (Value Added Tax) Compliance', category: 'Business & Finance', translations: { de: 'Mehrwertsteuer-Konformität', fr: 'Conformité à la TVA', es: 'Cumplimiento del IVA' } },
  { name: 'Vendor Negotiation', category: 'Business & Finance', translations: { de: 'Lieferantenverhandlungen', fr: 'Négociation avec les fournisseurs', es: 'Negociación con proveedores' } },
  { name: 'Vendor Relations', category: 'Business & Finance', translations: { de: 'Lieferantenbeziehungen', fr: 'Relations avec les fournisseurs', es: 'Relaciones con proveedores' } },
  { name: 'Venture Capital', category: 'Business & Finance', translations: { de: 'Risikokapital', fr: 'Capital-risque', es: 'Capital de riesgo' } },
  { name: 'Visual Merchandising', category: 'Business & Finance', translations: { de: 'Visuelles Merchandising', fr: 'Merchandising visuel', es: 'Merchandising visual' } },
  { name: 'Voice of the Customer (VoC)', category: 'Business & Finance', translations: { de: 'Stimme des Kunden (VoC)', fr: 'Voix du client (VoC)', es: 'Voz del cliente (VoC)' } },

  // --- Communication & Interpersonal ---
  { name: 'Verbal Communication', category: 'Communication & Interpersonal', translations: { de: 'Verbale Kommunikation', fr: 'Communication verbale', es: 'Comunicación verbal' } },
  { name: 'Video Conferencing', category: 'Communication & Interpersonal', translations: { de: 'Videokonferenzen', fr: 'Vidéoconférence', es: 'Videoconferencia' } },
  { name: 'Virtual Communication', category: 'Communication & Interpersonal', translations: { de: 'Virtuelle Kommunikation', fr: 'Communication virtuelle', es: 'Comunicación virtual' } },
  { name: 'Visual Communication', category: 'Communication & Interpersonal', translations: { de: 'Visuelle Kommunikation', fr: 'Communication visuelle', es: 'Comunicación visual' } },
  { name: 'Vocal Variety', category: 'Communication & Interpersonal', translations: { de: 'Stimmvielfalt', fr: 'Variété vocale', es: 'Variedad vocal' } },
  { name: 'Voice Acting', category: 'Communication & Interpersonal', translations: { de: 'Synchronsprechen', fr: 'Doublage', es: 'Actuación de voz' } },
  
  // --- Analytical & Technical ---
  { name: 'Version Control', category: 'Analytical & Technical', translations: { de: 'Versionskontrolle', fr: 'Contrôle de version', es: 'Control de versiones' } },
  { name: 'Video Editing', category: 'Analytical & Technical', translations: { de: 'Videobearbeitung', fr: 'Montage vidéo', es: 'Edición de video' } },
  { name: 'Video Production', category: 'Analytical & Technical', translations: { de: 'Videoproduktion', fr: 'Production vidéo', es: 'Producción de video' } },
  { name: 'Virtualization', category: 'Analytical & Technical', translations: { de: 'Virtualisierung', fr: 'Virtualisation', es: 'Virtualización' } },
  { name: 'Visual Basic for Applications (VBA)', category: 'Analytical & Technical', translations: { de: 'Visual Basic für Applikationen (VBA)', fr: 'Visual Basic pour Applications (VBA)', es: 'Visual Basic para Aplicaciones (VBA)' } },
  { name: 'Visual Studio', category: 'Analytical & Technical', translations: { de: 'Visual Studio', fr: 'Visual Studio', es: 'Visual Studio' } },
  { name: 'VMware', category: 'Analytical & Technical', translations: { de: 'VMware', fr: 'VMware', es: 'VMware' } },
  { name: 'VPN Management', category: 'Analytical & Technical', translations: { de: 'VPN-Management', fr: 'Gestion VPN', es: 'Gestión de VPN' } },
  { name: 'Vue.js', category: 'Analytical & Technical', translations: { de: 'Vue.js', fr: 'Vue.js', es: 'Vue.js' } },
  { name: 'Vulnerability Assessment', category: 'Analytical & Technical', translations: { de: 'Schwachstellenanalyse', fr: 'Évaluation de la vulnérabilité', es: 'Evaluación de vulnerabilidades' } },

  // --- Personal Development & Mindset ---
  { name: 'Values Alignment', category: 'Personal Development & Mindset', translations: { de: 'Werteabgleich', fr: 'Alignement des valeurs', es: 'Alineación de valores' } },
  { name: 'Values Clarification', category: 'Personal Development & Mindset', translations: { de: 'Werteklärung', fr: 'Clarification des valeurs', es: 'Clarificación de valores' } },
  { name: 'Vision Board Creation', category: 'Personal Development & Mindset', translations: { de: 'Erstellung von Visionboards', fr: 'Création de tableaux de vision', es: 'Creación de tableros de visión' } },
  { name: 'Visioning', category: 'Personal Development & Mindset', translations: { de: 'Visionierung', fr: 'Visioning', es: 'Visualización estratégica' } },
  { name: 'Visualization', category: 'Personal Development & Mindset', translations: { de: 'Visualisierung', fr: 'Visualisation', es: 'Visualización' } },
  { name: 'Vitality', category: 'Personal Development & Mindset', translations: { de: 'Vitalität', fr: 'Vitalité', es: 'Vitalidad' } },
  { name: 'Vulnerability', category: 'Personal Development & Mindset', translations: { de: 'Verletzlichkeit', fr: 'Vulnérabilité', es: 'Vulnerabilidad' } },
  { name: 'Vigor', category: 'Personal Development & Mindset', translations: { de: 'Tatkraft', fr: 'Vigueur', es: 'Vigor' } },
  { name: 'Virtue Ethics', category: 'Personal Development & Mindset', translations: { de: 'Tugendethik', fr: 'Éthique de la vertu', es: 'Ética de la virtud' } },
  
  // --- Wellness & Creative Arts ---
  { name: 'Vegan Cooking', category: 'Wellness & Creative Arts', translations: { de: 'Vegane Küche', fr: 'Cuisine végétalienne', es: 'Cocina vegana' } },
  { name: 'Vegetarian Nutrition', category: 'Wellness & Creative Arts', translations: { de: 'Vegetarische Ernährung', fr: 'Nutrition végétarienne', es: 'Nutrición vegetariana' } },
  { name: 'Veterinary Medicine', category: 'Wellness & Creative Arts', translations: { de: 'Tiermedizin', fr: 'Médecine vétérinaire', es: 'Medicina veterinaria' } },
  { name: 'Video Game Design', category: 'Wellness & Creative Arts', translations: { de: 'Videospieldesign', fr: 'Conception de jeux vidéo', es: 'Diseño de videojuegos' } },
  { name: 'Vinyasa Yoga', category: 'Wellness & Creative Arts', translations: { de: 'Vinyasa Yoga', fr: 'Vinyasa Yoga', es: 'Vinyasa Yoga' } },
  { name: 'Violin', category: 'Wellness & Creative Arts', translations: { de: 'Violine', fr: 'Violon', es: 'Violín' } },
  { name: 'Visual Arts', category: 'Wellness & Creative Arts', translations: { de: 'Bildende Kunst', fr: 'Arts visuels', es: 'Artes visuales' } },
  { name: 'Viticulture', category: 'Wellness & Creative Arts', translations: { de: 'Weinbau', fr: 'Viticulture', es: 'Viticultura' } },
  { name: 'Vlogging', category: 'Wellness & Creative Arts', translations: { de: 'Vlogging', fr: 'Vlogging', es: 'Vlogging' } },
  { name: 'Voice Coaching', category: 'Wellness & Creative Arts', translations: { de: 'Stimmcoaching', fr: 'Coaching vocal', es: 'Coaching de voz' } },
  { name: 'Voice Lessons', category: 'Wellness & Creative Arts', translations: { de: 'Gesangsunterricht', fr: 'Cours de chant', es: 'Clases de canto' } },
  { name: 'Volcanology', category: 'Wellness & Creative Arts', translations: { de: 'Vulkanologie', fr: 'Volcanologie', es: 'Vulcanología' } },
  { name: 'Volleyball', category: 'Wellness & Creative Arts', translations: { de: 'Volleyball', fr: 'Volley-ball', es: 'Voleibol' } },
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