// ============================================================================
// INTERACTIVE HIGHWAY INSPECTOR — Highway Corridor Intelligence & Tracing
// ============================================================================
// - Detects major highways from reverse-geocode address, search query, or road clicks
// - Computes corridor origin, destination, total span, and relative location
// - Renders high-contrast Highway Shield badges in Location Details
// - 1-Click "Trace Corridor on Map": Renders glowing neon highway polyline on OpenLayers
// - 1-Click "Corridor Weather Forecast": Sends waypoints directly into Route Studio
// - Interactive Highway Inspector Modal with milestone waypoints and quick-fly navigation
// ============================================================================

import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import Point from "ol/geom/Point.js";
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from "ol/style.js";
import { fromLonLat, toLonLat } from "ol/proj.js";
import Overlay from "ol/Overlay.js";
import { haversineMeters } from "../modules/geo.js";

let appRef = null;
let highwayVectorLayer = null;
let activeTraceHighway = null;
let traceControlEl = null;

// Comprehensive Major Highways & Expressways Knowledge Base
export const HIGHWAY_DATABASE = {
  NH48: {
    id: "NH48",
    ref: "NH 48",
    type: "National Highway (Golden Quadrilateral)",
    name: "National Highway 48 (Delhi–Chennai Expressway Corridor)",
    shortName: "NH 48 (Delhi ➔ Chennai)",
    origin: "Delhi (Rao Tula Ram Marg)",
    destination: "Chennai, Tamil Nadu (Kathipara Junction)",
    lengthKm: 2807,
    lengthMi: 1744,
    lanes: "4 to 8 Lanes (Access-Controlled in sections)",
    states: ["Delhi", "Haryana", "Rajasthan", "Gujarat", "Maharashtra", "Karnataka", "Tamil Nadu"],
    description: "Major national highway connecting India's northern capital to the southern economic hub of Chennai, forming the western and south-western arms of the Golden Quadrilateral via Mumbai and Bengaluru.",
    waypoints: [
      { name: "New Delhi", lat: 28.6139, lng: 77.2090, role: "origin", km: 0 },
      { name: "Gurugram", lat: 28.4595, lng: 77.0266, km: 32 },
      { name: "Jaipur", lat: 26.9124, lng: 75.7873, km: 268 },
      { name: "Ajmer", lat: 26.4499, lng: 74.6399, km: 395 },
      { name: "Udaipur", lat: 24.5854, lng: 73.7125, km: 660 },
      { name: "Ahmedabad", lat: 23.0225, lng: 72.5714, km: 915 },
      { name: "Vadodara", lat: 22.3072, lng: 73.1812, km: 1025 },
      { name: "Surat", lat: 21.1702, lng: 72.8311, km: 1175 },
      { name: "Mumbai (Thane)", lat: 19.2183, lng: 72.9781, km: 1410 },
      { name: "Pune", lat: 18.5204, lng: 73.8567, km: 1560 },
      { name: "Satara", lat: 17.6805, lng: 73.9938, km: 1675 },
      { name: "Kolhapur", lat: 16.7050, lng: 74.2433, km: 1790 },
      { name: "Belagavi", lat: 15.8497, lng: 74.4977, km: 1895 },
      { name: "Hubballi-Dharwad", lat: 15.3647, lng: 75.1240, km: 1990 },
      { name: "Davanagere", lat: 14.4644, lng: 75.9218, km: 2130 },
      { name: "Tumakuru", lat: 13.3422, lng: 77.1017, km: 2335 },
      { name: "Bengaluru", lat: 12.9716, lng: 77.5946, km: 2405 },
      { name: "Hosur", lat: 12.7409, lng: 77.8253, km: 2445 },
      { name: "Krishnagiri", lat: 12.5186, lng: 78.2137, km: 2495 },
      { name: "Vaniyambadi", lat: 12.6825, lng: 78.6200, km: 2545 },
      { name: "Ambur", lat: 12.7904, lng: 78.7166, km: 2565 },
      { name: "Vellore", lat: 12.9165, lng: 79.1325, km: 2615 },
      { name: "Ranipet", lat: 12.9272, lng: 79.3330, km: 2640 },
      { name: "Kanchipuram", lat: 12.8342, lng: 79.7036, km: 2715 },
      { name: "Sriperumbudur", lat: 12.9675, lng: 79.9405, km: 2755 },
      { name: "Chennai (Kathipara)", lat: 13.0076, lng: 80.2045, role: "destination", km: 2807 }
    ]
  },
  NH44: {
    id: "NH44",
    ref: "NH 44",
    type: "National Highway (North–South Corridor)",
    name: "National Highway 44 (Srinagar–Kanyakumari Highway)",
    shortName: "NH 44 (Srinagar ➔ Kanyakumari)",
    origin: "Srinagar, Jammu & Kashmir",
    destination: "Kanyakumari, Tamil Nadu",
    lengthKm: 4112,
    lengthMi: 2555,
    lanes: "4 to 6 Lanes",
    states: ["Jammu & Kashmir", "Punjab", "Haryana", "Delhi", "Uttar Pradesh", "Madhya Pradesh", "Maharashtra", "Telangana", "Andhra Pradesh", "Karnataka", "Tamil Nadu"],
    description: "The longest major National Highway in India, forming the central North–South transportation lifeline connecting Kashmir to the southern tip at Cape Comorin.",
    waypoints: [
      { name: "Srinagar", lat: 34.0837, lng: 74.7973, role: "origin", km: 0 },
      { name: "Jammu", lat: 32.7266, lng: 74.8570, km: 260 },
      { name: "Pathankot", lat: 32.2643, lng: 75.6421, km: 370 },
      { name: "Jalandhar", lat: 31.3260, lng: 75.5762, km: 480 },
      { name: "Ludhiana", lat: 30.9010, lng: 75.8573, km: 540 },
      { name: "Ambala", lat: 30.3782, lng: 76.7767, km: 655 },
      { name: "Delhi", lat: 28.6139, lng: 77.2090, km: 860 },
      { name: "Agra", lat: 27.1767, lng: 78.0081, km: 1080 },
      { name: "Gwalior", lat: 26.2183, lng: 78.1828, km: 1200 },
      { name: "Jhansi", lat: 25.4484, lng: 78.5685, km: 1300 },
      { name: "Sagar", lat: 23.8388, lng: 78.7378, km: 1500 },
      { name: "Nagpur", lat: 21.1458, lng: 79.0882, km: 1880 },
      { name: "Adilabad", lat: 19.6641, lng: 78.5320, km: 2060 },
      { name: "Nizamabad", lat: 18.6725, lng: 78.0941, km: 2210 },
      { name: "Hyderabad", lat: 17.3850, lng: 78.4867, km: 2380 },
      { name: "Kurnool", lat: 15.8281, lng: 78.0373, km: 2595 },
      { name: "Anantapur", lat: 14.6819, lng: 77.6006, km: 2740 },
      { name: "Bengaluru", lat: 12.9716, lng: 77.5946, km: 2950 },
      { name: "Dharmapuri", lat: 12.1277, lng: 78.1579, km: 3085 },
      { name: "Salem", lat: 11.6643, lng: 78.1460, km: 3150 },
      { name: "Namakkal", lat: 11.2189, lng: 78.1674, km: 3205 },
      { name: "Karur", lat: 10.9601, lng: 78.0766, km: 3250 },
      { name: "Dindigul", lat: 10.3673, lng: 77.9803, km: 3330 },
      { name: "Madurai", lat: 9.9252, lng: 78.1198, km: 3390 },
      { name: "Virudhunagar", lat: 9.5680, lng: 77.9624, km: 3440 },
      { name: "Tirunelveli", lat: 8.7139, lng: 77.7567, km: 3530 },
      { name: "Kanyakumari", lat: 8.0883, lng: 77.5385, role: "destination", km: 4112 }
    ]
  },
  NH16: {
    id: "NH16",
    ref: "NH 16",
    type: "National Highway (Golden Quadrilateral East Coast)",
    name: "National Highway 16 (Kolkata–Chennai East Coast Corridor)",
    shortName: "NH 16 (Kolkata ➔ Chennai)",
    origin: "Dankuni (Kolkata), West Bengal",
    destination: "Chennai, Tamil Nadu",
    lengthKm: 1711,
    lengthMi: 1063,
    lanes: "4 to 6 Lanes",
    states: ["West Bengal", "Odisha", "Andhra Pradesh", "Tamil Nadu"],
    description: "Major arterial highway traversing the entire Bay of Bengal coastline, connecting West Bengal to Chennai through Odisha and Andhra Pradesh.",
    waypoints: [
      { name: "Kolkata (Dankuni)", lat: 22.6800, lng: 88.2900, role: "origin", km: 0 },
      { name: "Kharagpur", lat: 22.3460, lng: 87.2320, km: 125 },
      { name: "Balasore", lat: 21.4934, lng: 86.9135, km: 240 },
      { name: "Cuttack", lat: 20.4625, lng: 85.8828, km: 415 },
      { name: "Bhubaneswar", lat: 20.2961, lng: 85.8245, km: 445 },
      { name: "Brahmapur", lat: 19.3149, lng: 84.7941, km: 620 },
      { name: "Srikakulam", lat: 18.2949, lng: 83.8938, km: 770 },
      { name: "Visakhapatnam", lat: 17.6868, lng: 83.2185, km: 885 },
      { name: "Rajahmundry", lat: 17.0005, lng: 81.8040, km: 1080 },
      { name: "Vijayawada", lat: 16.5062, lng: 80.6480, km: 1240 },
      { name: "Guntur", lat: 16.3067, lng: 80.4365, km: 1275 },
      { name: "Ongole", lat: 15.5057, lng: 80.0499, km: 1385 },
      { name: "Nellore", lat: 14.4426, lng: 79.9865, km: 1515 },
      { name: "Chennai", lat: 13.0827, lng: 80.2707, role: "destination", km: 1711 }
    ]
  },
  NH66: {
    id: "NH66",
    ref: "NH 66",
    type: "National Highway (Konkan–Malabar Coastal Corridor)",
    name: "National Highway 66 (Mumbai–Kanyakumari Coastal Highway)",
    shortName: "NH 66 (Panvel ➔ Kanyakumari)",
    origin: "Panvel (Navi Mumbai), Maharashtra",
    destination: "Kanyakumari, Tamil Nadu",
    lengthKm: 1608,
    lengthMi: 999,
    lanes: "4 to 6 Lanes (Scenic Coastal)",
    states: ["Maharashtra", "Goa", "Karnataka", "Kerala", "Tamil Nadu"],
    description: "Spectacular western coastal corridor winding along the Arabian Sea and Western Ghats, passing through Konkan, Goa, Karwar, Mangaluru, and the entire Kerala coast.",
    waypoints: [
      { name: "Panvel (Mumbai)", lat: 18.9894, lng: 73.1175, role: "origin", km: 0 },
      { name: "Chiplun", lat: 17.5323, lng: 73.5181, km: 240 },
      { name: "Ratnagiri", lat: 16.9902, lng: 73.3120, km: 330 },
      { name: "Panaji (Goa)", lat: 15.4909, lng: 73.8278, km: 520 },
      { name: "Karwar", lat: 14.8185, lng: 74.1300, km: 615 },
      { name: "Gokarna Cross", lat: 14.5479, lng: 74.3188, km: 670 },
      { name: "Udupi", lat: 13.3409, lng: 74.7421, km: 805 },
      { name: "Mangaluru", lat: 12.9141, lng: 74.8560, km: 865 },
      { name: "Kasaragod", lat: 12.5102, lng: 74.9852, km: 915 },
      { name: "Kannur", lat: 11.8745, lng: 75.3704, km: 1005 },
      { name: "Kozhikode", lat: 11.2588, lng: 75.7804, km: 1095 },
      { name: "Thrissur", lat: 10.5276, lng: 76.2144, km: 1215 },
      { name: "Kochi (Ernakulam)", lat: 9.9312, lng: 76.2673, km: 1290 },
      { name: "Alappuzha", lat: 9.4981, lng: 76.3388, km: 1350 },
      { name: "Kollam", lat: 8.8932, lng: 76.6141, km: 1435 },
      { name: "Thiruvananthapuram", lat: 8.5241, lng: 76.9366, km: 1510 },
      { name: "Kanyakumari", lat: 8.0883, lng: 77.5385, role: "destination", km: 1608 }
    ]
  },
  NH27: {
    id: "NH27",
    ref: "NH 27",
    type: "National Highway (East–West Corridor)",
    name: "National Highway 27 (Porbandar–Silchar East–West Lifeline)",
    shortName: "NH 27 (Porbandar ➔ Silchar)",
    origin: "Porbandar, Gujarat",
    destination: "Silchar, Assam",
    lengthKm: 3507,
    lengthMi: 2179,
    lanes: "4 Lanes",
    states: ["Gujarat", "Rajasthan", "Madhya Pradesh", "Uttar Pradesh", "Bihar", "West Bengal", "Assam"],
    description: "The primary East–West national highway spanning the breadth of India from the Arabian Sea coast of Gujarat across northern and eastern plains into Assam.",
    waypoints: [
      { name: "Porbandar", lat: 21.6417, lng: 69.6293, role: "origin", km: 0 },
      { name: "Rajkot", lat: 22.3039, lng: 70.8022, km: 180 },
      { name: "Samakhiali", lat: 23.3039, lng: 70.5218, km: 310 },
      { name: "Palanpur", lat: 24.1724, lng: 72.4346, km: 540 },
      { name: "Abu Road", lat: 24.4826, lng: 72.7831, km: 590 },
      { name: "Udaipur", lat: 24.5854, lng: 73.7125, km: 740 },
      { name: "Chittorgarh", lat: 24.8887, lng: 74.6269, km: 855 },
      { name: "Kota", lat: 25.2138, lng: 75.8648, km: 1010 },
      { name: "Shivpuri", lat: 25.4262, lng: 77.6596, km: 1235 },
      { name: "Jhansi", lat: 25.4484, lng: 78.5685, km: 1335 },
      { name: "Kanpur", lat: 26.4499, lng: 80.3319, km: 1560 },
      { name: "Lucknow", lat: 26.8467, lng: 80.9462, km: 1640 },
      { name: "Ayodhya", lat: 26.7922, lng: 82.1998, km: 1775 },
      { name: "Gorakhpur", lat: 26.7606, lng: 83.3732, km: 1910 },
      { name: "Muzaffarpur", lat: 26.1209, lng: 85.3647, km: 2150 },
      { name: "Darbhanga", lat: 26.1542, lng: 85.8918, km: 2215 },
      { name: "Purnia", lat: 25.7771, lng: 87.4753, km: 2390 },
      { name: "Siliguri", lat: 26.7271, lng: 88.3953, km: 2565 },
      { name: "Guwahati", lat: 26.1445, lng: 91.7362, km: 3040 },
      { name: "Nagaon", lat: 26.3464, lng: 92.6840, km: 3160 },
      { name: "Silchar", lat: 24.8333, lng: 92.7789, role: "destination", km: 3507 }
    ]
  },
  NH75: {
    id: "NH75",
    ref: "NH 75",
    type: "National Highway (Port-to-Capital Corridor)",
    name: "National Highway 75 (Bantwal/Mangaluru–Vellore Highway)",
    shortName: "NH 75 (Mangaluru ➔ Bengaluru ➔ Vellore)",
    origin: "Bantwal (Mangaluru), Karnataka",
    destination: "Vellore, Tamil Nadu",
    lengthKm: 533,
    lengthMi: 331,
    lanes: "4 to 6 Lanes",
    states: ["Karnataka", "Tamil Nadu"],
    description: "Crucial economic artery crossing the Western Ghats (Shiradi Ghat) connecting Karnataka's major seaport at Mangaluru with Hassan, Bengaluru, Kolar, and Vellore.",
    waypoints: [
      { name: "Bantwal (Mangaluru)", lat: 12.8906, lng: 75.0344, role: "origin", km: 0 },
      { name: "Uppinangady", lat: 12.8375, lng: 75.3125, km: 45 },
      { name: "Sakleshpur", lat: 12.9733, lng: 75.7878, km: 130 },
      { name: "Hassan", lat: 13.0072, lng: 76.0962, km: 170 },
      { name: "Kunigal", lat: 13.0238, lng: 77.0272, km: 275 },
      { name: "Nelamangala", lat: 13.0973, lng: 77.3917, km: 320 },
      { name: "Bengaluru (Hebbal/KR Puram)", lat: 13.0358, lng: 77.5970, km: 350 },
      { name: "Hoskote", lat: 13.0709, lng: 77.7981, km: 375 },
      { name: "Kolar", lat: 13.1367, lng: 78.1291, km: 420 },
      { name: "Mulbagal", lat: 13.1633, lng: 78.3944, km: 450 },
      { name: "Vellore", lat: 12.9165, lng: 79.1325, role: "destination", km: 533 }
    ]
  },
  NH40: {
    id: "NH40",
    ref: "NH 40",
    type: "National Highway (Rayalaseema Corridor)",
    name: "National Highway 40 (Kurnool–Kadapa–Chittoor–Ranipet)",
    shortName: "NH 40 (Kurnool ➔ Ranipet)",
    origin: "Kurnool, Andhra Pradesh",
    destination: "Ranipet, Tamil Nadu",
    lengthKm: 408,
    lengthMi: 254,
    lanes: "4 Lanes",
    states: ["Andhra Pradesh", "Tamil Nadu"],
    description: "Major National Highway connecting Kurnool in north Rayalaseema through Nandyal, Kadapa, Rayachoti, Pileru, and Chittoor to Ranipet in Tamil Nadu.",
    waypoints: [
      { name: "Kurnool", lat: 15.8281, lng: 78.0373, role: "origin", km: 0 },
      { name: "Nandyal", lat: 15.4870, lng: 78.4842, km: 74 },
      { name: "Allagadda", lat: 15.1320, lng: 78.5130, km: 114 },
      { name: "Mydukur", lat: 14.7330, lng: 78.6830, km: 160 },
      { name: "Kadapa", lat: 14.4673, lng: 78.8242, km: 195 },
      { name: "Guvvalacheruvu", lat: 14.3000, lng: 78.8500, km: 220 },
      { name: "Rayachoti", lat: 14.0560, lng: 78.7520, km: 250 },
      { name: "Kalakada", lat: 13.8800, lng: 78.7800, km: 280 },
      { name: "Pileru", lat: 13.6540, lng: 78.9380, km: 310 },
      { name: "Chittoor", lat: 13.2172, lng: 79.1003, km: 365 },
      { name: "Ranipet", lat: 12.9272, lng: 79.3330, role: "destination", km: 408 }
    ]
  },
  NH42: {
    id: "NH42",
    ref: "NH 42",
    type: "National Highway",
    name: "National Highway 42 (Jolarpettai–Kuppam–Punganur–Madanapalle–Anantapur)",
    shortName: "NH 42 (Jolarpettai ➔ Anantapur)",
    origin: "Jolarpettai, Tamil Nadu",
    destination: "Anantapur, Andhra Pradesh",
    lengthKm: 342,
    lengthMi: 212,
    lanes: "2 to 4 Lanes",
    states: ["Tamil Nadu", "Andhra Pradesh"],
    description: "Connects northern Tamil Nadu via Kuppam, Punganur, and Madanapalle with Kadiri and Anantapur in central Andhra Pradesh.",
    waypoints: [
      { name: "Jolarpettai", lat: 12.5650, lng: 78.5770, role: "origin", km: 0 },
      { name: "Kuppam", lat: 12.7500, lng: 78.3670, km: 38 },
      { name: "Punganur", lat: 13.3660, lng: 78.5800, km: 110 },
      { name: "Madanapalle", lat: 13.5560, lng: 78.5010, km: 140 },
      { name: "Kadiri", lat: 14.1160, lng: 78.1660, km: 220 },
      { name: "Mudigubba", lat: 14.3400, lng: 77.9800, km: 260 },
      { name: "Anantapur", lat: 14.6819, lng: 77.6006, role: "destination", km: 342 }
    ]
  },
  NH275: {
    id: "NH275",
    ref: "NH 275",
    type: "National Highway / Expressway",
    name: "National Highway 275 & Bengaluru–Mysuru Expressway",
    shortName: "NH 275 (Bengaluru ➔ Mysuru ➔ Bantwal)",
    origin: "Bengaluru, Karnataka",
    destination: "Bantwal (Mangaluru), Karnataka",
    lengthKm: 367,
    lengthMi: 228,
    lanes: "10 Lanes (Expressway section), 4 Lanes (Coorg section)",
    states: ["Karnataka"],
    description: "Features India's premier 10-lane access-controlled expressway between Bengaluru and Mysuru, continuing through the scenic coffee hills of Coorg to Bantwal.",
    waypoints: [
      { name: "Bengaluru (Kengeri)", lat: 12.9081, lng: 77.4851, role: "origin", km: 0 },
      { name: "Bidadi", lat: 12.7987, lng: 77.3828, km: 25 },
      { name: "Ramanagara", lat: 12.7214, lng: 77.2799, km: 45 },
      { name: "Channapatna", lat: 12.6518, lng: 77.2057, km: 60 },
      { name: "Maddur", lat: 12.5843, lng: 77.0450, km: 80 },
      { name: "Mandya", lat: 12.5218, lng: 76.8951, km: 100 },
      { name: "Srirangapatna", lat: 12.4238, lng: 76.6946, km: 125 },
      { name: "Mysuru", lat: 12.2958, lng: 76.6394, km: 140 },
      { name: "Hunsur", lat: 12.3082, lng: 76.2891, km: 185 },
      { name: "Kushalnagar (Coorg)", lat: 12.4634, lng: 75.9602, km: 230 },
      { name: "Madikeri", lat: 12.4244, lng: 75.7382, km: 260 },
      { name: "Sulya", lat: 12.5630, lng: 75.3887, km: 310 },
      { name: "Bantwal", lat: 12.8906, lng: 75.0344, role: "destination", km: 367 }
    ]
  },
  MPE: {
    id: "MPE",
    ref: "Mumbai–Pune Expressway",
    type: "Access-Controlled Expressway",
    name: "Yashwantrao Chavan Mumbai–Pune Expressway",
    shortName: "Mumbai ➔ Pune Expressway",
    origin: "Kalamboli (Navi Mumbai), Maharashtra",
    destination: "Kiwale (Pune), Maharashtra",
    lengthKm: 94.5,
    lengthMi: 58.7,
    lanes: "6 Lanes + Grade Separated",
    states: ["Maharashtra"],
    description: "India's first 6-lane high-speed concrete expressway slicing through the Sahyadri ghats with scenic tunnels and viaducts.",
    waypoints: [
      { name: "Kalamboli (Navi Mumbai)", lat: 19.0300, lng: 73.1000, role: "origin", km: 0 },
      { name: "Khalapur Toll", lat: 18.8250, lng: 73.2850, km: 35 },
      { name: "Khandala Ghats", lat: 18.7610, lng: 73.3720, km: 55 },
      { name: "Lonavala", lat: 18.7557, lng: 73.4091, km: 62 },
      { name: "Urse Toll", lat: 18.7080, lng: 73.6650, km: 82 },
      { name: "Kiwale (Pune)", lat: 18.6500, lng: 73.7400, role: "destination", km: 94.5 }
    ]
  },
  AH43: {
    id: "AH43",
    ref: "AH 43",
    type: "Asian Highway International Network",
    name: "Asian Highway 43 (Agra–Nagpur–Bengaluru–Sri Lanka)",
    shortName: "AH 43 (Agra ➔ Sri Lanka)",
    origin: "Agra, Uttar Pradesh",
    destination: "Matale, Sri Lanka",
    lengthKm: 3024,
    lengthMi: 1879,
    lanes: "4 to 6 Lanes",
    states: ["Uttar Pradesh", "Madhya Pradesh", "Maharashtra", "Telangana", "Andhra Pradesh", "Karnataka", "Tamil Nadu", "Sri Lanka"],
    description: "International Asian Highway corridor designated by the United Nations, connecting central India through Hyderabad, Bengaluru, and Madurai to Sri Lanka.",
    waypoints: [
      { name: "Agra", lat: 27.1767, lng: 78.0081, role: "origin", km: 0 },
      { name: "Gwalior", lat: 26.2183, lng: 78.1828, km: 120 },
      { name: "Nagpur", lat: 21.1458, lng: 79.0882, km: 800 },
      { name: "Hyderabad", lat: 17.3850, lng: 78.4867, km: 1300 },
      { name: "Bengaluru", lat: 12.9716, lng: 77.5946, km: 1870 },
      { name: "Hosur", lat: 12.7409, lng: 77.8253, km: 1910 },
      { name: "Krishnagiri", lat: 12.5186, lng: 78.2137, km: 1960 },
      { name: "Madurai", lat: 9.9252, lng: 78.1198, km: 2310 },
      { name: "Rameswaram", lat: 9.2876, lng: 79.3129, km: 2470 },
      { name: "Talaimannar", lat: 9.1030, lng: 79.7210, km: 2540 },
      { name: "Colombo", lat: 6.9271, lng: 79.8612, km: 2900 },
      { name: "Matale", lat: 7.4675, lng: 80.6234, role: "destination", km: 3024 }
    ]
  },
  I95: {
    id: "I95",
    ref: "I-95",
    type: "US Interstate Highway",
    name: "Interstate 95 (Miami–Maine Atlantic Coast Corridor)",
    shortName: "I-95 (Miami ➔ Maine)",
    origin: "Miami, Florida",
    destination: "Houlton, Maine (Canadian Border)",
    lengthKm: 3071,
    lengthMi: 1908,
    lanes: "4 to 12 Lanes",
    states: ["Florida", "Georgia", "South Carolina", "North Carolina", "Virginia", "Maryland", "Delaware", "Pennsylvania", "New Jersey", "New York", "Connecticut", "Rhode Island", "Massachusetts", "New Hampshire", "Maine"],
    description: "The primary Interstate Highway of the American East Coast, linking major metropolitan areas from Miami through Washington D.C., Philadelphia, New York, and Boston.",
    waypoints: [
      { name: "Miami, FL", lat: 25.7617, lng: -80.1918, role: "origin", km: 0 },
      { name: "Jacksonville, FL", lat: 30.3322, lng: -81.6557, km: 550 },
      { name: "Savannah, GA", lat: 32.0809, lng: -81.0912, km: 770 },
      { name: "Richmond, VA", lat: 37.5407, lng: -77.4360, km: 1530 },
      { name: "Washington, D.C.", lat: 38.9072, lng: -77.0369, km: 1700 },
      { name: "Philadelphia, PA", lat: 39.9526, lng: -75.1652, km: 1920 },
      { name: "New York City, NY", lat: 40.7128, lng: -74.0060, km: 2075 },
      { name: "Boston, MA", lat: 42.3601, lng: -71.0589, km: 2420 },
      { name: "Portland, ME", lat: 43.6591, lng: -70.2568, km: 2590 },
      { name: "Houlton, ME", lat: 46.1262, lng: -67.8403, role: "destination", km: 3071 }
    ]
  }
};

