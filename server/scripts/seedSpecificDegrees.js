// scripts/seedSpecificDegrees.js

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
// A list of specific degrees relevant to coaching in the Swiss context.
const dataToUpload = [
  // --- Master's Degrees (ordered starting from 200) ---
  { name: "M.Sc. in Psychology", order: 200, translations: { de: "M.Sc. in Psychologie", fr: "M.Sc. en Psychologie", es: "M.Sc. en Psicología" } },
  { name: "M.Sc. in Work & Organisational Psychology", order: 205, translations: { de: "M.Sc. in Arbeits- & Organisationspsychologie", fr: "M.Sc. en Psychologie du travail et des organisations", es: "M.Sc. en Psicología del Trabajo y Organizacional" } },
  { name: "M.A. in Business Administration", order: 210, translations: { de: "M.A. in Betriebswirtschaftslehre (BWL)", fr: "M.A. en Gestion d'entreprise", es: "M.A. en Administración de Empresas" } },
  { name: "MBA (Master of Business Administration)", order: 215, translations: { de: "MBA (Master of Business Administration)", fr: "MBA (Master of Business Administration)", es: "MBA (Maestría en Administración de Empresas)" } },
  { name: "M.A. in Human Resources Management", order: 220, translations: { de: "M.A. in Personalmanagement", fr: "M.A. en Gestion des ressources humaines", es: "M.A. en Gestión de Recursos Humanos" } },
  { name: "M.A. in Adult and Continuing Education", order: 225, translations: { de: "M.A. in Erwachsenenbildung und Weiterbildung", fr: "M.A. en Formation des adultes", es: "M.A. en Educación de Adultos" } },
  { name: "M.Sc. in Management, Technology and Economics", order: 230, translations: { de: "M.Sc. in Management, Technologie und Ökonomie", fr: "M.Sc. en Management, technologie et économie", es: "M.Sc. en Gestión, Tecnología y Economía" } },
  { name: "M.A. in Social Sciences", order: 235, translations: { de: "M.A. in Sozialwissenschaften", fr: "M.A. en Sciences sociales", es: "M.A. en Ciencias Sociales" } },
  { name: "M.A. in Communication Science", order: 240, translations: { de: "M.A. in Kommunikationswissenschaft", fr: "M.A. en Sciences de la communication", es: "M.A. en Ciencias de la Comunicación" } },
  { name: "Master of Law (MLaw)", order: 245, translations: { de: "Master of Law (MLaw)", fr: "Maîtrise en Droit (MLaw)", es: "Maestría en Derecho (MLaw)" } },
  { name: "M.Sc. in Health Sciences", order: 250, translations: { de: "M.Sc. in Gesundheitswissenschaften", fr: "M.Sc. en Sciences de la santé", es: "M.Sc. en Ciencias de la Salud" } },
  { name: "M.Sc. in Business Psychology (FH)", order: 255, translations: { de: "M.Sc. in Wirtschaftspsychologie (FH)", fr: "M.Sc. en Psychologie d'entreprise (HES)", es: "M.Sc. en Psicología Empresarial (UAS)" } },
  { name: "M.A. in Leadership", order: 260, translations: { de: "M.A. in Leadership", fr: "M.A. en Leadership", es: "M.A. en Liderazgo" } },
  { name: "M.Sc. in Neuroscience", order: 265, translations: { de: "M.Sc. in Neurowissenschaften", fr: "M.Sc. en Neurosciences", es: "M.Sc. en Neurociencia" } },
  { name: "M.A. in Sociology", order: 270, translations: { de: "M.A. in Soziologie", fr: "M.A. en Sociologie", es: "M.A. en Sociología" } },

  // --- Bachelor's Degrees (ordered starting from 300) ---
  { name: "B.Sc. in Psychology", order: 300, translations: { de: "B.Sc. in Psychologie", fr: "B.Sc. en Psychologie", es: "B.Sc. en Psicología" } },
  { name: "B.Sc. in Applied Psychology (FH)", order: 305, translations: { de: "B.Sc. in Angewandter Psychologie (FH)", fr: "B.Sc. en Psychologie appliquée (HES)", es: "B.Sc. en Psicología Aplicada (UAS)" } },
  { name: "B.A. in Business Administration", order: 310, translations: { de: "B.A. in Betriebswirtschaftslehre (BWL)", fr: "B.A. en Gestion d'entreprise", es: "B.A. en Administración de Empresas" } },
  { name: "B.Sc. in Business Information Technology (FH)", order: 315, translations: { de: "B.Sc. in Wirtschaftsinformatik (FH)", fr: "B.Sc. en Informatique de gestion (HES)", es: "B.Sc. en Informática de Gestión (UAS)" } },
  { name: "B.A. in Human Resources Management (FH)", order: 320, translations: { de: "B.A. in Personalmanagement (FH)", fr: "B.A. en Gestion des ressources humaines (HES)", es: "B.A. en Gestión de Recursos Humanos (UAS)" } },
  { name: "B.A. in Social Work (FH)", order: 325, translations: { de: "B.A. in Sozialer Arbeit (FH)", fr: "B.A. en Travail social (HES)", es: "B.A. en Trabajo Social (UAS)" } },
  { name: "B.A. in Communication", order: 330, translations: { de: "B.A. in Kommunikation", fr: "B.A. en Communication", es: "B.A. en Comunicación" } },
  { name: "B.Sc. in Economics", order: 335, translations: { de: "B.Sc. in Volkswirtschaftslehre (VWL)", fr: "B.Sc. en Sciences économiques", es: "B.Sc. en Economía" } },
  { name: "B.A. in Pedagogy / Education Science", order: 340, translations: { de: "B.A. in Pädagogik / Erziehungswissenschaften", fr: "B.A. en Pédagogie / Sciences de l'éducation", es: "B.A. en Pedagogía / Ciencias de la Educación" } },
  { name: "Bachelor of Law (BLaw)", order: 345, translations: { de: "Bachelor of Law (BLaw)", fr: "Baccalauréat en Droit (BLaw)", es: "Grado en Derecho (BLaw)" } },
  { name: "B.Sc. in Nutrition and Dietetics (FH)", order: 350, translations: { de: "B.Sc. in Ernährung und Diätetik (FH)", fr: "B.Sc. en Nutrition et diététique (HES)", es: "B.Sc. en Nutrición y Dietética (UAS)" } },
  { name: "B.A. in Philosophy", order: 355, translations: { de: "B.A. in Philosophie", fr: "B.A. en Philosophie", es: "B.A. en Filosofía" } },
  { name: "B.A. in International Relations", order: 360, translations: { de: "B.A. in Internationale Beziehungen", fr: "B.A. en Relations internationales", es: "B.A. en Relaciones Internacionales" } },
  { name: "B.Sc. in Engineering and Management", order: 365, translations: { de: "B.Sc. in Wirtschaftsingenieurwesen", fr: "B.Sc. en Ingénierie et management", es: "B.Sc. en Ingeniería y Gestión" } },
  { name: "B.A. in Public Management & Economics", order: 370, translations: { de: "B.A. in Public Management & Economics", fr: "B.A. en Gestion publique et économie", es: "B.A. en Gestión Pública y Economía" } },
];


const seedSpecificDegrees = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    let createdCount = 0;
    for (const item of dataToUpload) {
      const existingLevel = await EducationLevel.findOne({ name: item.name });

      if (existingLevel) {
        console.log(`Skipping existing degree: "${item.name}"`);
        continue;
      }

      const newLevel = new EducationLevel({
        name: item.name,
        order: item.order
      });
      await newLevel.save();

      const newTranslation = new Translation({
        key: `educationLevels_${newLevel._id}`,
        listType: 'educationLevels',
        translations: item.translations,
      });
      await newTranslation.save();

      console.log(`Successfully created: "${item.name}" with order ${item.order}.`);
      createdCount++;
    }

    console.log(`\nSeed complete. Created ${createdCount} new specific degrees and their translations.`);
  } catch (error) {
    console.error('An error occurred during the seed process:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

// --- Run the Seeder ---
seedSpecificDegrees();