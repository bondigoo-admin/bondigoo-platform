// server/scripts/uploadSettings.js (FINAL, DIRECT CONFIGURATION METHOD)
const path = require('path');
const fs = require('fs').promises;
const cloudinary = require('cloudinary').v2;

// ====================================================================================
// --- STEP 1: PASTE YOUR 3 PRODUCTION KEYS HERE ---
//
// Get these from your NEW production Cloudinary account dashboard (the 'dirrzax4r' one)
//
const DESTINATION_CLOUD_NAME = 'dirrzax4r'; // You already know this one
const DESTINATION_API_KEY    = '484612959653276'; // You already provided this
const DESTINATION_API_SECRET = 'SZR64zVeZGAVmYhUc1atVn_Gank'; // <--- PASTE YOUR ACTUAL SECRET HERE
//
// ====================================================================================


// --- Pre-run check to make sure you've added the secret ---
if (!DESTINATION_CLOUD_NAME || !DESTINATION_API_KEY || !DESTINATION_API_SECRET || DESTINATION_API_SECRET.includes('YOUR_API_SECRET_HERE')) {

  console.error('[FATAL ERROR] Open this script and paste your API Secret into the DESTINATION_API_SECRET variable on line 13.');

  process.exit(1);
}

// --- STEP 2: CONFIGURE CLOUDINARY DIRECTLY WITH THE OBJECT (THIS CANNOT FAIL) ---
console.log('--- Starting Cloudinary Settings Upload (Direct Config Method) ---');

try {
  cloudinary.config({
    cloud_name: DESTINATION_CLOUD_NAME,
    api_key:    DESTINATION_API_KEY,
    api_secret: DESTINATION_API_SECRET,
  });
  const cloudName = cloudinary.config().cloud_name;
  console.log(`[SUCCESS] Configured for DESTINATION cloud: ${cloudName}\n`);
} catch (configError) {
  console.error('\n[FATAL ERROR] A completely unexpected error occurred during configuration.');
  console.error(configError);
  process.exit(1);
}


// --- STEP 3: CORE LOGIC ---
const inputFile = path.resolve(__dirname, 'cloudinary_settings.json');

async function uploadSettings() {
  try {
    const allSettings = JSON.parse(await fs.readFile(inputFile, 'utf-8'));
    const { presets = [], transformations = [] } = allSettings;
    console.log(`Found ${presets.length} presets and ${transformations.length} transformations to upload.`);
    
    let created = 0, skipped = 0, errors = 0;

    console.log('\n--- Processing Upload Presets ---');
    for (const preset of presets) {
      try {
        await cloudinary.api.create_upload_preset(preset);
        console.log(` -> SUCCESS: Created preset '${preset.name}'`); created++;
      } catch (e) {
        if (e && e.message && e.message.includes('already exists')) { console.log(` -> INFO: Preset '${preset.name}' already exists. Skipping.`); skipped++; } 
        else { console.error(` -> ERROR on preset '${preset.name}': ${e.message}`); errors++; }
      }
    }

    console.log('\n--- Processing Named Transformations ---');
    for (const trans of transformations) {
      try {
        await cloudinary.api.create_transformation(trans.name, trans.transformation);
        console.log(` -> SUCCESS: Created transformation '${trans.name}'`); created++;
      } catch (e) {
        if (e && e.message && e.message.includes('already exists')) { console.log(` -> INFO: Transformation '${trans.name}' already exists. Skipping.`); skipped++; }
        else { console.error(` -> ERROR on transformation '${trans.name}': ${e.message}`); errors++; }
      }
    }

    console.log('\n--- SUMMARY ---');
    console.log(`Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`);
    console.log('--- UPLOAD COMPLETE ---');
  } catch (error) {
    console.error('\n--- A CRITICAL ERROR OCCURRED ---');
    console.error('Error:', error.message);
  }
}

uploadSettings();