/**
 * Detects whether a given address string, road name, or coordinates correspond to a known major highway.
 */
export function detectHighway(textOrAddress, lat = null, lng = null) {
  let searchStr = "";
  if (typeof textOrAddress === "string") {
    searchStr = textOrAddress;
  } else if (textOrAddress && typeof textOrAddress === "object") {
    searchStr = [
      textOrAddress.road,
      textOrAddress.ref,
      textOrAddress.name,
      textOrAddress.display_name,
      textOrAddress.state_district,
      textOrAddress.county
    ].filter(Boolean).join(" ");
  }

  // 1. Regex check for highway codes
  let matchedHighway = null;
  const upper = searchStr.toUpperCase();

  if (/\b(?:NH\s*48|NATIONAL HIGHWAY\s*48|NH-48|AH\s*47)\b/i.test(upper)) {
    matchedHighway = HIGHWAY_DATABASE.NH48;
  } else if (/\b(?:NH\s*44|NATIONAL HIGHWAY\s*44|NH-44)\b/i.test(upper)) {
    matchedHighway = HIGHWAY_DATABASE.NH44;
  } else if (/\b(?:NH\s*16|NATIONAL HIGHWAY\s*16|NH-16)\b/i.test(upper)) {
    matchedHighway = HIGHWAY_DATABASE.NH16;
  } else if (/\b(?:NH\s*66|NATIONAL HIGHWAY\s*66|NH-66)\b/i.test(upper)) {
    matchedHighway = HIGHWAY_DATABASE.NH66;
  } else if (/\b(?:NH\s*27|NATIONAL HIGHWAY\s*27|NH-27)\b/i.test(upper)) {
    matchedHighway = HIGHWAY_DATABASE.NH27;
  } else if (/\b(?:NH\s*75|NATIONAL HIGHWAY\s*75|NH-75)\b/i.test(upper)) {
    matchedHighway = HIGHWAY_DATABASE.NH75;
  } else if (/\b(?:NH\s*40|NATIONAL HIGHWAY\s*40|NH-40)\b/i.test(upper)) {
    matchedHighway = HIGHWAY_DATABASE.NH40;
  } else if (/\b(?:NH\s*42|NATIONAL HIGHWAY\s*42|NH-42)\b/i.test(upper)) {
    matchedHighway = HIGHWAY_DATABASE.NH42;
  } else if (/\b(?:NH\s*275|NATIONAL HIGHWAY\s*275|BENGALURU[- ]MYSURU\s*EXPRESSWAY)\b/i.test(upper)) {
    matchedHighway = HIGHWAY_DATABASE.NH275;
  } else if (/\b(?:MUMBAI[- ]PUNE\s*EXPRESSWAY|YASHWANTRAO CHAVAN)\b/i.test(upper)) {
    matchedHighway = HIGHWAY_DATABASE.MPE;
  } else if (/\b(?:AH\s*43|ASIAN HIGHWAY\s*43)\b/i.test(upper)) {
    matchedHighway = HIGHWAY_DATABASE.AH43;
  } else if (/\b(?:I-95|INTERSTATE\s*95)\b/i.test(upper)) {
    matchedHighway = HIGHWAY_DATABASE.I95;
  } else {
    // Generic regex extractor for any numbered National Highway (e.g. NH 69, NH 71, etc.)
    const anyNh = upper.match(/\b(?:NH|NATIONAL HIGHWAY)\s*[- ]?(\d+[A-Z]?)\b/i);
    if (anyNh) {
      const code = "NH" + anyNh[1];
      if (HIGHWAY_DATABASE[code]) {
        matchedHighway = HIGHWAY_DATABASE[code];
      }
    }
  }

  // 2. Spatial proximity fallback: if lat/lng is provided and no regex hit, check distance to corridors
  if (!matchedHighway && lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
    let closestDist = Infinity;
    let bestHwy = null;

    for (const hwy of Object.values(HIGHWAY_DATABASE)) {
      for (const wp of hwy.waypoints) {
        const d = haversineMeters(lat, lng, wp.lat, wp.lng);
        // Only match spatial proximity if within 15 km of a known highway waypoint AND query or address context indicates highway
        if (d < 15000 && d < closestDist) {
          closestDist = d;
          bestHwy = hwy;
        }
      }
    }

    if (bestHwy && closestDist <= 15000) {
      matchedHighway = bestHwy;
    }
  }

  // 3. Dynamic generic highway detection from OpenStreetMap reverse geocode attributes
  if (!matchedHighway && textOrAddress && typeof textOrAddress === "object") {
    const road = textOrAddress.road || "";
    const ref = textOrAddress.ref || "";
    const hwyProp = textOrAddress.highway || "";
    const isHighwayLike =
      /\b(?:NH\s*\d+|SH\s*\d+|STATE HIGHWAY|NATIONAL HIGHWAY|EXPRESSWAY|MOTORWAY|FREEWAY|INTERSTATE|AUTOBAHN|ROUTE\s*\d+|BYPASS)\b/i.test(road + " " + ref) ||
      /^(motorway|trunk|primary|motorway_link|trunk_link)$/i.test(hwyProp);

    if (isHighwayLike && (road || ref)) {
      const hwyRef = ref || (road.match(/\b(?:NH|SH|NE|M|A|I)\s*[- ]?\d+[A-Z]?\b/i)?.[0]) || "Highway";
      const hwyName = road || hwyRef;
      const nearestPlace = textOrAddress.village || textOrAddress.town || textOrAddress.city || textOrAddress.county || "";
      matchedHighway = {
        id: hwyRef.replace(/\s+/g, ""),
        ref: hwyRef,
        type: hwyProp ? `Road Class: ${hwyProp}` : "Regional Highway / Expressway",
        name: hwyName,
        shortName: `${hwyRef}${nearestPlace ? ` (${nearestPlace})` : ''}`,
        origin: "Regional Corridor",
        destination: "Active Route Segment",
        lengthKm: null,
        states: [textOrAddress.state || textOrAddress.county || "Region"].filter(Boolean),
        description: `Active highway corridor section along ${[road, nearestPlace, textOrAddress.state].filter(Boolean).join(", ")}.`,
        isDynamic: true,
        waypoints: (lat != null && lng != null) ? [
          { name: nearestPlace || hwyName, lat, lng, role: "waypoint", km: 0 }
        ] : []
      };
    }
  }

  if (!matchedHighway) return null;

  // Compute position relative to corridor
  let relativeInfo = null;
  if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
    relativeInfo = computeCorridorProximity(matchedHighway, lat, lng);
  }

  return {
    ...matchedHighway,
    relativeInfo
  };
}

