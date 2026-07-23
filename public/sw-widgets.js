importScripts('https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js');

const WIDGET_TAG = 'weather-widget';

// WMO Weather Codes to Descriptions and Icons (Simplified)
const weatherMap = {
  0: { desc: 'Clear sky', icon: '☀️' },
  1: { desc: 'Mainly clear', icon: '🌤️' },
  2: { desc: 'Partly cloudy', icon: '⛅' },
  3: { desc: 'Overcast', icon: '☁️' },
  45: { desc: 'Fog', icon: '🌫️' },
  48: { desc: 'Depositing rime fog', icon: '🌫️' },
  51: { desc: 'Light drizzle', icon: '🌧️' },
  53: { desc: 'Moderate drizzle', icon: '🌧️' },
  55: { desc: 'Dense drizzle', icon: '🌧️' },
  56: { desc: 'Light freezing drizzle', icon: '🌨️' },
  57: { desc: 'Dense freezing drizzle', icon: '🌨️' },
  61: { desc: 'Slight rain', icon: '🌧️' },
  63: { desc: 'Moderate rain', icon: '🌧️' },
  65: { desc: 'Heavy rain', icon: '🌧️' },
  66: { desc: 'Light freezing rain', icon: '🌨️' },
  67: { desc: 'Heavy freezing rain', icon: '🌨️' },
  71: { desc: 'Slight snow', icon: '❄️' },
  73: { desc: 'Moderate snow', icon: '❄️' },
  75: { desc: 'Heavy snow', icon: '❄️' },
  77: { desc: 'Snow grains', icon: '❄️' },
  80: { desc: 'Slight rain showers', icon: '🌧️' },
  81: { desc: 'Moderate rain showers', icon: '🌧️' },
  82: { desc: 'Violent rain showers', icon: '🌧️' },
  85: { desc: 'Slight snow showers', icon: '❄️' },
  86: { desc: 'Heavy snow showers', icon: '❄️' },
  95: { desc: 'Thunderstorm', icon: '⛈️' },
  96: { desc: 'Thunderstorm with slight hail', icon: '⛈️' },
  99: { desc: 'Thunderstorm with heavy hail', icon: '⛈️' },
};

async function updateWidget(widget) {
  try {
    // 1. Get location from localforage
    let locationData = await localforage.getItem('_lastSession');
    
    // Fallback location if none stored
    if (!locationData) {
      locationData = { lat: 40.7128, lng: -74.0060, name: 'New York City' };
    }

    // 2. Fetch current weather from Open-Meteo
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${locationData.lat}&longitude=${locationData.lng}&current=temperature_2m,weather_code`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch weather');
    
    const data = await response.json();
    const temp = Math.round(data.current.temperature_2m);
    const code = data.current.weather_code;
    
    const weatherInfo = weatherMap[code] || { desc: 'Unknown', icon: '🌡️' };

    // 3. Prepare data for Adaptive Card
    const widgetData = {
      locationName: locationData.name.split(',')[0], // Simplify name
      temperature: temp.toString(),
      condition: weatherInfo.desc,
      iconUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><text y="50" font-size="50">${weatherInfo.icon}</text></svg>`
    };

    // 4. Fetch the template
    const templateRes = await fetch('/widgets/template.json');
    const template = await templateRes.text();

    // 5. Update the widget
    if (self.widgets && self.widgets.updateByTag) {
      await self.widgets.updateByTag(widget.tag, {
        template,
        data: JSON.stringify(widgetData)
      });
    }
  } catch (err) {
    console.error('Failed to update weather widget:', err);
  }
}

self.addEventListener('widgetinstall', event => {
  event.waitUntil(updateWidget(event.widget));
});

self.addEventListener('widgetresume', event => {
  event.waitUntil(updateWidget(event.widget));
});

self.addEventListener('widgetclick', event => {
  if (event.action === 'refresh') {
    event.waitUntil(updateWidget(event.widget));
  }
});
