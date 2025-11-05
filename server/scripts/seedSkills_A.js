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
// A list of 60 important coaching-related skills starting with the letter 'A'.
const dataToUpload = [
  // --- Personal Development & Mindset ---
  { name: 'Accountability', category: 'Personal Development & Mindset', translations: { de: 'Rechenschaftspflicht', fr: 'Responsabilité', es: 'Responsabilidad' } },
  { name: 'Adaptability', category: 'Personal Development & Mindset', translations: { de: 'Anpassungsfähigkeit', fr: 'Adaptabilité', es: 'Adaptabilidad' } },
  { name: 'Affirmation Practice', category: 'Personal Development & Mindset', translations: { de: 'Affirmationspraxis', fr: 'Pratique des affirmations', es: 'Práctica de afirmaciones' } },
  { name: 'Ambition Cultivation', category: 'Personal Development & Mindset', translations: { de: 'Ambitionsförderung', fr: 'Culture de l\'ambition', es: 'Cultivo de la ambición' } },
  { name: 'Anchoring Techniques', category: 'Personal Development & Mindset', translations: { de: 'Ankertechniken', fr: 'Techniques d\'ancrage', es: 'Técnicas de anclaje' } },
  { name: 'Assertiveness', category: 'Personal Development & Mindset', translations: { de: 'Durchsetzungsvermögen', fr: 'Assertivité', es: 'Asertividad' } },
  { name: 'Attitude Adjustment', category: 'Personal Development & Mindset', translations: { de: 'Einstellungsanpassung', fr: 'Ajustement de l\'attitude', es: 'Ajuste de actitud' } },
  { name: 'Authenticity', category: 'Personal Development & Mindset', translations: { de: 'Authentizität', fr: 'Authenticité', es: 'Autenticidad' } },
  { name: 'Awareness (Self)', category: 'Personal Development & Mindset', translations: { de: 'Selbstwahrnehmung', fr: 'Conscience de soi', es: 'Autoconciencia' } },

  // --- Communication & Interpersonal ---
  { name: 'Active Listening', category: 'Communication & Interpersonal', translations: { de: 'Aktives Zuhören', fr: 'Écoute active', es: 'Escucha activa' } },
  { name: 'Acknowledging Contributions', category: 'Communication & Interpersonal', translations: { de: 'Anerkennung von Beiträgen', fr: 'Reconnaissance des contributions', es: 'Reconocimiento de contribuciones' } },
  { name: 'Addressing Conflict', category: 'Communication & Interpersonal', translations: { de: 'Konfliktbewältigung', fr: 'Gestion des conflits', es: 'Abordaje de conflictos' } },
  { name: 'Advocating for Others', category: 'Communication & Interpersonal', translations: { de: 'Für andere eintreten', fr: 'Défendre les autres', es: 'Abogar por los demás' } },
  { name: 'Alliance Building', category: 'Communication & Interpersonal', translations: { de: 'Allianzbildung', fr: 'Création d\'alliances', es: 'Construcción de alianzas' } },
  { name: 'Appreciative Inquiry', category: 'Communication & Interpersonal', translations: { de: 'Wertschätzende Erkundung', fr: 'Enquête appréciative', es: 'Indagación apreciativa' } },
  { name: 'Argument Resolution', category: 'Communication & Interpersonal', translations: { de: 'Streitbeilegung', fr: 'Résolution des conflits', es: 'Resolución de disputas' } },
  { name: 'Articulation', category: 'Communication & Interpersonal', translations: { de: 'Artikulation', fr: 'Articulation', es: 'Articulación' } },
  { name: 'Asking Powerful Questions', category: 'Communication & Interpersonal', translations: { de: 'Stellen wirkungsvoller Fragen', fr: 'Poser des questions puissantes', es: 'Hacer preguntas poderosas' } },
  { name: 'Audience Analysis', category: 'Communication & Interpersonal', translations: { de: 'Publikumsanalyse', fr: 'Analyse de l\'audience', es: 'Análisis de la audiencia' } },

  // --- Leadership & Management ---
  { name: 'Action-Oriented Leadership', category: 'Leadership & Management', translations: { de: 'Handlungsorientierte Führung', fr: 'Leadership orienté action', es: 'Liderazgo orientado a la acción' } },
  { name: 'Action Planning', category: 'Leadership & Management', translations: { de: 'Aktionsplanung', fr: 'Planification d\'actions', es: 'Planificación de acciones' } },
  { name: 'Acquiring Talent', category: 'Leadership & Management', translations: { de: 'Talentakquise', fr: 'Acquisition de talents', es: 'Adquisición de talento' } },
  { name: 'Administrative Skills', category: 'Leadership & Management', translations: { de: 'Administrative Fähigkeiten', fr: 'Compétences administratives', es: 'Habilidades administrativas' } },
  { name: 'Agile Leadership', category: 'Leadership & Management', translations: { de: 'Agile Führung', fr: 'Leadership agile', es: 'Liderazgo ágil' } },
  { name: 'Agenda Setting', category: 'Leadership & Management', translations: { de: 'Themensetzung', fr: 'Établissement de l\'ordre du jour', es: 'Establecimiento de la agenda' } },
  { name: 'Aligning Teams', category: 'Leadership & Management', translations: { de: 'Team-Ausrichtung', fr: 'Alignement des équipes', es: 'Alineación de equipos' } },
  { name: 'Assessment of Performance', category: 'Leadership & Management', translations: { de: 'Leistungsbeurteilung', fr: 'Évaluation de la performance', es: 'Evaluación del desempeño' } },
  { name: 'Authority Delegation', category: 'Leadership & Management', translations: { de: 'Delegation von Befugnissen', fr: 'Délégation d\'autorité', es: 'Delegación de autoridad' } },
  { name: 'Autonomy Support', category: 'Leadership & Management', translations: { de: 'Autonomieunterstützung', fr: 'Soutien à l\'autonomie', es: 'Apoyo a la autonomía' } },
  
  // --- Business & Strategy ---
  { name: 'Account Management', category: 'Business & Strategy', translations: { de: 'Kundenbetreuung', fr: 'Gestion de comptes', es: 'Gestión de cuentas' } },
  { name: 'Acquisition Strategy', category: 'Business & Strategy', translations: { de: 'Akquisitionsstrategie', fr: 'Stratégie d\'acquisition', es: 'Estrategia de adquisición' } },
  { name: 'Advertising Strategy', category: 'Business & Strategy', translations: { de: 'Werbestrategie', fr: 'Stratégie publicitaire', es: 'Estrategia publicitaria' } },
  { name: 'Affiliate Marketing', category: 'Business & Strategy', translations: { de: 'Affiliate-Marketing', fr: 'Marketing d\'affiliation', es: 'Marketing de afiliados' } },
  { name: 'Agile Methodologies', category: 'Business & Strategy', translations: { de: 'Agile Methoden', fr: 'Méthodologies agiles', es: 'Metodologías ágiles' } },
  { name: 'Angel Investment Pitching', category: 'Business & Strategy', translations: { de: 'Pitching für Angel-Investoren', fr: 'Présentation aux investisseurs providentiels', es: 'Presentación a inversores ángeles' } },
  { name: 'Annual Planning', category: 'Business & Strategy', translations: { de: 'Jahresplanung', fr: 'Planification annuelle', es: 'Planificación anual' } },
  { name: 'Asset Allocation', category: 'Business & Strategy', translations: { de: 'Vermögensallokation', fr: 'Allocation d\'actifs', es: 'Asignación de activos' } },
  { name: 'Auditing Processes', category: 'Business & Strategy', translations: { de: 'Prüfung von Prozessen', fr: 'Audit des processus', es: 'Auditoría de procesos' } },
  { name: 'Automation Strategy', category: 'Business & Strategy', translations: { de: 'Automatisierungsstrategie', fr: 'Stratégie d\'automatisation', es: 'Estrategia de automatización' } },

  // --- Analytical & Technical ---
  { name: 'Abstract Reasoning', category: 'Analytical & Technical', translations: { de: 'Abstraktes Denken', fr: 'Raisonnement abstrait', es: 'Razonamiento abstracto' } },
  { name: 'AI Prompt Engineering', category: 'Analytical & Technical', translations: { de: 'KI-Prompt-Engineering', fr: 'Ingénierie des prompts pour l\'IA', es: 'Ingeniería de prompts de IA' } },
  { name: 'Algorithmic Thinking', category: 'Analytical & Technical', translations: { de: 'Algorithmisches Denken', fr: 'Pensée algorithmique', es: 'Pensamiento algorítmico' } },
  { name: 'Analytical Skills', category: 'Analytical & Technical', translations: { de: 'Analytische Fähigkeiten', fr: 'Compétences analytiques', es: 'Habilidades analíticas' } },
  { name: 'Analytical Thinking', category: 'Analytical & Technical', translations: { de: 'Analytisches Denken', fr: 'Pensée analytique', es: 'Pensamiento analítico' } },
  { name: 'API Integration', category: 'Analytical & Technical', translations: { de: 'API-Integration', fr: 'Intégration d\'API', es: 'Integración de API' } },
  { name: 'Architectural Design Thinking', category: 'Analytical & Technical', translations: { de: 'Architektonisches Designdenken', fr: 'Pensée conceptuelle architecturale', es: 'Pensamiento de diseño arquitectónico' } },
  { name: 'Asset Management (Digital)', category: 'Analytical & Technical', translations: { de: 'Digitale Vermögensverwaltung', fr: 'Gestion des actifs numériques', es: 'Gestión de activos (digitales)' } },
  { name: 'Audio Production Basics', category: 'Analytical & Technical', translations: { de: 'Grundlagen der Audioproduktion', fr: 'Bases de la production audio', es: 'Conceptos básicos de producción de audio' } },
  { name: 'Automated Reporting', category: 'Analytical & Technical', translations: { de: 'Automatisiertes Reporting', fr: 'Reporting automatisé', es: 'Informes automatizados' } },

  // --- Wellness & Health ---
  { name: 'Acceptance and Commitment Therapy (ACT) Principles', category: 'Wellness & Health', translations: { de: 'Prinzipien der Akzeptanz- und Commitment-Therapie (ACT)', fr: 'Principes de la thérapie d\'acceptation et d\'engagement (ACT)', es: 'Principios de la Terapia de Aceptación y Compromiso (ACT)' } },
  { name: 'Activity Scheduling (for well-being)', category: 'Wellness & Health', translations: { de: 'Aktivitätenplanung (für Wohlbefinden)', fr: 'Planification d\'activités (pour le bien-être)', es: 'Programación de actividades (para el bienestar)' } },
  { name: 'Addiction Recovery Support', category: 'Wellness & Health', translations: { de: 'Unterstützung bei der Suchtbewältigung', fr: 'Soutien à la guérison de la dépendance', es: 'Apoyo en la recuperación de adicciones' } },
  { name: 'Alternative Healing Practices', category: 'Wellness & Health', translations: { de: 'Alternative Heilpraktiken', fr: 'Pratiques de guérison alternatives', es: 'Prácticas de sanación alternativas' } },
  { name: 'Anger Management', category: 'Wellness & Health', translations: { de: 'Aggressionsbewältigung', fr: 'Gestion de la colère', es: 'Manejo de la ira' } },
  { name: 'Anxiety Management', category: 'Wellness & Health', translations: { de: 'Angstbewältigung', fr: 'Gestion de l\'anxiété', es: 'Manejo de la ansiedad' } },
  { name: 'Aromatherapy', category: 'Wellness & Health', translations: { de: 'Aromatherapie', fr: 'Aromathérapie', es: 'Aromaterapia' } },
  { name: 'Artistic Expression', category: 'Wellness & Health', translations: { de: 'Künstlerischer Ausdruck', fr: 'Expression artistique', es: 'Expresión artística' } },
  { name: 'Athletic Performance Enhancement', category: 'Wellness & Health', translations: { de: 'Steigerung der sportlichen Leistung', fr: 'Amélioration de la performance athlétique', es: 'Mejora del rendimiento atlético' } },
  { name: 'Attention Control', category: 'Wellness & Health', translations: { de: 'Aufmerksamkeitskontrolle', fr: 'Contrôle de l\'attention', es: 'Control de la atención' } },

   { name: 'Accountability', category: 'Personal Development & Mindset', translations: { de: 'Rechenschaftspflicht', fr: 'Responsabilité', es: 'Responsabilidad' } },
  { name: 'Adaptability', category: 'Personal Development & Mindset', translations: { de: 'Anpassungsfähigkeit', fr: 'Adaptabilité', es: 'Adaptabilidad' } },
  { name: 'Affirmation Practice', category: 'Personal Development & Mindset', translations: { de: 'Affirmationspraxis', fr: 'Pratique des affirmations', es: 'Práctica de afirmaciones' } },
  { name: 'Ambition Cultivation', category: 'Personal Development & Mindset', translations: { de: 'Ambitionsförderung', fr: 'Culture de l\'ambition', es: 'Cultivo de la ambición' } },
  { name: 'Anchoring Techniques', category: 'Personal Development & Mindset', translations: { de: 'Ankertechniken', fr: 'Techniques d\'ancrage', es: 'Técnicas de anclaje' } },
  { name: 'Assertiveness', category: 'Personal Development & Mindset', translations: { de: 'Durchsetzungsvermögen', fr: 'Assertivité', es: 'Asertividad' } },
  { name: 'Attitude Adjustment', category: 'Personal Development & Mindset', translations: { de: 'Einstellungsanpassung', fr: 'Ajustement de l\'attitude', es: 'Ajuste de actitud' } },
  { name: 'Authenticity', category: 'Personal Development & Mindset', translations: { de: 'Authentizität', fr: 'Authenticité', es: 'Autenticidad' } },
  { name: 'Self-Awareness', category: 'Personal Development & Mindset', translations: { de: 'Selbstwahrnehmung', fr: 'Conscience de soi', es: 'Autoconciencia' } },

  // --- Communication & Interpersonal ---
  { name: 'Active Listening', category: 'Communication & Interpersonal', translations: { de: 'Aktives Zuhören', fr: 'Écoute active', es: 'Escucha activa' } },
  { name: 'Acknowledging Contributions', category: 'Communication & Interpersonal', translations: { de: 'Anerkennung von Beiträgen', fr: 'Reconnaissance des contributions', es: 'Reconocimiento de contribuciones' } },
  { name: 'Addressing Conflict', category: 'Communication & Interpersonal', translations: { de: 'Konfliktbewältigung', fr: 'Gestion des conflits', es: 'Abordaje de conflictos' } },
  { name: 'Advocating for Others', category: 'Communication & Interpersonal', translations: { de: 'Für andere eintreten', fr: 'Défendre les autres', es: 'Abogar por los demás' } },
  { name: 'Alliance Building', category: 'Communication & Interpersonal', translations: { de: 'Allianzbildung', fr: 'Création d\'alliances', es: 'Construcción de alianzas' } },
  { name: 'Appreciative Inquiry', category: 'Communication & Interpersonal', translations: { de: 'Wertschätzende Erkundung', fr: 'Enquête appréciative', es: 'Indagación apreciativa' } },
  { name: 'Argument Resolution', category: 'Communication & Interpersonal', translations: { de: 'Streitbeilegung', fr: 'Résolution des conflits', es: 'Resolución de disputas' } },
  { name: 'Articulation', category: 'Communication & Interpersonal', translations: { de: 'Artikulation', fr: 'Articulation', es: 'Articulación' } },
  { name: 'Asking Powerful Questions', category: 'Communication & Interpersonal', translations: { de: 'Stellen wirkungsvoller Fragen', fr: 'Poser des questions puissantes', es: 'Hacer preguntas poderosas' } },
  { name: 'Audience Analysis', category: 'Communication & Interpersonal', translations: { de: 'Publikumsanalyse', fr: 'Analyse de l\'audience', es: 'Análisis de la audiencia' } },

  // --- Leadership & Management ---
  { name: 'Action-Oriented Leadership', category: 'Leadership & Management', translations: { de: 'Handlungsorientierte Führung', fr: 'Leadership orienté action', es: 'Liderazgo orientado a la acción' } },
  { name: 'Action Planning', category: 'Leadership & Management', translations: { de: 'Aktionsplanung', fr: 'Planification d\'actions', es: 'Planificación de acciones' } },
  { name: 'Acquiring Talent', category: 'Leadership & Management', translations: { de: 'Talentakquise', fr: 'Acquisition de talents', es: 'Adquisición de talento' } },
  { name: 'Administrative Skills', category: 'Leadership & Management', translations: { de: 'Administrative Fähigkeiten', fr: 'Compétences administratives', es: 'Habilidades administrativas' } },
  { name: 'Agile Leadership', category: 'Leadership & Management', translations: { de: 'Agile Führung', fr: 'Leadership agile', es: 'Liderazgo ágil' } },
  { name: 'Agenda Setting', category: 'Leadership & Management', translations: { de: 'Themensetzung', fr: 'Établissement de l\'ordre du jour', es: 'Establecimiento de la agenda' } },
  { name: 'Aligning Teams', category: 'Leadership & Management', translations: { de: 'Team-Ausrichtung', fr: 'Alignement des équipes', es: 'Alineación de equipos' } },
  { name: 'Assessment of Performance', category: 'Leadership & Management', translations: { de: 'Leistungsbeurteilung', fr: 'Évaluation de la performance', es: 'Evaluación del desempeño' } },
  { name: 'Authority Delegation', category: 'Leadership & Management', translations: { de: 'Delegation von Befugnissen', fr: 'Délégation d\'autorité', es: 'Delegación de autoridad' } },
  { name: 'Autonomy Support', category: 'Leadership & Management', translations: { de: 'Autonomieunterstützung', fr: 'Soutien à l\'autonomie', es: 'Apoyo a la autonomía' } },
  
  // --- Business & Strategy ---
  { name: 'Account Management', category: 'Business & Strategy', translations: { de: 'Kundenbetreuung', fr: 'Gestion de comptes', es: 'Gestión de cuentas' } },
  { name: 'Acquisition Strategy', category: 'Business & Strategy', translations: { de: 'Akquisitionsstrategie', fr: 'Stratégie d\'acquisition', es: 'Estrategia de adquisición' } },
  { name: 'Advertising Strategy', category: 'Business & Strategy', translations: { de: 'Werbestrategie', fr: 'Stratégie publicitaire', es: 'Estrategia publicitaria' } },
  { name: 'Affiliate Marketing', category: 'Business & Strategy', translations: { de: 'Affiliate-Marketing', fr: 'Marketing d\'affiliation', es: 'Marketing de afiliados' } },
  { name: 'Agile Methodologies', category: 'Business & Strategy', translations: { de: 'Agile Methoden', fr: 'Méthodologies agiles', es: 'Metodologías ágiles' } },
  { name: 'Angel Investment Pitching', category: 'Business & Strategy', translations: { de: 'Pitching für Angel-Investoren', fr: 'Présentation aux investisseurs providentiels', es: 'Presentación a inversores ángeles' } },
  { name: 'Annual Planning', category: 'Business & Strategy', translations: { de: 'Jahresplanung', fr: 'Planification annuelle', es: 'Planificación anual' } },
  { name: 'Asset Allocation', category: 'Business & Strategy', translations: { de: 'Vermögensallokation', fr: 'Allocation d\'actifs', es: 'Asignación de activos' } },
  { name: 'Auditing Processes', category: 'Business & Strategy', translations: { de: 'Prüfung von Prozessen', fr: 'Audit des processus', es: 'Auditoría de procesos' } },
  { name: 'Automation Strategy', category: 'Business & Strategy', translations: { de: 'Automatisierungsstrategie', fr: 'Stratégie d\'automatisation', es: 'Estrategia de automatización' } },

  // --- Analytical & Technical ---
  { name: 'Abstract Reasoning', category: 'Analytical & Technical', translations: { de: 'Abstraktes Denken', fr: 'Raisonnement abstrait', es: 'Razonamiento abstracto' } },
  { name: 'AI Prompt Engineering', category: 'Analytical & Technical', translations: { de: 'KI-Prompt-Engineering', fr: 'Ingénierie des prompts pour l\'IA', es: 'Ingeniería de prompts de IA' } },
  { name: 'Algorithmic Thinking', category: 'Analytical & Technical', translations: { de: 'Algorithmisches Denken', fr: 'Pensée algorithmique', es: 'Pensamiento algorítmico' } },
  { name: 'Analytical Skills', category: 'Analytical & Technical', translations: { de: 'Analytische Fähigkeiten', fr: 'Compétences analytiques', es: 'Habilidades analíticas' } },
  { name: 'Analytical Thinking', category: 'Analytical & Technical', translations: { de: 'Analytisches Denken', fr: 'Pensée analytique', es: 'Pensamiento analítico' } },
  { name: 'API Integration', category: 'Analytical & Technical', translations: { de: 'API-Integration', fr: 'Intégration d\'API', es: 'Integración de API' } },
  { name: 'Architectural Design Thinking', category: 'Analytical & Technical', translations: { de: 'Architektonisches Designdenken', fr: 'Pensée conceptuelle architecturale', es: 'Pensamiento de diseño arquitectónico' } },
  { name: 'Digital Asset Management', category: 'Analytical & Technical', translations: { de: 'Digitale Vermögensverwaltung', fr: 'Gestion des actifs numériques', es: 'Gestión de activos digitales' } },
  { name: 'Audio Production Basics', category: 'Analytical & Technical', translations: { de: 'Grundlagen der Audioproduktion', fr: 'Bases de la production audio', es: 'Conceptos básicos de producción de audio' } },
  { name: 'Automated Reporting', category: 'Analytical & Technical', translations: { de: 'Automatisiertes Reporting', fr: 'Reporting automatisé', es: 'Informes automatizados' } },

  // --- Wellness & Health ---
  { name: 'Acceptance and Commitment Therapy (ACT) Principles', category: 'Wellness & Health', translations: { de: 'Prinzipien der Akzeptanz- und Commitment-Therapie (ACT)', fr: 'Principes de la thérapie d\'acceptation et d\'engagement (ACT)', es: 'Principios de la Terapia de Aceptación y Compromiso (ACT)' } },
  { name: 'Activity Scheduling', category: 'Wellness & Health', translations: { de: 'Aktivitätenplanung', fr: 'Planification d\'activités', es: 'Programación de actividades' } },
  { name: 'Addiction Recovery Support', category: 'Wellness & Health', translations: { de: 'Unterstützung bei der Suchtbewältigung', fr: 'Soutien à la guérison de la dépendance', es: 'Apoyo en la recuperación de adicciones' } },
  { name: 'Alternative Healing Practices', category: 'Wellness & Health', translations: { de: 'Alternative Heilpraktiken', fr: 'Pratiques de guérison alternatives', es: 'Prácticas de sanación alternativas' } },
  { name: 'Anger Management', category: 'Wellness & Health', translations: { de: 'Aggressionsbewältigung', fr: 'Gestion de la colère', es: 'Manejo de la ira' } },
  { name: 'Anxiety Management', category: 'Wellness & Health', translations: { de: 'Angstbewältigung', fr: 'Gestion de l\'anxiété', es: 'Manejo de la ansiedad' } },
  { name: 'Aromatherapy', category: 'Wellness & Health', translations: { de: 'Aromatherapie', fr: 'Aromathérapie', es: 'Aromaterapia' } },
  { name: 'Artistic Expression', category: 'Wellness & Health', translations: { de: 'Künstlerischer Ausdruck', fr: 'Expression artistique', es: 'Expresión artística' } },
  { name: 'Athletic Performance Enhancement', category: 'Wellness & Health', translations: { de: 'Steigerung der sportlichen Leistung', fr: 'Amélioration de la performance athlétique', es: 'Mejora del rendimiento atlético' } },
  { name: 'Attention Control', category: 'Wellness & Health', translations: { de: 'Aufmerksamkeitskontrolle', fr: 'Contrôle de l\'attention', es: 'Control de la atención' } },

  { name: 'Accounting', category: 'Business & Finance', translations: { de: 'Buchhaltung', fr: 'Comptabilité', es: 'Contabilidad' } },
  { name: 'Account Management', category: 'Business & Finance', translations: { de: 'Kundenbetreuung', fr: 'Gestion de comptes', es: 'Gestión de cuentas' } },
  { name: 'Acquisition Integration', category: 'Business & Finance', translations: { de: 'Akquisition-Integration', fr: 'Intégration d\'acquisition', es: 'Integración de adquisiciones' } },
  { name: 'Administrative Assistance', category: 'Business & Finance', translations: { de: 'Administrative Unterstützung', fr: 'Assistance administrative', es: 'Asistencia administrativa' } },
  { name: 'Advertising', category: 'Business & Finance', translations: { de: 'Werbung', fr: 'Publicité', es: 'Publicidad' } },
  { name: 'Affiliate Marketing', category: 'Business & Finance', translations: { de: 'Affiliate-Marketing', fr: 'Marketing d\'affiliation', es: 'Marketing de afiliados' } },
  { name: 'Agile Project Management', category: 'Business & Finance', translations: { de: 'Agiles Projektmanagement', fr: 'Gestion de projet agile', es: 'Gestión de proyectos ágil' } },
  { name: 'Annual Budgeting', category: 'Business & Finance', translations: { de: 'Jahresbudgetierung', fr: 'Budgétisation annuelle', es: 'Presupuesto anual' } },
  { name: 'Asset Allocation', category: 'Business & Finance', translations: { de: 'Vermögensallokation', fr: 'Allocation d\'actifs', es: 'Asignación de activos' } },
  { name: 'Auditing', category: 'Business & Finance', translations: { de: 'Wirtschaftsprüfung', fr: 'Audit', es: 'Auditoría' } },

  // --- Leadership & Management ---
  { name: 'Action Planning', category: 'Leadership & Management', translations: { de: 'Aktionsplanung', fr: 'Planification d\'actions', es: 'Planificación de acciones' } },
  { name: 'Advising', category: 'Leadership & Management', translations: { de: 'Beratung', fr: 'Conseil', es: 'Asesoramiento' } },
  { name: 'Advocacy', category: 'Leadership & Management', translations: { de: 'Fürsprache', fr: 'Plaidoyer', es: 'Defensa' } },
  { name: 'Agenda Management', category: 'Leadership & Management', translations: { de: 'Agendamanagement', fr: 'Gestion de l\'ordre du jour', es: 'Gestión de la agenda' } },
  { name: 'Agile Leadership', category: 'Leadership & Management', translations: { de: 'Agile Führung', fr: 'Leadership agile', es: 'Liderazgo ágil' } },
  { name: 'Aligning Strategy and Culture', category: 'Leadership & Management', translations: { de: 'Abstimmung von Strategie und Kultur', fr: 'Alignement de la stratégie et de la culture', es: 'Alineación de estrategia y cultura' } },
  { name: 'Appraisal', category: 'Leadership & Management', translations: { de: 'Beurteilung', fr: 'Évaluation', es: 'Evaluación' } },
  { name: 'Assessment', category: 'Leadership & Management', translations: { de: 'Bewertung', fr: 'Évaluation', es: 'Evaluación' } },
  { name: 'Audience Analysis', category: 'Leadership & Management', translations: { de: 'Publikumsanalyse', fr: 'Analyse de l\'audience', es: 'Análisis de la audiencia' } },
  { name: 'Authority Delegation', category: 'Leadership & Management', translations: { de: 'Delegation von Befugnissen', fr: 'Délégation d\'autorité', es: 'Delegación de autoridad' } },

  // --- Communication & Interpersonal ---
  { name: 'Active Listening', category: 'Communication & Interpersonal', translations: { de: 'Aktives Zuhören', fr: 'Écoute active', es: 'Escucha activa' } },
  { name: 'Appreciative Inquiry', category: 'Communication & Interpersonal', translations: { de: 'Wertschätzende Erkundung', fr: 'Enquête appréciative', es: 'Indagación apreciativa' } },
  { name: 'Argument Resolution', category: 'Communication & Interpersonal', translations: { de: 'Streitbeilegung', fr: 'Résolution des conflits', es: 'Resolución de disputas' } },
  { name: 'Articulation', category: 'Communication & Interpersonal', translations: { de: 'Artikulation', fr: 'Articulation', es: 'Articulación' } },
  { name: 'Asking Powerful Questions', category: 'Communication & Interpersonal', translations: { de: 'Stellen wirkungsvoller Fragen', fr: 'Poser des questions puissantes', es: 'Hacer preguntas poderosas' } },
  { name: 'Assertiveness', category: 'Communication & Interpersonal', translations: { de: 'Durchsetzungsvermögen', fr: 'Assertivité', es: 'Asertividad' } },
  { name: 'Alliance Building', category: 'Communication & Interpersonal', translations: { de: 'Allianzbildung', fr: 'Création d\'alliances', es: 'Construcción de alianzas' } },
  { name: 'Authentic Relating', category: 'Communication & Interpersonal', translations: { de: 'Authentische Beziehungen', fr: 'Relation authentique', es: 'Relaciones auténticas' } },

  // --- Analytical & Technical ---
  { name: 'Analytical Skills', category: 'Analytical & Technical', translations: { de: 'Analytische Fähigkeiten', fr: 'Compétences analytiques', es: 'Habilidades analíticas' } },
  { name: 'Analytics', category: 'Analytical & Technical', translations: { de: 'Analytik', fr: 'Analyse de données', es: 'Análisis de datos' } },
  { name: 'Agile Methodologies', category: 'Analytical & Technical', translations: { de: 'Agile Methoden', fr: 'Méthodologies agiles', es: 'Metodologías ágiles' } },
  { name: 'Artificial Intelligence (AI)', category: 'Analytical & Technical', translations: { de: 'Künstliche Intelligenz (KI)', fr: 'Intelligence Artificielle (IA)', es: 'Inteligencia Artificial (IA)' } },
  { name: 'Automation', category: 'Analytical & Technical', translations: { de: 'Automatisierung', fr: 'Automatisation', es: 'Automatización' } },
  { name: 'Adobe Creative Suite', category: 'Analytical & Technical', translations: { de: 'Adobe Creative Suite', fr: 'Suite Adobe Creative', es: 'Suite Adobe Creative' } },
  { name: 'API Development', category: 'Analytical & Technical', translations: { de: 'API-Entwicklung', fr: 'Développement d\'API', es: 'Desarrollo de API' } },
  { name: 'Application Development', category: 'Analytical & Technical', translations: { de: 'Anwendungsentwicklung', fr: 'Développement d\'applications', es: 'Desarrollo de aplicaciones' } },
  { name: 'Architecture', category: 'Analytical & Technical', translations: { de: 'Architektur', fr: 'Architecture', es: 'Arquitectura' } },
  
  // --- Personal Development & Mindset ---
  { name: 'Accountability', category: 'Personal Development & Mindset', translations: { de: 'Rechenschaftspflicht', fr: 'Responsabilisation', es: 'Responsabilidad' } },
  { name: 'Adaptability', category: 'Personal Development & Mindset', translations: { de: 'Anpassungsfähigkeit', fr: 'Adaptabilité', es: 'Adaptabilidad' } },
  { name: 'Affirmations', category: 'Personal Development & Mindset', translations: { de: 'Affirmationen', fr: 'Affirmations', es: 'Afirmaciones' } },
  { name: 'Ambition', category: 'Personal Development & Mindset', translations: { de: 'Ehrgeiz', fr: 'Ambition', es: 'Ambición' } },
  { name: 'Anchoring', category: 'Personal Development & Mindset', translations: { de: 'Verankerung', fr: 'Ancrage', es: 'Anclaje' } },
  { name: 'Attention to Detail', category: 'Personal Development & Mindset', translations: { de: 'Liebe zum Detail', fr: 'Souci du détail', es: 'Atención al detalle' } },
  { name: 'Attitude', category: 'Personal Development & Mindset', translations: { de: 'Einstellung', fr: 'Attitude', es: 'Actitud' } },
  { name: 'Authenticity', category: 'Personal Development & Mindset', translations: { de: 'Authentizität', fr: 'Authenticité', es: 'Autenticidad' } },
  { name: 'Awareness', category: 'Personal Development & Mindset', translations: { de: 'Bewusstsein', fr: 'Conscience', es: 'Conciencia' } },

  // --- Wellness & Creative Arts ---
  { name: 'Acupressure', category: 'Wellness & Creative Arts', translations: { de: 'Akupressur', fr: 'Acupression', es: 'Acupresión' } },
  { name: 'Acupuncture', category: 'Wellness & Creative Arts', translations: { de: 'Akupunktur', fr: 'Acupuncture', es: 'Acupuntura' } },
  { name: 'Anger Management', category: 'Wellness & Creative Arts', translations: { de: 'Aggressionsbewältigung', fr: 'Gestion de la colère', es: 'Manejo de la ira' } },
  { name: 'Anxiety Management', category: 'Wellness & Creative Arts', translations: { de: 'Angstbewältigung', fr: 'Gestion de l\'anxiété', es: 'Manejo de la ansiedad' } },
  { name: 'Aromatherapy', category: 'Wellness & Creative Arts', translations: { de: 'Aromatherapie', fr: 'Aromathérapie', es: 'Aromaterapia' } },
  { name: 'Art', category: 'Wellness & Creative Arts', translations: { de: 'Kunst', fr: 'Art', es: 'Arte' } },
  { name: 'Art Therapy', category: 'Wellness & Creative Arts', translations: { de: 'Kunsttherapie', fr: 'Art-thérapie', es: 'Arte terapia' } },
  { name: 'Astrology', category: 'Wellness & Creative Arts', translations: { de: 'Astrologie', fr: 'Astrologie', es: 'Astrología' } },
  { name: 'Ayurveda', category: 'Wellness & Creative Arts', translations: { de: 'Ayurveda', fr: 'Ayurveda', es: 'Ayurveda' } },
  { name: 'Acting', category: 'Wellness & Creative Arts', translations: { de: 'Schauspiel', fr: 'Jeu d\'acteur', es: 'Actuación' } },
  { name: 'Athletics', category: 'Wellness & Creative Arts', translations: { de: 'Leichtathletik', fr: 'Athlétisme', es: 'Atletismo' } },
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
        let updated = false;
        if (skill.category !== item.category) {
            skill.category = item.category;
            updated = true;
        }
        // Add other fields to check for updates if necessary
        
        if(updated) {
            await skill.save();
            console.log(`Synchronizing existing skill: "${item.name}"...`);
            synchronizedCount++;
        }

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
      const translationResult = await Translation.updateOne(
        { key: `skills_${skill._id}` },
        {
          $set: {
            listType: 'skills',
            translations: item.translations,
          }
        },
        { upsert: true }
      );

      // Check if translation was new or just updated
      if (translationResult.upsertedCount > 0) {
        console.log(`  - Created translation for "${item.name}".`);
      } else if (translationResult.modifiedCount > 0) {
        console.log(`  - Synchronized translation for "${item.name}".`);
        // If the skill itself wasn't updated but the translation was, count it.
        if (!skill.isNew && !synchronizedCount) {
             synchronizedCount++;
        }
      }
    }

    console.log(`\nSeed complete. Created: ${createdCount} skills, Synchronized: ${synchronizedCount} skills.`);
  } catch (error) {
    console.error('An error occurred during the seed process:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

// --- Run the Seeder ---
seedSkills();