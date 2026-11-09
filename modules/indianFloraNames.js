// modules/indianFloraNames.js
// ── Indian & Regional Botanical Nomenclature Dictionary ─────────────
//
// Translates scientific Latin binomials (from GBIF or herbarium catalogs)
// into familiar Indian vernacular names across regional languages
// (Kannada, Hindi, Tamil, Telugu, Sanskrit) with script and transliteration,
// plus common English names.
//
// Includes botanical name normalizer that strips author citations like
// 'L.fil.', 'L.', '(Lam.) Benth.', '(L.) Appelhans, Gropp...', etc.

/**
 * Normalizes a raw GBIF scientific name by stripping taxonomic authority,
 * citations, sub-rank tags, and parentheticals.
 * E.g., 'Ficus benghalensis L.' -> 'Ficus benghalensis'
 *       'Ficus hispida L.fil.' -> 'Ficus hispida'
 *       'Zanthoxylum asiaticum (L.) Appelhans, Gropp...' -> 'Zanthoxylum asiaticum'
 *
 * @param {string} rawName
 * @returns {string} clean binomial (Genus species)
 */
export function cleanBotanicalName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';
  const trimmed = rawName.trim();

  // Remove parenthetical author citations e.g. "(L.) Appelhans, Gropp..."
  let cleaned = trimmed.replace(/\([^)]*\)/g, ' ');

  // Remove common authority abbreviations and trailing author strings
  // Stop after the first two botanical words (Genus + specific epithet)
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const genus = tokens[0].replace(/[^a-zA-Z-]/g, '');
    const species = tokens[1].replace(/[^a-zA-Z-]/g, '');
    if (genus && species && species.toLowerCase() !== 'sp' && species.toLowerCase() !== 'spp') {
      return `${genus.charAt(0).toUpperCase() + genus.slice(1).toLowerCase()} ${species.toLowerCase()}`;
    }
    return genus.charAt(0).toUpperCase() + genus.slice(1).toLowerCase();
  }
  return tokens[0] || trimmed;
}

/**
 * Comprehensive dictionary of Indian flora: trees, medicinal herbs, shrubs,
 * and wild plants commonly recorded across Indian ecosystems.
 */