/**
 * Computes how far the user is along the highway and which waypoints they are between.
 */
function computeCorridorProximity(highway, lat, lng) {
  let nearestWp = null;
  let nearestDistM = Infinity;
  let nearestIdx = -1;

  highway.waypoints.forEach((wp, idx) => {
    const d = haversineMeters(lat, lng, wp.lat, wp.lng);
    if (d < nearestDistM) {
      nearestDistM = d;
      nearestWp = wp;
      nearestIdx = idx;
    }
  });

  const approxKmFromStart = nearestWp ? nearestWp.km : 0;
  const approxKmToEnd = Math.max(0, highway.lengthKm - approxKmFromStart);

  let corridorSection = nearestWp ? nearestWp.name : "";
  if (nearestIdx > 0 && nearestIdx < highway.waypoints.length - 1) {
    const prev = highway.waypoints[nearestIdx - 1];
    const next = highway.waypoints[nearestIdx + 1];
    corridorSection = `${prev.name} ➔ ${nearestWp.name} ➔ ${next.name}`;
  } else if (nearestIdx === 0) {
    corridorSection = `Near Origin (${nearestWp.name})`;
  } else if (nearestIdx === highway.waypoints.length - 1) {
    corridorSection = `Near Destination (${nearestWp.name})`;
  }

  return {
    nearestCity: nearestWp?.name,
    distanceToHighwayMeters: Math.round(nearestDistM),
    distanceToHighwayKm: (nearestDistM / 1000).toFixed(1),
    approxKmFromOrigin: approxKmFromStart,
    approxKmToDestination: approxKmToEnd,
    corridorSection
  };
}

