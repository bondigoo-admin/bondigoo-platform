const mongoose = require('mongoose');
const Fuse = require('fuse.js');
const User = require('../models/User');
const Coach = require('../models/Coach');
const Program = require('../models/Program');
const Connection = require('../models/Connection');
const Booking = require('../models/Booking');
const { logger } = require('../utils/logger');
const Specialty = require('../models/Specialty');
const Language = require('../models/Language');
const Skill = require('../models/Skill');
const CoachingStyle = require('../models/CoachingStyle');
const EducationLevel = require('../models/EducationLevel');
const Translation = require('../models/Translation');
const ProgramCategory = require('../models/ProgramCategory');
const SkillLevel = require('../models/SkillLevel');

const { i18next } = require('../config/i18n');

const SearchCollection = mongoose.model('SearchCollection', new mongoose.Schema({}, { strict: false, collection: 'search_collection' }));

const NAVIGATION_MAP = [
    { nameKey: 'header:dashboard', path: '/dashboard', keywordsKeys: ['search:keywords.home', 'search:keywords.main', 'search:keywords.overview'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:profile', path: '/profile', keywordsKeys: ['search:keywords.account', 'search:keywords.bio', 'search:keywords.myDetails', 'search:keywords.viewProfile'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:calendar', path: '/my-calendar', keywordsKeys: ['search:keywords.schedule', 'search:keywords.appointments', 'search:keywords.bookings'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:connections', path: '/connections', keywordsKeys: ['search:keywords.clients', 'search:keywords.myCoaches', 'search:keywords.network', 'search:keywords.contacts'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:messages', path: '/messages', keywordsKeys: ['search:keywords.chat', 'search:keywords.inbox', 'search:keywords.conversations'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:notifications', path: '/notifications', keywordsKeys: ['search:keywords.alerts', 'search:keywords.updates', 'search:keywords.activity'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:analytics', path: '/analytics', keywordsKeys: ['search:keywords.stats', 'search:keywords.statistics', 'search:keywords.reports', 'search:keywords.data'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:resources', path: '/resources', keywordsKeys: ['search:keywords.help', 'search:keywords.guides', 'search:keywords.documents', 'search:keywords.library'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:forum', path: '/forum', keywordsKeys: ['search:keywords.community', 'search:keywords.discussion', 'search:keywords.questions'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:referralSystem', path: '/referral', keywordsKeys: ['search:keywords.invite', 'search:keywords.friends', 'search:keywords.rewards', 'search:keywords.affiliate'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:findCoaches', path: '/coaches', keywordsKeys: ['search:keywords.browse', 'search:keywords.searchCoaches', 'search:keywords.explore'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'common:programs', path: '/programs', keywordsKeys: ['search:keywords.courses', 'search:keywords.learning', 'search:keywords.training'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:manageSessions', path: (user) => `/manage-sessions/${user.id}`, keywordsKeys: ['search:keywords.mySessions', 'search:keywords.availability', 'search:keywords.services'], roles: ['coach'] },
    { nameKey: 'header:earnings', path: '/dashboard?tab=earnings', keywordsKeys: ['search:keywords.revenue', 'search:keywords.payouts', 'search:keywords.income', 'search:keywords.money'], roles: ['coach'] },
    { nameKey: 'header:billing', path: '/billing', keywordsKeys: ['search:keywords.payment', 'search:keywords.creditCard', 'search:keywords.receipts', 'search:keywords.subscription'], roles: ['client'] },
    { nameKey: 'header:adminDashboard', path: '/admin-dashboard', keywordsKeys: ['search:keywords.administration', 'search:keywords.manageUsers', 'search:keywords.systemOverview'], roles: ['admin'] },
    { nameKey: 'header:settings', path: '/settings', keywordsKeys: ['search:keywords.preferences', 'search:keywords.options', 'search:keywords.configuration'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:settings', path: '/settings?tab=general', keywordsKeys: ['search:keywords.appearance', 'search:keywords.theme', 'search:keywords.darkMode', 'search:keywords.lightMode', 'search:keywords.language'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:settings', path: '/settings?tab=profile', keywordsKeys: ['search:keywords.editProfile', 'search:keywords.myName', 'search:keywords.phoneNumber', 'search:keywords.address', 'search:keywords.occupation'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:settings', path: '/settings?tab=security', keywordsKeys: ['search:keywords.password', 'search:keywords.changePassword', 'search:keywords.security', 'search:keywords.2fa', 'search:keywords.twoFactor', 'search:keywords.blockedUsers'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:settings', path: '/settings?tab=billing', keywordsKeys: ['search:keywords.managePayment', 'search:keywords.creditCard', 'search:keywords.invoices', 'search:keywords.receipts'], roles: ['client', 'coach', 'admin'] },
    { nameKey: 'header:settings', path: '/settings?tab=coach', keywordsKeys: ['search:keywords.availability', 'search:keywords.bookingRules', 'search:keywords.scheduling', 'search:keywords.cancellationPolicy', 'search:keywords.overtime'], roles: ['coach'] },
    { nameKey: 'header:settings', path: '/settings?tab=pricing', keywordsKeys: ['search:keywords.hourlyRate', 'search:keywords.discounts', 'search:keywords.sessionPrice', 'search:keywords.myRates'], roles: ['coach'] },
];

const getZeroQueryResults = async (userId, t) => {
    console.log(`[Search BE] Fetching zero-query results for userId: ${userId}`);
    
    const recentConnectionsPromise = Connection.find({ 
        $or: [{ coach: userId }, { client: userId }], 
        status: 'accepted' 
    })
    .sort({ updatedAt: -1 })
    .limit(3)
    .populate({
        path: 'coach client',
        select: 'firstName lastName profilePicture.url role'
    })
    .lean();

    const upcomingBookingsPromise = Booking.find({ 
        userIds: userId, 
        start: { $gte: new Date() } 
    })
    .sort({ start: 1 })
    .limit(3)
    .lean();

    const [recentConnections, upcomingBookings] = await Promise.all([recentConnectionsPromise, upcomingBookingsPromise]);

    const connections = recentConnections.map(conn => {
        const otherUser = conn.coach._id.toString() === userId.toString() ? conn.client : conn.coach;
        return {
            _id: otherUser._id,
            name: `${otherUser.firstName} ${otherUser.lastName}`,
            detail: t('header:details.yourConnection'),
            avatar: otherUser.profilePicture?.url,
            type: 'connection',
            role: otherUser.role
        };
    });

    const bookings = upcomingBookings.map(booking => ({
        _id: booking._id,
        name: booking.title,
        detail: t('search:details.bookingOnDate', { date: new Date(booking.start).toLocaleDateString() }),
        path: '/my-calendar',
        type: 'booking'
    }));
    
    return {
        coaches: [],
        programs: [],
        connections,
        bookings,
        navigation: [],
        users: []
    };
};

exports.globalSearch = async (req, res) => {
    const { q: searchTerm } = req.query;
    const user = req.user;

    const lang = req.headers['accept-language']?.split(',')[0] || 'en';
    const t = i18next.getFixedT(lang);

    if (!user || !user.id) {
        return res.status(401).json({ message: 'Authentication required.' });
    }
    
    try {
        if (!searchTerm || searchTerm.trim().length === 0) {
            const zeroQueryResults = await getZeroQueryResults(user.id, t);
            return res.json(zeroQueryResults);
        }

        if (searchTerm.trim().length < 1) {
            return res.json({ coaches: [], programs: [], connections: [], bookings: [], navigation: [], users: [] });
        }

        console.log(`[Search BE] Received search for term: "${searchTerm}" from userId: ${user.id} in lang: "${lang}"`);
        const searchTermRegex = new RegExp(searchTerm, 'i');

        const directCoachPromise = async () => {
            const users = await User.find({ role: 'coach', $or: [{ firstName: searchTermRegex }, { lastName: searchTermRegex }] }).select('_id').lean();
            const userIds = users.map(u => u._id);
            return Coach.find({ status: 'active', $or: [ { user: { $in: userIds } }, { headline: searchTermRegex }, { bio: searchTermRegex } ]})
            .populate('user', 'firstName lastName profilePicture role')
            .limit(5).lean();
        };

        const directProgramPromise = async () => {
            const coaches = await User.find({ role: 'coach', $or: [{ firstName: searchTermRegex }, { lastName: searchTermRegex }] }).select('_id').lean();
            const coachIds = coaches.map(c => c._id);
            return Program.find({ status: 'published', $or: [ { title: searchTermRegex }, { subtitle: searchTermRegex }, { description: searchTermRegex }, { learningOutcomes: searchTermRegex }, { coach: { $in: coachIds } } ]})
            .populate('coach', 'firstName lastName').limit(5).lean();
        };
        
        const atlasSearchPromise = SearchCollection.aggregate([
            { $search: { index: 'unified_search_index', text: { query: searchTerm, path: ['name', 'searchable_content'], fuzzy: { maxEdits: 1, prefixLength: 3 } }}},
            { $limit: 5 }
        ]);

        const userSpecificSearchPromise = async () => {
            const connectionPromise = async () => {
                const userConnections = await Connection.find({ $or: [{ coach: user.id }, { client: user.id }], status: 'accepted' }).select('coach client').lean();
                const connectionIds = userConnections.map(conn => (conn.coach.toString() === user.id ? conn.client.toString() : conn.coach.toString()));
                if (connectionIds.length === 0) return [];
                const matchedConnections = await User.find({ _id: { $in: connectionIds }, $or: [{ firstName: searchTermRegex }, { lastName: searchTermRegex }] }).select('firstName lastName profilePicture.url role').limit(5).lean();
                return matchedConnections.map(u => ({ _id: u._id, name: `${u.firstName} ${u.lastName}`, detail: t('search:details.yourConnection'), avatar: u.profilePicture?.url, type: 'connection', role: u.role }));
            };
            const bookingPromise = async () => {
                const matchedBookings = await Booking.find({ userIds: user.id, title: searchTermRegex }).select('title start').limit(5).lean();
                return matchedBookings.map(booking => ({ _id: booking._id, name: booking.title, detail: t('search:details.bookingOnDate', { date: new Date(booking.start).toLocaleDateString() }), path: '/my-calendar', type: 'booking' }));
            };
            const [connections, bookings] = await Promise.all([connectionPromise(), bookingPromise()]);
            return { connections, bookings };
        };

        const generalUserSearchPromise = () => {
            console.log(`[Search BE] Searching for general users matching: "${searchTerm}"`);
            return User.find({
                $or: [{ firstName: searchTermRegex }, { lastName: searchTermRegex }],
                role: { $ne: 'coach' },
                _id: { $ne: new mongoose.Types.ObjectId(user.id) }
            })
            .select('firstName lastName profilePicture.url role')
            .limit(5)
            .lean();
        };

        const [directCoachesRaw, directProgramsRaw, fuzzyResults, userSpecificData, generalUsersRaw] = await Promise.all([
            directCoachPromise(),
            directProgramPromise(),
            atlasSearchPromise,
            userSpecificSearchPromise(),
            generalUserSearchPromise()
        ]);

        const resultsMap = new Map();

        directCoachesRaw.filter(c => c.user).forEach(coach => {
            resultsMap.set(coach.user._id.toString(), { _id: coach.user._id, name: `${coach.user.firstName} ${coach.user.lastName}`, detail: coach.headline, avatar: coach.user.profilePicture?.url, type: 'coach', role: coach.user.role });
        });
        directProgramsRaw.filter(p => p.coach).forEach(program => {
            resultsMap.set(program._id.toString(), { _id: program._id, name: program.title, detail: t('search:details.byCoach', { name: `${program.coach.firstName} ${program.coach.lastName}` }), path: `/programs/${program._id}`, type: 'program' });
        });
        fuzzyResults.forEach(item => {
            if (!resultsMap.has(item._id.toString())) {
                resultsMap.set(item._id.toString(), { _id: item._id, name: item.name, detail: item.detail, path: item.path, avatar: item.avatar, type: item.doc_type, role: item.role });
            }
        });
        
        const allResults = Array.from(resultsMap.values());
        const coaches = allResults.filter(r => r.type === 'coach');
        const programs = allResults.filter(r => r.type === 'program');

        const existingIds = new Set(Array.from(resultsMap.keys()));
        const connectionIds = new Set(userSpecificData.connections.map(c => c._id.toString()));
        
        const generalUsers = generalUsersRaw
            .filter(u => !existingIds.has(u._id.toString()) && !connectionIds.has(u._id.toString()))
            .map(u => ({
                _id: u._id,
                name: `${u.firstName} ${u.lastName}`,
                detail: t('search:details.userRoleLabel'),
                avatar: u.profilePicture?.url,
                type: 'user',
                role: u.role
            }));

        const filteredCoaches = coaches.filter(coach => !connectionIds.has(coach._id.toString()));

        // --- MODIFIED: Fuzzy search on translated navigation items ---
        const roleSpecificNavMap = NAVIGATION_MAP.filter(link => link.roles.includes(user.role));
        
        // 1. Create a translated version of the navigation map for searching
        const translatedNavMap = roleSpecificNavMap.map(item => ({
            ...item,
            name: t(item.nameKey),
            keywords: item.keywordsKeys.map(key => t(key)),
        }));

        if (lang.startsWith('de')) {
            const settingsTranslation = translatedNavMap.find(item => item.nameKey === 'header:settings');
            console.log('[Search BE] DEBUG: Translated "settings" item for German:', JSON.stringify(settingsTranslation, null, 2));
        }

        const fuseOptions = {
            keys: ['name', 'keywords'],
            includeScore: true,
            threshold: 0.5,
        };
        // 2. Run Fuse search on the translated data
        const fuse = new Fuse(translatedNavMap, fuseOptions);

const fuzzyNavResults = fuse.search(searchTerm);
        console.log(`[Search BE] Fuzzy navigation search for "${searchTerm}" found ${fuzzyNavResults.length} results.`);

        // 3. Map the results, which now have translated names
        const navigationResults = fuzzyNavResults
            .map(result => {
                const navItem = result.item; // This item is from translatedNavMap
                const finalPath = typeof navItem.path === 'function' ? navItem.path(user) : navItem.path;
                return { 
                    ...navItem, // Contains the translated name
                    path: finalPath,
                    type: 'navigation',
                    detail: t('search:typeLabels.navigation', 'Navigation') 
                };
            });
        
        // --- NEW: De-duplicate navigation results by name ---
        const uniqueNavigationMap = new Map();
        navigationResults.forEach(item => {
            if (!uniqueNavigationMap.has(item.name)) {
                uniqueNavigationMap.set(item.name, item);
            }
        });
        const navigation = Array.from(uniqueNavigationMap.values());
        // --- END NEW SECTION ---

         const actions = []; 
        if (filteredCoaches.length > 0) {
            actions.unshift({
                _id: 'see-all-coaches',
                name: t('search:actions.seeAllCoaches', { count: filteredCoaches.length }),
                path: `/coaches?q=${encodeURIComponent(searchTerm)}`,
                type: 'action',
            });
        }

         const finalResults = {
            coaches: filteredCoaches,
            programs: programs,
            connections: userSpecificData.connections,
            bookings: userSpecificData.bookings,
            navigation: navigation, // Use the de-duplicated array
            users: generalUsers,
            actions: actions
        };

        console.log(`[Search BE] Sending results for "${searchTerm}":`, { coaches: finalResults.coaches.length, users: finalResults.users.length, navigation: finalResults.navigation.length, connections: finalResults.connections.length });
        res.json(finalResults);

    } catch (error) {
        console.error('--- [GlobalSearch API] CRITICAL ERROR ---', error);
        res.status(500).json({ message: 'An error occurred during search.' });
    }
};

const buildCoachSearchPipeline = async (req) => {
    const { sortBy = 'popularity_desc', ...filters } = req.query;
    const language = req.language || 'en';
    
    const andClauses = [];

    if (req.user && req.user.id) {
        const currentUserId = new mongoose.Types.ObjectId(req.user.id);
        const currentUser = await User.findById(currentUserId).select('blockedUsers.user').lean();
        const usersBlockedByCurrentUser = currentUser?.blockedUsers?.map(b => b.user) || [];
        const usersWhoBlockedCurrentUser = await User.find({ 'blockedUsers.user': currentUserId }).select('_id').lean();
        const userIdsWhoBlockedCurrentUser = usersWhoBlockedCurrentUser.map(u => u._id);
        const allBlockedUserIds = [...new Set([...usersBlockedByCurrentUser, ...userIdsWhoBlockedCurrentUser])];
        if (allBlockedUserIds.length > 0) {
            andClauses.push({ user: { $nin: allBlockedUserIds } });
        }
    }

    if (filters.searchTerm) {
        const searchTermRegex = new RegExp(filters.searchTerm, 'i');
        
        const modelsToSearch = {
            User: { model: User, fields: ['firstName', 'lastName'], idField: '_id', coachField: 'user' },
            Specialty: { model: Specialty, fields: ['name'], idField: '_id', coachField: 'specialties' },
            Language: { model: Language, fields: ['name'], idField: '_id', coachField: 'languages.language' },
            Skill: { model: Skill, fields: ['name'], idField: '_id', coachField: 'skills' },
            CoachingStyle: { model: CoachingStyle, fields: ['name'], idField: '_id', coachField: 'coachingStyles' },
        };

        const listTypesForTranslation = {
            specialties: 'specialties',
            languages: 'languages',
            skills: 'skills',
            coachingStyles: 'coachingStyles',
        };

        const translationMatches = await Translation.find({
            listType: { $in: Object.keys(listTypesForTranslation) },
            [`translations.${language}`]: searchTermRegex
        }).select('key').lean();

        const idsFromTranslations = {};
        translationMatches.forEach(t => {
            const [type, id] = t.key.split('_');
            if (!idsFromTranslations[type]) idsFromTranslations[type] = [];
            idsFromTranslations[type].push(new mongoose.Types.ObjectId(id));
        });

        const searchPromises = Object.entries(modelsToSearch).map(async ([modelName, config]) => {
            const orQuery = config.fields.map(field => ({ [field]: searchTermRegex }));
            const existingIds = idsFromTranslations[config.coachField.split('.')[0]] || [];
            if (existingIds.length > 0) {
                orQuery.push({ _id: { $in: existingIds } });
            }
            const results = await config.model.find({ $or: orQuery }).select(config.idField).lean();
            return {
                coachField: config.coachField,
                ids: results.map(r => r[config.idField])
            };
        });

        const searchResults = await Promise.all(searchPromises);
        
        const textSearchOrClause = [
            { headline: searchTermRegex },
            { bio: searchTermRegex }
        ];

        searchResults.forEach(result => {
            if (result.ids.length > 0) {
                textSearchOrClause.push({ [result.coachField]: { $in: result.ids } });
            }
        });
        
        andClauses.push({ $or: textSearchOrClause });
    }

    const arrayFilterKeys = ['specialties', 'languages', 'educationLevels', 'coachingStyles', 'skills'];
    for (const key of arrayFilterKeys) {
      if (filters[key] && typeof filters[key] === 'string') {
        const ids = filters[key].split(',').map(id => id.trim()).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
        if (ids.length > 0) {
          const field = key === 'languages' ? 'languages.language' : key;
          andClauses.push({ [field]: { $in: ids } });
        }
      }
    }

    if (filters.liveSessionAvailable === 'true') {
        andClauses.push({ liveSessionAvailable: true });
    }

 const query = andClauses.length > 0 ? { $and: andClauses } : {};
    
    const pipeline = [
        { $match: query },
        { $lookup: { from: 'price_configurations', localField: 'user', foreignField: 'user', as: 'priceConfigData' } },
        { $addFields: { priceConfig: { $arrayElemAt: ['$priceConfigData', 0] } } },
    ];

    const priceQuery = {};
    if (filters.minPrice !== undefined && filters.minPrice !== null && filters.minPrice !== '') {
        priceQuery.$gte = parseInt(filters.minPrice, 10);
    }
    if (filters.maxPrice !== undefined && filters.maxPrice !== null && filters.maxPrice !== '') {
        priceQuery.$lte = parseInt(filters.maxPrice, 10);
    }
    if (Object.keys(priceQuery).length > 0) {
        pipeline.push({ $match: { 'priceConfig.baseRate.amount': priceQuery } });
    }

    pipeline.push(
        { $lookup: { from: 'reviews', localField: 'user', foreignField: 'rateeId', as: 'reviewsData' }},
        { $addFields: { rating: { $ifNull: [{ $avg: '$reviewsData.rating' }, 0] }, totalReviews: { $ifNull: [{ $size: '$reviewsData' }, 0] } }}
    );

    if (filters.minRating) pipeline.push({ $match: { rating: { $gte: parseFloat(filters.minRating) } } });

    return { pipeline, sortBy };
};

exports.searchCoaches = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;
    const language = req.language || 'en';

    const { sortBy = 'popularity_desc', ...filters } = req.query;
    console.log('[searchController.js->searchCoaches] LOG 1: Received request with filters:', { filters, sortBy, page, limit });
    
    let andClauses = [{ status: 'active' }];

    if (req.user && req.user.id) {
        const currentUserId = new mongoose.Types.ObjectId(req.user.id);
        const currentUser = await User.findById(currentUserId).select('blockedUsers.user').lean();
        const usersBlockedByCurrentUser = currentUser?.blockedUsers?.map(b => b.user) || [];
        const usersWhoBlockedCurrentUser = await User.find({ 'blockedUsers.user': currentUserId }).select('_id').lean();
        const userIdsWhoBlockedCurrentUser = usersWhoBlockedCurrentUser.map(u => u._id);
        const allBlockedUserIds = [...new Set([...usersBlockedByCurrentUser, ...userIdsWhoBlockedCurrentUser])];
        if (allBlockedUserIds.length > 0) {
            andClauses.push({ user: { $nin: allBlockedUserIds } });
        }
    }

    if (filters.searchTerm) {
        // --- START: MODIFIED SEARCH TERM LOGIC ---
        // Keep the original full term for searching in bio, headline, etc.
        const fullSearchTermRegex = new RegExp(filters.searchTerm, 'i');
        
        // Deconstruct the search term for intelligent name matching.
        const commonWords = ['coach', 'coaching', 'trainer'];
        const nameSearchWords = filters.searchTerm.split(/\s+/)
            .filter(word => word && !commonWords.includes(word.toLowerCase()));

        console.log(`[searchController.searchCoaches] Deconstructed search term for name matching:`, nameSearchWords);
        
        let userIdsFromNameSearch = [];
        if (nameSearchWords.length > 0) {
            const wordRegexes = nameSearchWords.map(word => new RegExp(word, 'i'));

            // Build a query that finds users where the words match across first/last names.
            // If searching "Dominic Frei", this finds a user where "Dominic" is in a name field AND "Frei" is in a name field.
            const userNameQuery = {
                $and: wordRegexes.map(regex => ({
                    $or: [{ firstName: regex }, { lastName: regex }]
                }))
            };
            
            const users = await User.find(userNameQuery).select('_id').lean();
            userIdsFromNameSearch = users.map(u => u._id);
            console.log(`[searchController.searchCoaches] Found ${userIdsFromNameSearch.length} user ID(s) from dedicated name search.`);
        }

        // The rest of the logic for specialties, languages, etc., remains the same.
        const modelsToSearch = {
            Specialty: { model: Specialty, fields: ['name'], idField: '_id', coachField: 'specialties' },
            Language: { model: Language, fields: ['name'], idField: '_id', coachField: 'languages.language' },
            Skill: { model: Skill, fields: ['name'], idField: '_id', coachField: 'skills' },
            CoachingStyle: { model: CoachingStyle, fields: ['name'], idField: '_id', coachField: 'coachingStyles' },
        };

        const listTypesForTranslation = {
            specialties: 'specialties',
            languages: 'languages',
            skills: 'skills',
            coachingStyles: 'coachingStyles',
        };

        const translationMatches = await Translation.find({
            listType: { $in: Object.keys(listTypesForTranslation) },
            [`translations.${language}`]: fullSearchTermRegex
        }).select('key').lean();

        const idsFromTranslations = {};
        translationMatches.forEach(t => {
            const [type, id] = t.key.split('_');
            if (!idsFromTranslations[type]) idsFromTranslations[type] = [];
            idsFromTranslations[type].push(new mongoose.Types.ObjectId(id));
        });

        const searchPromises = Object.entries(modelsToSearch).map(async ([modelName, config]) => {
            const orQuery = config.fields.map(field => ({ [field]: fullSearchTermRegex }));
            const existingIds = idsFromTranslations[config.coachField.split('.')[0]] || [];
            if (existingIds.length > 0) {
                orQuery.push({ _id: { $in: existingIds } });
            }
            const results = await config.model.find({ $or: orQuery }).select(config.idField).lean();
            return {
                coachField: config.coachField,
                ids: results.map(r => r[config.idField])
            };
        });

        const searchResults = await Promise.all(searchPromises);
        
        // This is the main search clause. We combine all potential matches here.
        const textSearchOrClause = [
            { headline: fullSearchTermRegex },
            { bio: fullSearchTermRegex }
        ];

        // Add the users we found from our smart name search.
        if (userIdsFromNameSearch.length > 0) {
            textSearchOrClause.push({ user: { $in: userIdsFromNameSearch } });
        }

        searchResults.forEach(result => {
            if (result.ids.length > 0) {
                textSearchOrClause.push({ [result.coachField]: { $in: result.ids } });
            }
        });
        
        andClauses.push({ $or: textSearchOrClause });
        // --- END: MODIFIED SEARCH TERM LOGIC ---
    }

    const arrayFilterKeys = ['specialties', 'languages', 'educationLevels', 'coachingStyles', 'skills'];
    for (const key of arrayFilterKeys) {
      if (filters[key] && typeof filters[key] === 'string') {
        const ids = filters[key].split(',').map(id => id.trim()).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
        if (ids.length > 0) {
          const field = key === 'languages' ? 'languages.language' : key;
          andClauses.push({ [field]: { $in: ids } });
        }
      }
    }

    if (filters.isInsuranceRecognized === 'true') {
      andClauses.push({ 'settings.insuranceRecognition.isRecognized': true });
    }

     const liveSessionFilter = filters.liveSessionAvailable === 'true';

    const pipeline = []; // DECLARE THE PIPELINE ARRAY HERE

    if (liveSessionFilter) {
      // andClauses.push({ liveSessionAvailable: true }); // This line is redundant and can be removed

      const liveSessionMatchConditions = {
        'userData.status': 'online',
        'priceConfigData.liveSessionRate.amount': { $gt: 0 }
      };

      const livePriceQuery = {};
      if (filters.minLivePrice) {
        livePriceQuery.$gte = parseInt(filters.minLivePrice, 10);
      }
      if (filters.maxLivePrice) {
        livePriceQuery.$lte = parseInt(filters.maxLivePrice, 10);
      }

      if (Object.keys(livePriceQuery).length > 0) {
        liveSessionMatchConditions['priceConfigData.liveSessionRate.amount'] = {
            ...liveSessionMatchConditions['priceConfigData.liveSessionRate.amount'],
            ...livePriceQuery
        };
      }
      
      const pipelinePrefix = [
        { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userData' } },
        { $lookup: { from: 'price_configurations', localField: 'user', foreignField: 'user', as: 'priceConfigData' } },
        { $unwind: "$userData" },
        { $unwind: "$priceConfigData" },
        { $match: liveSessionMatchConditions }
      ];

      pipeline.push(...pipelinePrefix); // USE PUSH INSTEAD OF UNSHIFT
      console.log('[searchController.js->searchCoaches] LOG 2: Live session filter is ACTIVE. Conditions:', JSON.stringify(liveSessionMatchConditions));
    }

    const query = andClauses.length > 0 ? { $and: andClauses } : {};
    
    pipeline.push(
        { $match: query },
        { $lookup: { from: 'price_configurations', localField: 'user', foreignField: 'user', as: 'priceConfigData' } },
        { $addFields: { priceConfig: { $arrayElemAt: ['$priceConfigData', 0] } } }
    );

    const priceQuery = {};
    if (filters.minPrice !== undefined && filters.minPrice !== null && filters.minPrice !== '') {
      priceQuery.$gte = parseInt(filters.minPrice, 10);
    }
 if (filters.maxPrice !== undefined && filters.maxPrice !== null && filters.maxPrice !== '') {
      priceQuery.$lte = parseInt(filters.maxPrice, 10);
    }

    if (Object.keys(priceQuery).length > 0) {
      console.log('[searchController.searchCoaches] PRICE FILTER: Parsed price range from request.', { minPrice: filters.minPrice, maxPrice: filters.maxPrice });
      console.log('[searchController.searchCoaches] PRICE FILTER: Constructed MongoDB query object.', { priceQuery });

      try {
        const preFilterCountResult = await Coach.aggregate([...pipeline, { $count: 'count' }]);
        const preFilterCount = preFilterCountResult.length > 0 ? preFilterCountResult[0].count : 0;
        
        const preFilterSample = await Coach.aggregate([
          ...pipeline,
          { $limit: 5 },
          { $project: { _id: 1, baseRate: '$priceConfig.baseRate' } }
        ]);

        console.log('[searchController.searchCoaches] PRICE FILTER DIAGNOSTIC (BEFORE):', {
          potentialMatches: preFilterCount,
          sampleCoaches: preFilterSample.map(c => ({ coachId: c._id, baseRate: c.baseRate }))
        });
      } catch(diagError) {
         logger.error('[searchController.searchCoaches] PRICE FILTER DIAGNOSTIC: Error during pre-check.', { error: diagError.message });
      }

      const priceMatchStage = { $match: { 'priceConfig.baseRate.amount': priceQuery } };
      pipeline.push(priceMatchStage);
      console.log('[searchController.searchCoaches] PRICE FILTER: Added price match stage to aggregation pipeline.', { priceMatchStage: JSON.stringify(priceMatchStage) });
    } else {
      console.log('[searchController.searchCoaches] PRICE FILTER: No min/max price provided, skipping price filter stage.');
    }

    pipeline.push(
        { $lookup: { from: 'reviews', localField: 'user', foreignField: 'rateeId', as: 'reviewsData' }},
        { $addFields: { rating: { $ifNull: [{ $avg: '$reviewsData.rating' }, 0] }, totalReviews: { $ifNull: [{ $size: '$reviewsData' }, 0] } }}
    );

    if (filters.minRating) {
      pipeline.push({ $match: { rating: { $gte: parseFloat(filters.minRating) } } });
    }
    
    const sortStage = {};
    switch (sortBy) {
        case 'rating_desc': sortStage.rating = -1; sortStage.totalReviews = -1; break;
        case 'price_asc': sortStage['priceConfig.baseRate.amount'] = 1; break;
        case 'price_desc': sortStage['priceConfig.baseRate.amount'] = -1; break;
        case 'newest_desc': sortStage.createdAt = -1; break;
        default: sortStage.totalReviews = -1; sortStage.rating = -1;
    }

    const facetPipeline = [
      ...pipeline,
      {
        $facet: {
          paginatedResults: [
            { $sort: sortStage },
            { $skip: skip },
            { $limit: limit },
            { $project: { reviewsData: 0, priceConfigData: 0, priceConfig: 0, userData: 0 } }
          ],
          totalCount: [
            { $count: 'count' }
          ],
          specialties: [ { $unwind: '$specialties' }, { $group: { _id: '$specialties', count: { $sum: 1 } } } ],
          languages: [ { $unwind: '$languages' }, { $group: { _id: '$languages.language', count: { $sum: 1 } } } ],
          educationLevels: [ { $unwind: '$educationLevels' }, { $group: { _id: '$educationLevels', count: { $sum: 1 } } } ],
          coachingStyles: [ { $unwind: '$coachingStyles' }, { $group: { _id: '$coachingStyles', count: { $sum: 1 } } } ],
          skills: [ { $unwind: '$skills' }, { $group: { _id: '$skills', count: { $sum: 1 } } } ],
        }
      }
    ];

    console.log('[searchController.js->searchCoaches] LOG 3: Executing final aggregation pipeline:', JSON.stringify(facetPipeline, null, 2));

    const results = await Coach.aggregate(facetPipeline);
    const aggregationResult = results[0];

    const coaches = aggregationResult.paginatedResults;
    const totalCoaches = aggregationResult.totalCount.length > 0 ? aggregationResult.totalCount[0].count : 0;
    
     console.log('[searchController.js->searchCoaches] LOG 4: Aggregation complete. Total coaches found:', totalCoaches);
    if (totalCoaches > 0) {
      console.log('[searchController.js->searchCoaches] LOG 5: Sample of coaches found:', coaches.slice(0, 2));
    }

    console.log('[searchController.searchCoaches] AGGREGATION RESULT (AFTER):', {
        finalCoachCount: totalCoaches,
        hasPriceFilter: Object.keys(priceQuery).length > 0
    });

    const rawFacets = aggregationResult;

    await Coach.populate(coaches, [
      { path: 'user', select: 'firstName lastName email profilePicture' },
      { path: 'specialties' },
      { path: 'languages.language' }
    ]);
    
    const facetModels = {
      specialties: Specialty,
      languages: Language,
      educationLevels: EducationLevel,
      coachingStyles: CoachingStyle,
      skills: Skill
    };

    const finalFacets = {};
    for (const [key, model] of Object.entries(facetModels)) {
        if (rawFacets[key] && rawFacets[key].length > 0) {
            const ids = rawFacets[key].map(item => item._id);
            const items = await model.find({ _id: { $in: ids } }).lean();
            const translations = await Translation.find({
              key: { $in: ids.map(id => `${key}_${id}`) },
              [`translations.${language}`]: { $exists: true, $ne: null }
            }).lean();

            const itemMap = new Map(items.map(i => [i._id.toString(), i]));
            const translationMap = new Map(translations.map(t => [t.key, t.translations[language]]));

            finalFacets[key] = rawFacets[key].map(facetItem => {
                const itemDoc = itemMap.get(facetItem._id.toString());
                if (!itemDoc) return null;
                const translation = translationMap.get(`${key}_${facetItem._id.toString()}`);
                return {
                    ...itemDoc,
                    count: facetItem.count,
                    translation: translation || null,
                };
            }).filter(Boolean);
        } else {
            finalFacets[key] = [];
        }
    }
    
    const formattedCoaches = coaches.map(coach => ({ 
      ...coach, 
      userId: coach.user?._id, 
      _id: coach._id,
      liveSessionRate: coach.priceConfigData?.[0]?.liveSessionRate || null,
    }));

    res.json({
      coaches: formattedCoaches,
      currentPage: page,
      totalPages: Math.ceil(totalCoaches / limit),
      hasMore: page < Math.ceil(totalCoaches / limit),
      facets: finalFacets,
    });

  } catch (error) {
    logger.error('[searchController.searchCoaches] CRITICAL ERROR', { error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Error getting coaches', error: error.message });
  }
};

exports.getCoachFacets = async (req, res) => {
    try {
        const language = req.language || 'en';
        const { pipeline } = await buildCoachSearchPipeline(req);

        const listFields = {
            specialties: { unwind: '$specialties', model: Specialty },
            languages: { unwind: '$languages.language', model: Language },
            educationLevels: { unwind: '$educationLevels', model: EducationLevel },
            coachingStyles: { unwind: '$coachingStyles', model: CoachingStyle },
            skills: { unwind: '$skills', model: Skill },
        };

        const facetPipelines = {};
        for (const [field, config] of Object.entries(listFields)) {
            facetPipelines[field] = [
                { $unwind: config.unwind },
                { $group: { _id: config.unwind, count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 100 },
                {
                    $lookup: {
                        from: config.model.collection.name,
                        localField: '_id',
                        foreignField: '_id',
                        as: 'details'
                    }
                },
                { $unwind: '$details' },
                { $project: { _id: 1, name: '$details.name', count: 1 } },
            ];
        }

        pipeline.push({ $facet: facetPipelines });

        const result = await Coach.aggregate(pipeline);
        const facets = result[0];

        const translationKeysToFetch = Object.entries(facets).flatMap(([type, items]) =>
            items.map(item => `${type}_${item._id.toString()}`)
        );

        const translationMap = new Map();
        if (translationKeysToFetch.length > 0) {
            const translations = await Translation.find({
                key: { $in: translationKeysToFetch },
                [`translations.${language}`]: { $exists: true, $ne: null }
            }).lean();
            translations.forEach(t => translationMap.set(t.key, t.translations[language]));
        }

        const translatedFacets = {};
        Object.keys(facets).forEach(type => {
            translatedFacets[type] = facets[type].map(item => ({
                ...item,
                translation: translationMap.get(`${type}_${item._id.toString()}`) || null,
            }));
        });

        res.json(translatedFacets);
    } catch (error) {
        logger.error('[getCoachFacets] Error fetching coach facets', { error: error.message, stack: error.stack });
        res.status(500).json({ message: 'Error fetching coach facets', error: error.message });
    }
};

exports.getSearchSuggestions = async (req, res) => {
    try {
        const lang = req.headers['accept-language']?.split(',')[0] || 'en';
        const { q: searchTerm } = req.query;

        if (!searchTerm || searchTerm.trim().length < 2) {
            // UPDATED: Added 'programs' for a consistent response shape
            return res.json({ programs: [], coaches: [], specialties: [], languages: [] });
        }

        logger.info(`[getSearchSuggestions] Fetching suggestions for term: "${searchTerm}"`);
        const searchTermRegex = new RegExp(searchTerm, 'i');

        const coachPromise = User.find({
            role: 'coach',
            $or: [{ firstName: searchTermRegex }, { lastName: searchTermRegex }]
        })
        .select('firstName lastName profilePicture.url')
        .limit(3)
        .lean();

        // NEW: Add a promise to search for programs
        const programPromise = Program.find({
            status: 'published',
            $or: [
                { title: searchTermRegex },
                { subtitle: searchTermRegex }
            ]
        })
        .populate('coach', 'firstName lastName')
        .select('title programImages coach')
        .limit(3)
        .lean();

        const findItems = async (Model, listType) => {
            const nameMatchPromise = Model.find({ name: searchTermRegex }).limit(3).lean();
            
            const translationMatchPromise = Translation.find({
                listType: listType,
                [`translations.${lang}`]: searchTermRegex
            }).select('key translations').limit(3).lean();

            const [nameMatches, translationMatches] = await Promise.all([nameMatchPromise, translationMatchPromise]);
            
            const translationIds = translationMatches.map(t => new mongoose.Types.ObjectId(t.key.split('_').pop()));
            const translationMap = new Map(translationMatches.map(t => [t.key.split('_').pop(), t.translations[lang]]));
            
            const itemsFromTranslations = translationIds.length > 0
                ? await Model.find({ _id: { $in: translationIds } }).lean()
                : [];
                
            const combined = [...nameMatches, ...itemsFromTranslations];
            let uniqueItems = Array.from(new Map(combined.map(item => [item._id.toString(), item])).values());

            uniqueItems = uniqueItems.map(item => ({
                ...item,
                translation: translationMap.get(item._id.toString()) || null
            }));
            
            return uniqueItems;
        };

        const specialtyPromise = findItems(Specialty, 'specialties');
        const languagePromise = findItems(Language, 'languages');

        // UPDATED: Await the new programPromise
        const [coaches, programsRaw, specialties, languages] = await Promise.all([
            coachPromise, 
            programPromise, 
            specialtyPromise, 
            languagePromise
        ]);

        // NEW: Format program data to match frontend expectations
        const programs = programsRaw.map(p => ({
            _id: p._id,
            name: p.title, // 'name' is used as the primary display text in the frontend
            programImages: p.programImages,
            coachName: p.coach ? `${p.coach.firstName} ${p.coach.lastName}` : null
        }));

        logger.info(`[getSearchSuggestions] Found: ${programs.length} programs, ${coaches.length} coaches, ${specialties.length} specialties, ${languages.length} languages.`);

        // UPDATED: Include programs in the final JSON response
        res.json({ programs, coaches, specialties, languages });

    } catch (error) {
        logger.error('[getSearchSuggestions] Error fetching search suggestions', { error: error.message });
        res.status(500).json({ message: 'Error fetching suggestions' });
    }
};

exports.searchPrograms = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;
        const language = req.language || 'en';

        let filters = {};
        if (req.query.filters) {
            try {
                const parsedFilters = JSON.parse(req.query.filters);
                if (parsedFilters && typeof parsedFilters === 'object') {
                    filters = parsedFilters;
                }
            } catch (e) {
                logger.warn('Invalid filters JSON received', { filters: req.query.filters });
                return res.status(400).json({ message: 'Invalid filter format.' });
            }
        }
        
        const { 
            sortBy = 'popularity_desc',
            searchTerm,
            categories,
            price,
            features,
            language: languageFilter,
            skillLevel,
            learningOutcomes,
            contentDuration,
            estimatedCompletionTime,
            contentTypes,
            author
        } = filters;

        let andClauses = [{ status: 'published' }];

        if (searchTerm) {
            const searchTermRegex = new RegExp(searchTerm, 'i');
            const coaches = await User.find({ role: 'coach', $or: [{ firstName: searchTermRegex }, { lastName: searchTermRegex }] }).select('_id').lean();
            const coachIds = coaches.map(c => c._id);
            const searchOrClause = [
                { title: searchTermRegex },
                { subtitle: searchTermRegex },
                { description: searchTermRegex },
                { learningOutcomes: searchTermRegex }
            ];
            if (coachIds.length > 0) {
                searchOrClause.push({ coach: { $in: coachIds } });
            }
            andClauses.push({ $or: searchOrClause });
        }

        if (author && typeof author === 'string' && author.length > 0) {
            andClauses.push({ coach: { $in: author.split(',').map(id => new mongoose.Types.ObjectId(id)) } });
        }
        if (categories && typeof categories === 'string' && categories.length > 0) {
            andClauses.push({ categories: { $in: categories.split(',').map(id => new mongoose.Types.ObjectId(id)) } });
        }
        if (languageFilter && typeof languageFilter === 'string' && languageFilter.length > 0) {
            andClauses.push({ language: { $in: languageFilter.split(',').map(id => new mongoose.Types.ObjectId(id)) } });
        }
        if (skillLevel && typeof skillLevel === 'string' && skillLevel.length > 0) {
            andClauses.push({ skillLevel: { $in: skillLevel.split(',').map(id => new mongoose.Types.ObjectId(id)) } });
        }
        if (learningOutcomes && typeof learningOutcomes === 'string' && learningOutcomes.length > 0) {
             andClauses.push({ learningOutcomes: { $all: learningOutcomes.split(',') } });
        }
        if (price && Array.isArray(price) && price.length === 2) {
            const [minPrice, maxPrice] = price;
            const priceQuery = {};
            if (minPrice > 0) priceQuery.$gte = minPrice;
            if (maxPrice < 1000) priceQuery.$lte = maxPrice;
            if (Object.keys(priceQuery).length > 0) {
                andClauses.push({ 'basePrice.amount': priceQuery });
            }
        }
       const applyDurationFilter = (fieldName, durationString) => {
            if (!durationString || typeof durationString !== 'string' || durationString.length === 0) return;
            const orConditions = durationString.split(',').map(bucket => {
                const [min, max] = bucket.split('-').map(val => parseInt(val, 10));
                const condition = {};
                if (!isNaN(min)) condition.$gte = min;
                if (!isNaN(max)) condition.$lte = max;
                return Object.keys(condition).length > 0 ? { [fieldName]: condition } : null;
            }).filter(Boolean);
            if (orConditions.length > 0) {
                andClauses.push({ $or: orConditions });
            }
        };
        applyDurationFilter('contentDuration.minutes', contentDuration);
        applyDurationFilter('estimatedCompletionTime.minutes', estimatedCompletionTime);
        if (contentTypes && typeof contentTypes === 'string' && contentTypes.length > 0) {
            andClauses.push({ availableContentTypes: { $in: contentTypes.split(',') } });
        }
        if (features && features.includes('discussion')) {
            andClauses.push({ isDiscussionEnabled: true });
        }
        
        const query = andClauses.length > 0 ? { $and: andClauses } : {};

        const sortStage = {};
        switch(sortBy) {
            case 'price_asc': sortStage['basePrice.amount'] = 1; break;
            case 'price_desc': sortStage['basePrice.amount'] = -1; break;
            case 'createdAt_desc': sortStage.createdAt = -1; break;
            case 'sales_desc': sortStage.enrollmentsCount = -1; break;
            case 'popularity_desc': default:
                sortStage.averageRating = -1;
                sortStage.enrollmentsCount = -1;
                break;
        }

        const facetPipeline = [
            { $match: query },
            {
                $facet: {
                    paginatedResults: [
                        { $sort: sortStage },
                        { $skip: skip },
                        { $limit: limit },
                    ],
                    totalCount: [ { $count: 'count' } ],
                    categories: [ { $unwind: '$categories' }, { $group: { _id: '$categories', count: { $sum: 1 } } } ],
                    language: [ { $unwind: '$language' }, { $group: { _id: '$language', count: { $sum: 1 } } } ],
                    skillLevel: [ { $unwind: '$skillLevel' }, { $group: { _id: '$skillLevel', count: { $sum: 1 } } } ],
                }
            }
        ];
        
        const results = await Program.aggregate(facetPipeline);
        const aggregationResult = results[0];

        const programs = aggregationResult.paginatedResults;
        const totalDocs = aggregationResult.totalCount.length > 0 ? aggregationResult.totalCount[0].count : 0;
        
        await Program.populate(programs, [
            { path: 'coach', select: 'firstName lastName profilePicture' },
            { path: 'categories' },
            { path: 'skillLevel' },
            { path: 'language' }
        ]);
        
        if (programs.length > 0) {
            const coachUserIds = [...new Set(programs.map(p => p.coach?._id?.toString()).filter(Boolean))];
            if (coachUserIds.length > 0) {
                const coachProfiles = await Coach.find({ user: { $in: coachUserIds } }).select('user profilePicture').lean();
                const coachProfilePictureMap = new Map(coachProfiles.map(coach => [coach.user.toString(), coach.profilePicture]));
                programs.forEach(program => {
                    if (program.coach) {
                        program.coach.coachProfilePicture = coachProfilePictureMap.get(program.coach._id.toString());
                    }
                });
            }
        }
        
        const rawFacets = aggregationResult;
        const facetModels = {
            categories: ProgramCategory,
            language: Language,
            skillLevel: SkillLevel,
        };
        const finalFacets = {};
        for (const [key, model] of Object.entries(facetModels)) {
            if (rawFacets[key] && rawFacets[key].length > 0) {
                const ids = rawFacets[key].map(item => item._id);
                const items = await model.find({ _id: { $in: ids } }).lean();
                const translationKeys = ids.map(id => (key === 'categories' ? `program_categories_${id}` : `${key}_${id}`));
                const translations = await Translation.find({
                    key: { $in: translationKeys },
                    [`translations.name.${language}`]: { $exists: true, $ne: null }
                }).lean();
                
                const itemMap = new Map(items.map(i => [i._id.toString(), i]));
                const translationMap = new Map();
                translations.forEach(t => {
                    const id = t.key.split('_').pop();
                    if (t.translations.name && t.translations.name[language]) {
                        translationMap.set(id, t.translations.name[language]);
                    }
                });

                finalFacets[key] = rawFacets[key].map(facetItem => {
                    const itemDoc = itemMap.get(facetItem._id.toString());
                    if (!itemDoc) return null;
                    return { ...itemDoc, count: facetItem.count, translation: translationMap.get(facetItem._id.toString()) || null };
                }).filter(Boolean);
            } else {
                finalFacets[key] = [];
            }
        }

        res.status(200).json({
            docs: programs,
            totalDocs,
            limit,
            page,
            totalPages: Math.ceil(totalDocs / limit),
            hasNextPage: page < Math.ceil(totalDocs / limit),
            facets: finalFacets
        });
    } catch (error) {
        logger.error('Error searching programs', { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Error searching programs." });
    }
};