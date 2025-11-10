const fs = require('fs');
const path = require('path');

/**
 * A simple, reusable utility to clean and seed a collection from a JSON file.
 * @param {mongoose.Model} model The Mongoose model for the collection.
 * @param {string} collectionName The name of the collection.
 * @param {string} dataFilePath The absolute path to the JSON data file.
 */
async function loadData(model, collectionName, dataFilePath) {
  try {
    console.log(`--- Seeding ${collectionName} ---`);
    
    // 1. Read the JSON file
    const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf-8'));
    if (!Array.isArray(data) || data.length === 0) {
      console.log(`Skipping ${collectionName}: No data found in file.`);
      return;
    }

    // 2. Clear existing documents in the collection
    console.log(`Deleting existing documents from ${collectionName}...`);
    const deleteResult = await model.deleteMany({});
    console.log(`Deleted ${deleteResult.deletedCount} documents.`);

    // 3. Insert the new documents
    console.log(`Inserting ${data.length} new documents into ${collectionName}...`);
    await model.insertMany(data);
    console.log(`Successfully seeded ${collectionName}.\n`);
  } catch (error) {
    console.error(`\nERROR seeding ${collectionName}:`, error);
    // Exit with a non-zero code to indicate failure, which is important for CI/CD pipelines.
    process.exit(1); 
  }
}

module.exports = { loadData };