/**
 * Trace Highway polyline across the entire map using OpenLayers vector layer.
 */
export function traceHighwayOnMap(highwayId) {
  const hwy = HIGHWAY_DATABASE[highwayId] || Object.values(HIGHWAY_DATABASE).find(h => h.id === highwayId);
  if (!hwy || !appRef || !appRef.map) return;

  clearHighwayTrace();

  const coordinates = hwy.waypoints.map(wp => fromLonLat([wp.lng, wp.lat]));
  const lineGeom = new LineString(coordinates);
  const routeFeature = new Feature({
    geometry: lineGeom,
    name: hwy.name
  });

  // Create Waypoint marker features
  const markerFeatures = hwy.waypoints.map((wp, i) => {
    const feat = new Feature({
      geometry: new Point(fromLonLat([wp.lng, wp.lat])),
      name: wp.name,
      role: wp.role || "waypoint",
      km: wp.km
    });
    return feat;
  });

  const vectorSource = new VectorSource({
    features: [routeFeature, ...markerFeatures]
  });

  // High-contrast glowing highway styles
  const casingStyle = new Style({
    stroke: new Stroke({
      color: "rgba(14, 165, 233, 0.95)", // Electric Cyan Glow
      width: 8,
      lineCap: "round",
      lineJoin: "round"
    })
  });

  const coreLineStyle = new Style({
    stroke: new Stroke({
      color: "#ffffff", // Bright Core
      width: 4,
      lineCap: "round",
      lineJoin: "round"
    })
  });

  const waypointStyle = (feature) => {
    const role = feature.get("role");
    const isTerminus = role === "origin" || role === "destination";
    const name = feature.get("name");

    return new Style({
      image: new CircleStyle({
        radius: isTerminus ? 7 : 4.5,
        fill: new Fill({ color: isTerminus ? "#f59e0b" : "#0284c7" }),
        stroke: new Stroke({ color: "#ffffff", width: 2 })
      }),
      text: isTerminus ? new Text({
        text: name,
        offsetY: -14,
        font: "bold 11px Inter, sans-serif",
        fill: new Fill({ color: "#ffffff" }),
        stroke: new Stroke({ color: "#0f172a", width: 3.5 })
      }) : undefined
    });
  };

  highwayVectorLayer = new VectorLayer({
    source: vectorSource,
    style: (feature) => {
      if (feature.getGeometry() instanceof LineString) {
        return [casingStyle, coreLineStyle];
      }
      return waypointStyle(feature);
    },
    zIndex: 105
  });

  appRef.map.addLayer(highwayVectorLayer);
  activeTraceHighway = hwy;

  // Fit map view to encompass the highway corridor smoothly
  const extent = lineGeom.getExtent();
  appRef.map.getView().fit(extent, {
    padding: [70, 70, 70, 70],
    duration: 900
  });

  showTraceHud(hwy);
  if (typeof appRef._haptic === "function") appRef._haptic("success");
  if (typeof appRef.showToast === "function") {
    appRef.showToast(`Tracing ${hwy.ref}: ${hwy.origin} ➔ ${hwy.destination} (${hwy.lengthKm} km)`, "info");
  }
}

