// -- ASTRONOMY & DAY CYCLES --

function updateAstronomyWidget(weather, _hourIndex) {
    if (!this.weatherData) return;

    try {
      const dateStr = weather.time.split("T")[0];
      const daily = WeatherService.getDailyForecast(this.weatherData);
      const currentDayData = daily.find((d) => d.date === dateStr) || daily[0];

      if (
        !currentDayData ||
        !currentDayData.sunrise ||
        !currentDayData.sunset
      ) {
        return;
      }

      const sunriseTime = new Date(currentDayData.sunrise);
      const sunsetTime = new Date(currentDayData.sunset);
      const currentTime = new Date(weather.time);

      // Independent of the day-length math below — the sky gazing score
      // only needs cloud cover and moon phase, so it renders the same way
      // on a polar day/night as on any other, and above the early return.
      this.updateStargazingWidget(weather, currentDayData, currentTime);

      // Compute & render real planetary and prominent star positions
      this.updateCelestialBodies(currentTime);

      // Inside the polar circles the sun can stay up (or down) for the whole
      // day, and the API reports sunrise and sunset as the same instant. That
      // makes the day length zero, so the sun-arc fraction below becomes 0/0
      // — NaN — and every coordinate derived from it lands in the SVG as
      // cx="NaN", cy="NaN", d="…A 45,45 0 0,1 NaN NaN". Bail out to the
      // static arc for those days instead of drawing an invalid one.
      const dayLengthMs = sunsetTime - sunriseTime;
      if (!Number.isFinite(dayLengthMs) || dayLengthMs <= 0) {
        // weather.isDay comes from the API's own is_day flag, so it tells us
        // which of the two cases this is without guessing from latitude.
        this._renderPolarDayCycle(currentTime, weather.isDay === true);
        return;
      }

      const diffMs = sunsetTime - sunriseTime;
      const diffHours = Math.floor(diffMs / 3600000);
      const diffMins = Math.floor((diffMs % 3600000) / 60000);
      this.$.sunDayLength.textContent = `${diffHours}h ${diffMins}m`;

      this.$.sunSunrise.textContent = sunriseTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      this.$.sunSunset.textContent = sunsetTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Live sunrise/sunset countdown.
      //
      // This used to read `new Date()` while every other line of the widget
      // read `weather.time`. Scrub the timeline to another day and the two
      // clocks diverge: the countdown compared real-now against *that day's*
      // sunrise and printed the gap as a negative — the "Sunrise in -2h -13m"
      // in the Antarctica screenshot. The +24h shortcut for "already past
      // sunset" was the second half of the bug: near the poles consecutive
      // sunrises are nowhere near 24h apart, so even the sign-correct answer
      // was wrong by hours.
      //
      // Both go away by walking the real sunrise/sunset timestamps the API
      // already returns and taking the first event after the reference time.
      if (this.$.sunCountdown) {
        // Tick live only while the widget is showing roughly the present.
        // On a scrubbed day the countdown is a static "from then" figure and
        // a ticking clock would just drift away from the rest of the panel.
        const isLive = Math.abs(Date.now() - currentTime.getTime()) < 1800000;

        const updateCountdown = () => {
          const ref = isLive ? new Date() : currentTime;
          const next = this._nextSunEvent(daily, ref);

          if (!next) {
            this.$.sunCountdown.textContent = "";
            return;
          }

          const diff = Math.max(0, next.at - ref);
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          const isSunset = next.type === "sunset";

          this.$.sunCountdown.textContent = `${isSunset ? "Sunset" : "Sunrise"} in ${h}h ${m}m`;
          this.$.sunCountdown.className = isSunset
            ? "text-[7px] text-amber-500 dark:text-amber-400 font-bold mt-0.5"
            : "text-[7px] text-emerald-500 dark:text-emerald-400 font-bold mt-0.5";
        };

        updateCountdown();
        // Clear any previous timer before starting a new one
        if (this.sunCountdownTimer) clearInterval(this.sunCountdownTimer);
        this.sunCountdownTimer = isLive
          ? setInterval(updateCountdown, 60000)
          : null;
      }

      // Calculate Sun Arc Dot position
      if (currentTime >= sunriseTime && currentTime <= sunsetTime) {
        const frac = (currentTime - sunriseTime) / (sunsetTime - sunriseTime);
        const angle = Math.PI - frac * Math.PI; // Semicircular bend from PI to 0 radians

        const cx = 50 + 45 * Math.cos(angle);
        const cy = 45 - 45 * Math.sin(angle);

        this.$.sunArcDot.setAttribute("cx", cx);
        this.$.sunArcDot.setAttribute("cy", cy);
        this.$.sunArcDot.setAttribute("fill", "#f59e0b");
        this.$.sunArcDot.setAttribute("r", "4");

        if (this.$.sunArcPassed) {
          this.$.sunArcPassed.setAttribute(
            "d",
            `M 5,45 A 45,45 0 0,1 ${cx} ${cy}`,
          );
        }
      } else {
        // Night position
        const isBeforeSunrise = currentTime < sunriseTime;
        this.$.sunArcDot.setAttribute("cx", isBeforeSunrise ? 5 : 95);
        this.$.sunArcDot.setAttribute("cy", 45);
        this.$.sunArcDot.setAttribute("fill", "#94a3b8");
        this.$.sunArcDot.setAttribute("r", "3");
        if (this.$.sunArcPassed) {
          this.$.sunArcPassed.setAttribute("d", "M 5,45 A 45,45 0 0,1 5,45");
        }
      }

      this._renderMoonPhase(currentTime);
    } catch (e) {
      console.warn("Astronomy widget update failed:", e);
    }
  }

