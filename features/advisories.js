// -- WEATHER ADVISORIES & FAVICONS --

// Banner glyph per advisory type. A lookup beats the nested ternary this
// replaced: adding the cold tiers to that chain would have made it six levels
// deep, and a missing entry silently fell through to the generic ⚠️.
const ADVISORY_ICONS = {
  aqi: "🍃",
  wind: "💨",
  heat: "☀️",
  frost: "❄️",
  "wind-chill": "🥶",
  "extreme-cold": "🧊",
  storm: "⛈️",
  rain: "🌧️",
};

function renderAdvisoryBanner(advisories) {
    if (!advisories || advisories.length === 0) {
      this.$.advisoryBanner.classList.add("hidden");
      return;
    }

    const severityPrecedence = {
      extreme: 4,
      severe: 3,
      warning: 2,
      advisory: 1,
    };
    advisories.sort(
      (a, b) => severityPrecedence[b.severity] - severityPrecedence[a.severity],
    );

    const topAlert = advisories[0];

    this.$.advisoryBanner.className = `mb-4 rounded-xl p-3 border shadow-sm flex items-start gap-2.5 transition-all duration-300 alert-${topAlert.severity}`;
    this.$.advisoryIcon.textContent = ADVISORY_ICONS[topAlert.type] || "⚠️";
    this.$.advisoryTitle.textContent = topAlert.title;
    this.$.advisoryDesc.textContent = topAlert.desc;

    this.$.advisoryBanner.classList.remove("hidden");
  }

function updateWeatherFavicon(weatherCode, isDay = true) {
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    // Use IconSystem to generate a proper SVG favicon with the weather icon
    if (
      window.IconSystem &&
      typeof IconSystem.getDynamicFavicon === "function"
    ) {
      favicon.href = IconSystem.getDynamicFavicon(weatherCode, isDay);
    } else {
      // Fallback to original emoji-based favicon
      const iconSvg = WeatherIcons.getIcon(weatherCode, isDay);
      const inner = iconSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
      const content = inner ? inner[1] : iconSvg;
      favicon.href = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><g transform='scale(2) translate(26,26)'>${encodeURIComponent(content)}</g></svg>`;
    }
  }

export function init(app) {
  app.renderAdvisoryBanner = renderAdvisoryBanner;
  app.updateWeatherFavicon = updateWeatherFavicon;
}