/**
 * Remove highway polyline from map.
 */
export function clearHighwayTrace() {
  if (highwayVectorLayer && appRef && appRef.map) {
    appRef.map.removeLayer(highwayVectorLayer);
    highwayVectorLayer = null;
  }
  activeTraceHighway = null;
  hideTraceHud();
}

/**
 * Shows floating HUD on map with Exit Trace button.
 */
function showTraceHud(highway) {
  hideTraceHud();
  traceControlEl = document.createElement("div");
  traceControlEl.id = "highwayTraceHud";
  traceControlEl.className = "fixed bottom-20 left-1/2 -translate-x-1/2 z-[1100] flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/90 text-white backdrop-blur-md shadow-2xl border border-sky-500/40 text-xs animate-in fade-in slide-in-from-bottom-2";
  traceControlEl.innerHTML = `
    <span class="inline-flex items-center gap-1 font-bold text-sky-400">
      <span class="text-sm">🛣️</span> ${highway.ref}
    </span>
    <span class="text-slate-300 border-l border-slate-700 pl-2 text-[11px] font-medium hidden sm:inline">
      ${highway.origin.split("(")[0].trim()} ➔ ${highway.destination.split("(")[0].trim()} (${highway.lengthKm} km)
    </span>
    <button id="inspectHwyWeatherBtn" type="button" class="ml-1 px-2.5 py-1 rounded-full bg-sky-500 hover:bg-sky-400 text-white font-semibold text-[11px] transition-all flex items-center gap-1">
      ⛅ Route Weather
    </button>
    <button id="closeHwyTraceBtn" type="button" class="ml-1 p-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors" title="Exit Highway Trace">
      ✕
    </button>
  `;

  document.body.appendChild(traceControlEl);

  document.getElementById("inspectHwyWeatherBtn")?.addEventListener("click", () => {
    openHighwayWeather(highway.id);
  });
  document.getElementById("closeHwyTraceBtn")?.addEventListener("click", () => {
    clearHighwayTrace();
  });
}