/**
 * First sunrise or sunset strictly after `ref`, taken from the real daily
 * timestamps rather than assuming a 24h cycle.
 *
 * Days inside the polar circles report sunrise and sunset at the same instant
 * — those are not real events, so they are skipped. If the whole forecast
 * window is polar day or polar night there is no next event at all and this
 * returns null, which the caller renders as a blank rather than a bogus
 * countdown.
 *
 * @param {Array<Object>} daily - getDailyForecast() output
 * @param {Date} ref - Reference instant
 * @returns {{ type: "sunrise"|"sunset", at: Date }|null}
 */
function _nextSunEvent(daily, ref) {
    if (!Array.isArray(daily)) return null;

    const events = [];
    for (const d of daily) {
      if (!d?.sunrise || !d?.sunset) continue;
      const rise = new Date(d.sunrise);
      const set = new Date(d.sunset);
      if (!Number.isFinite(rise.getTime()) || !Number.isFinite(set.getTime()))
        continue;
      // Zero-length day = polar day/night. No crossing of the horizon.
      if (set.getTime() - rise.getTime() <= 0) continue;
      events.push({ type: "sunrise", at: rise });
      events.push({ type: "sunset", at: set });
    }

    events.sort((a, b) => a.at - b.at);
    return events.find((e) => e.at > ref) || null;
  }

/**
 * Sun widget for a day with no sunrise/sunset — polar day or polar night,
 * which the API reports by giving both the same timestamp. There's no arc
 * position to interpolate on such a day, so show the state plainly instead
 * of computing a fraction of a zero-length day.
 */
function _renderPolarDayCycle(currentTime, isPolarDay) {
    if (this.sunCountdownTimer) {
      clearInterval(this.sunCountdownTimer);
      this.sunCountdownTimer = null;
    }

    this.$.sunDayLength.textContent = isPolarDay ? "24h 0m" : "0h 0m";
    this.$.sunSunrise.textContent = "--:--";
    this.$.sunSunset.textContent = "--:--";

    if (this.$.sunCountdown) {
      this.$.sunCountdown.textContent = isPolarDay ? "Polar day" : "Polar night";
      this.$.sunCountdown.className = isPolarDay
        ? "text-[7px] text-amber-500 dark:text-amber-400 font-bold mt-0.5"
        : "text-[7px] text-slate-400 dark:text-slate-500 font-bold mt-0.5";
    }

    if (this.$.sunArcDot) {
      // Polar day: sun parked at the top of the arc. Polar night: below the
      // horizon line, at the start of the arc, greyed out.
      this.$.sunArcDot.setAttribute("cx", isPolarDay ? "50" : "5");
      this.$.sunArcDot.setAttribute("cy", isPolarDay ? "0" : "45");
      this.$.sunArcDot.setAttribute("fill", isPolarDay ? "#f59e0b" : "#94a3b8");
      this.$.sunArcDot.setAttribute("r", isPolarDay ? "4" : "3");
    }
    if (this.$.sunArcPassed) {
      this.$.sunArcPassed.setAttribute(
        "d",
        isPolarDay ? "M 5,45 A 45,45 0 0,1 95,45" : "M 5,45 A 45,45 0 0,1 5,45",
      );
    }

    this._renderMoonPhase(currentTime);
  }

