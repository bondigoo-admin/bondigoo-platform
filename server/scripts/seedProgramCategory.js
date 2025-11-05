// scripts/seedProgramCategory.js

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const ProgramCategory = require('../models/ProgramCategory');
const Translation = require('../models/Translation');

const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is not defined in your environment variables.');
  process.exit(1);
}

// --- DATA TO UPLOAD ---
// A list of high-level categories for coaching programs.
const dataToUpload = [
  // --- Business & Career ---
  {
    name: 'Business & Entrepreneurship',
    description: 'Programs to help you launch, manage, and scale your business ventures.',
    translations: {
      name: { de: 'Business & Unternehmertum', fr: 'Affaires & Entrepreneuriat', es: 'Negocios y Emprendimiento' },
      description: { de: 'Programme, die Ihnen helfen, Ihre Geschäftsvorhaben zu starten, zu verwalten und zu skalieren.', fr: 'Programmes pour vous aider à lancer, gérer et développer vos projets d\'entreprise.', es: 'Programas para ayudarte a lanzar, gestionar y escalar tus proyectos empresariales.' }
    }
  },
  {
    name: 'Leadership & Management',
    description: 'Develop the essential skills to lead teams, manage projects, and inspire others.',
    translations: {
      name: { de: 'Führung & Management', fr: 'Leadership & Gestion', es: 'Liderazgo y Gestión' },
      description: { de: 'Entwickeln Sie die wesentlichen Fähigkeiten, um Teams zu führen, Projekte zu leiten und andere zu inspirieren.', fr: 'Développez les compétences essentielles pour diriger des équipes, gérer des projets et inspirer les autres.', es: 'Desarrolla las habilidades esenciales para liderar equipos, gestionar proyectos e inspirar a otros.' }
    }
  },
  {
    name: 'Career Development',
    description: 'Navigate your career path, from landing a new job to achieving a promotion.',
    translations: {
      name: { de: 'Karriereentwicklung', fr: 'Développement de carrière', es: 'Desarrollo Profesional' },
      description: { de: 'Navigieren Sie Ihren Karriereweg, von der Jobsuche bis zur Beförderung.', fr: 'Naviguez dans votre parcours professionnel, de la recherche d\'un nouvel emploi à l\'obtention d\'une promotion.', es: 'Navega por tu carrera profesional, desde conseguir un nuevo trabajo hasta lograr un ascenso.' }
    }
  },
  {
    name: 'Finance & Investing',
    description: 'Master your personal finances, learn about investing, and build long-term wealth.',
    translations: {
      name: { de: 'Finanzen & Investieren', fr: 'Finance & Investissement', es: 'Finanzas e Inversión' },
      description: { de: 'Meistern Sie Ihre persönlichen Finanzen, lernen Sie das Investieren und bauen Sie langfristiges Vermögen auf.', fr: 'Maîtrisez vos finances personnelles, apprenez à investir et construisez un patrimoine à long terme.', es: 'Domina tus finanzas personales, aprende a invertir y construye riqueza a largo plazo.' }
    }
  },
  {
    name: 'Marketing & Sales',
    description: 'Learn to market products, attract customers, and close deals effectively.',
    translations: {
      name: { de: 'Marketing & Vertrieb', fr: 'Marketing & Ventes', es: 'Marketing y Ventas' },
      description: { de: 'Lernen Sie, Produkte zu vermarkten, Kunden zu gewinnen und Geschäfte effektiv abzuschließen.', fr: 'Apprenez à commercialiser des produits, à attirer des clients et à conclure des ventes efficacement.', es: 'Aprende a comercializar productos, atraer clientes y cerrar tratos de manera efectiva.' }
    }
  },
  {
    name: 'Productivity & Time Management',
    description: 'Optimize your workflow, overcome procrastination, and achieve your goals faster.',
    translations: {
      name: { de: 'Produktivität & Zeitmanagement', fr: 'Productivité & Gestion du temps', es: 'Productividad y Gestión del Tiempo' },
      description: { de: 'Optimieren Sie Ihren Arbeitsablauf, überwinden Sie Prokrastination und erreichen Sie Ihre Ziele schneller.', fr: 'Optimisez votre flux de travail, surmontez la procrastination et atteignez vos objectifs plus rapidement.', es: 'Optimiza tu flujo de trabajo, supera la procrastinación y alcanza tus metas más rápido.' }
    }
  },

  // --- Health & Wellness ---
  {
    name: 'Health & Wellness',
    description: 'A holistic approach to improving your physical, mental, and emotional well-being.',
    translations: {
      name: { de: 'Gesundheit & Wohlbefinden', fr: 'Santé & Bien-être', es: 'Salud y Bienestar' },
      description: { de: 'Ein ganzheitlicher Ansatz zur Verbesserung Ihres körperlichen, geistigen und emotionalen Wohlbefindens.', fr: 'Une approche holistique pour améliorer votre bien-être physique, mental et émotionnel.', es: 'Un enfoque holístico para mejorar tu bienestar físico, mental y emocional.' }
    }
  },
  {
    name: 'Nutrition & Healthy Eating',
    description: 'Understand the science of nutrition and build sustainable, healthy eating habits.',
    translations: {
      name: { de: 'Ernährung & Gesundes Essen', fr: 'Nutrition & Alimentation saine', es: 'Nutrición y Alimentación Saludable' },
      description: { de: 'Verstehen Sie die Wissenschaft der Ernährung und entwickeln Sie nachhaltige, gesunde Essgewohnheiten.', fr: 'Comprenez la science de la nutrition et adoptez des habitudes alimentaires saines et durables.', es: 'Comprende la ciencia de la nutrición y desarrolla hábitos alimenticios saludables y sostenibles.' }
    }
  },
  {
    name: 'Fitness & Movement',
    description: 'Programs for all levels, from building strength to improving cardiovascular health.',
    translations: {
      name: { de: 'Fitness & Bewegung', fr: 'Fitness & Mouvement', es: 'Fitness y Movimiento' },
      description: { de: 'Programme für alle Niveaus, vom Kraftaufbau bis zur Verbesserung der Herz-Kreislauf-Gesundheit.', fr: 'Programmes pour tous les niveaux, du renforcement musculaire à l\'amélioration de la santé cardiovasculaire.', es: 'Programas para todos los niveles, desde el desarrollo de la fuerza hasta la mejora de la salud cardiovascular.' }
    }
  },
  {
    name: 'Mindfulness & Meditation',
    description: 'Learn techniques to reduce stress, improve focus, and cultivate inner peace.',
    translations: {
      name: { de: 'Achtsamkeit & Meditation', fr: 'Pleine conscience & Méditation', es: 'Mindfulness y Meditación' },
      description: { de: 'Lernen Sie Techniken, um Stress abzubauen, die Konzentration zu verbessern und inneren Frieden zu finden.', fr: 'Apprenez des techniques pour réduire le stress, améliorer la concentration et cultiver la paix intérieure.', es: 'Aprende técnicas para reducir el estrés, mejorar la concentración y cultivar la paz interior.' }
    }
  },
  {
    name: 'Mental & Emotional Health',
    description: 'Develop resilience, manage anxiety, and foster a positive psychological state.',
    translations: {
      name: { de: 'Mentale & Emotionale Gesundheit', fr: 'Santé mentale & émotionnelle', es: 'Salud Mental y Emocional' },
      description: { de: 'Entwickeln Sie Resilienz, bewältigen Sie Angst und fördern Sie einen positiven psychischen Zustand.', fr: 'Développez la résilience, gérez l\'anxiété et favorisez un état psychologique positif.', es: 'Desarrolla la resiliencia, maneja la ansiedad y fomenta un estado psicológico positivo.' }
    }
  },
  {
    name: 'Sleep Science',
    description: 'Improve the quality of your sleep to boost energy, mood, and overall health.',
    translations: {
      name: { de: 'Schlafwissenschaft', fr: 'Science du sommeil', es: 'Ciencia del Sueño' },
      description: { de: 'Verbessern Sie die Qualität Ihres Schlafs, um Energie, Stimmung und allgemeine Gesundheit zu steigern.', fr: 'Améliorez la qualité de votre sommeil pour augmenter votre énergie, votre humeur et votre santé globale.', es: 'Mejora la calidad de tu sueño para potenciar la energía, el estado de ánimo y la salud en general.' }
    }
  },

  // --- Personal Development & Relationships ---
  {
    name: 'Personal Growth',
    description: 'Embark on a journey of self-discovery, unlock your potential, and live a fulfilling life.',
    translations: {
      name: { de: 'Persönlichkeitsentwicklung', fr: 'Développement personnel', es: 'Crecimiento Personal' },
      description: { de: 'Begeben Sie sich auf eine Reise der Selbstentdeckung, entfalten Sie Ihr Potenzial und leben Sie ein erfülltes Leben.', fr: 'Embarquez pour un voyage de découverte de soi, libérez votre potentiel et vivez une vie épanouie.', es: 'Embárcate en un viaje de autodescubrimiento, desbloquea tu potencial y vive una vida plena.' }
    }
  },
  {
    name: 'Relationships & Communication',
    description: 'Build stronger connections, improve communication, and navigate interpersonal dynamics.',
    translations: {
      name: { de: 'Beziehungen & Kommunikation', fr: 'Relations & Communication', es: 'Relaciones y Comunicación' },
      description: { de: 'Bauen Sie stärkere Verbindungen auf, verbessern Sie die Kommunikation und navigieren Sie zwischenmenschliche Dynamiken.', fr: 'Établissez des liens plus solides, améliorez la communication et naviguez dans les dynamiques interpersonnelles.', es: 'Construye conexiones más fuertes, mejora la comunicación y navega por las dinámicas interpersonales.' }
    }
  },
  {
    name: 'Parenting & Family',
    description: 'Guidance and strategies for raising resilient, happy children and fostering family harmony.',
    translations: {
      name: { de: 'Erziehung & Familie', fr: 'Parentalité & Famille', es: 'Crianza y Familia' },
      description: { de: 'Anleitungen und Strategien für die Erziehung widerstandsfähiger, glücklicher Kinder und die Förderung der Familienharmonie.', fr: 'Conseils et stratégies pour élever des enfants résilients et heureux et favoriser l\'harmonie familiale.', es: 'Guía y estrategias para criar hijos resilientes y felices y fomentar la armonía familiar.' }
    }
  },
  {
    name: 'Confidence & Self-Esteem',
    description: 'Overcome self-doubt, build unshakeable confidence, and embrace your worth.',
    translations: {
      name: { de: 'Selbstvertrauen & Selbstwertgefühl', fr: 'Confiance & Estime de soi', es: 'Confianza y Autoestima' },
      description: { de: 'Überwinden Sie Selbstzweifel, bauen Sie unerschütterliches Selbstvertrauen auf und erkennen Sie Ihren Wert an.', fr: 'Surmontez le doute, construisez une confiance inébranlable et acceptez votre valeur.', es: 'Supera la duda, construye una confianza inquebrantable y abraza tu valía.' }
    }
  },
  {
    name: 'Spirituality & Consciousness',
    description: 'Explore deeper questions of existence, purpose, and the nature of consciousness.',
    translations: {
      name: { de: 'Spiritualität & Bewusstsein', fr: 'Spiritualité & Conscience', es: 'Espiritualidad y Conciencia' },
      description: { de: 'Erforschen Sie tiefere Fragen der Existenz, des Sinns und der Natur des Bewusstseins.', fr: 'Explorez les questions plus profondes de l\'existence, du but et de la nature de la conscience.', es: 'Explora preguntas más profundas sobre la existencia, el propósito y la naturaleza de la conciencia.' }
    }
  },
  
  // --- Arts, Creativity & Hobbies ---
  {
    name: 'Arts & Creativity',
    description: 'Unleash your inner artist through writing, music, visual arts, and more.',
    translations: {
      name: { de: 'Kunst & Kreativität', fr: 'Arts & Créativité', es: 'Artes y Creatividad' },
      description: { de: 'Entfesseln Sie Ihren inneren Künstler durch Schreiben, Musik, bildende Kunst und mehr.', fr: 'Libérez l\'artiste qui est en vous à travers l\'écriture, la musique, les arts visuels, et plus encore.', es: 'Desata a tu artista interior a través de la escritura, la música, las artes visuales y más.' }
    }
  },
  {
    name: 'Writing & Storytelling',
    description: 'Learn to craft compelling narratives, write with clarity, and tell your story.',
    translations: {
      name: { de: 'Schreiben & Geschichtenerzählen', fr: 'Écriture & Narration', es: 'Escritura y Narración' },
      description: { de: 'Lernen Sie, fesselnde Erzählungen zu verfassen, klar zu schreiben und Ihre Geschichte zu erzählen.', fr: 'Apprenez à créer des récits captivants, à écrire avec clarté et à raconter votre histoire.', es: 'Aprende a crear narrativas convincentes, escribir con claridad y contar tu historia.' }
    }
  },
  {
    name: 'Music',
    description: 'From learning an instrument to music theory and production, explore the world of sound.',
    translations: {
      name: { de: 'Musik', fr: 'Musique', es: 'Música' },
      description: { de: 'Vom Erlernen eines Instruments über Musiktheorie bis hin zur Produktion – erkunden Sie die Welt des Klangs.', fr: 'De l\'apprentissage d\'un instrument à la théorie musicale et la production, explorez le monde du son.', es: 'Desde aprender un instrumento hasta la teoría musical y la producción, explora el mundo del sonido.' }
    }
  },
  {
    name: 'Photography & Filmmaking',
    description: 'Master the art of visual storytelling with your camera.',
    translations: {
      name: { de: 'Fotografie & Film', fr: 'Photographie & Cinéma', es: 'Fotografía y Cinematografía' },
      description: { de: 'Meistern Sie die Kunst des visuellen Geschichtenerzählens mit Ihrer Kamera.', fr: 'Maîtrisez l\'art de la narration visuelle avec votre appareil photo.', es: 'Domina el arte de la narración visual con tu cámara.' }
    }
  },
  {
    name: 'Culinary Arts',
    description: 'Elevate your cooking skills with programs from world-class chefs and nutritionists.',
    translations: {
      name: { de: 'Kulinarische Künste', fr: 'Arts culinaires', es: 'Artes Culinarias' },
      description: { de: 'Verbessern Sie Ihre Kochkünste mit Programmen von Weltklasse-Köchen und Ernährungswissenschaftlern.', fr: 'Améliorez vos compétences culinaires avec des programmes de chefs et de nutritionnistes de renommée mondiale.', es: 'Eleva tus habilidades culinarias con programas de chefs y nutricionistas de clase mundial.' }
    }
  },
  {
    name: 'Crafts & Hobbies',
    description: 'Discover a new passion, from woodworking and painting to gardening and knitting.',
    translations: {
      name: { de: 'Handwerk & Hobbys', fr: 'Artisanat & Loisirs', es: 'Artesanías y Hobbies' },
      description: { de: 'Entdecken Sie eine neue Leidenschaft, von Holzarbeiten und Malen bis hin zu Gartenarbeit und Stricken.', fr: 'Découvrez une nouvelle passion, du travail du bois à la peinture, en passant par le jardinage et le tricot.', es: 'Descubre una nueva pasión, desde la carpintería y la pintura hasta la jardinería y el tejido.' }
    }
  },
  
  // --- Science & Technology ---
  {
    name: 'Science & Technology',
    description: 'Dive into the worlds of computer science, neuroscience, and environmental studies.',
    translations: {
      name: { de: 'Wissenschaft & Technologie', fr: 'Science & Technologie', es: 'Ciencia y Tecnología' },
      description: { de: 'Tauchen Sie ein in die Welten der Informatik, Neurowissenschaften und Umweltstudien.', fr: 'Plongez dans les mondes de l\'informatique, des neurosciences et des études environnementales.', es: 'Sumérgete en los mundos de la informática, la neurociencia y los estudios ambientales.' }
    }
  },
  {
    name: 'Psychology & Neuroscience',
    description: 'Understand the human mind, brain, and behavior with leading experts.',
    translations: {
      name: { de: 'Psychologie & Neurowissenschaften', fr: 'Psychologie & Neurosciences', es: 'Psicología y Neurociencia' },
      description: { de: 'Verstehen Sie den menschlichen Geist, das Gehirn und das Verhalten mit führenden Experten.', fr: 'Comprenez l\'esprit humain, le cerveau et le comportement avec des experts de premier plan.', es: 'Comprende la mente humana, el cerebro y el comportamiento con expertos de primer nivel.' }
    }
  },
  {
    name: 'Nature & Environment',
    description: 'Learn about conservation, sustainability, and the natural world around us.',
    translations: {
      name: { de: 'Natur & Umwelt', fr: 'Nature & Environnement', es: 'Naturaleza y Medio Ambiente' },
      description: { de: 'Lernen Sie über Naturschutz, Nachhaltigkeit und die natürliche Welt um uns herum.', fr: 'Apprenez-en davantage sur la conservation, la durabilité et le monde naturel qui nous entoure.', es: 'Aprende sobre la conservación, la sostenibilidad y el mundo natural que nos rodea.' }
    }
  },
  {
    name: 'Philosophy & Critical Thinking',
    description: 'Engage with timeless questions and sharpen your analytical reasoning skills.',
    translations: {
      name: { de: 'Philosophie & Kritisches Denken', fr: 'Philosophie & Pensée critique', es: 'Filosofía y Pensamiento Crítico' },
      description: { de: 'Beschäftigen Sie sich mit zeitlosen Fragen und schärfen Sie Ihr analytisches Denkvermögen.', fr: 'Abordez des questions intemporelles et affinez vos compétences en raisonnement analytique.', es: 'Involúcrate con preguntas atemporales y agudiza tus habilidades de razonamiento analítico.' }
    }
  },

  // --- Society & Culture ---
  {
    name: 'Social Impact & Activism',
    description: 'Learn how to make a difference in your community and the world.',
    translations: {
      name: { de: 'Sozialer Einfluss & Aktivismus', fr: 'Impact social & Activisme', es: 'Impacto Social y Activismo' },
      description: { de: 'Lernen Sie, wie Sie in Ihrer Gemeinschaft und in der Welt einen Unterschied machen können.', fr: 'Apprenez à faire une différence dans votre communauté et dans le monde.', es: 'Aprende a marcar la diferencia en tu comunidad y en el mundo.' }
    }
  },
  {
    name: 'History & Culture',
    description: 'Explore the events, ideas, and cultures that have shaped our world.',
    translations: {
      name: { de: 'Geschichte & Kultur', fr: 'Histoire & Culture', es: 'Historia y Cultura' },
      description: { de: 'Erkunden Sie die Ereignisse, Ideen und Kulturen, die unsere Welt geformt haben.', fr: 'Explorez les événements, les idées et les cultures qui ont façonné notre monde.', es: 'Explora los eventos, ideas y culturas que han dado forma a nuestro mundo.' }
    }
  },
  // Add more as needed to reach 60... let's add some niche/specific ones.
  {
    name: 'Public Speaking & Debate',
    description: 'Conquer stage fright and learn to articulate your ideas persuasively.',
    translations: {
        name: { de: 'Öffentliches Reden & Debatte', fr: 'Art oratoire & Débat', es: 'Oratoria y Debate' },
        description: { de: 'Besiegen Sie Lampenfieber und lernen Sie, Ihre Ideen überzeugend zu artikulieren.', fr: 'Surmontez le trac et apprenez à articuler vos idées de manière persuasive.', es: 'Vence el miedo escénico y aprende a articular tus ideas de forma persuasiva.' }
    }
  },
  {
    name: 'Habit Formation & Change',
    description: 'Master the science of building good habits and breaking bad ones.',
    translations: {
        name: { de: 'Gewohnheitsbildung & Veränderung', fr: 'Formation & Changement d\'habitudes', es: 'Formación y Cambio de Hábitos' },
        description: { de: 'Meistern Sie die Wissenschaft, gute Gewohnheiten aufzubauen und schlechte abzulegen.', fr: 'Maîtrisez la science de la création de bonnes habitudes et de l\'abandon des mauvaises.', es: 'Domina la ciencia de construir buenos hábitos y romper los malos.' }
    }
  },
  {
    name: 'Addiction & Recovery',
    description: 'Support and strategies for understanding and overcoming addictive behaviors.',
    translations: {
        name: { de: 'Sucht & Genesung', fr: 'Addiction & Rétablissement', es: 'Adicción y Recuperación' },
        description: { de: 'Unterstützung und Strategien zum Verständnis und zur Überwindung von Suchtverhalten.', fr: 'Soutien et stratégies pour comprendre et surmonter les comportements addictifs.', es: 'Apoyo y estrategias para comprender y superar las conductas adictivas.' }
    }
  },
  {
    name: 'Grief & Bereavement',
    description: 'Guidance for navigating the complex process of grief and loss.',
    translations: {
        name: { de: 'Trauer & Verlust', fr: 'Deuil & Chagrin', es: 'Duelo y Pérdida' },
        description: { de: 'Anleitung zur Bewältigung des komplexen Prozesses von Trauer und Verlust.', fr: 'Accompagnement pour naviguer dans le processus complexe du deuil et de la perte.', es: 'Guía para navegar el complejo proceso del duelo y la pérdida.' }
    }
  },
  {
    name: 'Digital Skills & Literacy',
    description: 'Master the essential tools and technologies of the modern digital world.',
    translations: {
        name: { de: 'Digitale Kompetenzen & Bildung', fr: 'Compétences & littératie numériques', es: 'Habilidades y Alfabetización Digital' },
        description: { de: 'Meistern Sie die wesentlichen Werkzeuge und Technologien der modernen digitalen Welt.', fr: 'Maîtrisez les outils et technologies essentiels du monde numérique moderne.', es: 'Domina las herramientas y tecnologías esenciales del mundo digital moderno.' }
    }
  },
  {
    name: 'Data Science & Analytics',
    description: 'Learn to interpret data, generate insights, and make data-driven decisions.',
    translations: {
        name: { de: 'Data Science & Analytik', fr: 'Science des données & Analytique', es: 'Ciencia de Datos y Análisis' },
        description: { de: 'Lernen Sie, Daten zu interpretieren, Erkenntnisse zu gewinnen und datengesteuerte Entscheidungen zu treffen.', fr: 'Apprenez à interpréter les données, à générer des informations et à prendre des décisions basées sur les données.', es: 'Aprende a interpretar datos, generar conocimientos y tomar decisiones basadas en datos.' }
    }
  },
  {
    name: 'Alternative & Holistic Healing',
    description: 'Explore healing modalities beyond conventional medicine, including energy work and herbalism.',
    translations: {
        name: { de: 'Alternative & Ganzheitliche Heilung', fr: 'Guérison alternative & holistique', es: 'Sanación Alternativa y Holística' },
        description: { de: 'Erkunden Sie Heilmethoden jenseits der konventionellen Medizin, einschließlich Energiearbeit und Kräuterheilkunde.', fr: 'Explorez des modalités de guérison au-delà de la médecine conventionnelle, y compris le travail énergétique et l\'herboristerie.', es: 'Explora modalidades de sanación más allá de la medicina convencional, incluyendo el trabajo energético y la herbolaria.' }
    }
  },
  {
    name: 'Astrology & Esoteric Arts',
    description: 'Delve into ancient wisdom systems like astrology, tarot, and numerology for self-understanding.',
    translations: {
        name: { de: 'Astrologie & Esoterik', fr: 'Astrologie & Arts ésotériques', es: 'Astrología y Artes Esotéricas' },
        description: { de: 'Tauchen Sie ein in alte Weisheitssysteme wie Astrologie, Tarot und Numerologie zur Selbst-Erkenntnis.', fr: 'Plongez dans d\'anciens systèmes de sagesse comme l\'astrologie, le tarot et la numérologie pour la connaissance de soi.', es: 'Adéntrate en antiguos sistemas de sabiduría como la astrología, el tarot y la numerología para el autoconocimiento.' }
    }
  }
];


const seedProgramCategories = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    let createdCount = 0;
    let synchronizedCount = 0;

    for (const item of dataToUpload) {
      let category = await ProgramCategory.findOne({ name: item.name });

      if (category) {
        // --- UPDATE PATH ---
        let needsSave = false;
        if (category.description !== item.description) {
            category.description = item.description;
            needsSave = true;
        }
        
        if (needsSave) {
            await category.save();
            console.log(`Synchronizing description for existing category: "${item.name}"...`);
        }
        synchronizedCount++;

      } else {
        // --- CREATE PATH ---
        console.log(`Creating new program category: "${item.name}"...`);
        category = new ProgramCategory({
          name: item.name,
          description: item.description,
        });
        await category.save();
        createdCount++;
      }

      // Find and update the translation, or create it if it's missing.
      await Translation.updateOne(
        { key: `program_categories_${category._id}` },
        {
          $set: {
            listType: 'program_categories',
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
seedProgramCategories();