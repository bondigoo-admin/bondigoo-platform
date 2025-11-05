const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
require('dotenv').config({ path: '.env.development' });
const path = require('path');
const fs = require('fs');

const modelsDir = path.join(__dirname, 'models');

function registerModels() {
  const modelFiles = fs.readdirSync(modelsDir).filter(file => file.endsWith('.js'));

  modelFiles.forEach(file => {
    const modelName = path.basename(file, '.js');
    if (!mongoose.models[modelName]) {
      try {
        require(path.join(modelsDir, file));
        console.log(`Registered model: ${modelName}`);
      } catch (error) {
        console.error(`Error registering model ${modelName}:`, error);
      }
    }
  });
}

const models = [
  'User', 'Coach', 'Connection', 'SessionType', 'Booking', 'Specialty',
  'Language', 'EducationLevel', 'Achievement', 'CoachingStyle', 'Skill',
  'Review', 'Group'
];

async function revertToObjectId() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    registerModels();

    const idMap = new Map();

    for (const modelName of models) {
      if (!mongoose.models[modelName]) {
        console.error(`Model ${modelName} is not registered. Skipping...`);
        continue;
      }

      const Model = mongoose.model(modelName);
      const documents = await Model.find({});

      for (const doc of documents) {
        const oldId = doc._id.toString();
        const newId = new ObjectId();
        idMap.set(oldId, newId);

        const newDoc = new Model(doc.toObject());
        newDoc._id = newId;
        await newDoc.save();
        await Model.deleteOne({ _id: oldId });
      }

      console.log(`${modelName} reverted`);
    }

    // Update references
    for (const modelName of models) {
      if (!mongoose.models[modelName]) {
        console.error(`Model ${modelName} is not registered. Skipping reference update...`);
        continue;
      }

      const Model = mongoose.model(modelName);
      const documents = await Model.find({});

      for (const doc of documents) {
        const updates = {};
        for (const [key, value] of Object.entries(doc.toObject())) {
          if (typeof value === 'string' && idMap.has(value)) {
            updates[key] = idMap.get(value);
          } else if (Array.isArray(value)) {
            updates[key] = value.map(item => {
              if (typeof item === 'string' && idMap.has(item)) {
                return idMap.get(item);
              }
              if (item && typeof item === 'object' && item._id && idMap.has(item._id.toString())) {
                return { ...item, _id: idMap.get(item._id.toString()) };
              }
              return item;
            });
          } else if (value && typeof value === 'object') {
            updates[key] = { ...value };
            for (const [subKey, subValue] of Object.entries(value)) {
              if (typeof subValue === 'string' && idMap.has(subValue)) {
                updates[key][subKey] = idMap.get(subValue);
              }
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          await Model.updateOne({ _id: doc._id }, { $set: updates });
        }
      }

      console.log(`${modelName} references updated`);
    }

    console.log('Reversion completed successfully');
  } catch (error) {
    console.error('Reversion failed:', error);
  } finally {
    await mongoose.connection.close();
  }
}

revertToObjectId();