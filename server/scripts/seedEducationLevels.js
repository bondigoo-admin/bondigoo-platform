// scripts/seedEducationLevels.js

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const EducationLevel = require('../models/EducationLevel');
const Translation = require('../models/Translation');

const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is not defined in your environment variables.');
  process.exit(1);
}

// --- DATA TO UPLOAD ---
// A list of education levels, including general degrees and specific coaching certifications.
// The 'order' field helps in sorting them logically.
const dataToUpload = [
  // --- Academic Degrees ---
  {
    name: 'PhD (Doctor of Philosophy)', order: 10,
    translations: { de: 'Doktorat (PhD)', fr: 'Doctorat (PhD)', es: 'Doctorado (PhD)' },
  },
  {
    name: 'Master\'s Degree', order: 20,
    translations: { de: 'Master-Abschluss', fr: 'Master', es: 'Máster' },
  },
  {
    name: 'Bachelor\'s Degree', order: 30,
    translations: { de: 'Bachelor-Abschluss', fr: 'Bachelor', es: 'Licenciatura / Grado' },
  },
  {
    name: 'Associate Degree', order: 40,
    translations: { de: 'Associate Degree', fr: 'Diplôme d\'associé', es: 'Grado Asociado' },
  },

  // --- Swiss Federal & Advanced Diplomas ---
  {
    name: 'Federal Diploma as Coach/Supervisor', order: 50,
    translations: { de: 'Coach/Supervisor mit eidg. Diplom', fr: 'Coach/Superviseur avec diplôme fédéral', es: 'Diploma Federal de Coach/Supervisor' },
  },
  {
    name: 'Federal Certificate as Corporate Mentor', order: 55,
    translations: { de: 'Betrieblicher Mentor mit eidg. Fachausweis', fr: 'Mentor d\'entreprise avec brevet fédéral', es: 'Certificado Federal de Mentor Corporativo' },
  },
  {
    name: 'MAS (Master of Advanced Studies)', order: 60,
    translations: { de: 'MAS (Master of Advanced Studies)', fr: 'MAS (Master of Advanced Studies)', es: 'MAS (Master of Advanced Studies)' },
  },
  {
    name: 'DAS (Diploma of Advanced Studies)', order: 70,
    translations: { de: 'DAS (Diploma of Advanced Studies)', fr: 'DAS (Diploma of Advanced Studies)', es: 'DAS (Diploma of Advanced Studies)' },
  },
  {
    name: 'CAS (Certificate of Advanced Studies)', order: 80,
    translations: { de: 'CAS (Zertifikat für weiterführende Studien)', fr: 'CAS (Certificate of Advanced Studies)', es: 'CAS (Certificate of Advanced Studies)' },
  },

  // --- International Coaching Federation (ICF) ---
  {
    name: 'ICF Master Certified Coach (MCC)', order: 90,
    translations: { de: 'ICF Master Certified Coach (MCC)', fr: 'ICF Master Certified Coach (MCC)', es: 'ICF Master Certified Coach (MCC)' },
  },
  {
    name: 'ICF Professional Certified Coach (PCC)', order: 100,
    translations: { de: 'ICF Professional Certified Coach (PCC)', fr: 'ICF Professional Certified Coach (PCC)', es: 'ICF Professional Certified Coach (PCC)' },
  },
  {
    name: 'ICF Associate Certified Coach (ACC)', order: 110,
    translations: { de: 'ICF Associate Certified Coach (ACC)', fr: 'ICF Associate Certified Coach (ACC)', es: 'ICF Associate Certified Coach (ACC)' },
  },

  // --- Swiss/European Associations ---
  {
    name: 'Coach BSO', order: 120,
    translations: { de: 'Coach BSO', fr: 'Coach BSO', es: 'Coach BSO' },
  },
  {
    name: 'Supervisor-Coach BSO', order: 125,
    translations: { de: 'Supervisor-Coach BSO', fr: 'Superviseur-Coach BSO', es: 'Supervisor-Coach BSO' },
  },
  {
    name: 'ECA Licensed Master Coach', order: 130,
    translations: { de: 'ECA Lizenzierter Master Coach', fr: 'Coach Master licencié ECA', es: 'Coach Master con licencia ECA' },
  },
  {
    name: 'ECA Licensed Coach', order: 140,
    translations: { de: 'ECA Lizenzierter Coach', fr: 'Coach licencié ECA', es: 'Coach con licencia ECA' },
  },
  
  // --- General & Vocational Education ---
  {
    name: 'Vocational Diploma', order: 150,
    translations: { de: 'Berufsdiplom / Fähigkeitszeugnis', fr: 'Diplôme professionnel', es: 'Diploma vocacional' },
  },
  {
    name: 'High School Diploma / Matura', order: 160,
    translations: { de: 'Abitur / Matura', fr: 'Baccalauréat / Maturité', es: 'Bachillerato' },
  }
];


const seedEducationLevels = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    let createdCount = 0;
    for (const item of dataToUpload) {
      const existingLevel = await EducationLevel.findOne({ name: item.name });

      if (existingLevel) {
        console.log(`Skipping existing education level: "${item.name}"`);
        continue;
      }

      // 1. Create the new EducationLevel
      const newLevel = new EducationLevel({
        name: item.name,
        order: item.order
      });
      await newLevel.save();

      // 2. Create the corresponding Translation
      const newTranslation = new Translation({
        key: `educationLevels_${newLevel._id}`,
        listType: 'educationLevels',
        translations: item.translations,
      });
      await newTranslation.save();

      console.log(`Successfully created: "${item.name}" and its translations.`);
      createdCount++;
    }

    console.log(`\nSeed complete. Created ${createdCount} new education levels and their translations.`);
  } catch (error) {
    console.error('An error occurred during the seed process:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

// --- Run the Seeder ---
seedEducationLevels();