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
├── index.html      # Main HTML page (Leaflet, Tailwind structure)
├── styles.css      # Custom CSS (glassmorphism, slider track, animations)
├── app.js          # Map controller (Leaflet events, search, timeline updates)
├── weather.js      # Weather data module (Open-Meteo fetching, WMO code mapping)
└── README.md       # Setup and documentation (this file)
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

## ⚙️ Tech Stack & Credits

- **Maps**: [Leaflet.js](https://leafletjs.com/) with tile layers by [CartoDB](https://carto.com/) and [OpenStreetMap](https://www.openstreetmap.org/)
- **Weather Data**: [Open-Meteo API](https://open-meteo.com/)
- **Geocoding & Reverse Geocoding**: Open-Meteo Geocoding API + OpenStreetMap [Nominatim API](https://nominatim.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + Custom CSS
- **Typography**: [Inter Font](https://fonts.google.com/specimen/Inter)
