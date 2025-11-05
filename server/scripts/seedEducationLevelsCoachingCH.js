// scripts/seedEducationLevelsCoachingCH.js

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

const dataToUpload = [

  {
    name: 'Corporate Mentor with Federal Diploma', order: 405,
    translations: { de: 'Betriebliche/-r Mentor/-in mit eidg. Fachausweis', fr: 'Mentor/e d\'entreprise avec brevet fédéral', es: 'Mentor/a corporativo/a con diploma federal' },
  },
  {
    name: 'Supervisor-Coach with Advanced Federal Diploma', order: 410,
    translations: { de: 'Supervisor/-in-Coach mit eidg. Diplom', fr: 'Superviseur-Coach avec diplôme fédéral', es: 'Supervisor-Coach con diploma federal superior' },
  },
  {
    name: 'Organizational Consultant with Advanced Federal Diploma', order: 415,
    translations: { de: 'Organisationsberater/-in mit eidg. Diplom', fr: 'Consultant/e en organisation avec diplôme fédéral', es: 'Consultor/a organizacional con diploma federal superior' },
  },
  {
    name: 'Head of Training with Advanced Federal Diploma', order: 420,
    translations: { de: 'Ausbildungsleiter/-in mit eidg. Diplom', fr: 'Responsable de formation avec diplôme fédéral', es: 'Jefe/a de formación con diploma federal superior' },
  },

  { name: 'CAS Coaching', order: 435, translations: { de: 'CAS Coaching', fr: 'CAS Coaching', es: 'CAS Coaching' } },
  { name: 'CAS Coaching in Organizations', order: 440, translations: { de: 'CAS Coaching in Organisationen', fr: 'CAS Coaching en organisations', es: 'CAS Coaching en organizaciones' } },
  { name: 'CAS Systemic Coaching & Consulting', order: 445, translations: { de: 'CAS Systemisches Coaching & Beratung', fr: 'CAS Coaching & conseil systémiques', es: 'CAS Coaching y consultoría sistémicos' } },
  { name: 'CAS Business Coaching', order: 450, translations: { de: 'CAS Business Coaching', fr: 'CAS Business Coaching', es: 'CAS Business Coaching' } },
  { name: 'CAS Leadership Coaching', order: 455, translations: { de: 'CAS Leadership Coaching', fr: 'CAS Leadership Coaching', es: 'CAS Coaching de liderazgo' } },
  { name: 'CAS Executive Coaching', order: 460, translations: { de: 'CAS Executive Coaching', fr: 'CAS Executive Coaching', es: 'CAS Executive Coaching' } },
  { name: 'CAS Team Coaching', order: 465, translations: { de: 'CAS Teamcoaching', fr: 'CAS Coaching d\'équipe', es: 'CAS Coaching de equipos' } },
  { name: 'CAS Agile Coach', order: 470, translations: { de: 'CAS Agile Coach', fr: 'CAS Coach Agile', es: 'CAS Agile Coach' } },
  { name: 'CAS Career Coaching', order: 475, translations: { de: 'CAS Laufbahncoaching', fr: 'CAS Coaching de carrière', es: 'CAS Coaching de carrera' } },
  { name: 'CAS Sports Coaching / Sports Mental Training', order: 480, translations: { de: 'CAS Sportcoaching / Sportmentaltraining', fr: 'CAS Coaching sportif / Préparation mentale sportive', es: 'CAS Coaching deportivo / Entrenamiento mental deportivo' } },
  { name: 'CAS Health & Resource Coaching', order: 485, translations: { de: 'CAS Gesundheits- und Ressourcen-Coaching', fr: 'CAS Coaching en santé & ressources', es: 'CAS Coaching de salud y recursos' } },
  { name: 'CAS Coaching for Transformation', order: 490, translations: { de: 'CAS Coaching für die Transformation', fr: 'CAS Coaching pour la transformation', es: 'CAS Coaching para la transformación' } },
  { name: 'CAS Conflict Management & Mediation', order: 495, translations: { de: 'CAS Konfliktmanagement & Mediation', fr: 'CAS Gestion de conflits & médiation', es: 'CAS Gestión de conflictos y mediación' } },
  { name: 'CAS Psychosocial Counseling', order: 500, translations: { de: 'CAS Psychosoziale Beratung', fr: 'CAS Conseil psychosocial', es: 'CAS Asesoramiento psicosocial' } },
  { name: 'CAS Resilience Training', order: 505, translations: { de: 'CAS Resilienztraining', fr: 'CAS Formation en résilience', es: 'CAS Entrenamiento en resiliencia' } },
  { name: 'CAS Positive Psychology', order: 510, translations: { de: 'CAS Positive Psychologie', fr: 'CAS Psychologie positive', es: 'CAS Psicología positiva' } },
  { name: 'DAS Coaching', order: 520, translations: { de: 'DAS Coaching', fr: 'DAS Coaching', es: 'DAS Coaching' } },
  { name: 'DAS Coaching & Supervision in Organizations', order: 525, translations: { de: 'DAS Coaching & Supervision in Organisationen', fr: 'DAS Coaching & supervision en organisations', es: 'DAS Coaching y supervisión en organizaciones' } },
  { name: 'DAS Coaching & Organizational Consulting', order: 530, translations: { de: 'DAS Coaching & Organisationsberatung', fr: 'DAS Coaching & conseil en organisation', es: 'DAS Coaching y consultoría organizacional' } },
  { name: 'DAS Systemic Coaching', order: 535, translations: { de: 'DAS Systemisches Coaching', fr: 'DAS Coaching systémique', es: 'DAS Coaching sistémico' } },
  { name: 'DAS Leadership and Coaching', order: 540, translations: { de: 'DAS Leadership und Coaching', fr: 'DAS Leadership et coaching', es: 'DAS Liderazgo y coaching' } },
  { name: 'DAS Psychological Counseling & Coaching', order: 545, translations: { de: 'DAS Psychologische Beratung & Coaching', fr: 'DAS Conseil psychologique & coaching', es: 'DAS Asesoramiento psicológico y coaching' } },
  { name: 'DAS Change Management, Organizational Development & Consulting', order: 550, translations: { de: 'DAS Change Management, Organisationsentwicklung & -beratung', fr: 'DAS Gestion du changement, développement & conseil organisationnel', es: 'DAS Gestión del cambio, desarrollo y consultoría organizacional' } },
  { name: 'MAS Coaching, Supervision and Organizational Consulting', order: 560, translations: { de: 'MAS Coaching, Supervision und Organisationsberatung', fr: 'MAS Coaching, supervision et conseil en organisation', es: 'MAS Coaching, supervisión y consultoría organizacional' } },
  { name: 'MAS Systemic Coaching', order: 565, translations: { de: 'MAS Systemisches Coaching', fr: 'MAS Coaching systémique', es: 'MAS Coaching sistémico' } },
  { name: 'MAS Leadership and Management', order: 570, translations: { de: 'MAS Leadership and Management', fr: 'MAS Leadership et management', es: 'MAS Liderazgo y gestión' } },
  { name: 'MAS Human Capital Management', order: 575, translations: { de: 'MAS Human Capital Management', fr: 'MAS Human Capital Management', es: 'MAS Gestión del capital humano' } },
  { name: 'MAS Professional, Academic and Career Counseling', order: 580, translations: { de: 'MAS Berufs-, Studien- und Laufbahnberatung', fr: 'MAS Conseil en orientation professionnelle, universitaire et de carrière', es: 'MAS Orientación profesional, académica y de carrera' } },
  
  { name: 'General & Systemic Coaching', order: 590, translations: { de: 'General & Systemic Coaching', fr: 'Coaching général & systémique', es: 'Coaching general y sistémico' } },
  { name: 'Certified Coach SCA (Swiss Coaching Association)', order: 595, translations: { de: 'Dipl. Coach SCA (Swiss Coaching Association)', fr: 'Coach diplômé(e) SCA (Swiss Coaching Association)', es: 'Coach certificado/a SCA (Swiss Coaching Association)' } },
  { name: 'Master-Coach SCA', order: 600, translations: { de: 'Master-Coach SCA', fr: 'Master-Coach SCA', es: 'Master-Coach SCA' } },
  { name: 'Coach BSO (Association of Professionals for Coaching, Supervision and Organizational Consulting)', order: 605, translations: { de: 'Coach BSO (Berufsverband für Coaching, Supervision und Organisationsberatung)', fr: 'Coach BSO (Association professionnelle pour le coaching, la supervision et le conseil en organisation)', es: 'Coach BSO (Asociación profesional de coaching, supervisión y consultoría organizacional)' } },
  { name: 'Certified Systemic Coach', order: 610, translations: { de: 'Dipl. Systemischer Coach', fr: 'Coach systémique diplômé(e)', es: 'Coach sistémico certificado/a' } },
  { name: 'Certified Integral Coach', order: 615, translations: { de: 'Dipl. Integral Coach', fr: 'Coach intégral diplômé(e)', es: 'Coach integral certificado/a' } },
  { name: 'Certified Solution-Focused Coach', order: 620, translations: { de: 'Dipl. Lösungsorientierter Coach', fr: 'Coach orienté solutions diplômé(e)', es: 'Coach certificado/a enfocado/a en soluciones' } },
  { name: 'Certified Coach (ICF - ACC/PCC/MCC)', order: 625, translations: { de: 'Zert. Coach (ICF - Associate/Professional/Master Certified Coach ACC/PCC/MCC)', fr: 'Coach certifié(e) (ICF - ACC/PCC/MCC)', es: 'Coach certificado/a (ICF - ACC/PCC/MCC)' } },
  { name: 'Certified Coach (ECA - European Coaching Association)', order: 630, translations: { de: 'Zert. Coach (ECA - European Coaching Association)', fr: 'Coach certifié(e) (ECA - European Coaching Association)', es: 'Coach certificado/a (ECA - European Coaching Association)' } },
  { name: 'Certified Coach (EMCC - European Mentoring & Coaching Council)', order: 635, translations: { de: 'Zert. Coach (EMCC - European Mentoring & Coaching Council)', fr: 'Coach certifié(e) (EMCC - European Mentoring & Coaching Council)', es: 'Coach certificado/a (EMCC - European Mentoring & Coaching Council)' } },
  { name: 'Business, Leadership & Team Coaching', order: 640, translations: { de: 'Business, Leadership & Team Coaching', fr: 'Coaching d\'affaires, de leadership & d\'équipe', es: 'Coaching de negocios, liderazgo y equipos' } },
  { name: 'Certified Business Coach', order: 645, translations: { de: 'Dipl. Business Coach', fr: 'Coach d\'affaires diplômé(e)', es: 'Coach de negocios certificado/a' } },
  { name: 'Certified Leadership Coach', order: 650, translations: { de: 'Dipl. Leadership Coach', fr: 'Coach en leadership diplômé(e)', es: 'Coach de liderazgo certificado/a' } },
  { name: 'Certified Executive Coach', order: 655, translations: { de: 'Dipl. Executive Coach', fr: 'Coach exécutif diplômé(e)', es: 'Coach ejecutivo certificado/a' } },
  { name: 'Certified Team Coach', order: 660, translations: { de: 'Dipl. Team-Coach', fr: 'Coach d\'équipe diplômé(e)', es: 'Coach de equipos certificado/a' } },
  { name: 'Certified Conflict Coach / Mediator', order: 665, translations: { de: 'Dipl. Konfliktcoach / Mediator', fr: 'Coach en conflit / Médiateur diplômé(e)', es: 'Coach de conflictos / Mediador certificado/a' } },
  { name: 'Certified Organizational Developer', order: 670, translations: { de: 'Dipl. Organisationsentwickler/-in', fr: 'Développeur(-euse) organisationnel(le) diplômé(e)', es: 'Desarrollador/a organizacional certificado/a' } },
  { name: 'Certified Change Manager', order: 675, translations: { de: 'Dipl. Change Manager', fr: 'Gestionnaire du changement diplômé(e)', es: 'Gerente de cambio certificado/a' } },
  { name: 'Certified Agile Coach', order: 680, translations: { de: 'Zert. Agile Coach', fr: 'Coach Agile certifié(e)', es: 'Agile Coach certificado/a' } },
  { name: 'Certified Project Management Coach', order: 685, translations: { de: 'Dipl. Projektmanagement-Coach', fr: 'Coach en gestion de projet diplômé(e)', es: 'Coach de gestión de proyectos certificado/a' } },
  { name: 'Life, Mental & Personal Coaching', order: 690, translations: { de: 'Life, Mental & Personal Coaching', fr: 'Coaching de vie, mental & personnel', es: 'Coaching de vida, mental y personal' } },
  { name: 'Certified Life Coach', order: 695, translations: { de: 'Dipl. Life Coach', fr: 'Coach de vie diplômé(e)', es: 'Life Coach certificado/a' } },
  { name: 'Certified Mental Coach', order: 700, translations: { de: 'Dipl. Mentalcoach', fr: 'Coach mental diplômé(e)', es: 'Coach mental certificado/a' } },
  { name: 'Certified Personal Coach', order: 705, translations: { de: 'Dipl. Personal Coach', fr: 'Coach personnel diplômé(e)', es: 'Coach personal certificado/a' } },
  { name: 'Certified Resilience Coach', order: 710, translations: { de: 'Dipl. Resilienz-Coach', fr: 'Coach en résilience diplômé(e)', es: 'Coach de resiliencia certificado/a' } },
  { name: 'Certified Wingwave Coach', order: 715, translations: { de: 'Dipl. Wingwave-Coach', fr: 'Coach Wingwave diplômé(e)', es: 'Coach Wingwave certificado/a' } },
  { name: 'Certified Mindfulness Coach', order: 720, translations: { de: 'Dipl. Achtsamkeitscoach', fr: 'Coach en pleine conscience diplômé(e)', es: 'Coach de mindfulness certificado/a' } },
  { name: 'Certified Personality Coach', order: 725, translations: { de: 'Dipl. Persönlichkeitscoach', fr: 'Coach en personnalité diplômé(e)', es: 'Coach de personalidad certificado/a' } },
  { name: 'Health & Wellness Coaching', order: 730, translations: { de: 'Health & Wellness Coaching', fr: 'Coaching santé & bien-être', es: 'Coaching de salud y bienestar' } },
  { name: 'Certified Health Coach', order: 735, translations: { de: 'Dipl. Gesundheitscoach', fr: 'Coach en santé diplômé(e)', es: 'Coach de salud certificado/a' } },
  { name: 'Certified Nutrition Coach', order: 740, translations: { de: 'Dipl. Ernährungscoach', fr: 'Coach en nutrition diplômé(e)', es: 'Coach de nutrición certificado/a' } },
  { name: 'Certified Fitness Coach', order: 745, translations: { de: 'Dipl. Fitnesscoach', fr: 'Coach fitness diplômé(e)', es: 'Coach de fitness certificado/a' } },
  { name: 'Certified Stress Management Coach / Burnout Counselor', order: 750, translations: { de: 'Dipl. Stressmanagement-Coach / Burnout-Berater', fr: 'Coach en gestion du stress / Conseiller en burnout diplômé(e)', es: 'Coach de gestión del estrés / Asesor de burnout certificado/a' } },
  { name: 'Certified Relaxation Coach', order: 755, translations: { de: 'Dipl. Entspannungstrainer/-in', fr: 'Entraîneur/-euse en relaxation diplômé(e)', es: 'Entrenador/a de relajación certificado/a' } },
  { name: 'Certified Mental Health Coach', order: 760, translations: { de: 'Dipl. Mental-Health-Coach', fr: 'Coach en santé mentale diplômé(e)', es: 'Coach de salud mental certificado/a' } },
  { name: 'Career & Development Coaching', order: 765, translations: { de: 'Career & Development Coaching', fr: 'Coaching de carrière & développement', es: 'Coaching de carrera y desarrollo' } },
  { name: 'Certified Career Coach', order: 770, translations: { de: 'Dipl. Laufbahncoach / Karrierecoach', fr: 'Coach de carrière diplômé(e)', es: 'Coach de carrera certificado/a' } },
  { name: 'Certified Job Coach', order: 775, translations: { de: 'Dipl. Job Coach', fr: 'Job Coach diplômé(e)', es: 'Job Coach certificado/a' } },
  { name: 'Certified Learning Coach', order: 780, translations: { de: 'Dipl. Lerncoach', fr: 'Coach d\'apprentissage diplômé(e)', es: 'Coach de aprendizaje certificado/a' } },
  { name: 'Certified Potential Coach', order: 785, translations: { de: 'Dipl. Potenzial-Coach', fr: 'Coach de potentiel diplômé(e)', es: 'Coach de potencial certificado/a' } },
  { name: 'Certified Application Coach', order: 790, translations: { de: 'Dipl. Bewerbungscoach', fr: 'Coach en candidatures diplômé(e)', es: 'Coach de postulación certificado/a' } },
  { name: 'Specialized Niches', order: 795, translations: { de: 'Specialized Niches', fr: 'Niches spécialisées', es: 'Nichos especializados' } },
  { name: 'Certified Child and Youth Coach', order: 800, translations: { de: 'Dipl. Kinder- und Jugendcoach', fr: 'Coach pour enfants et adolescents diplômé(e)', es: 'Coach infantil y juvenil certificado/a' } },
  { name: 'Certified Family Coach', order: 805, translations: { de: 'Dipl. Familiencoach', fr: 'Coach familial diplômé(e)', es: 'Coach familiar certificado/a' } },
  { name: 'Certified Couples Coach', order: 810, translations: { de: 'Dipl. Paarcoach', fr: 'Coach de couple diplômé(e)', es: 'Coach de parejas certificado/a' } },
  { name: 'Certified Hypnocoach / Certified Hypnotherapist', order: 815, translations: { de: 'Dipl. Hypnosecoach / Dipl. Hypnosetherapeut', fr: 'Hypnocoach / Hypnothérapeute diplômé(e)', es: 'Hipnocoach / Hipnoterapeuta certificado/a' } },
  { name: 'NLP Practitioner', order: 820, translations: { de: 'NLP-Practitioner', fr: 'Praticien PNL', es: 'Practitioner en PNL' } },
  { name: 'NLP Master', order: 825, translations: { de: 'NLP-Master', fr: 'Maître-praticien PNL', es: 'Máster en PNL' } },
  { name: 'NLP Coach', order: 830, translations: { de: 'NLP-Coach', fr: 'Coach PNL', es: 'Coach PNL' } },
  { name: 'Certified Equine-Assisted Coach', order: 835, translations: { de: 'Dipl. Pferdegestützter Coach', fr: 'Coach assisté par le cheval diplômé(e)', es: 'Coach certificado/a asistido/a por caballos' } },
  { name: 'Certified Nature Coach / Outdoor Coach', order: 840, translations: { de: 'Dipl. Natur-Coach / Outdoor-Coach', fr: 'Coach en nature / Coach en plein air diplômé(e)', es: 'Coach de naturaleza / Coach al aire libre certificado/a' } },
  { name: 'Certified Highly Sensitive Person (HSP) Coach', order: 845, translations: { de: 'Dipl. Hochsensibilitätscoach', fr: 'Coach pour personnes hypersensibles diplômé(e)', es: 'Coach para personas altamente sensibles (PAS) certificado/a' } },
  { name: 'Certified Sales Coach', order: 850, translations: { de: 'Dipl. Verkaufscoach', fr: 'Coach en vente diplômé(e)', es: 'Coach de ventas certificado/a' } },
  { name: 'Certified Public Speaking Coach / Rhetoric Coach', order: 855, translations: { de: 'Dipl. Auftritts-Coach / Rhetorik-Coach', fr: 'Coach en prise de parole / Coach en rhétorique diplômé(e)', es: 'Coach de oratoria / Coach de retórica certificado/a' } },

];


const seedEducationLevelsCoachingCH = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    let createdCount = 0;
    for (const item of dataToUpload) {
      // Use a combination of name and order to check for existence, making it more robust
      const existingLevel = await EducationLevel.findOne({ name: item.name, order: item.order });

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
seedEducationLevelsCoachingCH();