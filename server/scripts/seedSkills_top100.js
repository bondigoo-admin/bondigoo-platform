// scripts/seedSkills_Top100.js

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
// A list of the 100 most popular and in-demand skills based on platforms like LinkedIn, Fiverr, and Masterclass.
const dataToUpload = [
  // --- Leadership & Soft Skills ---
  { name: 'Communication', category: 'Leadership & Management', translations: { de: 'Kommunikation', fr: 'Communication', es: 'Comunicación' } },
  { name: 'Leadership', category: 'Leadership & Management', translations: { de: 'Führung', fr: 'Leadership', es: 'Liderazgo' } },
  { name: 'Teamwork', category: 'Leadership & Management', translations: { de: 'Teamarbeit', fr: 'Travail d\'équipe', es: 'Trabajo en equipo' } },
  { name: 'Problem Solving', category: 'Leadership & Management', translations: { de: 'Problemlösung', fr: 'Résolution de problèmes', es: 'Resolución de problemas' } },
  { name: 'Time Management', category: 'Leadership & Management', translations: { de: 'Zeitmanagement', fr: 'Gestion du temps', es: 'Gestión del tiempo' } },
  { name: 'Emotional Intelligence', category: 'Leadership & Management', translations: { de: 'Emotionale Intelligenz', fr: 'Intelligence émotionnelle', es: 'Inteligencia emocional' } },
  { name: 'Critical Thinking', category: 'Leadership & Management', translations: { de: 'Kritisches Denken', fr: 'Pensée critique', es: 'Pensamiento crítico' } },
  { name: 'Adaptability', category: 'Leadership & Management', translations: { de: 'Anpassungsfähigkeit', fr: 'Adaptabilité', es: 'Adaptabilidad' } },
  { name: 'Conflict Resolution', category: 'Leadership & Management', translations: { de: 'Konfliktlösung', fr: 'Résolution de conflits', es: 'Resolución de conflictos' } },
  { name: 'Decision Making', category: 'Leadership & Management', translations: { de: 'Entscheidungsfindung', fr: 'Prise de décision', es: 'Toma de decisiones' } },
  { name: 'Mentoring', category: 'Leadership & Management', translations: { de: 'Mentoring', fr: 'Mentorat', es: 'Mentoría' } },
  { name: 'Negotiation', category: 'Leadership & Management', translations: { de: 'Verhandlung', fr: 'Négociation', es: 'Negociación' } },
  { name: 'Public Speaking', category: 'Leadership & Management', translations: { de: 'Öffentliches Reden', fr: 'Prise de parole en public', es: 'Hablar en público' } },
  { name: 'Active Listening', category: 'Communication & Interpersonal', translations: { de: 'Aktives Zuhören', fr: 'Écoute active', es: 'Escucha activa' } },
  { name: 'Creativity', category: 'Personal Development & Mindset', translations: { de: 'Kreativität', fr: 'Créativité', es: 'Creatividad' } },

  // --- Business & Finance ---
  { name: 'Project Management', category: 'Business & Finance', translations: { de: 'Projektmanagement', fr: 'Gestion de projet', es: 'Gestión de proyectos' } },
  { name: 'Agile Methodologies', category: 'Business & Finance', translations: { de: 'Agile Methoden', fr: 'Méthodologies agiles', es: 'Metodologías ágiles' } },
  { name: 'Scrum', category: 'Business & Finance', translations: { de: 'Scrum', fr: 'Scrum', es: 'Scrum' } },
  { name: 'Business Analysis', category: 'Business & Finance', translations: { de: 'Geschäftsanalyse', fr: 'Analyse d\'affaires', es: 'Análisis de negocio' } },
  { name: 'Digital Marketing', category: 'Business & Finance', translations: { de: 'Digitales Marketing', fr: 'Marketing numérique', es: 'Marketing digital' } },
  { name: 'Social Media Marketing', category: 'Business & Finance', translations: { de: 'Social-Media-Marketing', fr: 'Marketing des médias sociaux', es: 'Marketing en redes sociales' } },
  { name: 'Search Engine Optimization (SEO)', category: 'Business & Finance', translations: { de: 'Suchmaschinenoptimierung (SEO)', fr: 'Optimisation pour les moteurs de recherche (SEO)', es: 'Optimización para motores de búsqueda (SEO)' } },
  { name: 'Content Marketing', category: 'Business & Finance', translations: { de: 'Content-Marketing', fr: 'Marketing de contenu', es: 'Marketing de contenidos' } },
  { name: 'Email Marketing', category: 'Business & Finance', translations: { de: 'E-Mail-Marketing', fr: 'Marketing par courriel', es: 'Email marketing' } },
  { name: 'Copywriting', category: 'Business & Finance', translations: { de: 'Texten', fr: 'Rédaction publicitaire', es: 'Redacción publicitaria' } },
  { name: 'Sales', category: 'Business & Finance', translations: { de: 'Vertrieb', fr: 'Vente', es: 'Ventas' } },
  { name: 'Customer Relationship Management (CRM)', category: 'Business & Finance', translations: { de: 'Kundenbeziehungsmanagement (CRM)', fr: 'Gestion de la relation client (CRM)', es: 'Gestión de la relación con el cliente (CRM)' } },
  { name: 'Salesforce', category: 'Business & Finance', translations: { de: 'Salesforce', fr: 'Salesforce', es: 'Salesforce' } },
  { name: 'Financial Analysis', category: 'Business & Finance', translations: { de: 'Finanzanalyse', fr: 'Analyse financière', es: 'Análisis financiero' } },
  { name: 'Accounting', category: 'Business & Finance', translations: { de: 'Buchhaltung', fr: 'Comptabilité', es: 'Contabilidad' } },
  { name: 'Bookkeeping', category: 'Business & Finance', translations: { de: 'Buchführung', fr: 'Tenue de livres', es: 'Teneduría de libros' } },
  { name: 'QuickBooks', category: 'Business & Finance', translations: { de: 'QuickBooks', fr: 'QuickBooks', es: 'QuickBooks' } },
  { name: 'Human Resources (HR)', category: 'Business & Finance', translations: { de: 'Personalwesen (HR)', fr: 'Ressources humaines (RH)', es: 'Recursos Humanos (RRHH)' } },
  { name: 'Recruiting', category: 'Business & Finance', translations: { de: 'Personalbeschaffung', fr: 'Recrutement', es: 'Reclutamiento' } },
  { name: 'Business Strategy', category: 'Business & Finance', translations: { de: 'Geschäftsstrategie', fr: 'Stratégie d\'entreprise', es: 'Estrategia de negocios' } },
  { name: 'E-commerce Management', category: 'Business & Finance', translations: { de: 'E-Commerce-Management', fr: 'Gestion du commerce électronique', es: 'Gestión de comercio electrónico' } },
  { name: 'Shopify', category: 'Business & Finance', translations: { de: 'Shopify', fr: 'Shopify', es: 'Shopify' } },
  { name: 'Supply Chain Management', category: 'Business & Finance', translations: { de: 'Lieferkettenmanagement', fr: 'Gestion de la chaîne d\'approvisionnement', es: 'Gestión de la cadena de suministro' } },

  // --- Analytical & Technical ---
  { name: 'Data Analysis', category: 'Analytical & Technical', translations: { de: 'Datenanalyse', fr: 'Analyse de données', es: 'Análisis de datos' } },
  { name: 'Microsoft Excel', category: 'Analytical & Technical', translations: { de: 'Microsoft Excel', fr: 'Microsoft Excel', es: 'Microsoft Excel' } },
  { name: 'SQL', category: 'Analytical & Technical', translations: { de: 'SQL', fr: 'SQL', es: 'SQL' } },
  { name: 'Python (Programming Language)', category: 'Analytical & Technical', translations: { de: 'Python (Programmiersprache)', fr: 'Python (Langage de programmation)', es: 'Python (Lenguaje de programación)' } },
  { name: 'Tableau', category: 'Analytical & Technical', translations: { de: 'Tableau', fr: 'Tableau', es: 'Tableau' } },
  { name: 'Power BI', category: 'Analytical & Technical', translations: { de: 'Power BI', fr: 'Power BI', es: 'Power BI' } },
  { name: 'Machine Learning', category: 'Analytical & Technical', translations: { de: 'Maschinelles Lernen', fr: 'Apprentissage automatique', es: 'Aprendizaje automático' } },
  { name: 'Artificial Intelligence (AI)', category: 'Analytical & Technical', translations: { de: 'Künstliche Intelligenz (KI)', fr: 'Intelligence artificielle (IA)', es: 'Inteligencia artificial (IA)' } },
  { name: 'Web Development', category: 'Analytical & Technical', translations: { de: 'Webentwicklung', fr: 'Développement Web', es: 'Desarrollo web' } },
  { name: 'HTML', category: 'Analytical & Technical', translations: { de: 'HTML', fr: 'HTML', es: 'HTML' } },
  { name: 'CSS', category: 'Analytical & Technical', translations: { de: 'CSS', fr: 'CSS', es: 'CSS' } },
  { name: 'JavaScript', category: 'Analytical & Technical', translations: { de: 'JavaScript', fr: 'JavaScript', es: 'JavaScript' } },
  { name: 'React.js', category: 'Analytical & Technical', translations: { de: 'React.js', fr: 'React.js', es: 'React.js' } },
  { name: 'Node.js', category: 'Analytical & Technical', translations: { de: 'Node.js', fr: 'Node.js', es: 'Node.js' } },
  { name: 'WordPress Development', category: 'Analytical & Technical', translations: { de: 'WordPress-Entwicklung', fr: 'Développement WordPress', es: 'Desarrollo de WordPress' } },
  { name: 'Git', category: 'Analytical & Technical', translations: { de: 'Git', fr: 'Git', es: 'Git' } },
  { name: 'Amazon Web Services (AWS)', category: 'Analytical & Technical', translations: { de: 'Amazon Web Services (AWS)', fr: 'Amazon Web Services (AWS)', es: 'Amazon Web Services (AWS)' } },
  { name: 'Cybersecurity', category: 'Analytical & Technical', translations: { de: 'Cybersicherheit', fr: 'Cybersécurité', es: 'Ciberseguridad' } },
  { name: 'Java', category: 'Analytical & Technical', translations: { de: 'Java', fr: 'Java', es: 'Java' } },
  { name: 'C++', category: 'Analytical & Technical', translations: { de: 'C++', fr: 'C++', es: 'C++' } },
  { name: 'Software Testing', category: 'Analytical & Technical', translations: { de: 'Softwaretests', fr: 'Test de logiciels', es: 'Pruebas de software' } },

  // --- Creative ---
  { name: 'Graphic Design', category: 'Wellness & Creative Arts', translations: { de: 'Grafikdesign', fr: 'Conception graphique', es: 'Diseño gráfico' } },
  { name: 'Adobe Photoshop', category: 'Wellness & Creative Arts', translations: { de: 'Adobe Photoshop', fr: 'Adobe Photoshop', es: 'Adobe Photoshop' } },
  { name: 'Adobe Illustrator', category: 'Wellness & Creative Arts', translations: { de: 'Adobe Illustrator', fr: 'Adobe Illustrator', es: 'Adobe Illustrator' } },
  { name: 'Canva', category: 'Wellness & Creative Arts', translations: { de: 'Canva', fr: 'Canva', es: 'Canva' } },
  { name: 'User Interface (UI) Design', category: 'Analytical & Technical', translations: { de: 'UI-Design', fr: 'Conception d\'interface utilisateur (UI)', es: 'Diseño de interfaz de usuario (UI)' } },
  { name: 'User Experience (UX) Design', category: 'Analytical & Technical', translations: { de: 'UX-Design', fr: 'Conception de l\'expérience utilisateur (UX)', es: 'Diseño de experiencia de usuario (UX)' } },
  { name: 'Figma', category: 'Analytical & Technical', translations: { de: 'Figma', fr: 'Figma', es: 'Figma' } },
  { name: 'Video Editing', category: 'Wellness & Creative Arts', translations: { de: 'Videobearbeitung', fr: 'Montage vidéo', es: 'Edición de video' } },
  { name: 'Adobe Premiere Pro', category: 'Wellness & Creative Arts', translations: { de: 'Adobe Premiere Pro', fr: 'Adobe Premiere Pro', es: 'Adobe Premiere Pro' } },
  { name: 'Final Cut Pro', category: 'Wellness & Creative Arts', translations: { de: 'Final Cut Pro', fr: 'Final Cut Pro', es: 'Final Cut Pro' } },
  { name: 'Photography', category: 'Wellness & Creative Arts', translations: { de: 'Fotografie', fr: 'Photographie', es: 'Fotografía' } },
  { name: 'Writing', category: 'Wellness & Creative Arts', translations: { de: 'Schreiben', fr: 'Écriture', es: 'Escritura' } },
  { name: 'Creative Writing', category: 'Wellness & Creative Arts', translations: { de: 'Kreatives Schreiben', fr: 'Écriture créative', es: 'Escritura creativa' } },
  { name: 'Blogging', category: 'Wellness & Creative Arts', translations: { de: 'Bloggen', fr: 'Blogging', es: 'Blogging' } },
  { name: 'Podcasting', category: 'Wellness & Creative Arts', translations: { de: 'Podcasting', fr: 'Podcasting', es: 'Podcasting' } },
  { name: 'Music Production', category: 'Wellness & Creative Arts', translations: { de: 'Musikproduktion', fr: 'Production musicale', es: 'Producción musical' } },
  { name: 'Illustration', category: 'Wellness & Creative Arts', translations: { de: 'Illustration', fr: 'Illustration', es: 'Ilustración' } },
  { name: 'Animation', category: 'Wellness & Creative Arts', translations: { de: 'Animation', fr: 'Animation', es: 'Animación' } },
  { name: 'Storytelling', category: 'Communication & Interpersonal', translations: { de: 'Geschichtenerzählen', fr: 'Narration', es: 'Narración de historias' } },
  { name: 'Interior Design', category: 'Wellness & Creative Arts', translations: { de: 'Innenarchitektur', fr: 'Design d\'intérieur', es: 'Diseño de interiores' } },
  { name: 'Fashion Design', category: 'Wellness & Creative Arts', translations: { de: 'Modedesign', fr: 'Stylisme', es: 'Diseño de moda' } },

  // --- Personal Development & Wellness ---
  { name: 'Mindfulness', category: 'Personal Development & Mindset', translations: { de: 'Achtsamkeit', fr: 'Pleine conscience', es: 'Atención plena' } },
  { name: 'Meditation', category: 'Wellness & Creative Arts', translations: { de: 'Meditation', fr: 'Méditation', es: 'Meditación' } },
  { name: 'Yoga', category: 'Wellness & Creative Arts', translations: { de: 'Yoga', fr: 'Yoga', es: 'Yoga' } },
  { name: 'Fitness Coaching', category: 'Wellness & Creative Arts', translations: { de: 'Fitnesstraining', fr: 'Coaching de fitness', es: 'Entrenamiento físico' } },
  { name: 'Personal Training', category: 'Wellness & Creative Arts', translations: { de: 'Personal Training', fr: 'Entraînement personnel', es: 'Entrenamiento personal' } },
  { name: 'Nutrition', category: 'Wellness & Creative Arts', translations: { de: 'Ernährung', fr: 'Nutrition', es: 'Nutrición' } },
  { name: 'Goal Setting', category: 'Personal Development & Mindset', translations: { de: 'Zielsetzung', fr: 'Définition d\'objectifs', es: 'Establecimiento de metas' } },
  { name: 'Productivity', category: 'Personal Development & Mindset', translations: { de: 'Produktivität', fr: 'Productivité', es: 'Productividad' } },
  { name: 'Habit Formation', category: 'Personal Development & Mindset', translations: { de: 'Gewohnheitsbildung', fr: 'Formation d\'habitudes', es: 'Formación de hábitos' } },
  { name: 'Self-Confidence', category: 'Personal Development & Mindset', translations: { de: 'Selbstvertrauen', fr: 'Confiance en soi', es: 'Autoconfianza' } },
  { name: 'Stress Management', category: 'Personal Development & Mindset', translations: { de: 'Stressbewältigung', fr: 'Gestion du stress', es: 'Gestión del estrés' } },
  { name: 'Life Coaching', category: 'Personal Development & Mindset', translations: { de: 'Life Coaching', fr: 'Coaching de vie', es: 'Coaching de vida' } },
  { name: 'Career Coaching', category: 'Personal Development & Mindset', translations: { de: 'Karriere-Coaching', fr: 'Coaching de carrière', es: 'Coaching de carrera' } },
  { name: 'Cooking', category: 'Wellness & Creative Arts', translations: { de: 'Kochen', fr: 'Cuisine', es: 'Cocina' } },
  { name: 'Baking', category: 'Wellness & Creative Arts', translations: { de: 'Backen', fr: 'Pâtisserie', es: 'Repostería' } },
  { name: 'Gardening', category: 'Wellness & Creative Arts', translations: { de: 'Gärtnern', fr: 'Jardinage', es: 'Jardinería' } },
  { name: 'Language Learning', category: 'Personal Development & Mindset', translations: { de: 'Sprachen lernen', fr: 'Apprentissage des langues', es: 'Aprendizaje de idiomas' } },

    { name: 'Cognitive Behavioral Therapy (CBT)', category: 'Personal Development & Mindset', translations: { de: 'Kognitive Verhaltenstherapie (KVT)', fr: 'Thérapie cognitivo-comportementale (TCC)', es: 'Terapia cognitivo-conductual (TCC)' } },
  { name: 'Dialectical Behavior Therapy (DBT)', category: 'Personal Development & Mindset', translations: { de: 'Dialektisch-Behaviorale Therapie (DBT)', fr: 'Thérapie comportementale dialectique (TCD)', es: 'Terapia dialéctica conductual (TDC)' } },
  { name: 'Acceptance and Commitment Therapy (ACT)', category: 'Personal Development & Mindset', translations: { de: 'Akzeptanz- und Commitment-Therapie (ACT)', fr: 'Thérapie d\'acceptation et d\'engagement (ACT)', es: 'Terapia de aceptación y compromiso (ACT)' } },
  { name: 'Somatic Experiencing', category: 'Wellness & Creative Arts', translations: { de: 'Somatisches Erleben', fr: 'Somatic Experiencing', es: 'Somatic Experiencing' } },
  { name: 'Internal Family Systems (IFS)', category: 'Personal Development & Mindset', translations: { de: 'Arbeit mit inneren Anteilen (IFS)', fr: 'Systèmes familiaux intérieurs (IFS)', es: 'Sistemas de la Familia Interna (IFS)' } },
  { name: 'Gestalt Therapy Principles', category: 'Personal Development & Mindset', translations: { de: 'Prinzipien der Gestalttherapie', fr: 'Principes de la Gestalt-thérapie', es: 'Principios de la Terapia Gestalt' } },
  { name: 'Psychoanalytic Theory', category: 'Personal Development & Mindset', translations: { de: 'Psychoanalytische Theorie', fr: 'Théorie psychanalytique', es: 'Teoría psicoanalítica' } },
  { name: 'Solution-Focused Brief Therapy (SFBT)', category: 'Personal Development & Mindset', translations: { de: 'Lösungsorientierte Kurzzeittherapie', fr: 'Thérapie brève axée sur les solutions', es: 'Terapia breve centrada en soluciones' } },
  { name: 'Trauma-Informed Care', category: 'Personal Development & Mindset', translations: { de: 'Traumasensible Begleitung', fr: 'Approche tenant compte des traumatismes', es: 'Atención informada sobre el trauma' } },
  { name: 'Schema Therapy', category: 'Personal Development & Mindset', translations: { de: 'Schematherapie', fr: 'Thérapie des schémas', es: 'Terapia de esquemas' } },

  // --- Relationships & Family Dynamics ---
  { name: 'Couples Counseling', category: 'Personal Development & Mindset', translations: { de: 'Paarberatung', fr: 'Conseil conjugal', es: 'Terapia de pareja' } },
  { name: 'Parenting Coaching', category: 'Personal Development & Mindset', translations: { de: 'Elterncoaching', fr: 'Coaching parental', es: 'Coaching para padres' } },
  { name: 'Attachment Theory', category: 'Personal Development & Mindset', translations: { de: 'Bindungstheorie', fr: 'Théorie de l\'attachement', es: 'Teoría del apego' } },
  { name: 'Nonviolent Communication (NVC)', category: 'Communication & Interpersonal', translations: { de: 'Gewaltfreie Kommunikation (GFK)', fr: 'Communication non violente (CNV)', es: 'Comunicación no violenta (CNV)' } },
  { name: 'Family Systems Theory', category: 'Personal Development & Mindset', translations: { de: 'Familientherapeutische Systemtheorie', fr: 'Théorie des systèmes familiaux', es: 'Teoría de los sistemas familiares' } },
  { name: 'Relationship Repair', category: 'Communication & Interpersonal', translations: { de: 'Beziehungskonflikte lösen', fr: 'Réparation de la relation', es: 'Reparación de relaciones' } },
  { name: 'Conscious Uncoupling', category: 'Personal Development & Mindset', translations: { de: 'Bewusste Trennung', fr: 'Séparation consciente', es: 'Separación consciente' } },
  { name: 'Co-parenting Strategies', category: 'Personal Development & Mindset', translations: { de: 'Co-Parenting-Strategien', fr: 'Stratégies de coparentalité', es: 'Estrategias de coparentalidad' } },
  { name: 'Dating Coaching', category: 'Personal Development & Mindset', translations: { de: 'Dating-Coaching', fr: 'Coaching en séduction', es: 'Coaching de citas' } },
  { name: 'Interpersonal Dynamics', category: 'Communication & Interpersonal', translations: { de: 'Zwischenmenschliche Dynamik', fr: 'Dynamiques interpersonnelles', es: 'Dinámicas interpersonales' } },

  // --- Niche Life Challenges & Support ---
  { name: 'Grief and Loss Support', category: 'Personal Development & Mindset', translations: { de: 'Trauer- und Verlustbegleitung', fr: 'Soutien au deuil et à la perte', es: 'Apoyo en el duelo y la pérdida' } },
  { name: 'ADHD Coaching', category: 'Personal Development & Mindset', translations: { de: 'ADHS-Coaching', fr: 'Coaching pour le TDAH', es: 'Coaching para el TDAH' } },
  { name: 'Addiction Recovery Coaching', category: 'Personal Development & Mindset', translations: { de: 'Sucht-Coaching', fr: 'Coaching en rétablissement de la dépendance', es: 'Coaching para la recuperación de adicciones' } },
  { name: 'Anxiety Management', category: 'Personal Development & Mindset', translations: { de: 'Angstbewältigung', fr: 'Gestion de l\'anxiété', es: 'Manejo de la ansiedad' } },
  { name: 'Anger Management', category: 'Personal Development & Mindset', translations: { de: 'Aggressionsbewältigung', fr: 'Gestion de la colère', es: 'Manejo de la ira' } },
  { name: 'Phobia Management', category: 'Personal Development & Mindset', translations: { de: 'Phobienbewältigung', fr: 'Gestion des phobies', es: 'Manejo de fobias' } },
  { name: 'Burnout Prevention & Recovery', category: 'Personal Development & Mindset', translations: { de: 'Burnout-Prävention und -Erholung', fr: 'Prévention et récupération du burn-out', es: 'Prevención y recuperación del burnout' } },
  { name: 'Chronic Illness Support', category: 'Wellness & Creative Arts', translations: { de: 'Unterstützung bei chronischen Krankheiten', fr: 'Soutien pour les maladies chroniques', es: 'Apoyo para enfermedades crónicas' } },
  { name: 'End-of-Life Doula Support', category: 'Wellness & Creative Arts', translations: { de: 'Sterbebegleitung', fr: 'Accompagnement de fin de vie (Doula)', es: 'Acompañamiento de fin de vida (Doula)' } },
  { name: 'Fertility Coaching', category: 'Wellness & Creative Arts', translations: { de: 'Kinderwunsch-Coaching', fr: 'Coaching en fertilité', es: 'Coaching de fertilidad' } },

  // --- Deeper Personal Growth & Mindset ---
  { name: 'Inner Child Work', category: 'Personal Development & Mindset', translations: { de: 'Arbeit mit dem inneren Kind', fr: 'Travail sur l\'enfant intérieur', es: 'Trabajo con el niño interior' } },
  { name: 'Self-Worth', category: 'Personal Development & Mindset', translations: { de: 'Selbstwert', fr: 'Valeur personnelle', es: 'Autoestima' } },
  { name: 'Imposter Syndrome', category: 'Personal Development & Mindset', translations: { de: 'Hochstapler-Syndrom', fr: 'Syndrome de l\'imposteur', es: 'Síndrome del impostor' } },
  { name: 'Mind-Body Connection', category: 'Personal Development & Mindset', translations: { de: 'Geist-Körper-Verbindung', fr: 'Connexion corps-esprit', es: 'Conexión mente-cuerpo' } },
  { name: 'Existential Coaching', category: 'Personal Development & Mindset', translations: { de: 'Existenzielles Coaching', fr: 'Coaching existentiel', es: 'Coaching existencial' } },
  { name: 'Spiritual Guidance', category: 'Personal Development & Mindset', translations: { de: 'Spirituelle Begleitung', fr: 'Guidance spirituelle', es: 'Guía espiritual' } },
  { name: 'Legacy Work', category: 'Personal Development & Mindset', translations: { de: 'Legacy-Arbeit', fr: 'Travail sur l\'héritage', es: 'Trabajo de legado' } },
  { name: 'Growth Mindset', category: 'Personal Development & Mindset', translations: { de: 'Wachstumsorientierte Denkweise', fr: 'État d\'esprit de croissance', es: 'Mentalidad de crecimiento' } },
  { name: 'Abundance Mindset', category: 'Personal Development & Mindset', translations: { de: 'Fülle-Denkweise', fr: 'État d\'esprit d\'abondance', es: 'Mentalidad de abundancia' } },
  { name: 'Stoicism', category: 'Personal Development & Mindset', translations: { de: 'Stoizismus', fr: 'Stoïcisme', es: 'Estoicismo' } },

  // --- Advanced Career & Leadership ---
  { name: 'Executive Presence', category: 'Leadership & Management', translations: { de: 'Executive Presence', fr: 'Présence exécutive', es: 'Presencia ejecutiva' } },
  { name: 'Career Transition Coaching', category: 'Leadership & Management', translations: { de: 'Karriere-Übergangs-Coaching', fr: 'Coaching en transition de carrière', es: 'Coaching para la transición profesional' } },
  { name: 'High-Performance Coaching', category: 'Leadership & Management', translations: { de: 'High-Performance-Coaching', fr: 'Coaching de haute performance', es: 'Coaching de alto rendimiento' } },
  { name: 'Change Management', category: 'Leadership & Management', translations: { de: 'Veränderungsmanagement', fr: 'Gestion du changement', es: 'Gestión del cambio' } },
  { name: 'Organizational Psychology', category: 'Leadership & Management', translations: { de: 'Organisationspsychologie', fr: 'Psychologie organisationnelle', es: 'Psicología organizacional' } },
  { name: 'Team Dynamics Facilitation', category: 'Leadership & Management', translations: { de: 'Moderation von Teamdynamiken', fr: 'Facilitation de la dynamique d\'équipe', es: 'Facilitación de la dinámica de equipo' } },
  { name: 'Entrepreneurial Mindset', category: 'Business & Finance', translations: { de: 'Unternehmerische Denkweise', fr: 'Esprit d\'entreprise', es: 'Mentalidad emprendedora' } },
  { name: 'Authentic Leadership', category: 'Leadership & Management', translations: { de: 'Authentische Führung', fr: 'Leadership authentique', es: 'Liderazgo auténtico' } },
  { name: 'Thought Leadership', category: 'Leadership & Management', translations: { de: 'Vordenkerrolle', fr: 'Leadership éclairé', es: 'Liderazgo de pensamiento' } },
  { name: 'Financial Coaching', category: 'Business & Finance', translations: { de: 'Finanzcoaching', fr: 'Coaching financier', es: 'Coaching financiero' } },

  // --- Holistic Wellness & Body-Focused Skills ---
  { name: 'Breathwork', category: 'Wellness & Creative Arts', translations: { de: 'Atemarbeit', fr: 'Travail de la respiration', es: 'Técnicas de respiración' } },
  { name: 'Holistic Nutrition', category: 'Wellness & Creative Arts', translations: { de: 'Ganzheitliche Ernährung', fr: 'Nutrition holistique', es: 'Nutrición holística' } },
  { name: 'Sleep Hygiene', category: 'Wellness & Creative Arts', translations: { de: 'Schlafhygiene', fr: 'Hygiène du sommeil', es: 'Higiene del sueño' } },
  { name: 'Mindful Eating', category: 'Wellness & Creative Arts', translations: { de: 'Achtsames Essen', fr: 'Alimentation en pleine conscience', es: 'Alimentación consciente' } },
  { name: 'Gut Health', category: 'Wellness & Creative Arts', translations: { de: 'Darmgesundheit', fr: 'Santé intestinale', es: 'Salud intestinal' } },
  { name: 'Hormone Health', category: 'Wellness & Creative Arts', translations: { de: 'Hormongesundheit', fr: 'Santé hormonale', es: 'Salud hormonal' } },
  { name: 'Functional Medicine Principles', category: 'Wellness & Creative Arts', translations: { de: 'Prinzipien der funktionellen Medizin', fr: 'Principes de la médecine fonctionnelle', es: 'Principios de la medicina funcional' } },
  { name: 'Digital Detox', category: 'Personal Development & Mindset', translations: { de: 'Digitaler Detox', fr: 'Détox numérique', es: 'Desintoxicación digital' } },
  { name: 'Ergonomics', category: 'Wellness & Creative Arts', translations: { de: 'Ergonomie', fr: 'Ergonomie', es: 'Ergonomía' } },
  { name: 'Acupressure', category: 'Wellness & Creative Arts', translations: { de: 'Akupressur', fr: 'Acupression', es: 'Acupresión' } },

  // --- Creative & Expressive Therapies ---
  { name: 'Art Therapy', category: 'Wellness & Creative Arts', translations: { de: 'Kunsttherapie', fr: 'Art-thérapie', es: 'Arteterapia' } },
  { name: 'Journaling for Healing', category: 'Wellness & Creative Arts', translations: { de: 'Heilendes Tagebuchschreiben', fr: 'Tenue d\'un journal à des fins de guérison', es: 'Escribir un diario para sanar' } },
  { name: 'Music Therapy', category: 'Wellness & Creative Arts', translations: { de: 'Musiktherapie', fr: 'Musicothérapie', es: 'Musicoterapia' } },
  { name: 'Dance/Movement Therapy', category: 'Wellness & Creative Arts', translations: { de: 'Tanz-/Bewegungstherapie', fr: 'Danse-thérapie/Thérapie par le mouvement', es: 'Danza/movimiento terapia' } },
  { name: 'Expressive Writing', category: 'Wellness & Creative Arts', translations: { de: 'Expressives Schreiben', fr: 'Écriture expressive', es: 'Escritura expresiva' } },
  { name: 'Bibliotherapy', category: 'Wellness & Creative Arts', translations: { de: 'Bibliotherapie', fr: 'Bibliothérapie', es: 'Biblioterapia' } },
  { name: 'Sandplay Therapy', category: 'Wellness & Creative Arts', translations: { de: 'Sandspieltherapie', fr: 'Thérapie par le jeu de sable', es: 'Terapia de juego de arena' } },
  { name: 'Drama Therapy', category: 'Wellness & Creative Arts', translations: { de: 'Dramatherapie', fr: 'Dramathérapie', es: 'Dramaterapia' } },
  { name: 'Poetry Therapy', category: 'Wellness & Creative Arts', translations: { de: 'Poesietherapie', fr: 'Poésie-thérapie', es: 'Poesíaterapia' } },
  { name: 'Mandala Creation', category: 'Wellness & Creative Arts', translations: { de: 'Mandala-Gestaltung', fr: 'Création de mandalas', es: 'Creación de mandalas' } },

  // --- Advanced Communication & Interpersonal Skills ---
  { name: 'Assertiveness Training', category: 'Communication & Interpersonal', translations: { de: 'Selbstsicherheitstraining', fr: 'Formation à l\'affirmation de soi', es: 'Entrenamiento en asertividad' } },
  { name: 'Empathetic Communication', category: 'Communication & Interpersonal', translations: { de: 'Empathische Kommunikation', fr: 'Communication empathique', es: 'Comunicación empática' } },
  { name: 'Cross-Cultural Communication', category: 'Communication & Interpersonal', translations: { de: 'Interkulturelle Kommunikation', fr: 'Communication interculturelle', es: 'Comunicación intercultural' } },
  { name: 'Radical Candor', category: 'Communication & Interpersonal', translations: { de: 'Radikale Offenheit', fr: 'Franchise radicale', es: 'Franqueza radical' } },
  { name: 'Group Facilitation', category: 'Communication & Interpersonal', translations: { de: 'Gruppenmoderation', fr: 'Animation de groupe', es: 'Facilitación de grupos' } },
  { name: 'Motivational Interviewing', category: 'Communication & Interpersonal', translations: { de: 'Motivierende Gesprächsführung', fr: 'Entretien motivationnel', es: 'Entrevista motivacional' } },
  { name: 'Story-listening', category: 'Communication & Interpersonal', translations: { de: 'Geschichten zuhören', fr: 'Écoute d\'histoires', es: 'Escucha de historias' } },
  { name: 'Powerful Questioning', category: 'Communication & Interpersonal', translations: { de: 'Wirkungsvolles Fragen', fr: 'Questionnement puissant', es: 'Preguntas poderosas' } },
  { name: 'Holding Space', category: 'Communication & Interpersonal', translations: { de: 'Raum halten', fr: 'Tenir l\'espace', es: 'Sostener el espacio' } },
  { name: 'Generative Listening', category: 'Communication & Interpersonal', translations: { de: 'Generatives Zuhören', fr: 'Écoute générative', es: 'Escucha generativa' } },

  // --- Assessment Tools & Frameworks (Analytical) ---
  { name: 'Enneagram', category: 'Analytical & Technical', translations: { de: 'Enneagramm', fr: 'Ennéagramme', es: 'Eneagrama' } },
  { name: 'Myers-Briggs Type Indicator (MBTI)', category: 'Analytical & Technical', translations: { de: 'Myers-Briggs-Typenindikator (MBTI)', fr: 'Indicateur de type Myers-Briggs (MBTI)', es: 'Indicador de tipo Myers-Briggs (MBTI)' } },
  { name: 'StrengthsFinder (CliftonStrengths)', category: 'Analytical & Technical', translations: { de: 'StrengthsFinder (CliftonStrengths)', fr: 'StrengthsFinder (CliftonStrengths)', es: 'StrengthsFinder (CliftonStrengths)' } },
  { name: 'DISC Assessment', category: 'Analytical & Technical', translations: { de: 'DISG-Analyse', fr: 'Évaluation DISC', es: 'Evaluación DISC' } },
  { name: '360-Degree Feedback', category: 'Analytical & Technical', translations: { de: '360-Grad-Feedback', fr: 'Feedback à 360 degrés', es: 'Retroalimentación de 360 grados' } },
  { name: 'Behavioral Assessment', category: 'Analytical & Technical', translations: { de: 'Verhaltensbeurteilung', fr: 'Évaluation comportementale', es: 'Evaluación conductual' } },
  { name: 'Wheel of Life', category: 'Analytical & Technical', translations: { de: 'Lebensrad', fr: 'Roue de la vie', es: 'Rueda de la vida' } },
  { name: 'SWOT Analysis (Personal)', category: 'Analytical & Technical', translations: { de: 'SWOT-Analyse (Persönlich)', fr: 'Analyse SWOT (Personnelle)', es: 'Análisis FODA (Personal)' } },
  { name: 'Mindfulness-Based Stress Reduction (MBSR)', category: 'Wellness & Creative Arts', translations: { de: 'Achtsamkeitsbasierte Stressreduktion (MBSR)', fr: 'Réduction du stress basée sur la pleine conscience (MBSR)', es: 'Reducción del estrés basada en la atención plena (REBAP)' } },
  { name: 'Positive Intelligence (PQ)', category: 'Personal Development & Mindset', translations: { de: 'Positive Intelligenz (PQ)', fr: 'Intelligence Positive (PQ)', es: 'Inteligencia Positiva (PQ)' } },
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