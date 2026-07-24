const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoURI = process.env.MONGO_URI;

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

mongoose.connect(mongoURI).then(async () => {
    console.log('Connected for Testing...');
    const Post = mongoose.model('Post', new mongoose.Schema({}, { strict: false }));

    const searchTerms = ['Pakistan', 'Asia', 'Europe', 'United States', 'USA'];
    
    // Re-create the logic from posts.js
    const regionISO = {
      europe: ['FR', 'DE', 'IT', 'ES', 'GB', 'UK', 'PT', 'GR', 'CH', 'NL', 'BE', 'AT', 'TR', 'SE', 'NO', 'DK', 'FI', 'IE', 'PL', 'CZ', 'HU', 'RO', 'BG', 'HR', 'UA', 'RU', 'ME', 'AL', 'RS', 'BA', 'SI', 'IS', 'MC', 'MT', 'LU', 'LI', 'AD', 'SM', 'VA', 'EE', 'LV', 'LT'],
      americas: ['US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC', 'BO', 'PY', 'UY', 'CU', 'JM', 'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'DO', 'HT', 'PR'],
      asia: ['CN', 'JP', 'TH', 'VN', 'SG', 'HK', 'IN', 'PK', 'AE', 'SA', 'KR', 'ID', 'MY', 'PH', 'TW', 'IL', 'QA', 'KW', 'OM', 'JO', 'LB', 'KH', 'LA', 'MM', 'NP', 'LK', 'BD']
    };

    const countryToISO = {
      'france': 'FR', 'germany': 'DE', 'italy': 'IT', 'spain': 'ES', 'united kingdom': 'GB', 'uk': 'GB', 'usa': 'US', 'united states': 'US',
      'canada': 'CA', 'mexico': 'MX', 'brazil': 'BR', 'argentina': 'AR', 'japan': 'JP', 'china': 'CN', 'india': 'IN', 'pakistan': 'PK',
      'uae': 'AE', 'dubai': 'AE', 'saudi arabia': 'SA', 'thailand': 'TH', 'vietnam': 'VN', 'singapore': 'SG', 'turkey': 'TR'
    };

    const regionCountryNames = {
      europe: ['france', 'germany', 'italy', 'spain', 'uk', 'united kingdom', 'portugal', 'greece', 'turkey', 'croatia', 'montenegro', 'switzerland', 'netherlands', 'belgium', 'austria', 'russia', 'poland'],
      americas: ['usa', 'united states', 'canada', 'mexico', 'brazil', 'argentina', 'chile', 'colombia'],
      asia: ['china', 'japan', 'thailand', 'india', 'pakistan', 'uae', 'saudi arabia', 'vietnam', 'singapore']
    };

    for (const location of searchTerms) {
      console.log(`\n--- Searching for: "${location}" ---`);
      const normalizedLocs = [location.toLowerCase()];
      const conditions = [];

      normalizedLocs.forEach(loc => {
        const regex = new RegExp(escapeRegExp(loc), 'i');
        conditions.push({ locationKeys: { $in: [loc] } });
        conditions.push({ location: regex });
        conditions.push({ 'locationData.name': regex });
        conditions.push({ 'locationData.address': regex });
        conditions.push({ 'locationData.city': regex });
        conditions.push({ 'locationData.country': regex });

        if (regionISO[loc]) {
          const codes = regionISO[loc];
          const allCases = [...codes, ...codes.map(c => c.toLowerCase())];
          conditions.push({ 'locationData.countryCode': { $in: allCases } });
          const names = regionCountryNames[loc] || [];
          names.forEach(n => {
            const nRegex = new RegExp(escapeRegExp(n), 'i');
            conditions.push({ 'locationData.address': nRegex });
            conditions.push({ location: nRegex });
            conditions.push({ locationKeys: { $in: [n.toLowerCase()] } });
          });
        }
        if (countryToISO[loc]) {
          const code = countryToISO[loc];
          conditions.push({ 'locationData.countryCode': { $in: [code, code.toLowerCase()] } });
        }
      });

      const query = { $or: conditions };
      const results = await Post.find(query);
      console.log(`Found ${results.length} results.`);
      if (results.length > 0) {
        console.log(`Example: ${results[0].location || results[0].locationName}`);
      }
    }

    process.exit(0);
});
