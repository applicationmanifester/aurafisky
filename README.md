# 🌤️ Aurafisky — Live Weather Explorer

A premium single-page web application that combines **Leaflet.js** and **OpenStreetMap** with **real-time weather data**, a **time-travel slider**, and a **stylish search bar** — all in a responsive, glassmorphism UI.

**No API keys or registration required!** This software is proprietary and confidential.

---

## ✨ Features

| Feature                  | Description                                                                  |
| ------------------------ | ---------------------------------------------------------------------------- |
| 🗺️ **Interactive Map**   | Full-screen Leaflet map using CartoDB tile layers (light/dark adaptive)      |
| 🔍 **City Search**       | Fast, free search using the Open-Meteo Geocoding API                         |
| 🌡️ **Real-Time Weather** | Current conditions (temp, humidity, wind, pressure, UV, cloud cover, precip) |
| ⏱️ **Time Slider**       | Slide through 3 days of history + 7 days of forecast, hour by hour           |
| 📊 **7-Day Forecast**    | Daily weather summary showing min/max temps, conditions, and icons           |
| 🌙 **Dark Mode**         | Responsive dark theme matching dark map tiles, with persistent preference    |
| 📍 **My Location**       | Jump directly to your coordinates using the browser's Geolocation API        |
| 🌾 **Farm Mode**         | Crop recommendations, spray windows, water balance & frost watch (see below) |
| 📱 **Responsive**        | Optimized for desktop, tablet, and mobile screens                            |

---

## 🚀 Quick Start

1. Double-click `index.html` to open it in your browser.
2. Alternatively, run a local development server for the best experience:
   ```bash
   # Using Python
   python -m http.server 8080

   # Using Node.js
   npx serve .
   ```
3. Open `http://localhost:8080` in your web browser.

No configuration, API credentials, or setup is required. The map and weather data will load immediately.

---

## 📁 File Structure

```
Maps/
├── index.html              # Main HTML page (Leaflet, Tailwind structure)
├── styles.css              # Custom CSS (glassmorphism, slider track, animations)
├── app.js                  # Map controller (Leaflet events, search, timeline updates)
├── weather.js              # Weather data module (Open-Meteo fetching, WMO code mapping)
├── features/
│   ├── farm.js             # Farm Mode: scoring engine, agro fetch, panel rendering
│   └── cropData.js         # Curated crop envelopes (climate/soil/agronomy) + helpers
├── tests/
│   ├── farm.test.ts        # Farm Mode engine unit tests
│   └── cropData.test.ts    # Crop database integrity + window/climate tests
└── README.md               # Setup and documentation (this file)
```

---

## 🎨 How It Works

1. **Click the map** or **search for a city** to fetch location weather.
2. A **custom weather marker** appears on the clicked coordinates displaying temperature and condition icon.
3. The **detail panel** slides in showing detailed metrics and a 7-day forecast.
4. Drag the **timeline slider** at the bottom to travel through time (3 days back, 7 days ahead) in 1-hour increments.
5. Click the **moon/sun button** to toggle dark mode (automatically updates map tiles to CartoDB Dark Matter).
6. Click the **target button (📍)** to center the map on your physical location.

---

## 🌾 Farm Mode

The weather card's **🌾 Farm** tab turns any selected point into a cropping plan for
farmers and growers. Tap your field on the map (or search your village), pick your soil
type, and the tab answers four questions:

| Question | How it's answered |
| --- | --- |
| **What to grow here?** | Every crop in the built-in database is scored against this exact point's live conditions — temperature, rainfall, humidity, elevation, soil moisture and your soil texture — then ranked with a match percentage, verdict, and the binding constraints called out. |
| **When to grow it?** | Each card shows its sowing window (adjusted for your hemisphere) and whether that window is open now, closing, or opens in *N* months. |
| **How to grow it?** | Expand a crop card for practical agronomy: sowing method, spacing, irrigation schedule, fertiliser schedule, pest/disease watch lists, and harvest indicators. |
| **Where to grow it?** | Climate band, elevation ceiling, and the soil textures each crop suits. |

Three more farmer tools sit below the crop list:

- **Spray windows** — an hour-by-hour score for the next 24h combining wind, gusts,
  rain probability, VPD, temperature and humidity, with the best contiguous window
  highlighted. Gales (>38 km/h), active rain, or a 75%+ rain chance hard-block the
  hour, mirroring real nozzle-drift rules.
- **Water balance** — the last 3 days of rainfall vs evapotranspiration (ET₀) plus a
  7-day forecast, with a texture-aware soil-moisture reading that produces a concrete
  irrigation instruction.
- **Frost watch** — the next 3 nights' forecast lows against the 2°C damage threshold,
  with protective actions. Severe nights raise a push notification (opt-in, per-location
  cooldown), matching the existing rain heads-up pattern.

Also shown: growing degree-days (base 10°C) for seasonal heat tracking, root-zone and
deep-soil moisture, and soil temperature at seed depth (which gates sowing of
warm-season crops).

All agricultural data comes free and key-less from the same Open-Meteo service the app
already uses (soil moisture/temperature, dew point, VPD, ET₀), so no CSP or API-key
changes were needed. Farm Mode degrades gracefully when the soil feed is unavailable —
the plan falls back to rainfall-based advice.

**Verify against your local agriculture department before committing inputs.**

---

## ⚙️ Tech Stack & Credits

- **Maps**: [Leaflet.js](https://leafletjs.com/) with tile layers by [CartoDB](https://carto.com/) and [OpenStreetMap](https://www.openstreetmap.org/)
- **Weather & Agro Data**: [Open-Meteo API](https://open-meteo.com/) (agrometeorology, soil moisture, solar, air quality)
- **Soil Characterization**: [ISRIC SoilGrids 2.0](https://rest.isric.org/) (250m global topsoil texture)
- **Local Flora & Biodiversity**: [GBIF API](https://www.gbif.org/) (Global Biodiversity Information Facility)
- **Geocoding & Reverse Geocoding**: Open-Meteo Geocoding API + OpenStreetMap [Nominatim API](https://nominatim.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + Custom CSS
- **Typography**: [Inter Font](https://fonts.google.com/specimen/Inter)