function updateCelestialBodies(currentTime) {
    const lat = this.selectedLat;
    const lng = this.selectedLng;
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;

    const planetsList = document.getElementById("celestialPlanetsList");
    const starsList = document.getElementById("celestialStarsList");
    const planetsBadge = document.getElementById("planetsVisibleBadge");
    const starsBadge = document.getElementById("starsVisibleBadge");

    if (!planetsList || !starsList) return;

    try {
      import("./celestial.js").then(({ calculateCelestialSky, projectToSkyDome }) => {
        const sky = calculateCelestialSky(lat, lng, currentTime || new Date());
        if (!sky) return;

        // 1. Update Badges
        if (planetsBadge) {
          planetsBadge.textContent = `${sky.visiblePlanetsCount} visible`;
          planetsBadge.className = sky.visiblePlanetsCount > 0
            ? "text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400";
        }

        if (starsBadge) {
          starsBadge.textContent = `${sky.visibleStarsCount} visible`;
          starsBadge.className = sky.visibleStarsCount > 0
            ? "text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
            : "text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400";
        }

        // 2. Render Interactive 2D Sky Dome SVG
        const domeGroup = document.getElementById("skyDomeObjectsGroup");
        if (domeGroup) {
          const domeElements = [];
          const occupiedPositions = [];

          // Helper to offset overlapping labels
          const getCleanLabelOffset = (x, y) => {
            let offsetY = -6;
            for (const occ of occupiedPositions) {
              if (Math.hypot(occ.x - x, occ.y - y) < 14) {
                offsetY = occ.offsetY > 0 ? -(Math.abs(occ.offsetY) + 7) : (Math.abs(occ.offsetY) + 7);
              }
            }
            occupiedPositions.push({ x, y, offsetY });
            return offsetY;
          };

          // Add Moon to dome if above horizon
          if (sky.moon.isAboveHorizon) {
            const mPos = projectToSkyDome(sky.moon.altitude, sky.moon.azimuth, 80, 100, 100);
            if (mPos.isVisible) {
              const labelY = getCleanLabelOffset(mPos.x, mPos.y);
              domeElements.push(`
                <g transform="translate(${mPos.x.toFixed(1)}, ${mPos.y.toFixed(1)})" class="cursor-pointer">
                  <circle cx="0" cy="0" r="5.5" fill="#fef08a" filter="drop-shadow(0 0 4px rgba(254,240,138,0.9))"/>
                  <text x="0" y="${labelY}" text-anchor="middle" font-size="6" font-weight="bold" fill="#fef08a" stroke="#090d16" stroke-width="2" paint-order="stroke">Moon</text>
                </g>
              `);
            }
          }

          // Add Planets to dome
          sky.planets.forEach((p) => {
            if (p.isAboveHorizon) {
              const pos = projectToSkyDome(p.altitude, p.azimuth, 80, 100, 100);
              if (pos.isVisible) {
                const glow = p.isCurrentlyVisible ? "filter=\"drop-shadow(0 0 3px rgba(254,215,170,0.8))\"" : "";
                const labelY = getCleanLabelOffset(pos.x, pos.y);
                domeElements.push(`
                  <g transform="translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})">
                    <circle cx="0" cy="0" r="3.5" fill="${p.color}" ${glow} />
                    <text x="0" y="${labelY}" text-anchor="middle" font-size="5.5" font-weight="bold" fill="${p.color}" stroke="#090d16" stroke-width="1.8" paint-order="stroke">${p.name}</text>
                  </g>
                `);
              }
            }
          });

          // Add Stars to dome (only brightest or visible to avoid overcrowding)
          sky.stars.forEach((s) => {
            if (s.isAboveHorizon) {
              const pos = projectToSkyDome(s.altitude, s.azimuth, 80, 100, 100);
              if (pos.isVisible) {
                const r = s.magnitude < 0 ? 3 : s.magnitude < 1 ? 2.2 : 1.6;
                const labelY = getCleanLabelOffset(pos.x, pos.y);
                domeElements.push(`
                  <g transform="translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})">
                    <circle cx="0" cy="0" r="${r}" fill="${s.color}" />
                    <text x="0" y="${labelY}" text-anchor="middle" font-size="5" fill="#cbd5e1" stroke="#090d16" stroke-width="1.6" paint-order="stroke" opacity="0.9">${s.name}</text>
                  </g>
                `);
              }
            }
          });

          domeGroup.innerHTML = domeElements.join("");
        }

        // 3. Render Bortle Light Pollution Card
        const bortleTitle = document.getElementById("bortleTitle");
        const bortleDesc = document.getElementById("bortleDescription");
        const bortleBadge = document.getElementById("bortleBadge");
        if (bortleTitle && sky.lightPollution) {
          bortleTitle.textContent = sky.lightPollution.title;
          if (bortleDesc) bortleDesc.textContent = sky.lightPollution.description;
          if (bortleBadge) {
            bortleBadge.textContent = sky.lightPollution.badge;
            bortleBadge.style.color = sky.lightPollution.color;
            bortleBadge.style.backgroundColor = `${sky.lightPollution.color}20`;
          }
        }

        // 4. Render Meteor Shower Card
        const meteorTitle = document.getElementById("meteorShowerTitle");
        const meteorDetail = document.getElementById("meteorShowerDetail");
        const meteorBadge = document.getElementById("meteorStatusBadge");
        if (meteorTitle && sky.meteorShowers?.length > 0) {
          const primaryShower = sky.meteorShowers[0];
          meteorTitle.textContent = `${primaryShower.name} Shower`;
          if (meteorDetail) {
            meteorDetail.textContent = primaryShower.isActive
              ? `Active now! Peak in ${primaryShower.daysUntilPeak}d (${primaryShower.peakDateStr}) • ~${primaryShower.zhr} meteors/hr`
              : `Peaks on ${primaryShower.peakDateStr} (in ${primaryShower.daysUntilPeak} days) • Radiant: ${primaryShower.constellation}`;
          }
          if (meteorBadge) {
            meteorBadge.textContent = primaryShower.isActive ? "Active Now 🔥" : `In ${primaryShower.daysUntilPeak}d`;
            meteorBadge.className = primaryShower.isActive
              ? "text-[8px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400"
              : "text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400";
          }
        }

        // 5. Render Next Eclipse Card
        const eclipseTitle = document.getElementById("eclipseTitle");
        const eclipseDetail = document.getElementById("eclipseDetail");
        const eclipseBadge = document.getElementById("eclipseBadge");
        if (eclipseTitle && sky.eclipses) {
          const nextEclipse = sky.eclipses.lunar || sky.eclipses.solar;
          if (nextEclipse) {
            const isLunar = Boolean(sky.eclipses.lunar);
            eclipseTitle.textContent = `${isLunar ? "🌕 Lunar" : "☀️ Solar"} Eclipse (${nextEclipse.kind})`;
            if (eclipseDetail) {
              eclipseDetail.textContent = `Next occurrence: ${nextEclipse.dateStr}`;
            }
            if (eclipseBadge) {
              eclipseBadge.textContent = isLunar ? "Lunar" : "Solar";
            }
          }
        }

        // 6. Render Planets List
        planetsList.innerHTML = sky.planets.map((planet) => {
          const isVis = planet.isCurrentlyVisible;
          const statusClass = isVis
            ? "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
            : planet.isAboveHorizon
              ? "bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"
              : "bg-slate-200/50 dark:bg-slate-800/50 text-slate-400";

          return `
            <div class="bg-slate-100/70 dark:bg-slate-800/60 rounded-xl p-2.5 flex items-center justify-between border border-slate-200/50 dark:border-slate-700/50 transition-all hover:border-slate-300 dark:hover:border-slate-600">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="text-xl flex-shrink-0" aria-hidden="true">${planet.icon}</span>
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs font-bold text-slate-800 dark:text-slate-200">${planet.name}</span>
                    <span class="text-[9px] text-slate-400">mag ${planet.magnitude.toFixed(1)}</span>
                  </div>
                  <div class="text-[9px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                    <span>${planet.direction}</span>
                    <span>•</span>
                    <span>Alt: ${Math.round(planet.altitude)}°</span>
                  </div>
                </div>
              </div>
              <span class="text-[8px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${statusClass}">
                ${isVis ? "Visible" : planet.isAboveHorizon ? "In Sky" : "Below"}
              </span>
            </div>
          `;
        }).join("");

        // 7. Render Stars List
        starsList.innerHTML = sky.stars.map((star) => {
          const isVis = star.isCurrentlyVisible;
          const statusClass = isVis
            ? "text-indigo-600 dark:text-indigo-400 font-bold"
            : "text-slate-400";

          return `
            <div class="bg-slate-100/70 dark:bg-slate-800/60 rounded-xl p-2 flex flex-col justify-between border border-slate-200/50 dark:border-slate-700/50">
              <div class="flex items-start justify-between">
                <div class="min-w-0">
                  <div class="text-xs font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style="background-color: ${star.color}"></span>
                    <span>${star.name}</span>
                  </div>
                  <div class="text-[8px] text-slate-400 truncate mt-0.5">${star.constellation}</div>
                </div>
                <span class="text-[8px] font-semibold text-slate-400">m ${star.magnitude.toFixed(1)}</span>
              </div>
              <div class="text-[8px] ${statusClass} flex items-center justify-between mt-2 pt-1.5 border-t border-slate-200/40 dark:border-slate-700/40">
                <span>${star.direction} (${Math.round(star.altitude)}°)</span>
                <span>${isVis ? "Visible" : star.isAboveHorizon ? "Day" : "Set"}</span>
              </div>
            </div>
          `;
        }).join("");
      }).catch((err) => {
        console.warn("Celestial calculation error:", err);
      });
    } catch (e) {
      console.warn("Failed to load celestial sky module:", e);
    }
  }