function hideTraceHud() {
  if (traceControlEl) {
    traceControlEl.remove();
    traceControlEl = null;
  }
}

/**
 * Load highway waypoints directly into Route Studio to inspect live weather hazards & temperatures.
 */
export async function openHighwayWeather(highwayId) {
  const hwy = HIGHWAY_DATABASE[highwayId] || Object.values(HIGHWAY_DATABASE).find(h => h.id === highwayId);
  if (!hwy || !appRef) return;

  // Open Route Studio
  if (typeof appRef.openRouteStudio === "function") {
    appRef.openRouteStudio();
  }

  // Clear existing stops and add highway milestones
  try {
    const { addStop, clearRoute } = await import("./routes.js");
    if (typeof clearRoute === "function") clearRoute();

    // Select key milestones (e.g. Origin, 2-3 major middle junctions, Destination)
    const count = hwy.waypoints.length;
    const keyIndexes = count <= 5 
      ? hwy.waypoints.map((_, i) => i) 
      : [0, Math.floor(count * 0.25), Math.floor(count * 0.5), Math.floor(count * 0.75), count - 1];

    for (const idx of keyIndexes) {
      const wp = hwy.waypoints[idx];
      if (wp) {
        await addStop(wp.lat, wp.lng, `${wp.name} (${hwy.ref})`);
      }
    }

    if (typeof appRef.showToast === "function") {
      appRef.showToast(`Loaded ${hwy.ref} corridor into Route Weather Studio!`, "success");
    }
  } catch (err) {
    console.error("Failed to load highway into Route Studio:", err);
  }
}

/**
 * Removes any active Highway Badge from the location card.
 */
export function clearHighwayBadge() {
  const existingBadge = document.getElementById("locationHighwayBadge");
  if (existingBadge) existingBadge.remove();
}

/**
 * Renders an interactive Highway Badge in the location panel address summary.
 */
