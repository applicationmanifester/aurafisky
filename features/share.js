// -- SHARE WEATHER --

async function shareWeather(type = 'current', target = 'native') {
    if (!this.weatherData) {
      this.showToast("No weather data to share.", "error");
      return;
    }

    // The slider value is a *view* index; in 24h mode it must be shifted by the
    // timeline offset to become a data index, exactly as updateTimeline does.
    const timeOffset = this.timeline24hMode ? this._getTimelineOffset() : 0;
    const currentIdx = parseInt(this.$.timelineSlider.value, 10) + timeOffset;
    const weather = WeatherService.getHourlyAtIndex(this.weatherData, currentIdx);
    if (!weather) return;

    const timeStr = WeatherService.formatDateTime(
      weather.time,
      this.weatherData?.timezone,
      this.weatherData?.utc_offset_seconds,
    );
    const aqiVal = this.airQualityData?.hourly?.us_aqi[currentIdx];
    const aqiText = aqiVal != null ? ` | AQI: ${Math.round(aqiVal)}` : "";
    const gust = weather.windGusts != null ? ` | Gusts: ${WeatherService.formatWind(weather.windGusts)}` : "";
    const pressure = weather.pressure != null ? ` | Pressure: ${WeatherService.formatPressure(weather.pressure)}` : "";
    const uv = weather.uvIndex != null ? ` | UV: ${weather.uvIndex.toFixed(1)}` : "";
    const vis = weather.visibility != null ? ` | Visibility: ${WeatherService.formatVisibility(weather.visibility)}` : "";
    const clouds = weather.cloudCover != null ? ` | Clouds: ${weather.cloudCover}%` : "";
    const precip = weather.precipProb != null && weather.precipProb > 0 ? ` | Precip: ${weather.precipProb}%` : "";

    const coordsStr = (this.selectedLat != null && this.selectedLng != null)
      ? ` (${this.selectedLat.toFixed(4)}, ${this.selectedLng.toFixed(4)})`
      : "";

    // ── 1. Current Overview ──────────────────────────────────────────
    let text = `🌤️ Weather Report for ${this.selectedName}${coordsStr}
As of ${timeStr}

Current: ${WeatherService.formatTemp(weather.temperature)} ${weather.icon} ${weather.description}
Feels like: ${WeatherService.formatTemp(weather.feelsLike)} | Humidity: ${weather.humidity}%
Wind: ${WeatherService.formatWind(weather.windSpeed)} ${WeatherService.getWindDirection(weather.windDirection)}${gust}${pressure}${uv}${vis}${clouds}${precip}${aqiText}`;

    // ── 2. Hourly / 24-Hour Forecast Highlights ──────────────────────
    if ((type === 'full' || type === 'hourly') && this.weatherData?.hourly?.time) {
      const h = this.weatherData.hourly;
      const totalHours = h.time.length;
      const startIdx = Math.max(0, currentIdx);
      const endIdx = Math.min(totalHours, startIdx + 24);

      let temps24h = [];
      let hourlyRows = [];

      for (let i = startIdx; i < endIdx; i += 3) {
        const hourWeather = WeatherService.getHourlyAtIndex(this.weatherData, i);
        if (hourWeather) {
          const hourLabel = WeatherService.formatHourLabel(h.time[i], this.weatherData?.utc_offset_seconds);
          hourlyRows.push(`  • ${hourLabel} — ${WeatherService.formatTemp(hourWeather.temperature)} ${hourWeather.icon} ${hourWeather.description}`);
        }
      }

      for (let i = startIdx; i < endIdx; i++) {
        if (h.temperature_2m?.[i] != null) temps24h.push(h.temperature_2m[i]);
      }

      if (temps24h.length > 0) {
        const min24 = Math.min(...temps24h);
        const max24 = Math.max(...temps24h);
        text += `\n\n📊 24-Hour Overview (High: ${WeatherService.formatTemp(max24)} / Low: ${WeatherService.formatTemp(min24)})\n` + hourlyRows.join("\n");
      }
    }

    // ── 3. Weekly 7-Day Forecast ────────────────────────────────────
    if (type === 'full' || type === 'weekly') {
      const dailyList = WeatherService.getDailyForecast(this.weatherData);
      if (dailyList && dailyList.length > 0) {
        // getDailyForecast returns PAST_DAYS of history before today, so start at
        // today rather than at index 0 — otherwise the "forecast" leads with
        // three days that have already happened.
        const todayStr = new Date().toISOString().split("T")[0];
        const todayIdx = dailyList.findIndex((d) => d.date === todayStr);
        const startDay = todayIdx >= 0 ? todayIdx : (WeatherService.PAST_DAYS ?? 0);
        text += `\n\n📅 7-Day Weekly Forecast:\n`;
        const days = dailyList.slice(startDay, startDay + 7).map((d) => {
          const dayName = WeatherService.formatDayLabel(d.date);
          const maxStr = WeatherService.formatTemp(d.maxTemp);
          const minStr = WeatherService.formatTemp(d.minTemp);
          const precipStr = d.precipProb > 0 ? ` (${d.precipProb}% precip)` : "";
          return `  • ${dayName} — ${minStr} / ${maxStr} ${d.icon} ${d.description}${precipStr}`;
        });
        text += days.join("\n");
      }
    }

    // ── 4. App Link & Sharing Execution ─────────────────────────────────
    const shareUrl = (this.selectedLat != null && this.selectedLng != null)
      ? `${window.location.origin}${window.location.pathname}?lat=${this.selectedLat.toFixed(4)}&lng=${this.selectedLng.toFixed(4)}&name=${encodeURIComponent(this.selectedName)}`
      : window.location.href;
    
    text += `\n\n🔗 Live Map & Forecast: ${shareUrl}`;

    if (target === 'whatsapp') {
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(waUrl, "_blank", "noopener,noreferrer");
      this.toggleShareModal(false);
      return;
    }

    if (target === 'telegram') {
      const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`;
      window.open(tgUrl, "_blank", "noopener,noreferrer");
      this.toggleShareModal(false);
      return;
    }

    if (target === 'x') {
      const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
      window.open(xUrl, "_blank", "noopener,noreferrer");
      this.toggleShareModal(false);
      return;
    }

    if (target === 'copy') {
      const success = await this.copyToClipboard(text);
      if (success) {
        this.showToast("Weather report copied to clipboard!", "success");
      } else {
        this.showToast("Could not copy weather report.", "error");
      }
      this.toggleShareModal(false);
      return;
    }

    // Default target === 'native': System Share Sheet
    this.toggleShareModal(false);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Weather: ${this.selectedName}`, text: text, url: shareUrl });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
        console.warn("navigator.share failed, opening WhatsApp fallback:", e);
      }
    }

    // Fallback if system share not supported (e.g. desktop)
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }

export function init(app) {
  app.shareWeather = shareWeather;
}