export const INDIAN_FLORA_DICT = {
  // ── Figs & Moraceae ──────────────────────────────────────────────
  'Ficus hispida': {
    common: 'Hairy Fig / Kala Umbar',
    kn: 'ಕಾಡತ್ತಿ (Kadaththi / Adavi Atti)',
    hi: 'कठूमर / काला उंबर (Kala Umbar)',
    ta: 'பேயத்தி (Peyathi)',
    te: 'బొమ్మేడి (Bommedi)',
    sa: 'काकोदुम्बरिका (Kakodumbarika)',
    familyKn: 'ಅತ್ತಿ ಕುಟುಂಬ (Moraceae)',
  },
  'Ficus microcarpa': {
    common: 'Chinese Banyan / Laurel Fig',
    kn: 'ಕಾಡತ್ತಿ / ಕಲ್ಲಾಲ್ (Kaad-Athi / Kallal)',
    hi: 'चिलबोर / कामरूप (Chilbor)',
    ta: 'கல்லால் (Kal-Aal)',
    te: 'ప్లక్ష (Plaksha)',
    familyKn: 'ಅತ್ತಿ ಕುಟುಂಬ (Moraceae)',
  },
  'Ficus benghalensis': {
    common: 'Banyan Tree',
    kn: 'ಆಲದ ಮರ (Ala Mara)',
    hi: 'बरगद / बड़ (Bargad)',
    ta: 'ஆலமரம் (Aalamaram)',
    te: 'మర్రి చెట్టు (Marri Chettu)',
    sa: 'न्यग्रोध / वट (Nyagrodha)',
    familyKn: 'ಅತ್ತಿ ಕುಟುಂಬ (Moraceae)',
  },
  'Ficus religiosa': {
    common: 'Sacred Fig / Peepal Tree',
    kn: 'ಅರಳಿ ಮರ (Arali Mara)',
    hi: 'पीपल (Peepal)',
    ta: 'அரசமரம் (Arasa Maram)',
    te: 'రావి చెట్టు (Raavi Chettu)',
    sa: 'अश्वत्थ (Ashvattha)',
    familyKn: 'ಅತ್ತಿ ಕುಟುಂಬ (Moraceae)',
  },
  'Ficus auriculata': {
    common: 'Roxburgh Fig / Elephant Ear Fig',
    kn: 'ದೊಡ್ಡ ಅತ್ತಿ (Dodda Atti)',
    hi: 'तिमला (Timla)',
    ta: 'பெரு அத்தி (Peru Athi)',
    sa: 'रोहिणी (Rohini)',
    familyKn: 'ಅತ್ತಿ ಕುಟುಂಬ (Moraceae)',
  },
  'Ficus racemosa': {
    common: 'Cluster Fig / Gular',
    kn: 'ಅತ್ತಿ ಮರ (Atti Mara)',
    hi: 'गूलर (Gular)',
    ta: 'அத்தி (Atti)',
    te: 'మేడి చెట్టు (Medi Chettu)',
    sa: 'उदुम्बर (Udumbara)',
    familyKn: 'ಅತ್ತಿ ಕುಟುಂಬ (Moraceae)',
  },
  'Ficus elastica': {
    common: 'Rubber Fig',
    kn: 'ರಬ್ಬರ್ ಅತ್ತಿ (Rubber Atti)',
    hi: 'रबड़ अंजीर (Rubber Fig)',
    ta: 'சீமை அத்தி (Seemai Atti)',
    familyKn: 'ಅತ್ತಿ ಕುಟುಂಬ (Moraceae)',
  },
  'Ficus krishnae': {
    common: "Krishna's Butter Cup Fig",
    kn: 'ಕೃಷ್ಣನ ಬೆಣ್ಣೆ ಬಟ್ಟಲು (Krishna Battalu)',
    hi: 'कृष्ण वट (Krishna Vat)',
    sa: 'कृष्णवट (Krishnavata)',
    familyKn: 'ಅತ್ತಿ ಕುಟುಂಬ (Moraceae)',
  },
  'Ficus virens': {
    common: 'White Fig / Pilkhan',
    kn: 'ಬಸರಿ ಮರ (Basari Mara)',
    hi: 'पिलखन (Pilkhan)',
    sa: 'प्लक्षक (Plakshaka)',
    familyKn: 'ಅತ್ತಿ ಕುಟುಂಬ (Moraceae)',
  },
  'Ficus exasperata': {
    common: 'Sandpaper Fig',
    kn: 'ಗರ್ಗತ್ತಿ (Gargatti)',
    hi: 'खरपतरा (Kharpatra)',
    familyKn: 'ಅತ್ತಿ ಕುಟುಂಬ (Moraceae)',
  },

  // ── Western Ghats & Deccan Timber Trees ──────────────────────────
  'Tectona grandis': {
    common: 'Teak Tree',
    kn: 'ತೇಗದ ಮರ / ಸಾಗವಾನಿ (Thega / Saagwani)',
    hi: 'सागवान / सागौन (Sagwan)',
    ta: 'தேக்கு (Thekku)',
    te: 'టేకు (Teku)',
    sa: 'शाक (Shaka)',
    familyKn: 'ತೇಗದ ಕುಟುಂಬ (Lamiaceae)',
  },
  'Zanthoxylum asiaticum': {
    common: 'Asian Prickly Ash / Lopez Root',
    kn: 'ಜುಮ್ಮಿನ ಮರ / ಮಚಾಳೆ (Jummina Mara)',
    hi: 'तेजबल (Tejbal)',
    ta: 'காட்டுமிளகு (Kaatu Milagu)',
    te: 'మిరపకాయచెట్టు (Mirapakaya)',
    sa: 'दहन (Dahana)',
    familyKn: 'ಕಿತ್ತಳೆ ಕುಟುಂಬ (Rutaceae)',
  },
  'Toddalia asiatica': {
    common: 'Orange Climber / Lopez Root',
    kn: 'ಕಾಡು ಮೆಣಸು / ಮಚಾಳೆ (Kaadu Menasu)',
    hi: 'जंगलीजलेबी (Jangli Jalebi)',
    ta: 'காட்டுமிளகு (Kaatu Milagu)',
  },
  'Kigelia africana': {
    common: 'Sausage Tree',
    kn: 'ಮರ ಸೌತೆ / ಆನೆತೊಂಡೆ (Mara Southe / Aane Thonde)',
    hi: 'बालम खीरा (Balam Kheera)',
    ta: 'யானைப் பலம் (Yaanai Palam)',
    te: 'ఏనుగు కాయ (Enugu Kaya)',
    familyKn: 'ಬಿಗ್ನೋನಿಯಾ ಕುಟುಂಬ (Bignoniaceae)',
  },
  'Azadirachta indica': {
    common: 'Neem Tree / Indian Lilac',
    kn: 'ಬೇವಿನ ಮರ (Bevu / Bévina Mara)',
    hi: 'नीम (Neem)',
    ta: 'வேம்பு (Veppamaram)',
    te: 'వేప చెట్టు (Vepa Chettu)',
    sa: 'निम्ब (Nimba)',
  },
  'Melia azedarach': {
    common: 'Bead Tree / Persian Lilac',
    kn: 'ಹುಸಿ ಬೇವು / ಕಾಡುಬೇವು (Husi Bevu)',
    hi: 'बकायन (Bakayan)',
    ta: 'மலைவேம்பு (Malaivembu)',
  },
  'Mangifera indica': {
    common: 'Mango Tree',
    kn: 'ಮಾವಿನ ಮರ (Mavina Mara)',
    hi: 'आम (Aam)',
    ta: 'மாமரம் (Maamaram)',
    te: 'మామిడి (Mamidi)',
    sa: 'आम्र (Aamra)',
  },
  'Santalum album': {
    common: 'Indian Sandalwood',
    kn: 'ಶ್ರೀಗಂಧ / ಗಂಧದ ಮರ (Srigandha / Gandhada Mara)',
    hi: 'श्वेत चंदन (Chandan)',
    ta: 'சந்தனம் (Santhanam)',
    te: 'చందనం (Chandanam)',
    sa: 'चन्दन (Chandana)',
  },
  'Pongamia pinnata': {
    common: 'Pongam / Indian Beech',
    kn: 'ಹೊಂಗೆ ಮರ (Honge Mara)',
    hi: 'करंज (Karanj)',
    ta: 'புங்கை (Pungai)',
    te: 'కానుగ (Kanuga)',
    sa: 'करञ्ज (Karanja)',
  },
  'Millettia pinnata': {
    common: 'Indian Beech / Pongam Oil Tree',
    kn: 'ಹೊಂಗೆ ಮರ (Honge Mara)',
    hi: 'करंज (Karanj)',
    ta: 'புங்கை (Pungai)',
    te: 'కానుగ (Kanuga)',
  },
  'Cassia fistula': {
    common: 'Golden Shower Tree',
    kn: 'ಕಕ್ಕೆ ಮರ (Kakke Mara)',
    hi: 'अमलतास (Amaltas)',
    ta: 'கொன்றை (Konrai)',
    te: 'రేల (Rela)',
    sa: 'आरग्वध (Aragvadha)',
  },
  'Delonix regia': {
    common: 'Gulmohar / Royal Poinciana',
    kn: 'ಗುಲ್ಮೊಹರ್ (Gulmohar)',
    hi: 'गुलमोहर (Gulmohar)',
    ta: 'செம்மயிர்க்கொன்றை (Semmayirkondrai)',
  },
  'Syzygium cumini': {
    common: 'Jamun / Black Plum',
    kn: 'ನೇರಳೆ ಮರ (Nerale Mara)',
    hi: 'जामुन (Jamun)',
    ta: 'நாவல் (Naaval)',
    te: 'నేరేడు (Neredu)',
    sa: 'जम्बू (Jambu)',
  },
  'Tamarindus indica': {
    common: 'Tamarind Tree',
    kn: 'ಹುಣಸೆ ಮರ (Hunase Mara)',
    hi: 'इमली (Imli)',
    ta: 'புளியமரம் (Puliya Maram)',
    te: 'చింత చెట్టు (Chinta Chettu)',
    sa: 'तिन्तिडीक (Tintidika)',
  },
  'Artocarpus heterophyllus': {
    common: 'Jackfruit Tree',
    kn: 'ಹಲಸಿನ ಮರ (Halasina Mara)',
    hi: 'कटहल (Kathal)',
    ta: 'பலாமரம் (Palaa Maram)',
    te: 'పనస చెట్టు (Panasa)',
    sa: 'पनस (Panasa)',
  },
  'Artocarpus hirsutus': {
    common: 'Wild Jack',
    kn: 'ಹೆಬ್ಬಲಸು (Hebbalasu)',
    ta: 'அயனிப்பலா (Ayanipalaa)',
    ml: 'ആഞ്ഞിലി (Aanjili)',
  },
  'Terminalia arjuna': {
    common: 'Arjuna Tree',
    kn: 'ಮದ್ದಿ ಮರ / ಹೊಳೆಮತ್ತಿ (Maddi Mara)',
    hi: 'अर्जुन (Arjun)',
    ta: 'மருதமரம் (Marudhamaram)',
    te: 'తెల్ల మద్ది (Tella Maddi)',
    sa: 'अर्जुन (Arjuna)',
  },
  'Terminalia chebula': {
    common: 'Haritaki / Myrobalan',
    kn: 'ಅಳಲೆ ಕಾಯಿ ಮರ (Alale Kayi)',
    hi: 'हरड़ (Harad)',
    ta: 'கடுக்காய் (Kadukkai)',
    sa: 'हरीतकी (Haritaki)',
  },
  'Terminalia bellirica': {
    common: 'Baheda / Beach Almond',
    kn: 'ಶಾಂತಿ ಮರ / ತಾರೆ (Shanti Mara / Tare)',
    hi: 'बहेड़ा (Baheda)',
    ta: 'தான்றிக்காய் (Thandrikkai)',
    sa: 'बिभीतक (Bibhitaka)',
  },
  'Phyllanthus emblica': {
    common: 'Indian Gooseberry / Amla',
    kn: 'ನೆಲ್ಲಿಕಾಯಿ ಮರ (Nellikayi Mara)',
    hi: 'आँवला (Amla)',
    ta: 'நெல்லி (Nelli)',
    te: 'ఉసిరి (Usiri)',
    sa: 'आमलकी (Amalaki)',
  },
  'Emblica officinalis': {
    common: 'Indian Gooseberry / Amla',
    kn: 'ನೆಲ್ಲಿಕಾಯಿ ಮರ (Nellikayi Mara)',
    hi: 'आँवला (Amla)',
    ta: 'நெல்லி (Nelli)',
    te: 'ఉసిరి (Usiri)',
  },
  'Aegle marmelos': {
    common: 'Bael / Golden Apple',
    kn: 'ಬಿಲ್ವಪತ್ರೆ ಮರ / ಬೇಲ (Bilvapatre / Bela)',
    hi: 'बेल (Bel)',
    ta: 'வில்வமரம் (Vilvam)',
    te: 'మారేడు (Maredu)',
    sa: 'बिल्व (Bilva)',
  },
  'Moringa oleifera': {
    common: 'Drumstick Tree / Moringa',
    kn: 'ನುಗ್ಗೆಕಾಯಿ ಮರ (Nuggekayi Mara)',
    hi: 'सहजन / मुनगा (Sahjan)',
    ta: 'முருங்கை (Murungai)',
    te: 'మునగ (Munaga)',
    sa: 'शिग्रु (Shigru)',
  },
  'Calotropis gigantea': {
    common: 'Crown Flower / Giant Milkweed',
    kn: 'ಎಕ್ಕದ ಗಿಡ (Ekkada Gida)',
    hi: 'मदार / आक (Aak)',
    ta: 'எருக்கு (Erukku)',
    te: 'జిల్లేడు (Jilledu)',
    sa: 'अर्क (Arka)',
  },
  'Calotropis procera': {
    common: 'Rubber Bush / Sodom Apple',
    kn: 'ಕಿರು ಎಕ್ಕ (Kiru Ekka)',
    hi: 'आकड़ा (Aakada)',
  },
  'Murraya koenigii': {
    common: 'Curry Leaf Tree',
    kn: 'ಕರಿಬೇವು (Karibevu)',
    hi: 'कढ़ी पत्ता (Kadi Patta)',
    ta: 'கறிவேப்பிலை (Kariveppilai)',
    te: 'కరివేపాకు (Karivepaku)',
    sa: 'कालशाक (Kalashaka)',
  },
  'Cocos nucifera': {
    common: 'Coconut Palm',
    kn: 'ತೆಂಗಿನ ಮರ (Tengina Mara)',
    hi: 'नारियल (Nariyal)',
    ta: 'தென்னை மரம் (Thennai Maram)',
    te: 'కొబ్బరి చెట్టు (Kobbari)',
    sa: 'नारिकेल (Narikela)',
  },
  'Bambusa vulgaris': {
    common: 'Common Bamboo',
    kn: 'ಬಿದಿರು (Biduru)',
    hi: 'बांस (Baans)',
    ta: 'மூங்கில் (Moongil)',
    te: 'వెదురు (Veduru)',
    sa: 'वंश (Vamsha)',
  },
  'Butea monosperma': {
    common: 'Flame of the Forest / Palash',
    kn: 'ಮುತ್ತುಗ ಮರ (Muttuga Mara)',
    hi: 'पलाश / ढाक (Palash)',
    ta: 'புரசு / முருக்கு (Purasu)',
    te: 'మోదుగ (Moduga)',
    sa: 'पलाश (Palasha)',
  },
  'Albizia lebbeck': {
    common: "Siris / Woman's Tongue",
    kn: 'ಬಾಗೆ ಮರ (Bage Mara)',
    hi: 'शिरीष (Shirish)',
    ta: 'வாகை (Vaagai)',
    sa: 'शिरीष (Shirisha)',
  },
  'Samanea saman': {
    common: 'Rain Tree',
    kn: 'ಮಳೆ ಮರ (Male Mara)',
    hi: 'विलायती सिरिस (Vilayati Siris)',
    ta: 'தூங்குமூஞ்சி மரம் (Thoongumoonji)',
  },
  'Albizia saman': {
    common: 'Rain Tree',
    kn: 'ಮಳೆ ಮರ (Male Mara)',
    hi: 'विलायती सिरिस (Vilayati Siris)',
  },
  'Bauhinia variegata': {
    common: 'Orchid Tree / Kachnar',
    kn: 'ಬಸವನಪಾದ (Basavanapada)',
    hi: 'कचनार (Kachnar)',
    ta: 'மந்தாரை (Mandharai)',
    sa: 'काञ्चनार (Kanchanara)',
  },
  'Swietenia mahagoni': {
    common: 'West Indian Mahogany',
    kn: 'ಮಹಾಗನಿ ಮರ (Mahagani Mara)',
    hi: 'महोगनी (Mahogany)',
  },
  'Grevillea robusta': {
    common: 'Silver Oak',
    kn: 'ರೌಪ್ಯ ಓಕ್ ಮರ (Roupya Oak)',
    hi: 'सिल्वर ओक (Silver Oak)',
  },
  'Polyalthia longifolia': {
    common: 'Mast Tree / False Ashoka',
    kn: 'ಅಶೋಕ ಮರ (Asoka Mara)',
    hi: 'उल्टा अशोक (Ulta Ashok)',
    ta: 'நெட்டிலிங்கம் (Netilinkam)',
  },
  'Saraca asoca': {
    common: 'True Ashoka Tree',
    kn: 'ಸೀತಾ ಅಶೋಕ (Sita Ashoka)',
    hi: 'सीता अशोक (Sita Ashok)',
    ta: 'அசோகம் (Asogam)',
    sa: 'अशोक (Ashoka)',
  },
  'Jacaranda mimosifolia': {
    common: 'Blue Jacaranda',
    kn: 'ನೀಲಿ ಗುಲ್ಮೊಹರ್ (Neeli Gulmohar)',
    hi: 'नीली गुलमोहर (Neeli Gulmohar)',
  },
  'Tabebuia rosea': {
    common: 'Pink Poui (Bengaluru Pink Blossom)',
    kn: 'ಗುಲಾಬಿ ಕಹಳೆ ಮರ (Gulabi Kahale Mara)',
    hi: 'गुलाबी तुरही (Gulabi Turahi)',
  },
  'Tabebuia aurea': {
    common: 'Caribbean Trumpet / Yellow Poui',
    kn: 'ಹಳದಿ ಕಹಳೆ ಮರ (Haladi Kahale Mara)',
    hi: 'पीली तुरही (Peeli Turahi)',
  },
  'Spathodea campanulata': {
    common: 'African Tulip Tree',
    kn: 'ಪಟಾಡಿ ಮರ (Patadi Mara)',
    hi: 'रुद्रपलाश (Rudrapalash)',
    ta: 'பஞ்சு மரம் (Panju Maram)',
  },
  'Alstonia scholaris': {
    common: "Blackboard Tree / Devil's Tree",
    kn: 'ಮದ್ದಾಳೆ / ಜಂತಾಲ (Maddale)',
    hi: 'सप्तपर्णी (Saptaparni)',
    ta: 'ஏழிலம்பாலை (Ezhilam Paalai)',
    sa: 'सप्तपर्ण (Saptaparna)',
  },
  'Mimusops elengi': {
    common: 'Spanish Cherry / Bakul',
    kn: 'ಪಗಡೆ ಮರ / ರಂಜಲು (Pagade Mara)',
    hi: 'बकुल / मौलश्री (Bakul)',
    ta: 'மகிழமரம் (Magizhamaram)',
    sa: 'बकुल (Bakula)',
  },
  'Madhuca longifolia': {
    common: 'Mahua / Butter Tree',
    kn: 'ಇಪ್ಪೆ ಮರ (Ippe Mara)',
    hi: 'महुआ (Mahua)',
    ta: 'இலுப்பை (Iluppai)',
    sa: 'मधूक (Madhuka)',
  },
  'Peltophorum pterocarpum': {
    common: 'Yellow Poinciana / Copperpod',
    kn: 'ಹಳದಿ ಗುಲ್ಮೊಹರ್ (Haladi Gulmohar)',
    hi: 'पीला गुलमोहर (Peela Gulmohar)',
    ta: 'பெருங்கொன்றை (Perunkondrai)',
  },
  'Couroupita guianensis': {
    common: 'Cannonball Tree / Nagalingam',
    kn: 'ನಾಗಲಿಂಗ ಪುಷ್ಪ ಮರ (Nagalinga Pushpa Mara)',
    hi: 'तोपगोला / नागकेशर (Topgola)',
    ta: 'நாகலிங்கம் (Nagalingam)',
    te: 'నాగలింగం (Nagalingam)',
  },
  'Pithecellobium dulce': {
    common: 'Manila Tamarind / Madras Thorn',
    kn: 'ಸೀಮೆ ಹುಣಸೆ (Seeme Hunase)',
    hi: 'जंगल जलेबी (Jungle Jalebi)',
    ta: 'கொடுக்காப்புளி (Kodukkapuli)',
    te: 'సీమ చింత (Seema Chinta)',
  },
  'Sesbania grandiflora': {
    common: 'Hummingbird Tree / Agathi',
    kn: 'ಅಗಸೆ ಮರ (Agase Mara)',
    hi: 'अगस्त्य (Agastya)',
    ta: 'அகத்தி (Agathi)',
  },
  'Ziziphus mauritiana': {
    common: 'Indian Jujube / Ber',
    kn: 'ಬೋರೆ ಮರ / ಎಲಚಿ (Bore Mara)',
    hi: 'बेर (Ber)',
    ta: 'இலந்தை (Ilanthai)',
    sa: 'बदरी (Badari)',
  },
  'Psidium guajava': {
    common: 'Guava Tree',
    kn: 'ಸೀಬೆ ಮರ / ಪೇರಲ (Seebe Mara)',
    hi: 'अमरूद (Amrood)',
    ta: 'கொய்யா (Koyya)',
  },
  'Punica granatum': {
    common: 'Pomegranate',
    kn: 'ದಾಳಿಂಬೆ (Dalimbe)',
    hi: 'अनार (Anaar)',
    ta: 'மாதுளை (Maadhulai)',
    sa: 'दाडिमी (Dadimi)',
  },
  'Carica papaya': {
    common: 'Papaya',
    kn: 'ಪರಂಗಿ ಹಣ್ಣು (Parangi Hannu)',
    hi: 'पपीता (Papita)',
    ta: 'பப்பாளி (Pappali)',
  },
  'Musa paradisiaca': {
    common: 'Banana / Plantain',
    kn: 'ಬಾಳೆ ಗಿಡ (Baale Gida)',
    hi: 'केला (Kela)',
    ta: 'வாழை (Vaazhai)',
    sa: 'कदली (Kadali)',
  },
  'Annona squamosa': {
    common: 'Sugar Apple / Custard Apple',
    kn: 'ಸೀತಾಫಲ (Seethaphala)',
    hi: 'सीताफल / शरीफा (Sitaphal)',
    ta: 'சீதாப்பழம் (Seethapazham)',
  },
  'Annona reticulata': {
    common: "Bullock's Heart / Ramphal",
    kn: 'ರಾಮಫಲ (Ramaphala)',
    hi: 'रामफल (Ramphal)',
    ta: 'ராமாப்பழம் (Ramapazham)',
  },
  'Annona muricata': {
    common: 'Soursop / Graviola',
    kn: 'ಲಕ್ಷ್ಮಣಫಲ (Lakshmanaphala)',
    hi: 'लक्ष्मण फल (Lakshman Phal)',
    ta: 'முள்ளுச்சீத்தா (Mulluseetha)',
  },
  'Nyctanthes arbor-tristis': {
    common: 'Night Jasmine / Coral Jasmine',
    kn: 'ಪಾರಿಜಾತ (Parijatha)',
    hi: 'पारिजात / हरसिंगार (Parijat)',
    ta: 'பவழமல்லி (Pavazhamalli)',
    sa: 'पारिजात (Parijata)',
  },
  'Jasminum sambac': {
    common: 'Arabian Jasmine / Mogra',
    kn: 'ಮಲ್ಲಿಗೆ (Mallige)',
    hi: 'मोगरा (Mogra)',
    ta: 'மல்லிகை (Malligai)',
    sa: 'मल्लिका (Mallika)',
  },
  'Hibiscus rosa-sinensis': {
    common: 'Shoeblackplant / China Rose',
    kn: 'ದಾಸವಾಳ (Dasavala)',
    hi: 'गुड़हल (Gudhal)',
    ta: 'செம்பருத்தி (Chemparuthi)',
    sa: 'जपा (Japa)',
  },
  'Plumeria rubra': {
    common: 'Frangipani / Temple Tree',
    kn: 'ದೇವಗಣಗಿಲೆ (Devaganagile)',
    hi: 'चंपा (Champa)',
    sa: 'चम्पक (Champaka)',
  },
  'Plumeria alba': {
    common: 'White Frangipani / Champa',
    kn: 'ಬಿಳಿ ದೇವಗಣಗಿಲೆ (Bili Devaganagile)',
    hi: 'सफेद चंपा (Safed Champa)',
  },
  'Michelia champaca': {
    common: 'Golden Champa',
    kn: 'ಸಂಪಿಗೆ ಮರ (Sampige Mara)',
    hi: 'चंपा (Champa)',
    ta: 'செண்பகம் (Senbagam)',
  },
  'Magnolia champaca': {
    common: 'Golden Champa',
    kn: 'ಸಂಪಿಗೆ ಮರ (Sampige Mara)',
    hi: 'चंपा (Champa)',
    ta: 'செண்பகம் (Senbagam)',
  },
  'Lawsonia inermis': {
    common: 'Henna / Mignonette Tree',
    kn: 'ಗೋರಂಟಿ (Goranti)',
    hi: 'मेहँदी (Mehendi)',
    ta: 'மருதாணி (Maruthani)',
  },
  'Catharanthus roseus': {
    common: 'Madagascar Periwinkle',
    kn: 'ನಿತ್ಯಕಲ್ಯಾಣಿ (Nityakalyani)',
    hi: 'सदाबहार (Sadabahar)',
    ta: 'நித்யகல்யாணி (Nithyakalyani)',
  },
  'Nerium oleander': {
    common: 'Oleander',
    kn: 'ಕಣಗಿಲೆ (Kanagile)',
    hi: 'कनेर (Kaner)',
    ta: 'அரளி (Arali)',
    sa: 'करवीर (Karavira)',
  },
  'Bougainvillea spectabilis': {
    common: 'Great Bougainvillea',
    kn: 'ಕಾಗದದ ಹೂವು (Kagada Hoovu)',
    hi: 'बोगनवेलिया (Bougainvillea)',
    ta: 'காகிதப்பூ (Kagidapoo)',
  },
  'Tridax procumbens': {
    common: 'Coatbuttons / Tridax Daisy',
    kn: 'ಗಬ್ಬು ಸಣ್ಣಸೇವಂತಿ (Gabbu Sannasevanthi)',
    hi: 'जयंती वेद (Jayanti)',
    ta: 'வெட்டுக்காயப் பூண்டு (Vettukayapoondu)',
    te: 'గడ్డి చామంతి (Gaddi Chamanti)',
  },
  'Parthenium hysterophorus': {
    common: 'Congress Grass / Carrot Grass',
    kn: 'ಕಾಂಗ್ರೆಸ್ ಗಿಡ (Congress Gida)',
    hi: 'गाजर घास / कांग्रेस घास (Gajar Ghas)',
    ta: 'காங்கிரஸ் புல் (Congress Pul)',
  },
  'Lantana camara': {
    common: 'Wild Sage / Lantana',
    kn: 'ರೋಜಾ ಗಿಡ / ಲಂಟಾನ (Lantana Gida)',
    hi: 'रायमुनिया (Raimuniya)',
    ta: 'உண்ணிச்செடி (Unnichedi)',
  },
  'Ricinus communis': {
    common: 'Castor Oil Plant',
    kn: 'ಔಡಲ / ಹರಳು ಗಿಡ (Oudala / Haralu)',
    hi: 'अरण्डी (Arandi)',
    ta: 'ஆமணக்கு (Aamanakku)',
    sa: 'एरण्ड (Eranda)',
  },
  'Withania somnifera': {
    common: 'Ashwagandha / Indian Ginseng',
    kn: 'ಅಶ್ವಗಂಧ (Ashwagandha)',
    hi: 'अश्वगंधा (Ashwagandha)',
    ta: 'அமுக்கிரா (Amukkira)',
    sa: 'अश्वगन्धा (Ashwagandha)',
  },
  'Centella asiatica': {
    common: 'Gotu Kola / Indian Pennywort',
    kn: 'ಒಂದೆಲಗ (Ondelaga)',
    hi: 'मंडूकपर्णी / ब्राह्मी (Mandukaparni)',
    ta: 'வல்லாரை (Vallarai)',
    sa: 'मण्डूकपर्णी (Mandukaparni)',
  },
  'Bacopa monnieri': {
    common: 'Water Hyssop / Brahmi',
    kn: 'ಬ್ರಾಹ್ಮೀ (Brahmi)',
    hi: 'ब्राह्मी (Brahmi)',
    ta: 'பிராமி (Brami)',
    sa: 'ब्राह्मी (Brahmi)',
  },
  'Tinospora cordifolia': {
    common: 'Heart-leaved Moonseed / Giloy',
    kn: 'ಅಮೃತ ಬಳ್ಳಿ (Amrutha Balli)',
    hi: 'गिलोय / गुडुची (Giloy)',
    ta: 'சீந்தில் கொடி (Seenthil Kodi)',
    sa: 'गुडूची (Guduchi)',
  },
  'Aloe vera': {
    common: 'Aloe Vera / Medicinal Aloe',
    kn: 'ಲೋಳೆ ಸರ (Lole Sara)',
    hi: 'घृतकुमारी (Ghritkumari)',
    ta: 'கற்றாழை (Katrazhai)',
    sa: 'घृतकुमारी (Ghritakumari)',
  },
  'Justicia adhatoda': {
    common: 'Malabar Nut / Vasaka',
    kn: 'ಆಡುಸೋಗೆ (Adusogae)',
    hi: 'अडूसा (Adusa)',
    ta: 'ஆடாதோடை (Aadathodai)',
    sa: 'वासक (Vasaka)',
  },
  'Andrographis paniculata': {
    common: 'King of Bitters / Kalmegh',
    kn: 'ನೆಲ ಬೇವು (Nela Bevu)',
    hi: 'कालमेघ (Kalmegh)',
    ta: 'நிலவேம்பு (Nilavembu)',
    sa: 'कालमेघ (Kalamegha)',
  },
  'Eclipta prostrata': {
    common: 'False Daisy / Bhringraj',
    kn: 'ಗರಗದ ಸೊಪ್ಪು (Garagada Soppu)',
    hi: 'भृंगराज (Bhringraj)',
    ta: 'கரிசலாங்கண்ணி (Karisalankanni)',
    sa: 'भृङ्गराज (Bhringaraja)',
  },
  'Eclipta alba': {
    common: 'False Daisy / Bhringraj',
    kn: 'ಗರಗದ ಸೊಪ್ಪು (Garagada Soppu)',
    hi: 'भृंगराज (Bhringraj)',
    ta: 'கரிசலாங்கண்ணி (Karisalankanni)',
  },
  'Leucas aspera': {
    common: 'Common Leucas / Thumba',
    kn: 'ತುಂಬೆ ಗಿಡ (Thumbe Gida)',
    hi: 'छोटा हलकुसा (Halkusa)',
    ta: 'தும்பை (Thumbai)',
    sa: 'द्रोणपुष्पी (Dronapushpi)',
  },
  'Ocimum tenuiflorum': {
    common: 'Holy Basil / Tulsi',
    kn: 'ಶ್ರೀ ತುಳಸಿ (Tulasi)',
    hi: 'तुलसी (Tulsi)',
    ta: 'துளசி (Thulasi)',
    sa: 'तुलसी (Tulasi)',
  },
  'Ocimum sanctum': {
    common: 'Holy Basil / Tulsi',
    kn: 'ಶ್ರೀ ತುಳಸಿ (Tulasi)',
    hi: 'तुलसी (Tulsi)',
    ta: 'துளசி (Thulasi)',
    sa: 'तुलसी (Tulasi)',
  },
  'Curcuma longa': {
    common: 'Turmeric Plant',
    kn: 'ಅರಿಶಿನ ಗಿಡ (Arishina)',
    hi: 'हल्दी (Haldi)',
    ta: 'மஞ்சள் (Manjal)',
    sa: 'हरिद्रा (Haridra)',
  },
  'Zingiber officinale': {
    common: 'Ginger Plant',
    kn: 'ಶುಂಠಿ ಗಿಡ (Shunti)',
    hi: 'अदरक (Adrak)',
    ta: 'இஞ்சி (Inji)',
    sa: 'आर्द्रक (Aardraka)',
  },
  'Cyperus rotundus': {
    common: 'Nut Grass / Purple Nutsedge',
    kn: 'ತುಂಗೆ ಹುಲ್ಲು (Tunge Hullu)',
    hi: 'नागरमोथा (Nagarmotha)',
    ta: 'கோரைக்கிழங்கு (Korai Kizhangu)',
    sa: 'मुस्ता (Musta)',
  },
  'Cynodon dactylon': {
    common: 'Bermuda Grass / Doob Grass',
    kn: 'ಗರಿಕೆ ಹುಲ್ಲು (Garike Hullu)',
    hi: 'दूब घास (Doob Ghas)',
    ta: 'அறுகம்புல் (Arugampul)',
    sa: 'दूर्वा (Durva)',
  },
  'Mimosa pudica': {
    common: 'Touch-Me-Not / Shameplant',
    kn: 'ಮುಟ್ಟಿದರೆ ಮುನಿ (Muttidare Muni)',
    hi: 'छुई-मुई (Chhui-Mui)',
    ta: 'தொட்டாற்சிணுங்கி (Thottal Sinungi)',
    sa: 'लज्जावती (Lajjawati)',
  },
  'Commelina benghalensis': {
    common: 'Bengal Dayflower',
    kn: 'ಕಣ್ಣ ದಿಡ್ಡಿನ ಸೊಪ್ಪು (Kanna Diddina Soppu)',
    hi: 'कनकव्वा (Kankavva)',
  },
  'Phyllanthus niruri': {
    common: 'Gale of the Wind / Stonebreaker',
    kn: 'ನೆಲನೆಲ್ಲಿ (Nelanelli)',
    hi: 'भूमि आंवला (Bhumiamla)',
    ta: 'கீழாநெல்லி (Keezhanelli)',
    sa: 'भूधात्री (Bhudhatri)',
  },
  'Clitoria ternatea': {
    common: 'Butterfly Pea / Shankhapushpi',
    kn: 'ಶಂಖಪುಷ್ಪ (Shankhapushpa)',
    hi: 'अपराजिता (Aparajita)',
    ta: 'சங்குப்பூ (Sangupoo)',
    sa: 'अपराजिता (Aparajita)',
  },
  'Areca catechu': {
    common: 'Areca Palm / Betel Nut',
    kn: 'ಅಡಿಕೆ ಮರ (Adike Mara)',
    hi: 'सुपारी (Supari)',
    ta: 'பாக்கு மரம் (Paakku Maram)',
    sa: 'पूग (Pooga)',
  },
  'Piper nigrum': {
    common: 'Black Pepper',
    kn: 'ಕರಿಮೆಣಸು (Karimenasu)',
    hi: 'काली मिर्च (Kali Mirch)',
    ta: 'மிளகு (Milagu)',
    sa: 'मरिच (Maricha)',
  },
  'Piper betle': {
    common: 'Betel Vine / Paan',
    kn: 'ವೀಳೆಯದೆಲೆ (Vileyadele)',
    hi: 'पान (Paan)',
    ta: 'வெற்றிலை (Vettilai)',
    sa: 'ताम्बूल (Tambula)',
  },
  'Dalbergia latifolia': {
    common: 'Indian Rosewood',
    kn: 'ಬೀಟೆ ಮರ (Beete Mara)',
    hi: 'शीशम (Shisham)',
    ta: 'ஈட்டி மரம் (Eetti Maram)',
  },
  'Dalbergia sissoo': {
    common: 'North Indian Rosewood / Shisham',
    kn: 'ಬಿರಡಿ ಮರ / ಶೀಶಮ್ (Biradi Mara)',
    hi: 'शीशम / टाहली (Shisham)',
    sa: 'शिंशपा (Shimshapa)',
  },
  'Pterocarpus marsupium': {
    common: 'Indian Kino Tree / Honne',
    kn: 'ಹೊನ್ನೆ ಮರ (Honne Mara)',
    hi: 'विजयसार (Vijaysar)',
    ta: 'வேங்கை (Vengai)',
    sa: 'बीजक (Bijaka)',
  },
  'Pterocarpus santalinus': {
    common: 'Red Sandalwood / Red Sanders',
    kn: 'ರಕ್ತ ಚಂದನ (Rakta Chandana)',
    hi: 'लाल चंदन (Lal Chandan)',
    ta: 'செஞ்சந்தனம் (Senchanthanam)',
    sa: 'रक्तचन्दन (Raktachandana)',
  },
  'Acacia nilotica': {
    common: 'Babul / Gum Arabic Tree',
    kn: 'ಕರಿ ಜಾಲಿ ಮರ (Kari Jaali Mara)',
    hi: 'बबूल / कीकर (Babul)',
    ta: 'கருவேலம் (Karuvelam)',
    sa: 'बब्बूल (Babbula)',
  },
  'Prosopis cineraria': {
    common: 'Khejri Tree / Shami',
    kn: 'ಬನ್ನಿ ಮರ (Banni Mara)',
    hi: 'खेजड़ी / शमी (Khejri)',
    ta: 'வன்னி மரம் (Vanni Maram)',
    sa: 'शमी (Shami)',
  },
  'Bombax ceiba': {
    common: 'Red Silk Cotton Tree / Semal',
    kn: 'ಬೂರುಗದ ಮರ (Booruga Mara)',
    hi: 'सेमल (Semal)',
    ta: 'இலவமரம் (Ilavamaram)',
    sa: 'शाल्मली (Shalmali)',
  },
  'Nelumbo nucifera': {
    common: 'Sacred Indian Lotus',
    kn: 'ಕಮಲ (Kamala)',
    hi: 'कमल (Kamal)',
    ta: 'தாமரை (Thamarai)',
    sa: 'पद्म (Padma)',
  },
};