export function renderHighwaySummaryBadge(containerEl, highwayInfo) {
  clearHighwayBadge();
  if (!containerEl || !highwayInfo) return;

  const rel = highwayInfo.relativeInfo;
  const relText = rel
    ? `${rel.nearestCity ? `Near ${rel.nearestCity}` : ''} · ${rel.approxKmFromOrigin} km from start`
    : (highwayInfo.lengthKm ? `${highwayInfo.lengthKm} km` : (highwayInfo.type || "Highway"));

  const badge = document.createElement("div");
  badge.id = "locationHighwayBadge";
  badge.className = "mt-2 p-2 rounded-xl bg-gradient-to-r from-sky-500/10 via-teal-500/10 to-indigo-500/10 border border-sky-500/30 dark:border-sky-400/25 flex items-center justify-between gap-2 text-xs select-none transition-all hover:border-sky-500/60";
  badge.innerHTML = `
    <div class="flex items-center gap-2 min-w-0">
      <div class="flex items-center justify-center px-2 py-0.5 rounded font-black text-[11px] bg-slate-900 text-white dark:bg-white dark:text-slate-900 border border-slate-700 dark:border-slate-300 shadow-sm shrink-0">
        ${highwayInfo.ref || "HWY"}
      </div>
      <div class="flex flex-col min-w-0">
        <span class="font-bold text-slate-800 dark:text-slate-100 truncate text-[11.5px]">
          ${highwayInfo.shortName || highwayInfo.name}
        </span>
        <span class="text-[10px] text-slate-500 dark:text-slate-400 truncate">
          ${relText}
        </span>
      </div>
    </div>
    <div class="flex items-center gap-1 shrink-0">
      <button id="inspectHighwayBtn" type="button" class="px-2 py-1 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-semibold text-[10.5px] shadow-sm transition-transform active:scale-95 flex items-center gap-1">
        <span>Inspector</span> ➔
      </button>
    </div>
  `;

  containerEl.appendChild(badge);

  badge.querySelector("#inspectHighwayBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openHighwayInspectorModal(highwayInfo.id || highwayInfo.ref, appRef?.selectedLat, appRef?.selectedLng);
  });
}

/**
 * Opens the Interactive Highway Inspector Modal with rich corridor analytics,
 * milestone stops, distance calculations, and interactive tracing.
 */
export function openHighwayInspectorModal(highwayId, userLat = null, userLng = null) {
  const hwy = HIGHWAY_DATABASE[highwayId] || Object.values(HIGHWAY_DATABASE).find(h => h.id === highwayId);
  if (!hwy) return;

  const existing = document.getElementById("highwayInspectorModal");
  if (existing) existing.remove();

  const rel = (userLat != null && userLng != null) ? computeCorridorProximity(hwy, userLat, userLng) : null;

  const modal = document.createElement("div");
  modal.id = "highwayInspectorModal";
  modal.className = "fixed inset-0 z-[1200] flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200 select-none";
  modal.innerHTML = `
    <div class="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xl overflow-hidden text-slate-800 dark:text-slate-100 animate-in zoom-in-95 duration-200">
      
      <!-- Header -->
      <div class="p-4 sm:p-5 pb-3 bg-gradient-to-br from-slate-100 via-sky-50/50 to-indigo-50/30 dark:from-slate-800/80 dark:via-slate-800/40 dark:to-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="px-3 py-1 rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950 font-black text-sm tracking-wider shadow-md border border-slate-700 shrink-0">
            ${hwy.ref}
          </div>
          <div class="min-w-0">
            <h2 class="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
              ${hwy.name}
            </h2>
            <p class="text-xs text-sky-600 dark:text-sky-400 font-medium">
              ${hwy.type} · ${hwy.lanes}
            </p>
          </div>
        </div>
        <button id="closeHwyInspectorBtn" class="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" title="Close">
          ✕
        </button>
      </div>

      <!-- Content Scroll -->
      <div class="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs">
        
        <!-- Stretch Corridor Hero Card -->
        <div class="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/50 space-y-3">
          <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            <span>HIGHWAY CORRIDOR SPAN</span>
            <span class="font-bold text-sky-600 dark:text-sky-400">${hwy.lengthKm.toLocaleString()} km (${hwy.lengthMi.toLocaleString()} miles)</span>
          </div>

          <!-- From-To Visual -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex flex-col min-w-0">
              <span class="text-[10px] uppercase font-bold text-slate-400">Origin (Start)</span>
              <span class="font-bold text-slate-900 dark:text-white truncate text-sm">📍 ${hwy.origin.split("(")[0].trim()}</span>
              <span class="text-[10px] text-slate-500 truncate">${hwy.origin}</span>
            </div>
            <div class="flex-1 flex flex-col items-center px-2">
              <span class="text-[10px] font-mono text-sky-500 font-bold mb-0.5">───➤</span>
              <div class="w-full h-1 bg-gradient-to-r from-sky-400 via-indigo-500 to-amber-500 rounded-full"></div>
            </div>
            <div class="flex flex-col items-end min-w-0 text-right">
              <span class="text-[10px] uppercase font-bold text-slate-400">Destination (End)</span>
              <span class="font-bold text-slate-900 dark:text-white truncate text-sm">🏁 ${hwy.destination.split("(")[0].trim()}</span>
              <span class="text-[10px] text-slate-500 truncate">${hwy.destination}</span>
            </div>
          </div>

          <!-- Relative location badge if coordinates active -->
          ${rel ? `
            <div class="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/40 flex items-center justify-between text-[11px]">
              <span class="text-slate-600 dark:text-slate-300 font-medium">
                🎯 <strong>Your Location:</strong> ${rel.corridorSection}
              </span>
              <span class="font-mono text-slate-500 dark:text-slate-400">
                ${rel.approxKmFromOrigin} km from origin
              </span>
            </div>
          ` : ''}
        </div>

        <!-- Description -->
        <p class="text-slate-600 dark:text-slate-300 leading-relaxed">
          ${hwy.description}
        </p>

        <!-- States Traversed -->
        <div>
          <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">States Traversed (${hwy.states.length})</span>
          <div class="flex flex-wrap gap-1.5 mt-1.5">
            ${hwy.states.map(s => `<span class="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-[11px]">${s}</span>`).join('')}
          </div>
        </div>

        <!-- Waypoints & Major Junctions -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Major Waypoints & Junction Cities (${hwy.waypoints.length})</span>
            <span class="text-[10px] text-slate-400">Tap to fly on map</span>
          </div>
          <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            ${hwy.waypoints.map(wp => `
              <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-sky-50 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 transition-colors cursor-pointer group" data-lat="${wp.lat}" data-lng="${wp.lng}" data-name="${wp.name}">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="w-2 h-2 rounded-full ${wp.role === 'origin' ? 'bg-amber-500' : wp.role === 'destination' ? 'bg-emerald-500' : 'bg-sky-400'} shrink-0"></span>
                  <span class="font-medium text-slate-800 dark:text-slate-200 group-hover:text-sky-600 dark:group-hover:text-sky-400 truncate">${wp.name}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="text-[10px] font-mono text-slate-400">${wp.km} km</span>
                  <span class="text-slate-400 group-hover:text-sky-500 text-xs">➔</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

      </div>

      <!-- Footer Actions -->
      <div class="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2.5">
        <button id="modalTraceHighwayBtn" type="button" class="flex-1 py-2.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-1.5">
          <span>✨</span> Trace Corridor on Map
        </button>
        <button id="modalInspectWeatherBtn" type="button" class="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-1.5">
          <span>⛅</span> Route Weather Studio
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(modal);

  // Event handlers
  const closeModal = () => modal.remove();
  modal.querySelector("#closeHwyInspectorBtn")?.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Action: Trace on Map
  modal.querySelector("#modalTraceHighwayBtn")?.addEventListener("click", () => {
    closeModal();
    traceHighwayOnMap(hwy.id);
  });

  // Action: Inspect Corridor Weather
  modal.querySelector("#modalInspectWeatherBtn")?.addEventListener("click", () => {
    closeModal();
    openHighwayWeather(hwy.id);
  });

  // Click on waypoint to fly to that city
  modal.querySelectorAll("[data-lat]").forEach(el => {
    el.addEventListener("click", () => {
      const lat = parseFloat(el.getAttribute("data-lat"));
      const lng = parseFloat(el.getAttribute("data-lng"));
      const name = el.getAttribute("data-name");
      if (!isNaN(lat) && !isNaN(lng) && appRef) {
        closeModal();
        if (typeof appRef.selectLocation === "function") {
          appRef.selectLocation(lat, lng, name, { zoom: 12 });
        }
      }
    });
  });
}

