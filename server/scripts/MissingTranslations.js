const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const Translation = require('../models/Translation'); // Assuming this model path is correct

const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is not defined in your environment variables.');
  process.exit(1);
}

const dataToUpload = [
  // --- Coaching Styles ---
  { key: 'coachingStyles_66e4158648cdfa73ee74db87', listType: 'coachingStyles', translations: { de: 'Freundlich', fr: 'Amical', es: 'Amistoso' } }, // Friendly

  // --- Specialties ---
  { key: 'specialties_66e2bff9616218a1d7678f90', listType: 'specialties', translations: { de: 'Karriereentwicklung', fr: 'Développement de carrière', es: 'Desarrollo Profesional' } }, // Career Development
  { key: 'specialties_66e2bff9616218a1d7678f92', listType: 'specialties', translations: { de: 'Stressbewältigung', fr: 'Gestion du stress', es: 'Gestión del Estrés' } }, // Stress Management
  { key: 'specialties_66e2bff9616218a1d7678f94', listType: 'specialties', translations: { de: 'Zeitmanagement', fr: 'Gestion du temps', es: 'Gestión del Tiempo' } }, // Time Management
  { key: 'specialties_66e2bff9616218a1d7678f96', listType: 'specialties', translations: { de: 'Kommunikationsfähigkeiten', fr: 'Compétences en communication', es: 'Habilidades de Comunicación' } }, // Communication Skills
  { key: 'specialties_66e2bff9616218a1d7678f98', listType: 'specialties', translations: { de: 'Konfliktlösung', fr: 'Résolution de conflits', es: 'Resolución de Conflictos' } }, // Conflict Resolution
  { key: 'specialties_66e2bff9616218a1d7678f9a', listType: 'specialties', translations: { de: 'Persönlichkeitsentwicklung', fr: 'Développement personnel', es: 'Desarrollo Personal' } }, // Personal Development
  { key: 'specialties_66e2bff9616218a1d7678f9c', listType: 'specialties', translations: { de: 'Work-Life-Balance', fr: 'Équilibre vie pro-vie perso', es: 'Equilibrio Vida-Trabajo' } }, // Work-Life Balance
  { key: 'specialties_66e2bff9616218a1d7678f9e', listType: 'specialties', translations: { de: 'Emotionale Intelligenz', fr: 'Intelligence émotionnelle', es: 'Inteligencia Emocional' } }, // Emotional Intelligence
  { key: 'specialties_66e2bff9616218a1d7678fa0', listType: 'specialties', translations: { de: 'Teambildung', fr: 'Consolidation d\'équipe', es: 'Creación de Equipos' } }, // Team Building
  { key: 'specialties_66e2bff9616218a1d7678fa2', listType: 'specialties', translations: { de: 'Achtsamkeit und Meditation', fr: 'Pleine conscience et méditation', es: 'Mindfulness y Meditación' } }, // Mindfulness and Meditation
  { key: 'specialties_66e2bff9616218a1d7678fa4', listType: 'specialties', translations: { de: 'Zielsetzung', fr: 'Définition d\'objectifs', es: 'Establecimiento de Metas' } }, // Goal Setting
  { key: 'specialties_66e2bff9616218a1d7678fa6', listType: 'specialties', translations: { de: 'Motivation und Engagement', fr: 'Motivation et engagement', es: 'Motivación y Compromiso' } }, // Motivation and Engagement
  { key: 'specialties_66e2bff9616218a1d7678fa8', listType: 'specialties', translations: { de: 'Change Management', fr: 'Gestion du changement', es: 'Gestión del Cambio' } }, // Change Management
  { key: 'specialties_66e2bff9616218a1d7678faa', listType: 'specialties', translations: { de: 'Diversität und Inklusion', fr: 'Diversité et inclusion', es: 'Diversidad e Inclusión' } }, // Diversity and Inclusion
  { key: 'specialties_66e2bff9616218a1d7678fac', listType: 'specialties', translations: { de: 'Vorträge', fr: 'Prise de parole en public', es: 'Oratoria' } }, // Public Speaking
  { key: 'specialties_66e2bff9616218a1d7678fae', listType: 'specialties', translations: { de: 'Verkaufscoaching', fr: 'Coaching commercial', es: 'Coaching de Ventas' } }, // Sales Coaching
  { key: 'specialties_66e2bff9616218a1d7678fb0', listType: 'specialties', translations: { de: 'Kreativität und Innovation', fr: 'Créativité et innovation', es: 'Creatividad e Innovación' } }, // Creativity and Innovation
  { key: 'specialties_66e2bff9616218a1d7678fb2', listType: 'specialties', translations: { de: 'Unternehmertum', fr: 'Entrepreneuriat', es: 'Emprendimiento' } }, // Entrepreneurship
  { key: 'specialties_66e2bff9616218a1d7678fb4', listType: 'specialties', translations: { de: 'Selbstvertrauen stärken', fr: 'Renforcement de la confiance en soi', es: 'Desarrollo de la Confianza' } }, // Confidence Building
  { key: 'specialties_66e2bff9616218a1d7678fb6', listType: 'specialties', translations: { de: 'Selbstsicherheitstraining', fr: 'Formation à l\'affirmation de soi', es: 'Entrenamiento en Asertividad' } }, // Assertiveness Training
  { key: 'specialties_66e2bff9616218a1d7678fb8', listType: 'specialties', translations: { de: 'Verhandlungsgeschick', fr: 'Compétences en négociation', es: 'Habilidades de Negociación' } }, // Negotiation Skills
  { key: 'specialties_66e2bff9616218a1d7678fba', listType: 'specialties', translations: { de: 'Elterncoaching', fr: 'Coaching parental', es: 'Coaching para Padres' } }, // Parenting Coaching
  { key: 'specialties_66e2bff9616218a1d7678fbc', listType: 'specialties', translations: { de: 'Führung', fr: 'Leadership', es: 'Liderazgo' } }, // Leadership
  { key: 'specialties_66e2bff9616218a1d7678fbe', listType: 'specialties', translations: { de: 'Ruhestandsplanung', fr: 'Planification de la retraite', es: 'Planificación de la Jubilación' } }, // Retirement Planning
  { key: 'specialties_66e2bff9616218a1d7678fc0', listType: 'specialties', translations: { de: 'Interkulturelles Coaching', fr: 'Coaching interculturel', es: 'Coaching Intercultural' } }, // Cross-Cultural Coaching
  { key: 'specialties_66e2bff9616218a1d7678fc2', listType: 'specialties', translations: { de: 'Führungskräfte-Coaching', fr: 'Coaching de dirigeants', es: 'Coaching Ejecutivo' } }, // Executive Coaching
  { key: 'specialties_66e2bff9616218a1d7678fc4', listType: 'specialties', translations: { de: 'Digitale Transformation', fr: 'Transformation numérique', es: 'Transformación Digital' } }, // Digital Transformation
  { key: 'specialties_66e2bff9616218a1d7678fc8', listType: 'specialties', translations: { de: 'Resilienztraining', fr: 'Formation à la résilience', es: 'Entrenamiento en Resiliencia' } }, // Resilience Training
  { key: 'specialties_66e2bff9616218a1d7678fca', listType: 'specialties', translations: { de: 'Lebensberatung', fr: 'Coaching de vie', es: 'Coaching de Vida' } }, // Life Coaching
  { key: 'specialties_66e2bff9616218a1d7678fcc', listType: 'specialties', translations: { de: 'Gesundheit und Wellness', fr: 'Santé et bien-être', es: 'Salud y Bienestar' } }, // Health and Wellness
  { key: 'specialties_66e2bff9616218a1d7678fce', listType: 'specialties', translations: { de: 'Beziehungscoaching', fr: 'Coaching relationnel', es: 'Coaching de Relaciones' } }, // Relationship Coaching
  { key: 'specialties_66e2bff9616218a1d7678fd0', listType: 'specialties', translations: { de: 'Business-Coaching', fr: 'Coaching d\'affaires', es: 'Coaching de Negocios' } }, // Business Coaching
  { key: 'specialties_66e2bff9616218a1d7678fd2', listType: 'specialties', translations: { de: 'Finanzcoaching', fr: 'Coaching financier', es: 'Coaching Financiero' } }, // Financial Coaching
  { key: 'specialties_66e2bff9616218a1d7678fd4', listType: 'specialties', translations: { de: 'Leistungscoaching', fr: 'Coaching de performance', es: 'Coaching de Rendimiento' } }, // Performance Coaching
  { key: 'specialties_6866861db82e7758f9ea40a0', listType: 'specialties', translations: { de: 'Führungskompetenzen', fr: 'Compétences en leadership', es: 'Habilidades de Liderazgo' } }, // Leadership Skills
  { key: 'specialties_686686fc1993c52823947016', listType: 'specialties', translations: { de: 'Führungskräfteentwicklung', fr: 'Développement du leadership', es: 'Desarrollo de Liderazgo' } }, // Leadership Development
  { key: 'specialties_686686fc1993c5282394701b', listType: 'specialties', translations: { de: 'Team-Management & Teambildung', fr: 'Gestion et constitution d\'équipe', es: 'Gestión y Formación de Equipos' } }, // Team Management & Building
  { key: 'specialties_686686fc1993c52823947022', listType: 'specialties', translations: { de: 'Strategische Planung', fr: 'Planification stratégique', es: 'Planificación Estratégica' } }, // Strategic Planning
  { key: 'specialties_686686fc1993c52823947027', listType: 'specialties', translations: { de: 'Berufliche Neuorientierung', fr: 'Transition de carrière', es: 'Transición de Carrera' } }, // Career Transition
  { key: 'specialties_686686fc1993c5282394702c', listType: 'specialties', translations: { de: 'Interviewtraining', fr: 'Techniques d\'entretien', es: 'Habilidades para Entrevistas' } }, // Interview Skills
  { key: 'specialties_686686fc1993c52823947033', listType: 'specialties', translations: { de: 'Professionelles Networking', fr: 'Réseautage professionnel', es: 'Networking Profesional' } }, // Professional Networking
  { key: 'specialties_686686fd1993c52823947042', listType: 'specialties', translations: { de: 'Gewohnheitsbildung', fr: 'Création d\'habitudes', es: 'Formación de Hábitos' } }, // Habit Formation
  { key: 'specialties_686686fd1993c52823947048', listType: 'specialties', translations: { de: 'Startup-Coaching', fr: 'Coaching de startup', es: 'Coaching para Startups' } }, // Startup Coaching
  { key: 'specialties_686686fd1993c5282394704d', listType: 'specialties', translations: { de: 'Geschäftsstrategie', fr: 'Stratégie d\'entreprise', es: 'Estrategia de Negocio' } }, // Business Strategy
  { key: 'specialties_686686fd1993c52823947053', listType: 'specialties', translations: { de: 'Marketingstrategie', fr: 'Stratégie marketing', es: 'Estrategia de Marketing' } }, // Marketing Strategy
  { key: 'specialties_686686fd1993c52823947058', listType: 'specialties', translations: { de: 'Leistungssteigerung', fr: 'Amélioration des performances', es: 'Mejora del Rendimiento' } }, // Performance Improvement
  { key: 'specialties_686686fd1993c5282394705d', listType: 'specialties', translations: { de: 'Produktivitätscoaching', fr: 'Coaching en productivité', es: 'Coaching de Productividad' } }, // Productivity Coaching
  { key: 'specialties_686686fd1993c52823947062', listType: 'specialties', translations: { de: 'Kreatives Denken', fr: 'Pensée créative', es: 'Pensamiento Creativo' } }, // Creative Thinking
  
  // --- Skills ---
  // Note: Only skills missing translations are listed. Skills starting with 'B' are assumed to be handled by another script.
  
  // -- C --
  { key: 'skills_686772126365abf0069ea71b', listType: 'skills', translations: { de: 'Veränderungsmanagement', fr: 'Gestion du changement', es: 'Gestión del cambio' } }, // Change Management
  { key: 'skills_686772126365abf0069ea720', listType: 'skills', translations: { de: 'Kundenbeziehungen', fr: 'Relations clients', es: 'Relaciones con clientes' } }, // Client Relations
  { key: 'skills_686772126365abf0069ea724', listType: 'skills', translations: { de: 'Wettbewerbsanalyse', fr: 'Analyse concurrentielle', es: 'Análisis competitivo' } }, // Competitive Analysis
  { key: 'skills_686772126365abf0069ea728', listType: 'skills', translations: { de: 'Beratung', fr: 'Conseil', es: 'Consultoría' } }, // Consulting
  { key: 'skills_68677dbda8d65eb1d77a5468', listType: 'skills', translations: { de: 'Texten', fr: 'Rédaction publicitaire', es: 'Redacción publicitaria' } }, // Copywriting
  { key: 'skills_68677dc2a8d65eb1d77a554d', listType: 'skills', translations: { de: 'Paarberatung', fr: 'Conseil conjugal', es: 'Terapia de pareja' } }, // Couples Counseling
  { key: 'skills_686772126365abf0069ea72c', listType: 'skills', translations: { de: 'Content-Marketing', fr: 'Marketing de contenu', es: 'Marketing de contenidos' } }, // Content Marketing
  { key: 'skills_686772126365abf0069ea730', listType: 'skills', translations: { de: 'Vertragsverhandlungen', fr: 'Négociation de contrats', es: 'Negociación de contratos' } }, // Contract Negotiation
  { key: 'skills_686772126365abf0069ea734', listType: 'skills', translations: { de: 'Unternehmenskommunikation', fr: 'Communication d\'entreprise', es: 'Comunicaciones corporativas' } }, // Corporate Communications
  { key: 'skills_686772126365abf0069ea738', listType: 'skills', translations: { de: 'Unternehmensfinanzierung', fr: 'Finance d\'entreprise', es: 'Finanzas corporativas' } }, // Corporate Finance
  { key: 'skills_686772126365abf0069ea73c', listType: 'skills', translations: { de: 'Kostenmanagement', fr: 'Gestion des coûts', es: 'Gestión de costos' } }, // Cost Management
  { key: 'skills_686772126365abf0069ea740', listType: 'skills', translations: { de: 'Kundenbeziehungsmanagement (CRM)', fr: 'Gestion de la relation client (CRM)', es: 'Gestión de la relación con el cliente (CRM)' } }, // Customer Relationship Management (CRM)
  { key: 'skills_686772126365abf0069ea744', listType: 'skills', translations: { de: 'Kundenservice', fr: 'Service client', es: 'Servicio al cliente' } }, // Customer Service
  { key: 'skills_686772126365abf0069ea748', listType: 'skills', translations: { de: 'Kundenerlebnis (CX)', fr: 'Expérience client (CX)', es: 'Experiencia del cliente (CX)' } }, // Customer Experience (CX)
  { key: 'skills_686772126365abf0069ea74c', listType: 'skills', translations: { de: 'Karriereentwicklung', fr: 'Développement de carrière', es: 'Desarrollo de carrera' } }, // Career Development
  { key: 'skills_686772136365abf0069ea750', listType: 'skills', translations: { de: 'Coaching', fr: 'Coaching', es: 'Coaching' } }, // Coaching
  { key: 'skills_686772136365abf0069ea754', listType: 'skills', translations: { de: 'Zusammenarbeit', fr: 'Collaboration', es: 'Colaboración' } }, // Collaboration
  { key: 'skills_686772136365abf0069ea758', listType: 'skills', translations: { de: 'Konfliktmanagement', fr: 'Gestion des conflits', es: 'Gestión de conflictos' } }, // Conflict Management
  { key: 'skills_686772136365abf0069ea75c', listType: 'skills', translations: { de: 'Kontinuierliche Verbesserung', fr: 'Amélioration continue', es: 'Mejora continua' } }, // Continuous Improvement
  { key: 'skills_686772136365abf0069ea760', listType: 'skills', translations: { de: 'Unternehmensführung', fr: 'Gouvernance d\'entreprise', es: 'Gobierno corporativo' } }, // Corporate Governance
  { key: 'skills_686772136365abf0069ea764', listType: 'skills', translations: { de: 'Führung funktionsübergreifender Teams', fr: 'Leadership d\'équipes interfonctionnelles', es: 'Liderazgo de equipos multifuncionales' } }, // Cross-functional Team Leadership
  { key: 'skills_686772136365abf0069ea768', listType: 'skills', translations: { de: 'Kulturwandel', fr: 'Changement culturel', es: 'Cambio cultural' } }, // Culture Change
  { key: 'skills_686772136365abf0069ea76c', listType: 'skills', translations: { de: 'Klarheit', fr: 'Clarté', es: 'Claridad' } }, // Clarity
  { key: 'skills_686772136365abf0069ea774', listType: 'skills', translations: { de: 'Mitgefühl', fr: 'Compassion', es: 'Compasión' } }, // Compassion
  { key: 'skills_686772136365abf0069ea778', listType: 'skills', translations: { de: 'Selbstvertrauen', fr: 'Confiance en soi', es: 'Confianza' } }, // Confidence
  { key: 'skills_686772136365abf0069ea77c', listType: 'skills', translations: { de: 'Kreatives Denken', fr: 'Pensée créative', es: 'Pensamiento creativo' } }, // Creative Thinking
  { key: 'skills_686772146365abf0069ea784', listType: 'skills', translations: { de: 'Interkulturelle Kommunikation', fr: 'Communication interculturelle', es: 'Comunicación intercultural' } }, // Cross-Cultural Communication
  { key: 'skills_686772146365abf0069ea788', listType: 'skills', translations: { de: 'C++', fr: 'C++', es: 'C++' } }, // C++
  { key: 'skills_686772146365abf0069ea78c', listType: 'skills', translations: { de: 'C#', fr: 'C#', es: 'C#' } }, // C#
  { key: 'skills_686772146365abf0069ea790', listType: 'skills', translations: { de: 'Cloud Computing', fr: 'Cloud Computing', es: 'Computación en la nube' } }, // Cloud Computing
  { key: 'skills_686772146365abf0069ea794', listType: 'skills', translations: { de: 'Programmieren', fr: 'Codage', es: 'Codificación' } }, // Coding
  { key: 'skills_686772146365abf0069ea798', listType: 'skills', translations: { de: 'Informatik', fr: 'Informatique', es: 'Ciencias de la computación' } }, // Computer Science
  { key: 'skills_686772146365abf0069ea79c', listType: 'skills', translations: { de: 'Content-Management-Systeme (CMS)', fr: 'Systèmes de gestion de contenu (CMS)', es: 'Sistemas de gestión de contenidos (CMS)' } }, // Content Management Systems (CMS)
  { key: 'skills_686772146365abf0069ea7a0', listType: 'skills', translations: { de: 'Kryptographie', fr: 'Cryptographie', es: 'Criptografía' } }, // Cryptography
  { key: 'skills_686772146365abf0069ea7ac', listType: 'skills', translations: { de: 'Gelassenheit', fr: 'Calme', es: 'Calma' } }, // Calmness
  { key: 'skills_686772146365abf0069ea7b0', listType: 'skills', translations: { de: 'Kapazitätsaufbau', fr: 'Renforcement des capacités', es: 'Desarrollo de capacidades' } }, // Capacity Building
  { key: 'skills_686772156365abf0069ea7b4', listType: 'skills', translations: { de: 'Kognitive Umstrukturierung', fr: 'Restructuration cognitive', es: 'Reestructuración cognitiva' } }, // Cognitive Restructuring
  { key: 'skills_686772156365abf0069ea7b8', listType: 'skills', translations: { de: 'Engagement', fr: 'Engagement', es: 'Compromiso' } }, // Commitment
  { key: 'skills_686772156365abf0069ea7bc', listType: 'skills', translations: { de: 'Bewusstsein', fr: 'Conscience', es: 'Conciencia' } }, // Consciousness
  { key: 'skills_686772156365abf0069ea7c0', listType: 'skills', translations: { de: 'Mut', fr: 'Courage', es: 'Coraje' } }, // Courage
  { key: 'skills_686772156365abf0069ea7c8', listType: 'skills', translations: { de: 'Neugier', fr: 'Curiosité', es: 'Curiosidad' } }, // Curiosity
  { key: 'skills_686772156365abf0069ea7cc', listType: 'skills', translations: { de: 'Kalligraphie', fr: 'Calligraphie', es: 'Caligrafía' } }, // Calligraphy
  { key: 'skills_686772156365abf0069ea7d0', listType: 'skills', translations: { de: 'Camping', fr: 'Camping', es: 'Camping' } }, // Camping
  { key: 'skills_686772156365abf0069ea7d4', listType: 'skills', translations: { de: 'Keramik', fr: 'Céramique', es: 'Cerámica' } }, // Ceramics
  { key: 'skills_686772156365abf0069ea7d8', listType: 'skills', translations: { de: 'Chakrenausgleich', fr: 'Équilibrage des chakras', es: 'Equilibrio de chakras' } }, // Chakra Balancing
  { key: 'skills_686772156365abf0069ea7dc', listType: 'skills', translations: { de: 'Kino', fr: 'Cinéma', es: 'Cine' } }, // Cinema
  { key: 'skills_686772156365abf0069ea7e0', listType: 'skills', translations: { de: 'Klettern', fr: 'Escalade', es: 'Escalada' } }, // Climbing
  { key: 'skills_686772166365abf0069ea7e8', listType: 'skills', translations: { de: 'Handwerken', fr: 'Artisanat', es: 'Artesanía' } }, // Crafting
  { key: 'skills_686772166365abf0069ea7f0', listType: 'skills', translations: { de: 'Häkeln', fr: 'Crochet', es: 'Croché' } }, // Crochet
  { key: 'skills_686772166365abf0069ea7f4', listType: 'skills', translations: { de: 'Kristallheilung', fr: 'Lithothérapie', es: 'Cristaloterapia' } }, // Crystal Healing
  { key: 'skills_686772166365abf0069ea7f8', listType: 'skills', translations: { de: 'Radfahren', fr: 'Cyclisme', es: 'Ciclismo' } }, // Cycling
  { key: 'skills_686772166365abf0069ea7fc', listType: 'skills', translations: { de: 'Techniken der kognitiven Verhaltenstherapie (KVT)', fr: 'Techniques de thérapie cognitivo-comportementale (TCC)', es: 'Técnicas de terapia cognitivo-conductual (TCC)' } }, // Cognitive Behavioral Therapy (CBT) techniques
  { key: 'skills_68677dc3a8d65eb1d77a5565', listType: 'skills', translations: { de: 'Bewusste Trennung', fr: 'Séparation consciente', es: 'Separación consciente' } }, // Conscious Uncoupling
  { key: 'skills_68677dc3a8d65eb1d77a5569', listType: 'skills', translations: { de: 'Co-Parenting-Strategien', fr: 'Stratégies de coparentalité', es: 'Estrategias de coparentalidad' } }, // Co-parenting Strategies
  { key: 'skills_68677dc3a8d65eb1d77a558f', listType: 'skills', translations: { de: 'Unterstützung bei chronischen Krankheiten', fr: 'Soutien pour les maladies chroniques', es: 'Apoyo para enfermedades crónicas' } }, // Chronic Illness Support
  { key: 'skills_68677dc5a8d65eb1d77a55bf', listType: 'skills', translations: { de: 'Karriere-Übergangs-Coaching', fr: 'Coaching en transition de carrière', es: 'Coaching para la transición profesional' } }, // Career Transition Coaching
  
  // -- D --
  { key: 'skills_6867721dda2e9da50d6f4447', listType: 'skills', translations: { de: 'Geschäftsverhandlungen', fr: 'Négociation commerciale', es: 'Negociación de acuerdos' } }, // Deal Negotiation
  { key: 'skills_6867721dda2e9da50d6f444b', listType: 'skills', translations: { de: 'Inkasso', fr: 'Recouvrement de créances', es: 'Cobro de deudas' } }, // Debt Collection
  { key: 'skills_6867721dda2e9da50d6f4457', listType: 'skills', translations: { de: 'Digitale Transformation', fr: 'Transformation numérique', es: 'Transformación digital' } }, // Digital Transformation
  { key: 'skills_6867721dda2e9da50d6f445b', listType: 'skills', translations: { de: 'Direktmarketing', fr: 'Marketing direct', es: 'Marketing directo' } }, // Direct Marketing
  { key: 'skills_6867721dda2e9da50d6f445f', listType: 'skills', translations: { de: 'Direktvertrieb', fr: 'Vente directe', es: 'Ventas directas' } }, // Direct Sales
  { key: 'skills_6867721dda2e9da50d6f4463', listType: 'skills', translations: { de: 'Due Diligence', fr: 'Due diligence', es: 'Due diligence' } }, // Due Diligence
  { key: 'skills_6867721dda2e9da50d6f4467', listType: 'skills', translations: { de: 'Dynamics 365', fr: 'Dynamics 365', es: 'Dynamics 365' } }, // Dynamics 365
  { key: 'skills_6867721eda2e9da50d6f446f', listType: 'skills', translations: { de: 'Delegation', fr: 'Délégation', es: 'Delegación' } }, // Delegation
  { key: 'skills_6867721eda2e9da50d6f4473', listType: 'skills', translations: { de: 'Mitarbeiterentwicklung', fr: 'Développement des autres', es: 'Desarrollo de otros' } }, // Developing Others
  { key: 'skills_6867721eda2e9da50d6f4477', listType: 'skills', translations: { de: 'Streitbeilegung', fr: 'Résolution des litiges', es: 'Resolución de disputas' } }, // Dispute Resolution
  { key: 'skills_6867721eda2e9da50d6f447f', listType: 'skills', translations: { de: 'Ergebnisorientierung', fr: 'Orientation résultats', es: 'Impulso de resultados' } }, // Driving Results
  { key: 'skills_6867721eda2e9da50d6f4483', listType: 'skills', translations: { de: 'Abteilungsleitung', fr: 'Gestion de département', es: 'Gestión de departamentos' } }, // Department Management
  { key: 'skills_6867721eda2e9da50d6f4487', listType: 'skills', translations: { de: 'Debatte', fr: 'Débat', es: 'Debate' } }, // Debate
  { key: 'skills_6867721eda2e9da50d6f448b', listType: 'skills', translations: { de: 'Demonstration', fr: 'Démonstration', es: 'Demostración' } }, // Demonstration
  { key: 'skills_6867721eda2e9da50d6f448f', listType: 'skills', translations: { de: 'Diplomatie', fr: 'Diplomatie', es: 'Diplomacia' } }, // Diplomacy
  { key: 'skills_6867721eda2e9da50d6f4493', listType: 'skills', translations: { de: 'Regie', fr: 'Mise en scène', es: 'Dirección' } }, // Directing
  { key: 'skills_6867721eda2e9da50d6f4497', listType: 'skills', translations: { de: 'Dokumentation', fr: 'Documentation', es: 'Documentación' } }, // Documentation
  { key: 'skills_6867721eda2e9da50d6f449b', listType: 'skills', translations: { de: 'Entwerfen', fr: 'Rédaction', es: 'Redacción' } }, // Drafting
  { key: 'skills_6867721eda2e9da50d6f449f', listType: 'skills', translations: { de: 'Dateneingabe', fr: 'Saisie de données', es: 'Entrada de datos' } }, // Data Entry
  { key: 'skills_6867721fda2e9da50d6f44a3', listType: 'skills', translations: { de: 'Data-Mining', fr: 'Exploration de données', es: 'Minería de datos' } }, // Data Mining
  { key: 'skills_6867721fda2e9da50d6f44a7', listType: 'skills', translations: { de: 'Datenmodellierung', fr: 'Modélisation de données', es: 'Modelado de datos' } }, // Data Modeling
  { key: 'skills_6867721fda2e9da50d6f44ab', listType: 'skills', translations: { de: 'Datenwissenschaft', fr: 'Science des données', es: 'Ciencia de datos' } }, // Data Science
  { key: 'skills_6867721fda2e9da50d6f44b3', listType: 'skills', translations: { de: 'Datenbankadministration', fr: 'Administration de bases de données', es: 'Administración de bases de datos' } }, // Database Administration
  { key: 'skills_6867721fda2e9da50d6f44b7', listType: 'skills', translations: { de: 'Debugging', fr: 'Débogage', es: 'Depuración' } }, // Debugging
  { key: 'skills_6867721fda2e9da50d6f44bb', listType: 'skills', translations: { de: 'Design Thinking', fr: 'Design thinking', es: 'Design thinking' } }, // Design Thinking
  { key: 'skills_6867721fda2e9da50d6f44bf', listType: 'skills', translations: { de: 'DevOps', fr: 'DevOps', es: 'DevOps' } }, // DevOps
  { key: 'skills_6867721fda2e9da50d6f44c3', listType: 'skills', translations: { de: 'Docker', fr: 'Docker', es: 'Docker' } }, // Docker
  { key: 'skills_6867721fda2e9da50d6f44c7', listType: 'skills', translations: { de: 'Tagesplanung', fr: 'Planification quotidienne', es: 'Planificación diaria' } }, // Daily Planning
  { key: 'skills_6867721fda2e9da50d6f44cb', listType: 'skills', translations: { de: 'Entrümpeln', fr: 'Désencombrement', es: 'Organizar y despejar' } }, // Decluttering
  { key: 'skills_6867721fda2e9da50d6f44cf', listType: 'skills', translations: { de: 'Hingabe', fr: 'Dévouement', es: 'Dedicación' } }, // Dedication
  { key: 'skills_6867721fda2e9da50d6f44d3', listType: 'skills', translations: { de: 'Zuverlässigkeit', fr: 'Fiabilité', es: 'Confiabilidad' } }, // Dependability
  { key: 'skills_68677220da2e9da50d6f44d7', listType: 'skills', translations: { de: 'Loslösung', fr: 'Détachement', es: 'Desapego' } }, // Detachment
  { key: 'skills_68677220da2e9da50d6f44db', listType: 'skills', translations: { de: 'Entschlossenheit', fr: 'Détermination', es: 'Determinación' } }, // Determination
  { key: 'skills_68677220da2e9da50d6f44df', listType: 'skills', translations: { de: 'Sorgfalt', fr: 'Diligence', es: 'Diligencia' } }, // Diligence
  { key: 'skills_68677220da2e9da50d6f44e3', listType: 'skills', translations: { de: 'Disziplin', fr: 'Discipline', es: 'Disciplina' } }, // Discipline
  { key: 'skills_68677220da2e9da50d6f44e7', listType: 'skills', translations: { de: 'Traumanalyse', fr: 'Analyse des rêves', es: 'Análisis de sueños' } }, // Dream Analysis
  { key: 'skills_68677220da2e9da50d6f44eb', listType: 'skills', translations: { de: 'Tanzen', fr: 'Danse', es: 'Baile' } }, // Dancing
  { key: 'skills_68677220da2e9da50d6f44ef', listType: 'skills', translations: { de: 'Diätetik', fr: 'Diététique', es: 'Dietética' } }, // Dietetics
  { key: 'skills_68677220da2e9da50d6f44f3', listType: 'skills', translations: { de: 'Tauchen', fr: 'Plongée', es: 'Buceo' } }, // Diving
  { key: 'skills_68677220da2e9da50d6f44f7', listType: 'skills', translations: { de: 'DJing', fr: 'DJing', es: 'DJing' } }, // DJing
  { key: 'skills_68677220da2e9da50d6f44fb', listType: 'skills', translations: { de: 'Hundetraining', fr: 'Dressage de chiens', es: 'Entrenamiento de perros' } }, // Dog Training
  { key: 'skills_68677220da2e9da50d6f44ff', listType: 'skills', translations: { de: 'Wünschelrutengehen', fr: 'Radiesthésie', es: 'Radiestesia' } }, // Dowsing
  { key: 'skills_68677220da2e9da50d6f4503', listType: 'skills', translations: { de: 'Schauspiel', fr: 'Théâtre', es: 'Drama' } }, // Drama
  { key: 'skills_68677220da2e9da50d6f4507', listType: 'skills', translations: { de: 'Zeichnen', fr: 'Dessin', es: 'Dibujo' } }, // Drawing
  { key: 'skills_68677221da2e9da50d6f450b', listType: 'skills', translations: { de: 'Schneiderei', fr: 'Couture', es: 'Corte y confección' } }, // Dressmaking
  { key: 'skills_68677221da2e9da50d6f450f', listType: 'skills', translations: { de: 'Schlagzeugspielen', fr: 'Batterie', es: 'Tocar la batería' } }, // Drumming
  { key: 'skills_68677221da2e9da50d6f4513', listType: 'skills', translations: { de: 'Färben', fr: 'Teinture', es: 'Teñido' } }, // Dyeing
  { key: 'skills_68677221da2e9da50d6f4517', listType: 'skills', translations: { de: 'Design', fr: 'Design', es: 'Diseño' } }, // Design
  { key: 'skills_68677221da2e9da50d6f451b', listType: 'skills', translations: { de: 'Digitale Kunst', fr: 'Art numérique', es: 'Arte digital' } }, // Digital Art
  { key: 'skills_68677221da2e9da50d6f451f', listType: 'skills', translations: { de: 'Digitale Fotografie', fr: 'Photographie numérique', es: 'Fotografía digital' } }, // Digital Photography
  { key: 'skills_68677221da2e9da50d6f4523', listType: 'skills', translations: { de: 'Heimwerkerprojekte', fr: 'Projets de bricolage', es: 'Proyectos de bricolaje' } }, // DIY Projects
  { key: 'skills_68677221da2e9da50d6f4527', listType: 'skills', translations: { de: 'Hundeausführen', fr: 'Promenade de chiens', es: 'Paseo de perros' } }, // Dog Walking
  { key: 'skills_68677dc2a8d65eb1d77a5529', listType: 'skills', translations: { de: 'Dialektisch-Behaviorale Therapie (DBT)', fr: 'Thérapie comportementale dialectique (TCD)', es: 'Terapia dialéctica conductual (TDC)' } }, // Dialectical Behavior Therapy (DBT)
  { key: 'skills_68677dc3a8d65eb1d77a556d', listType: 'skills', translations: { de: 'Dating-Coaching', fr: 'Coaching en séduction', es: 'Coaching de citas' } }, // Dating Coaching
  { key: 'skills_68677dc4a8d65eb1d77a55fb', listType: 'skills', translations: { de: 'Digitaler Detox', fr: 'Détox numérique', es: 'Desintoxicación digital' } }, // Digital Detox
  { key: 'skills_68677dc6a8d65eb1d77a560d', listType: 'skills', translations: { de: 'Tanz-/Bewegungstherapie', fr: 'Danse-thérapie/Thérapie par le mouvement', es: 'Danza/movimiento terapia' } }, // Dance/Movement Therapy
  { key: 'skills_68677dc6a8d65eb1d77a561d', listType: 'skills', translations: { de: 'Dramatherapie', fr: 'Dramathérapie', es: 'Dramaterapia' } }, // Drama Therapy
  { key: 'skills_68677dc8a8d65eb1d77a5656', listType: 'skills', translations: { de: 'DISG-Analyse', fr: 'Évaluation DISC', es: 'Evaluación DISC' } }, // DISC Assessment

  // -- D --
  { key: 'skills_68676f673eca17b2443843ae', listType: 'skills', translations: { de: 'Digitale Vermögensverwaltung', fr: 'Gestion des actifs numériques', es: 'Gestión de activos digitales' } }, // Digital Asset Management
  { key: 'skills_6867721dda2e9da50d6f4442', listType: 'skills', translations: { de: 'Datenanalyse', fr: 'Analyse de données', es: 'Análisis de datos' } }, // Data Analysis
  { key: 'skills_6867721dda2e9da50d6f44af', listType: 'skills', translations: { de: 'Datenvisualisierung', fr: 'Visualisation de données', es: 'Visualización de datos' } }, // Data Visualization
  { key: 'skills_6867721eda2e9da50d6f447b', listType: 'skills', translations: { de: 'Vielfalt & Inklusion', fr: 'Diversité et inclusion', es: 'Diversidad e inclusión' } }, // Diversity & Inclusion
  { key: 'skills_68677dbca8d65eb1d77a5444', listType: 'skills', translations: { de: 'Entscheidungsfindung', fr: 'Prise de décision', es: 'Toma de decisiones' } }, // Decision Making
  { key: 'skills_68677dc2a8d65eb1d77a5529', listType: 'skills', translations: { de: 'Dialektisch-Behaviorale Therapie (DBT)', fr: 'Thérapie comportementale dialectique (TCD)', es: 'Terapia dialéctica conductual (TDC)' } }, // Dialectical Behavior Therapy (DBT)

  // -- E --
  { key: 'skills_6867723b9e5f727ff60dfc67', listType: 'skills', translations: { de: 'Mitarbeiterengagement', fr: 'Engagement des employés', es: 'Compromiso de los empleados' } }, // Employee Engagement
  { key: 'skills_6867723b9e5f727ff60dfc6b', listType: 'skills', translations: { de: 'Mitarbeiterbeziehungen', fr: 'Relations avec les employés', es: 'Relaciones laborales' } }, // Employee Relations
  { key: 'skills_6867723b9e5f727ff60dfc6f', listType: 'skills', translations: { de: 'Ermächtigung', fr: 'Autonomisation', es: 'Empoderamiento' } }, // Empowerment
  { key: 'skills_68677dbea8d65eb1d77a5481', listType: 'skills', translations: { de: 'E-Commerce-Management', fr: 'Gestion du commerce électronique', es: 'Gestión de comercio electrónico' } }, // E-commerce Management
  { key: 'skills_68677dc5a8d65eb1d77a55d2', listType: 'skills', translations: { de: 'Unternehmerische Denkweise', fr: 'Esprit d\'entreprise', es: 'Mentalidad emprendedora' } }, // Entrepreneurial Mindset

  // -- F --
  { key: 'skills_6867729ffa206bd33585e0b0', listType: 'skills', translations: { de: 'Finanzen', fr: 'Finance', es: 'Finanzas' } }, // Finance
  { key: 'skills_686772a0fa206bd33585e0d4', listType: 'skills', translations: { de: 'Moderation', fr: 'Animation', es: 'Facilitación' } }, // Facilitation
  { key: 'skills_686772a0fa206bd33585e0d8', listType: 'skills', translations: { de: 'Feedback', fr: 'Feedback', es: 'Retroalimentación' } }, // Feedback
  { key: 'skills_68677dc1a8d65eb1d77a5500', listType: 'skills', translations: { de: 'Fitnesstraining', fr: 'Coaching de fitness', es: 'Entrenamiento físico' } }, // Fitness Coaching
  { key: 'skills_68677dc2a8d65eb1d77a555d', listType: 'skills', translations: { de: 'Familientherapeutische Systemtheorie', fr: 'Théorie des systèmes familiaux', es: 'Teoría de los sistemas familiares' } }, // Family Systems Theory

  // -- G --
  { key: 'skills_686772ce5032ff0b9eb9f268', listType: 'skills', translations: { de: 'Dankbarkeit', fr: 'Gratitude', es: 'Gratitud' } }, // Gratitude
  { key: 'skills_686772d15032ff0b9eb9f274', listType: 'skills', translations: { de: 'Wachstumsorientierte Denkweise', fr: 'État d\'esprit de croissance', es: 'Mentalidad de crecimiento' } }, // Growth Mindset
  { key: 'skills_68677dc2a8d65eb1d77a5539', listType: 'skills', translations: { de: 'Prinzipien der Gestalttherapie', fr: 'Principes de la Gestalt-thérapie', es: 'Principios de la Terapia Gestalt' } }, // Gestalt Therapy Principles
  { key: 'skills_68677dc3a8d65eb1d77a5575', listType: 'skills', translations: { de: 'Trauer- und Verlustbegleitung', fr: 'Soutien au deuil et à la perte', es: 'Apoyo en el duelo y la pérdida' } }, // Grief and Loss Support

  // -- H --
  { key: 'skills_68677d51c9248df4c0298549', listType: 'skills', translations: { de: 'Personalwesen (HR)', fr: 'Ressources humaines (RH)', es: 'Recursos Humanos (RRHH)' } }, // Human Resources (HR)
  { key: 'skills_68677d51c9248df4c0298561', listType: 'skills', translations: { de: 'Hochleistungsteams', fr: 'Équipes à haute performance', es: 'Equipos de alto rendimiento' } }, // High-Performance Teams
  { key: 'skills_68677d53c9248df4c02985ad', listType: 'skills', translations: { de: 'Gewohnheitsbildung', fr: 'Formation d\'habitudes', es: 'Formación de hábitos' } }, // Habit Formation
  { key: 'skills_68677d54c9248df4c02985ed', listType: 'skills', translations: { de: 'Ganzheitliche Gesundheit', fr: 'Santé holistique', es: 'Salud holística' } }, // Holistic Health
  { key: 'skills_68677dc5a8d65eb1d77a55c3', listType: 'skills', translations: { de: 'High-Performance-Coaching', fr: 'Coaching de haute performance', es: 'Coaching de alto rendimiento' } }, // High-Performance Coaching
  
  // -- I --
  { key: 'skills_68677d5590ac6390ce10f9fb', listType: 'skills', translations: { de: 'Innovationsmanagement', fr: 'Gestion de l\'innovation', es: 'Gestión de la innovación' } }, // Innovation Management
  { key: 'skills_68677d5690ac6390ce10fa1f', listType: 'skills', translations: { de: 'Einflussnahme', fr: 'Influence', es: 'Influencia' } }, // Influencing
  { key: 'skills_68677d5690ac6390ce10fa2b', listType: 'skills', translations: { de: 'Interviewführung', fr: 'Entretien', es: 'Entrevistas' } }, // Interviewing
  { key: 'skills_68677d5790ac6390ce10fa4f', listType: 'skills', translations: { de: 'Zwischenmenschliche Fähigkeiten', fr: 'Compétences interpersonnelles', es: 'Habilidades interpersonales' } }, // Interpersonal Skills
  { key: 'skills_68677dc2a8d65eb1d77a5535', listType: 'skills', translations: { de: 'Arbeit mit inneren Anteilen (IFS)', fr: 'Systèmes familiaux intérieurs (IFS)', es: 'Sistemas de la Familia Interna (IFS)' } }, // Internal Family Systems (IFS)

  // -- J --
  { key: 'skills_68677d5b0435a7546f13150b', listType: 'skills', translations: { de: 'Job Shadowing (Hospitation)', fr: 'Observation en milieu de travail', es: 'Observación de puestos de trabajo' } }, // Job Shadowing
  { key: 'skills_68677d5b0435a7546f131517', listType: 'skills', translations: { de: 'Journalismus', fr: 'Journalisme', es: 'Periodismo' } }, // Journalism
  { key: 'skills_68677dc6a8d65eb1d77a5605', listType: 'skills', translations: { de: 'Heilendes Tagebuchschreiben', fr: 'Tenue d\'un journal à des fins de guérison', es: 'Escribir un diario para sanar' } }, // Journaling for Healing
  
  // -- K --
  { key: 'skills_68677d603bd5293274378810', listType: 'skills', translations: { de: 'Leistungskennzahlen (KPIs)', fr: 'Indicateurs clés de performance (KPI)', es: 'Indicadores clave de rendimiento (KPI)' } }, // Key Performance Indicators (KPIs)
  { key: 'skills_68677d603bd5293274378814', listType: 'skills', translations: { de: 'Wissensmanagement', fr: 'Gestion des connaissances', es: 'Gestión del conocimiento' } }, // Knowledge Management
  
  // -- L --
  { key: 'skills_68677d65fe00a176b507a891', listType: 'skills', translations: { de: 'Wandel führen', fr: 'Conduite du changement', es: 'Liderar el cambio' } }, // Leading Change
  { key: 'skills_68677d67fe00a176b507a8e5', listType: 'skills', translations: { de: 'Zuhörkompetenz', fr: 'Compétences d\'écoute', es: 'Habilidades de escucha' } }, // Listening Skills
  { key: 'skills_68677dc1a8d65eb1d77a5521', listType: 'skills', translations: { de: 'Sprachen lernen', fr: 'Apprentissage des langues', es: 'Aprendizaje de idiomas' } }, // Language Learning

  // -- M --
  { key: 'skills_68677d6b99ddbb6c14d060b3', listType: 'skills', translations: { de: 'Mentoring', fr: 'Mentorat', es: 'Mentoría' } }, // Mentoring
  { key: 'skills_68677d6b99ddbb6c14d060b7', listType: 'skills', translations: { de: 'Motivierende Führung', fr: 'Leadership motivationnel', es: 'Liderazgo motivacional' } }, // Motivational Leadership
  { key: 'skills_68677d6e99ddbb6c14d06137', listType: 'skills', translations: { de: 'Achtsamkeit', fr: 'Pleine conscience', es: 'Atención plena' } }, // Mindfulness
  { key: 'skills_68677d6e99ddbb6c14d0613b', listType: 'skills', translations: { de: 'Mindset-Coaching', fr: 'Coaching de l\'état d\'esprit', es: 'Coaching de mentalidad' } }, // Mindset Coaching
  { key: 'skills_68677d6e99ddbb6c14d0615b', listType: 'skills', translations: { de: 'Meditation', fr: 'Méditation', es: 'Meditación' } }, // Meditation

  // -- N --
  { key: 'skills_68677d712c1bf9352e229fb5', listType: 'skills', translations: { de: 'Netzwerken', fr: 'Réseautage', es: 'Networking' } }, // Networking
  { key: 'skills_68677d722c1bf9352e22fb9', listType: 'skills', translations: { de: 'Neurolinguistisches Programmieren (NLP)', fr: 'Programmation neuro-linguistique (PNL)', es: 'Programación neurolingüística (PNL)' } }, // Neurolinguistic Programming (NLP)
  { key: 'skills_68677dc2a8d65eb1d77a5559', listType: 'skills', translations: { de: 'Gewaltfreie Kommunikation (GFK)', fr: 'Communication non violente (CNV)', es: 'Comunicación no violenta (CNV)' } }, // Nonviolent Communication (NVC)

  // -- O --
  { key: 'skills_68677d7565cf459f53b76fb5', listType: 'skills', translations: { de: 'Onboarding', fr: 'Intégration', es: 'Incorporación' } }, // Onboarding
  { key: 'skills_68677d7665cf459f53b76fc1', listType: 'skills', translations: { de: 'Betriebsmanagement', fr: 'Gestion des opérations', es: 'Gestión de operaciones' } }, // Operations Management
  { key: 'skills_68677dc5a8d65eb1d77a55ca', listType: 'skills', translations: { de: 'Organisationspsychologie', fr: 'Psychologie organisationnelle', es: 'Psicología organizacional' } }, // Organizational Psychology

  // -- P --
  { key: 'skills_68677d7b42b3b14c8b481d8e', listType: 'skills', translations: { de: 'Personalmanagement', fr: 'Gestion du personnel', es: 'Gestión de personal' } }, // People Management
  { key: 'skills_68677d7b42b3b14c8b481d93', listType: 'skills', translations: { de: 'Leistungsmanagement', fr: 'Gestion de la performance', es: 'Gestión del rendimiento' } }, // Performance Management
  { key: 'skills_68677d7c42b3b14c8b481ddb', listType: 'skills', translations: { de: 'Produktmanagement', fr: 'Gestion de produits', es: 'Gestión de productos' } }, // Product Management
  { key: 'skills_68677dc1a8d65eb1d77a5504', listType: 'skills', translations: { de: 'Personal Training', fr: 'Entraînement personnel', es: 'Entrenamiento personal' } }, // Personal Training
  { key: 'skills_68677dc2a8d65eb1d77a5551', listType: 'skills', translations: { de: 'Elterncoaching', fr: 'Coaching parental', es: 'Coaching para padres' } }, // Parenting Coaching

  // -- Q --
  { key: 'skills_68677d803b83e77ec8e27e9a', listType: 'skills', translations: { de: 'Qualitätssicherung', fr: 'Assurance qualité', es: 'Aseguramiento de la calidad' } }, // Quality Assurance
  { key: 'skills_68677d803b83e77ec8e27ea6', listType: 'skills', translations: { de: 'Qualitätsmanagement', fr: 'Gestion de la qualité', es: 'Gestión de la calidad' } }, // Quality Management

  // -- R --
  { key: 'skills_68677d86f79b16cd30084791', listType: 'skills', translations: { de: 'Risikomanagement', fr: 'Gestion des risques', es: 'Gestión de riesgos' } }, // Risk Management
  { key: 'skills_68677d89f79b16cd30084825', listType: 'skills', translations: { de: 'Resilienz', fr: 'Résilience', es: 'Resiliencia' } }, // Resilience
  
  // -- S --
  { key: 'skills_68677d8ca63038979749c90f', listType: 'skills', translations: { de: 'Vertrieb', fr: 'Vente', es: 'Ventas' } }, // Sales
  { key: 'skills_68677d8ba63038979749c8f3', listType: 'skills', translations: { de: 'Stakeholder-Management', fr: 'Gestion des parties prenantes', es: 'Gestión de las partes interesadas' } }, // Stakeholder Management
  { key: 'skills_68677d8ba63038979749c8fb', listType: 'skills', translations: { de: 'Strategische Planung', fr: 'Planification stratégique', es: 'Planificación estratégica' } }, // Strategic Planning
  { key: 'skills_68677d8da63038979749c936', listType: 'skills', translations: { de: 'Lieferkettenmanagement', fr: 'Gestion de la chaîne d\'approvisionnement', es: 'Gestión de la cadena de suministro' } }, // Supply Chain Management
  { key: 'skills_68677d8fa63038979749c998', listType: 'skills', translations: { de: 'Stressbewältigung', fr: 'Gestion du stress', es: 'Gestión del estrés' } }, // Stress Management
  { key: 'skills_68677dc4a8d65eb1d77a55e7', listType: 'skills', translations: { de: 'Schlafhygiene', fr: 'Hygiène du sommeil', es: 'Higiene del sueño' } }, // Sleep Hygiene

  // -- T --
  { key: 'skills_68677d91aa0f48e1ad13e200', listType: 'skills', translations: { de: 'Talentmanagement', fr: 'Gestion des talents', es: 'Gestión del talento' } }, // Talent Management
  { key: 'skills_68677d91aa0f48e1ad13e208', listType: 'skills', translations: { de: 'Teambildung', fr: 'Consolidation d\'équipe', es: 'Creación de equipos' } }, // Team Building
  { key: 'skills_68677d91aa0f48e1ad13e210', listType: 'skills', translations: { de: 'Teamarbeit', fr: 'Travail d\'équipe', es: 'Trabajo en equipo' } }, // Teamwork
  { key: 'skills_68677d91aa0f48e1ad13e224', listType: 'skills', translations: { de: 'Fehlerbehebung', fr: 'Dépannage', es: 'Solución de problemas' } }, // Troubleshooting
  { key: 'skills_68677dc2a8d65eb1d77a5545', listType: 'skills', translations: { de: 'Traumasensible Begleitung', fr: 'Approche tenant compte des traumatismes', es: 'Atención informada sobre el trauma' } }, // Trauma-Informed Care

  // -- U --
  { key: 'skills_68677d969c3834f2c4b3761e', listType: 'skills', translations: { de: 'Benutzererfahrung (UX)', fr: 'Expérience utilisateur (UX)', es: 'Experiencia de usuario (UX)' } }, // User Experience (UX)
  { key: 'skills_68677d969c3834f2c4b37626', listType: 'skills', translations: { de: 'UI-Design', fr: 'Conception d\'interface utilisateur (UI)', es: 'Diseño de interfaz de usuario (UI)' } }, // User Interface (UI) Design
  { key: 'skills_68677dbfa8d65eb1d77a54cf', listType: 'skills', translations: { de: 'UX-Design', fr: 'Conception de l\'expérience utilisateur (UX)', es: 'Diseño de experiencia de usuario (UX)' } }, // User Experience (UX) Design

  // -- V --
  { key: 'skills_68677d9c61c06ad13ae9dc8f', listType: 'skills', translations: { de: 'Visionen entwickeln', fr: 'Définition de la vision', es: 'Establecimiento de la visión' } }, // Vision Setting
  { key: 'skills_68677d9e61c06ad13ae9dd17', listType: 'skills', translations: { de: 'Visualisierung', fr: 'Visualisation', es: 'Visualización' } }, // Visualization
  
  // -- W --
  { key: 'skills_68677da12bf813d98b55d549', listType: 'skills', translations: { de: 'Entwicklung der Arbeitsplatzkultur', fr: 'Développement de la culture d\'entreprise', es: 'Desarrollo de la cultura laboral' } }, // Workplace Culture Development
  { key: 'skills_68677da12bf813d98b55d551', listType: 'skills', translations: { de: 'Workshop-Moderation', fr: 'Animation d\'atelier', es: 'Facilitación de talleres' } }, // Workshop Facilitation
  { key: 'skills_68677da42bf813d98b55d605', listType: 'skills', translations: { de: 'Schreiben', fr: 'Écriture', es: 'Escritura' } }, // Writing
  { key: 'skills_68677da52bf813d98b55d60d', listType: 'skills', translations: { de: 'Wellness-Coaching', fr: 'Coaching bien-être', es: 'Coaching de bienestar' } }, // Wellness Coaching

  // -- X --
  { key: 'skills_68677da62e74226fd71d5086', listType: 'skills', translations: { de: 'Röntgenanalyse', fr: 'Analyse par rayons X', es: 'Análisis de rayos X' } }, // X-Ray Analysis
  { key: 'skills_68677da72e74226fd71d50ab', listType: 'skills', translations: { de: 'XML', fr: 'XML', es: 'XML' } }, // XML

  // -- Y --
  { key: 'skills_68677dab8731262c1fe84567', listType: 'skills', translations: { de: 'Yoga', fr: 'Yoga', es: 'Yoga' } }, // Yoga
  { key: 'skills_68677dab8731262c1fe8456c', listType: 'skills', translations: { de: 'Yoga-Unterricht', fr: 'Enseignement du yoga', es: 'Instrucción de yoga' } }, // Yoga Instruction
  
  // -- Z --
  { key: 'skills_68677db1b98537eff9c67319', listType: 'skills', translations: { de: 'Nullbasierte Budgetierung (ZBB)', fr: 'Budget base zéro (BBZ)', es: 'Presupuesto base cero (PBC)' } }, // Zero-Based Budgeting (ZBB)
  { key: 'skills_68677db4b98537eff9c673a2', listType: 'skills', translations: { de: 'Zen', fr: 'Zen', es: 'Zen' } }, // Zen
  { key: 'skills_68677db4b98537eff9c673a6', listType: 'skills', translations: { de: 'Lebensfreude', fr: 'Joie de vivre', es: 'Entusiasmo por la vida' } }, // Zest for Life
];

const MissingTranslations = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    let updatedCount = 0;

    for (const item of dataToUpload) {
      await Translation.updateOne(
        { key: item.key },
        {
          $set: {
            listType: item.listType,
            translations: item.translations,
          }
        },
        { upsert: true } // Creates the document if it doesn't exist, updates it if it does
      );
      updatedCount++;
      console.log(`  - Synchronized translation for key: "${item.key}".`);
    }

    console.log(`\nSeed complete. ${updatedCount} translations were added or updated.`);
  } catch (error) {
    console.error('An error occurred during the seed process:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

MissingTranslations();