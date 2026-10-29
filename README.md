# Aurafisky

Aurafisky is a map-first weather explorer for checking conditions anywhere and planning around weather. Use the live map, radar and forecasts for a place, compare cities, or see how conditions may change along a route. Install it as a Progressive Web App for a home-screen experience.

## What you can do

- Explore current, hourly and 7-day forecasts on an interactive global map.
- View animated precipitation radar, weather layers, air quality, alerts and historical conditions.
- Plan routes with weather and hazard information, and ask Aura practical questions about conditions.
- Share a location forecast or a weather card with a link that opens the same place.
- Use Farm Mode for location-based crop matching, spray windows, water balance and frost watch. Check recommendations with your local agricultural service before acting on them.
- Install Aurafisky as a PWA. Recent weather information and saved places can be available offline; live weather and map layers require a network connection.

## Run locally

Requirements: Node.js 20 or later.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To create a production build:

```bash
npm run build
npm run preview
```

The app uses Open-Meteo for weather and geocoding, OpenFreeMap and other credited map providers for map layers, RainViewer for radar, and supporting geographic data services. Provider availability, terms and rate limits apply. See [Privacy Policy](PRIVACY_POLICY.md) for data handling details.

## Project layout

- `index.html`, `styles.css`, `app.js` — app shell, UI and map behavior
- `features/` — weather, route planning, sharing, Farm Mode and other features
- `src/` — TypeScript services and supporting modules
- `public/` — static assets, PWA resources, crawler files and widgets
- `tests/` — automated checks for core features

Aurafisky is proprietary software. See [LICENSE](LICENSE) for terms.