/**
 * Genus-level fallback names when specific species isn't in dictionary.
 */
export const INDIAN_GENUS_DICT = {
  Ficus: { common: 'Fig Tree', kn: 'ಅತ್ತಿ / ಆಲದ ಮರ (Atti / Ala)', hi: 'अंजीर / बड़ (Fig)' },
  Acacia: { common: 'Acacia / Wattle', kn: 'ಜಾಲಿ ಮರ (Jaali Mara)', hi: 'बबूल (Babul)' },
  Eucalyptus: { common: 'Eucalyptus / Gum Tree', kn: 'ನೀಲಗಿರಿ ಮರ (Neelagiri Mara)', hi: 'नीलगिरी (Nilgiri)' },
  Syzygium: { common: 'Myrtle / Plum Tree', kn: 'ನೇರಳೆ ಮರ (Nerale)', hi: 'जामुन (Jamun)' },
  Terminalia: { common: 'Myrobalan Tree', kn: 'ಮದ್ದಿ / ಅಳಲೆ ಮರ (Maddi / Alale)', hi: 'अर्जुन / हरड़ (Terminalia)' },
  Artocarpus: { common: 'Jackfruit / Breadfruit', kn: 'ಹಲಸಿನ ಮರ (Halasu)', hi: 'कटहल (Kathal)' },
  Citrus: { common: 'Citrus Tree', kn: 'ಕಿತ್ತಳೆ / ಲಿಂಬೆ ಗಿಡ (Limbe / Kittale)', hi: 'नींबू / संतरा (Citrus)' },
  Bambusa: { common: 'Bamboo', kn: 'ಬಿದಿರು (Biduru)', hi: 'बांस (Baans)' },
  Jasminum: { common: 'Jasmine', kn: 'ಮಲ್ಲಿಗೆ (Mallige)', hi: 'चमेली / मोगरा (Jasmine)' },
  Ocimum: { common: 'Basil / Tulsi', kn: 'ತುಳಸಿ (Tulasi)', hi: 'तुलसी (Tulsi)' },
  Zanthoxylum: { common: 'Prickly Ash', kn: 'ಜುಮ್ಮಿನ ಗಿಡ (Jummina Gida)', hi: 'तेजबल (Tejbal)' },
  Plumeria: { common: 'Frangipani / Temple Tree', kn: 'ದೇವಗಣಗಿಲೆ (Devaganagile)', hi: 'चंपा (Champa)' },
  Bauhinia: { common: 'Mountain Ebony / Orchid Tree', kn: 'ಬಸವನಪಾದ (Basavanapada)', hi: 'कचनार (Kachnar)' },
  Albizia: { common: 'Siris Tree', kn: 'ಬಾಗೆ ಮರ (Bage Mara)', hi: 'शिरीष (Shirish)' },
  Dalbergia: { common: 'Rosewood', kn: 'ಬೀಟೆ ಮರ (Beete Mara)', hi: 'शीशम (Shisham)' },
  Pterocarpus: { common: 'Padauk / Kino Tree', kn: 'ಹೊನ್ನೆ ಮರ (Honne Mara)', hi: 'विजयसार (Vijaysar)' },
  Solanum: { common: 'Nightshade', kn: 'ಬದನೆ / ಗುಳ್ಳ ಗಿಡ (Gulla / Badane)', hi: 'बैंगन / भटैया (Solanum)' },
  Euphorbia: { common: 'Spurge / Milk Bush', kn: 'ಕಳ್ಳಿ ಗಿಡ (Kalli Gida)', hi: 'थूहर (Thuhar)' },
  Crotalaria: { common: 'Rattlepod', kn: 'ಗಿಜಿಗಿಜಿ ಗಿಡ (Gijigiji Gida)', hi: 'सनई (Sanai)' },
};

