const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

const modelsPath = path.resolve(__dirname, '../models');
require(path.join(modelsPath, 'User.js'));
require(path.join(modelsPath, 'Coach.js'));
require(path.join(modelsPath, 'Program.js'));
// We only need the models we query directly here
const Specialty = require(path.join(modelsPath, 'Specialty.js'));
const Skill = require(path.join(modelsPath, 'Skill.js'));
const CoachingStyle = require(path.join(modelsPath, 'CoachingStyle.js'));

const Coach = mongoose.model('Coach');
const Program = mongoose.model('Program');

const SearchCollectionSchema = new mongoose.Schema({}, { strict: false, collection: 'search_collection' });
const SearchCollection = mongoose.model('SearchCollection', SearchCollectionSchema);

async function rebuildSearchCollection() {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
        console.error('ERROR: MONGODB_URI not found. Please ensure your .env file in the /server directory is configured.');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Successfully connected to MongoDB.');

        console.log('Clearing existing search collection...');
        await SearchCollection.deleteMany({});
        console.log('Collection cleared.');

        // --- STAGE 1: Process and index all active coaches ---
        console.log('Processing coaches...');
        const coaches = await Coach.find({ status: 'active' })
            .populate('user', 'firstName lastName profilePicture')
            .populate('specialties', 'name')
            .populate('skills', 'name')
            .populate('coachingStyles', 'name')
            .lean();

        const coachDocs = [];
        for (const coach of coaches) {
            if (!coach.user) continue;

            const programs = await Program.find({ coach: coach.user._id, status: 'published' }, 'title description learningOutcomes').lean();

            const programText = programs.map(p => `${p.title} ${p.description} ${p.learningOutcomes.join(' ')}`).join(' ');
            const specialtiesText = coach.specialties.map(s => s.name).join(' ');
            const skillsText = coach.skills.map(s => s.name).join(' ');
            const stylesText = coach.coachingStyles.map(s => s.name).join(' ');

            const searchable_content = [
                coach.user.firstName, coach.user.lastName,
                coach.headline, coach.bio,
                specialtiesText, skillsText, stylesText,
                programText
            ].filter(Boolean).join(' ');

            coachDocs.push({
                _id: coach.user._id,
                doc_type: 'coach',
                name: `${coach.user.firstName} ${coach.user.lastName}`,
                detail: coach.headline,
                path: `/coach/${coach.user._id}`,
                avatar: coach.user.profilePicture?.url,
                searchable_content: searchable_content.replace(/\s+/g, ' ').trim()
            });
        }
        if (coachDocs.length > 0) {
            await SearchCollection.insertMany(coachDocs);
            console.log(`-> Successfully indexed ${coachDocs.length} coaches.`);
        } else {
            console.log('-> No active coaches found to index.');
        }

        // --- STAGE 2: Process and index all published programs ---
        console.log('Processing programs...');
        const programs = await Program.find({ status: 'published' })
            .populate('coach', 'firstName lastName') // Populate user info
            .lean();

        const programDocs = [];
        // Create a map of coach profiles to avoid querying inside the loop (much more efficient)
        const coachIds = [...new Set(programs.map(p => p.coach._id.toString()))];
        const coachProfiles = await Coach.find({ user: { $in: coachIds } })
            .populate('specialties', 'name')
            .populate('skills', 'name')
            .lean();
        const coachProfileMap = coachProfiles.reduce((map, profile) => {
            map[profile.user.toString()] = profile;
            return map;
        }, {});

        for (const program of programs) {
            if (!program.coach) continue;

            const coachProfile = coachProfileMap[program.coach._id.toString()];
            let coachKeywords = '';
            if (coachProfile) {
                const specialtiesText = coachProfile.specialties.map(s => s.name).join(' ');
                const skillsText = coachProfile.skills.map(s => s.name).join(' ');
                coachKeywords = `${coachProfile.headline} ${coachProfile.bio} ${specialtiesText} ${skillsText}`;
            }

            const searchable_content = [
                program.title, program.subtitle, program.description,
                program.learningOutcomes.join(' '),
                program.coach.firstName, program.coach.lastName,
                coachKeywords
            ].filter(Boolean).join(' ');

            programDocs.push({
                _id: program._id,
                doc_type: 'program',
                name: program.title,
                detail: `By ${program.coach.firstName} ${program.coach.lastName}`,
                path: `/programs/${program._id}`,
                avatar: null,
                searchable_content: searchable_content.replace(/\s+/g, ' ').trim()
            });
        }
        if (programDocs.length > 0) {
            await SearchCollection.insertMany(programDocs);
            console.log(`-> Successfully indexed ${programDocs.length} programs.`);
        } else {
            console.log('-> No published programs found to index.');
        }

        console.log('\nSUCCESS: Search collection has been rebuilt successfully.');

    } catch (error) {
        console.error('\nFATAL ERROR DURING SCRIPT EXECUTION:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('MongoDB connection closed.');
    }
}

rebuildSearchCollection();