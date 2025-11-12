// server/scripts/extractSettings.js
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs').promises;

// --- STEP 1: LOAD ENVIRONMENT VARIABLES ---
console.log('--- Starting Cloudinary Settings Extraction (Corrected Method) ---');

const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
const envPath = path.resolve(__dirname, '..', envFile);
dotenv.config({ path: envPath });

// --- STEP 2: SET THE ACTIVE CLOUDINARY URL FOR THE SOURCE ACCOUNT ---
// This is the key step. We temporarily set the main CLOUDINARY_URL variable
// that your ../utils/cloudinaryConfig file will use.
if (!process.env.SOURCE_CLOUDINARY_URL) {
  console.error(`\n[FATAL ERROR] SOURCE_CLOUDINARY_URL is not defined in ${envPath}.`);
  process.exit(1);
}
process.env.CLOUDINARY_URL = process.env.SOURCE_CLOUDINARY_URL;
console.log('[INFO] Pointing configuration to SOURCE account.');

// --- STEP 3: IMPORT THE PRE-CONFIGURED CLOUDINARY INSTANCE ---
// This now works exactly like your other scripts.
const cloudinary = require('../utils/cloudinaryConfig');
console.log(`[SUCCESS] Configured for SOURCE cloud: ${cloudinary.config().cloud_name}`);


// --- STEP 4: CORE LOGIC ---
const outputFile = path.resolve(__dirname, 'cloudinary_settings.json');
const DRY_RUN = process.argv.includes('--dry-run');

async function extractSettings() {
  console.log(`\nDry Run Mode: ${DRY_RUN ? 'ENABLED' : 'DISABLED'}`);

  try {
    console.log('\n--- Fetching Upload Presets ---');
    const { presets: presetList } = await cloudinary.api.upload_presets({ max_results: 100 });
    const detailedPresets = [];
    if (!presetList || presetList.length === 0) {
      console.log('No upload presets found.');
    } else {
        console.log(`Found ${presetList.length} presets. Fetching details...`);
        for (const preset of presetList) {
          const details = await cloudinary.api.upload_preset(preset.name);
          const cleanedPreset = { name: details.name, unsigned: details.unsigned, ...details.settings };
          detailedPresets.push(cleanedPreset);
          console.log(` -> Fetched settings for preset: '${preset.name}'`);
        }
    }

    console.log('\n--- Fetching Named Transformations ---');
    const { transformations: transformationList } = await cloudinary.api.transformations({ max_results: 100 });
    const detailedTransformations = [];
    if (!transformationList || transformationList.length === 0) {
      console.log('No named transformations found.');
    } else {
        console.log(`Found ${transformationList.length} transformations. Fetching details...`);
        for (const trans of transformationList) {
          const details = await cloudinary.api.transformation(trans.name);
          if (details && details.info) {
            detailedTransformations.push({ name: details.name, transformation: details.info.transformation });
            console.log(` -> Fetched settings for transformation: '${details.name}'`);
          }
        }
    }
    
    const allSettings = { presets: detailedPresets, transformations: detailedTransformations };

    console.log('\n--- Finalizing ---');
    if (DRY_RUN) {
      console.log('[DRY RUN] Would write the following settings to file:');
      console.log(JSON.stringify(allSettings, null, 2));
    } else {
      console.log(`Writing settings to ${outputFile}...`);
      await fs.writeFile(outputFile, JSON.stringify(allSettings, null, 2));
      console.log('File written successfully.');
    }
    console.log('\n--- EXTRACTION COMPLETE! ---');
  } catch (error) {
    console.error('\n--- SCRIPT FAILED ---');
    console.error('Error Message:', error.message);
    if (error.http_code === 401) {
      console.error('[DIAGNOSIS] AUTHENTICATION FAILED. Check the API Key/Secret in your SOURCE_CLOUDINARY_URL.');
    }
  }
}

extractSettings();