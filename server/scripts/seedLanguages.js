// scripts/seedLanguages.js

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const Language = require('../models/Language');
const Translation = require('../models/Translation');

const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is not defined in your environment variables.');
  process.exit(1);
}

// --- DATA TO UPLOAD ---
// A comprehensive list of world languages. The translations provide the native name for each language.
const dataToUpload = [
  { name: 'English', code: 'en', translations: { en: 'English', de: 'Englisch', fr: 'Anglais', es: 'Inglés' } },
  { name: 'German', code: 'de', translations: { en: 'German', de: 'Deutsch', fr: 'Allemand', es: 'Alemán' } },
  { name: 'French', code: 'fr', translations: { en: 'French', de: 'Französisch', fr: 'Français', es: 'Francés' } },
  { name: 'Spanish', code: 'es', translations: { en: 'Spanish', de: 'Spanisch', fr: 'Espagnol', es: 'Español' } },
  { name: 'Italian', code: 'it', translations: { en: 'Italian', de: 'Italienisch', fr: 'Italien', es: 'Italiano' } },
  { name: 'Portuguese', code: 'pt', translations: { en: 'Portuguese', de: 'Portugiesisch', fr: 'Portugais', es: 'Portugués' } },
  { name: 'Dutch', code: 'nl', translations: { en: 'Dutch', de: 'Niederländisch', fr: 'Néerlandais', es: 'Neerlandés' } },
  { name: 'Russian', code: 'ru', translations: { en: 'Russian', de: 'Russisch', fr: 'Russe', es: 'Ruso' } },
  { name: 'Chinese (Mandarin)', code: 'zh', translations: { en: 'Chinese (Mandarin)', de: 'Chinesisch (Mandarin)', fr: 'Chinois (Mandarin)', es: 'Chino (Mandarín)' } },
  { name: 'Japanese', code: 'ja', translations: { en: 'Japanese', de: 'Japanisch', fr: 'Japonais', es: 'Japonés' } },
  { name: 'Korean', code: 'ko', translations: { en: 'Korean', de: 'Koreanisch', fr: 'Coréen', es: 'Coreano' } },
  { name: 'Arabic', code: 'ar', translations: { en: 'Arabic', de: 'Arabisch', fr: 'Arabe', es: 'Árabe' } },
  { name: "Hindi", code: "hi", translations: { en: "Hindi", de: "Hindi", fr: "Hindi", es: "Hindi" } },
  { name: 'Turkish', code: 'tr', translations: { en: 'Turkish', de: 'Türkisch', fr: 'Turc', es: 'Turco' } },
  { name: 'Polish', code: 'pl', translations: { en: 'Polish', de: 'Polnisch', fr: 'Polonais', es: 'Polaco' } },
  { name: 'Swedish', code: 'sv', translations: { en: 'Swedish', de: 'Schwedisch', fr: 'Suédois', es: 'Sueco' } },
  { name: 'Norwegian', code: 'no', translations: { en: 'Norwegian', de: 'Norwegisch', fr: 'Norvégien', es: 'Noruego' } },
  { name: 'Danish', code: 'da', translations: { en: 'Danish', de: 'Dänisch', fr: 'Danois', es: 'Danés' } },
  { name: 'Finnish', code: 'fi', translations: { en: 'Finnish', de: 'Finnisch', fr: 'Finlandais', es: 'Finlandés' } },
  { name: 'Greek', code: 'el', translations: { en: 'Greek', de: 'Griechisch', fr: 'Grec', es: 'Griego' } },
  { name: 'Hebrew', code: 'he', translations: { en: 'Hebrew', de: 'Hebräisch', fr: 'Hébreu', es: 'Hebreo' } },
  { name: 'Czech', code: 'cs', translations: { en: 'Czech', de: 'Tschechisch', fr: 'Tchèque', es: 'Checo' } },
  { name: 'Hungarian', code: 'hu', translations: { en: 'Hungarian', de: 'Ungarisch', fr: 'Hongrois', es: 'Húngaro' } },
  { name: 'Romansh', code: 'rm', translations: { en: 'Romansh', de: 'Rätoromanisch', fr: 'Romanche', es: 'Romanche' } },
];

const seedLanguages = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of dataToUpload) {
      // Find an existing language by its unique name or code.
      let language = await Language.findOne({
        $or: [{ name: item.name }, { code: item.code }],
      });

      if (language) {
        // --- UPDATE PATH ---
        console.log(`Synchronizing existing language: "${item.name}"...`);

        // Ensure the language document is consistent with the master list
        let languageNeedsUpdate = false;
        if (language.name !== item.name) {
          language.name = item.name;
          languageNeedsUpdate = true;
        }
        if (language.code !== item.code) {
          language.code = item.code;
          languageNeedsUpdate = true;
        }

        if (languageNeedsUpdate) {
          await language.save();
          console.log(`  - Updated Language document for "${item.name}".`);
        }

        // Find and update the translation, or create it if it's missing.
        await Translation.updateOne(
          { key: `languages_${language._id}` },
          {
            $set: {
              listType: 'languages',
              translations: item.translations,
            }
          },
          { upsert: true } // This is the key: update or insert.
        );
        console.log(`  - Synchronized translation for "${item.name}".`);
        updatedCount++;

      } else {
        // --- CREATE PATH ---
        console.log(`Creating new language: "${item.name}"...`);
        
        const newLanguage = new Language({
          name: item.name,
          code: item.code,
        });
        await newLanguage.save();

        await Translation.create({
          key: `languages_${newLanguage._id}`,
          listType: 'languages',
          translations: item.translations,
        });
        console.log(`  - Created new language and translation for "${item.name}".`);
        createdCount++;
      }
    }

    console.log(`\nSeed complete. Created: ${createdCount}, Synchronized: ${updatedCount}.`);
  } catch (error) {
    console.error('An error occurred during the seed process:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

// --- Run the Seeder ---
seedLanguages();