/**
 * Resolves a friendly localized name for a plant occurrence.
 * Prioritizes Kannada when coordinates are in Karnataka (or location name matches),
 * otherwise provides Hindi, Tamil, and English vernaculars.
 *
 * @param {{scientificName:string, vernacularName?:string|null, genus?:string|null, family?:string|null}} plant
 * @param {{lat?:number, lng?:number, locationName?:string}} [options]
 * @returns {{
 *   cleanScientific: string,
 *   commonName: string,
 *   primaryDisplay: string,
 *   regionalBadge: string|null,
 *   searchKeywords: string
 * }}
 */
export function resolveIndianFloraName(plant = {}, options = {}) {
  const rawSci = plant.scientificName || '';
  const cleanSci = cleanBotanicalName(rawSci);
  const genus = plant.genus || cleanSci.split(' ')[0] || '';
  const fam = plant.family || '';

  const lat = Number(options.lat);
  const lng = Number(options.lng);
  const locName = (options.locationName || '').toLowerCase();

  // Region detection
  const isKarnataka = (lat >= 11.5 && lat <= 18.5 && lng >= 74.0 && lng <= 78.8) ||
    /karnataka|bengaluru|bangalore|mysore|mysuru|mangaluru|mangalore|puttur|udupi|hubballi|hubli|belagavi|dharwad/i.test(locName);
  const isTamilNadu = (lat >= 8.0 && lat <= 13.6 && lng >= 76.2 && lng <= 80.4) ||
    /tamil|chennai|coimbatore|madurai|salem/i.test(locName);
  const isIndia = (lat >= 6.5 && lat <= 37.5 && lng >= 68.0 && lng <= 97.5) ||
    /india|bharat|bangalore|delhi|mumbai|chennai|kolkata|hyderabad|pune/i.test(locName) ||
    isKarnataka || isTamilNadu;

  const entry = INDIAN_FLORA_DICT[cleanSci] || null;
  const genusEntry = !entry && genus ? INDIAN_GENUS_DICT[genus] : null;

  let common = '';
  let primaryDisplay = '';
  let regionalBadge = null;
  const kwList = [rawSci, cleanSci, fam, genus];

  if (entry) {
    common = entry.common;
    kwList.push(common);
    if (entry.hi) kwList.push(entry.hi);
    if (entry.kn) kwList.push(entry.kn);
    if (entry.ta) kwList.push(entry.ta);
    if (entry.te) kwList.push(entry.te);
    if (entry.sa) kwList.push(entry.sa);

    if (isKarnataka && entry.kn) {
      primaryDisplay = `${common} · ${entry.kn}`;
      regionalBadge = 'ಕನ್ನಡ (Karnataka)';
    } else if (isTamilNadu && entry.ta) {
      primaryDisplay = `${common} · ${entry.ta}`;
      regionalBadge = 'தமிழ் (Tamil Nadu)';
    } else if (entry.hi) {
      primaryDisplay = `${common} · ${entry.hi}`;
      if (entry.kn) primaryDisplay += ` / ${entry.kn}`;
      regionalBadge = 'Indian Flora';
    } else {
      primaryDisplay = common;
    }
  } else if (genusEntry) {
    common = genusEntry.common;
    kwList.push(common);
    if (genusEntry.hi) kwList.push(genusEntry.hi);
    if (genusEntry.kn) kwList.push(genusEntry.kn);

    if (isKarnataka && genusEntry.kn) {
      primaryDisplay = `${common} · ${genusEntry.kn}`;
      regionalBadge = 'ಸ್ಥಳೀಯ ಸಸ್ಯ (Karnataka)';
    } else if (genusEntry.hi) {
      primaryDisplay = `${common} · ${genusEntry.hi}`;
      regionalBadge = 'Indian Flora';
    } else {
      primaryDisplay = `${common} (${cleanSci})`;
    }
  } else {
    // If GBIF provided an English or local vernacular name that isn't just the Latin name repeated
    const gbifVern = (plant.vernacularName || '').trim();
    const isRedundant = !gbifVern || gbifVern.toLowerCase() === rawSci.toLowerCase() || gbifVern.toLowerCase() === cleanSci.toLowerCase();

    if (!isRedundant) {
      common = gbifVern;
      primaryDisplay = gbifVern;
    } else {
      common = cleanSci;
      primaryDisplay = cleanSci;
    }
    kwList.push(common);
  }

  return {
    cleanScientific: cleanSci || rawSci,
    commonName: common,
    primaryDisplay,
    regionalBadge,
    searchKeywords: kwList.join(' ').toLowerCase(),
  };
}