function _renderMoonPhase(currentTime) {
    const moon = WeatherService.getMoonPhase(currentTime);
    this.$.moonPhaseLabel.textContent = moon.label;
    this.$.moonPhasePercent.textContent = `${Math.round(moon.phase * 100)}%`;
    this.$.moonPhaseDesc.textContent = `${moon.icon} Phase fraction: ${moon.phase.toFixed(2)}`;

    // Draw custom SVG moon shadowing
    this.$.moonLitPath.setAttribute("d", this.getMoonSvgPath(moon.phase));
  }

function getMoonSvgPath(p, cx = 20, cy = 20, r = 18) {
    if (p <= 0.03 || p >= 0.97) {
      return ""; // New Moon - completely dark
    }
    const topY = cy - r;
    const botY = cy + r;
    if (p >= 0.47 && p <= 0.53) {
      return `M ${cx} ${topY} A ${r} ${r} 0 0 1 ${cx} ${botY} A ${r} ${r} 0 0 1 ${cx} ${topY}`; // Full Moon
    }

    if (p < 0.5) {
      // Lit on the right side
      const rx = r - 4 * r * p;
      const sweep = rx < 0 ? 1 : 0;
      return `M ${cx} ${topY} A ${r} ${r} 0 0 1 ${cx} ${botY} A ${Math.abs(rx).toFixed(2)} ${r} 0 0 ${sweep} ${cx} ${topY}`;
    } else {
      // Lit on the left side (waning)
      const rx = r - 4 * r * (p - 0.5);
      const sweep = rx < 0 ? 1 : 0;
      return `M ${cx} ${topY} A ${r} ${r} 0 0 0 ${cx} ${botY} A ${Math.abs(rx).toFixed(2)} ${r} 0 0 ${sweep} ${cx} ${topY}`;
    }
  }

export function init(app) {
  app.updateAstronomyWidget = updateAstronomyWidget;
  app.updateCelestialBodies = updateCelestialBodies;
  app.getMoonSvgPath = getMoonSvgPath;
  app._renderPolarDayCycle = _renderPolarDayCycle;
  app._nextSunEvent = _nextSunEvent;
  app._renderMoonPhase = _renderMoonPhase;
}

export { getMoonSvgPath };
