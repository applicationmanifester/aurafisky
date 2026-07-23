# Privacy Policy for Aurafisky Maps

Effective date: Jul 18, 2026

> [!NOTE]
> The official published version of this privacy policy is available online at: [Aurafisky Privacy Policy](https://sites.google.com/view/aurafisky-privacypolicy/home)

Thank you for using Aurafisky Maps. Your privacy is important to us. This policy explains what data we access, how we handle it, and what third parties receive.

---

## 1. Data We Access

Aurafisky Maps is an offline-capable single-page application. We do not run our own servers or databases.

| Data Type | Source | Purpose |
|-----------|--------|---------|
| Your location (lat/lng) | You choose on the map, or device location | Display weather at your selected point |
| Weather data | Open-Meteo API (open-meteo.com) | Forecasts, air quality, historical data |
| Place names | Nominatim / OpenStreetMap | Reverse geocoding (lat/lng → city name) |
| Radar / satellite tiles | RainViewer (rainviewer.com) | Weather overlay imagery |
| Saved locations | Your browser localStorage | Bookmarked favorites, search history |
| User identity | Firebase / Google OAuth (optional) | Cloud sync of bookmarks (only if you sign in) |

All location data stays in your browser unless you opt-in to cloud sync.

---

## 2. Location Data

- **On-screen map interaction:** When you tap or search for a city, the coordinates are sent directly to Open-Meteo to fetch weather. We do not log these requests ourselves.
- **"My Location" button:** Uses the browser's Geolocation API. The coordinates are sent only to Open-Meteo for one request. They are not stored on our servers.
- You can use every feature of the app without sharing your exact coordinates — just click any point on the map.

---

## 3. Local Storage

Aurafisky Maps stores the following in your browser's localStorage under keys prefixed with `weathermap_`:

- Weather cache (last requested forecast / air quality, keyed by rounded coordinates)
- Search history (up to 5 recent searches)
- Bookmarked locations and profile preferences

This data never leaves your device unless you explicitly sign in with Google and enable cloud sync.

---

## 4. Third-Party Services

| Service | URL | Data Sent | Purpose |
|---------|-----|-----------|---------|
| Open-Meteo Forecast | api.open-meteo.com | lat, lng | Hourly & daily weather forecast |
| Open-Meteo Air Quality | air-quality-api.open-meteo.com | lat, lng | AQI, PM2.5, pollen data |
| Open-Meteo Geocoding | geocoding-api.open-meteo.com | search query | City name search |
| OpenStreetMap Nominatim | nominatim.openstreetmap.org | lat, lng | Reverse geocoding |
| RainViewer | api.rainviewer.com, tilecache.rainviewer.com | — (public data) | Radar / satellite tile imagery |
| Firebase / Google OAuth | *varies* | — (only if you sign in) | Optional cloud sync of bookmarks |

Open-Meteo, Nominatim, and RainViewer are free public APIs. We recommend reviewing their own privacy policies for details on how they handle requests.

---

## 5. Cloud Sync (Optional)

If you sign in with Google, we use Firebase Authentication and Firestore to sync your bookmarks across devices. Your Google profile name and avatar URL may be stored in your Firestore document. You can:

- Disable cloud sync by not signing in
- Delete your data by removing bookmarks and signing out

Firebase is operated by Google. Their privacy practices are governed by the Google Privacy Policy.

---

## 6. Service Worker and Offline Mode

Aurafisky Maps registers a service worker (`sw.js`) for PWA offline support. It caches:

- The app's own HTML, CSS, and JS files
- Weather tile and radar overlay URLs (via stale-while-revalidate)

Live API calls (Open-Meteo, RainViewer, Nominatim, Firebase) bypass the service worker cache and always go direct to the network. No offline data is sent back to any server.

---

## 7. Analytics and Tracking

Aurafisky Maps does **not** use Google Analytics, advertising networks, or any third-party tracking scripts. No cookies, no beacons, no cross-site tracking.

---

## 8. Children's Privacy

Aurafisky Maps is a general-audience weather application. It does not knowingly collect data from children under 13. It does not offer account creation by children under 13.

---

## 9. Changes to This Policy

We may update this Privacy Policy to reflect changes in the app or applicable law. Updates will be posted at the URL or file location where you found this document.

---

## 10. Contact

For questions or concerns about this policy, please use the "Copy contact email" button in the app's Terms & Privacy modal.

---

*This privacy policy was written by an automated assistant reviewing the application's source code. For legal advice, consult a qualified attorney.*