/**
 * Initializes map hover detection for highways and road corridors.
 */
export function initHighwayMapHover(app) {
  const currentApp = app || appRef;
  if (!currentApp?.map || typeof currentApp.map.on !== "function") return;
  if (currentApp._highwayHoverAttached) return;
  currentApp._highwayHoverAttached = true;

  try {
    let hoverOverlay = null;
    let lastHoverHighwayId = null;

    const ensureHoverOverlay = () => {
      if (hoverOverlay) return hoverOverlay;
      if (!currentApp?.map) return null;
      const el = document.createElement("div");
      el.id = "highwayHoverTooltip";
      el.style.cssText = "display:none;pointer-events:none;padding:6px 10px;border-radius:10px;background:rgba(15,23,42,0.92);color:#fff;font-size:11px;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,0.35);border:1px solid rgba(56,189,248,0.45);white-space:nowrap;z-index:9999;";
      hoverOverlay = new Overlay({
        element: el,
        positioning: "bottom-center",
        offset: [0, -12],
        stopEvent: false
      });
      currentApp.map.addOverlay(hoverOverlay);
      return hoverOverlay;
    };

    const showHover = (highway, coordinate) => {
      const overlay = ensureHoverOverlay();
      if (!overlay || !highway) return;
      const el = overlay.getElement();
      el.innerHTML = `<span style="color:#38bdf8;">🛣️ ${highway.ref || "HWY"}</span> ${highway.shortName || highway.name || ""}`;
      el.style.display = "block";
      overlay.setPosition(coordinate);
      lastHoverHighwayId = highway.id || highway.ref;
    };

    const hideHover = () => {
      if (hoverOverlay) {
        hoverOverlay.setPosition(undefined);
        const el = hoverOverlay.getElement();
        if (el) el.style.display = "none";
      }
      lastHoverHighwayId = null;
      try { currentApp.map.getTargetElement().style.cursor = ""; } catch (_) {}
    };

    let _hoverTimer = null;
    let _lastHoverCoord = null;
    let _hoverAbort = null;

    currentApp.map.on("pointermove", (evt) => {
      if (evt.dragging) { hideHover(); return; }

      // 1. Immediate: show tooltip if cursor is over a traced highway vector feature
      let vectorDetected = null;
      try {
        currentApp.map.forEachFeatureAtPixel(evt.pixel, (feature) => {
          if (vectorDetected) return;
          if (activeTraceHighway && feature.get && (
            feature.get("highwayId") === activeTraceHighway.id ||
            feature.get("name") === activeTraceHighway.name
          )) {
            vectorDetected = activeTraceHighway;
          }
        }, { hitTolerance: 6 });
      } catch (_) {}

      if (vectorDetected) {
        showHover(vectorDetected, evt.coordinate);
        try { currentApp.map.getTargetElement().style.cursor = "pointer"; } catch (_) {}
        clearTimeout(_hoverTimer);
        return;
      }

      // 2. Debounced: reverse-geocode at cursor position after 350ms pause
      _lastHoverCoord = evt.coordinate.slice();
      clearTimeout(_hoverTimer);
      _hoverTimer = setTimeout(async () => {
        try {
          if (_hoverAbort) { _hoverAbort.abort(); }
          _hoverAbort = new AbortController();
          const [lng, lat] = toLonLat(_lastHoverCoord);
          const zoom = currentApp.map?.getView?.()?.getZoom?.() ?? 10;
          if (zoom < 9) { hideHover(); return; }
          const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&format=json&zoom=16&addressdetails=1`;
          const resp = await fetch(url, {
            signal: _hoverAbort.signal,
            headers: { "Accept-Language": "en", "User-Agent": "Aurafisky/1.0" }
          });
          if (!resp.ok) { hideHover(); return; }
          const data = await resp.json();
          const osmType = data.type || data.class || "";
          const roadName = data.address?.road || "";
          const isRoad = data.class === "highway" ||
            /^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|road|highway)$/i.test(osmType) ||
            /\b(?:NH|SH|National Highway|State Highway|Expressway)\b/i.test(roadName);

          if (!isRoad) { hideHover(); return; }
          const addr = {
            road: data.address?.road || data.name || data.display_name,
            ref: data.address?.ref || (data.namedetails?.ref),
            highway: osmType,
            village: data.address?.village,
            town: data.address?.town,
            city: data.address?.city,
            state: data.address?.state
          };
          const detected = detectHighway(addr, lat, lng);
          if (detected) {
            showHover(detected, _lastHoverCoord);
            try { currentApp.map.getTargetElement().style.cursor = "pointer"; } catch (_) {}
          } else {
            hideHover();
          }
        } catch (e) {
          if (e?.name !== "AbortError") hideHover();
        }
      }, 350);
    });

    currentApp.map.on("pointerout", () => {
      clearTimeout(_hoverTimer);
      if (_hoverAbort) { _hoverAbort.abort(); _hoverAbort = null; }
      hideHover();
    });
  } catch (e) {
    console.warn("Highway hover hook error:", e);
  }
}

/**
 * Attaches the Highway Inspector to the application instance.
 */
export function init(app) {
  appRef = app;
  app.detectHighway = detectHighway;
  app.traceHighwayOnMap = traceHighwayOnMap;
  app.clearHighwayTrace = clearHighwayTrace;
  app.clearHighwayBadge = clearHighwayBadge;
  app.openHighwayInspectorModal = openHighwayInspectorModal;
  app.openHighwayWeather = openHighwayWeather;
  app.renderHighwaySummaryBadge = renderHighwaySummaryBadge;
  app.initHighwayMapHover = () => initHighwayMapHover(app);

  window.detectHighway = detectHighway;
  window.traceHighwayOnMap = traceHighwayOnMap;
  window.clearHighwayTrace = clearHighwayTrace;
  window.clearHighwayBadge = clearHighwayBadge;
  window.openHighwayInspectorModal = openHighwayInspectorModal;

  if (app.map) {
    initHighwayMapHover(app);
  }
}
