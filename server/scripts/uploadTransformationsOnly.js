
const cloudinary = require('cloudinary').v2;

// --- SOURCE Account (your old dev/staging account, 'dzpjkn8eo') ---
const SOURCE_CLOUD_NAME = 'dzpjkn8eo';              // <--- CHECK THIS
const SOURCE_API_KEY    = '894758383959593';    // <--- PASTE YOUR SOURCE API KEY HERE
const SOURCE_API_SECRET = 'FGJocPVy9NBSMHe6vFA5Q6Fra6s'; // <--- PASTE YOUR SOURCE API SECRET HERE

// --- DESTINATION Account (your new production account, 'dirrzax4r') ---
const DESTINATION_CLOUD_NAME = 'dirrzax4r';                 // <--- THIS IS CORRECT
const DESTINATION_API_KEY    = '484612959653276';            // <--- THIS IS CORRECT
const DESTINATION_API_SECRET = 'SZR64zVeZGAVmYhUc1atVn_Gank'; // <--- PASTE YOUR NEW PRODUCTION SECRET HERE

async function migrateTransformations() {
  console.log('--- Starting Transformation Migration (Direct Config Method) ---');

  // --- Pre-run checks ---
  if (SOURCE_API_KEY.includes('YOUR_') || DESTINATION_API_SECRET.includes('YOUR_')) {
    console.error('\n[FATAL ERROR] Open this script and paste your API keys and secrets into the variables at the top of the file.');
    process.exit(1);
  }

  let transformationsToMigrate;

  // --- Step 1: Connect to SOURCE and fetch transformations ---
  try {
    console.log('\n--- Connecting to SOURCE account... ---');
    cloudinary.config({
      cloud_name: SOURCE_CLOUD_NAME,
      api_key:    SOURCE_API_KEY,
      api_secret: SOURCE_API_SECRET,
    });
    console.log(`[SUCCESS] Connected to SOURCE cloud: ${cloudinary.config().cloud_name}`);

    const { transformations: tList } = await cloudinary.api.transformations({ max_results: 100, named: true });
    
     if (!tList || tList.length === 0) {
      console.log('[INFO] No NAMED transformations found in the source account. This is normal if you have not created any.');
      transformationsToMigrate = [];
    } else {
      transformationsToMigrate = await Promise.all(tList.map(t => cloudinary.api.transformation(t.name)));
      console.log(`[SUCCESS] Fetched ${transformationsToMigrate.length} NAMED transformations from source.`);
    }

  } catch (error) {
    console.error('\n[FATAL ERROR] Could not fetch data from SOURCE account.');
    console.error('Check your SOURCE keys. Error:', error.message);
    process.exit(1);
  }

  // --- Step 2: Connect to DESTINATION and upload transformations ---
  try {
    console.log('\n--- Connecting to DESTINATION account... ---');
    cloudinary.config({
      cloud_name: DESTINATION_CLOUD_NAME,
      api_key:    DESTINATION_API_KEY,
      api_secret: DESTINATION_API_SECRET,
    });
    console.log(`[SUCCESS] Connected to DESTINATION cloud: ${cloudinary.config().cloud_name}`);

    let created = 0, skipped = 0, errors = 0;
    
    console.log('\n--- Uploading Named Transformations ---');
    for (const trans of transformationsToMigrate) {
        if (!trans || !trans.info) continue;
        const name = trans.name;
        const definition = trans.info.transformation;

      try {
        await cloudinary.api.create_transformation(name, definition);
        console.log(` -> SUCCESS: Created transformation '${name}'`); 
        created++;
      } catch (e) {
        if (e && e.message && e.message.includes('already exists')) {
          console.log(` -> INFO: Transformation '${name}' already exists. Skipping.`); 
          skipped++;
        } else {
          console.error(` -> ERROR on transformation '${name}':`, e.message || e); 
          errors++;
        }
      }
    }
    
    console.log('\n--- SUMMARY ---');
    console.log(`Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`);
    console.log('--- MIGRATION COMPLETE ---');
  } catch (error) {
    console.error('\n[FATAL ERROR] Could not upload to DESTINATION account.');
    console.error('Check your DESTINATION keys. Error:', error.message);
    process.exit(1);
  }
}

migrateTransformations();