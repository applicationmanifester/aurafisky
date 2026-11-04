// -- ASTRONOMY & DAY CYCLES --
import { calculateCelestialSky, projectToSkyDome } from "./celestial.js";

function updateAstronomyWidget(weather, _hourIndex) {
    if (!this.weatherData) return;
    if (typeof document !== "undefined") wireSkyRadarFullscreen(this);

    try {
      const currentTime = new Date(weather?.time || Date.now());

      // Always compute & render real planetary, star, and celestial positions
      // immediately on every timeline scrub or weather update, independent of daily sunrise/sunset!
      this.updateCelestialBodies(currentTime);

      const dateStr = weather?.time ? weather.time.split("T")[0] : "";
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

      // Independent of the day-length math below — the sky gazing score
      // only needs cloud cover and moon phase, so it renders the same way
      // on a polar day/night as on any other, and above the early return.
      this.updateStargazingWidget(weather, currentDayData, currentTime);

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

    try {
      const sky = calculateCelestialSky(lat, lng, currentTime || new Date());
      if (!sky) return;

      const planetsList = document.getElementById("celestialPlanetsList");
      const starsList = document.getElementById("celestialStarsList");
      const planetsBadge = document.getElementById("planetsVisibleBadge");
      const starsBadge = document.getElementById("starsVisibleBadge");

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

          // Add Sun to dome if above horizon (Daylight)
          if (sky.sun && sky.sun.isAboveHorizon) {
            const sPos = projectToSkyDome(sky.sun.altitude, sky.sun.azimuth, 80, 100, 100);
            if (sPos.isVisible) {
              const labelY = getCleanLabelOffset(sPos.x, sPos.y);
              domeElements.push(`
                <g transform="translate(${sPos.x.toFixed(1)}, ${sPos.y.toFixed(1)})" class="cursor-pointer">
                  <title>Sun: Alt ${sky.sun.altitude.toFixed(1)}°, Az ${sky.sun.azimuth.toFixed(1)}° (${sky.sun.direction}) • Daylight</title>
                  <circle cx="0" cy="0" r="8" fill="#f59e0b" opacity="0.25" filter="drop-shadow(0 0 8px #f59e0b)"/>
                  <circle cx="0" cy="0" r="5.5" fill="#f59e0b" filter="drop-shadow(0 0 5px rgba(245,158,11,0.9))"/>
                  <circle cx="0" cy="0" r="3.5" fill="#fef08a"/>
                  <text x="0" y="${labelY}" text-anchor="middle" font-size="6" font-weight="bold" fill="#fbbf24" stroke="#090d16" stroke-width="2" paint-order="stroke">Sun</text>
                </g>
              `);
            }
          }

          // Add Moon to dome if above horizon
          if (sky.moon && sky.moon.isAboveHorizon) {
            const mPos = projectToSkyDome(sky.moon.altitude, sky.moon.azimuth, 80, 100, 100);
            if (mPos.isVisible) {
              const labelY = getCleanLabelOffset(mPos.x, mPos.y);
              domeElements.push(`
                <g transform="translate(${mPos.x.toFixed(1)}, ${mPos.y.toFixed(1)})" class="cursor-pointer">
                  <title>Moon: ${sky.moon.phaseName || ''} (${sky.moon.phasePercent}% lit) • Alt ${sky.moon.altitude.toFixed(1)}°, Az ${sky.moon.azimuth.toFixed(1)}° (${sky.moon.direction})</title>
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
                  <g transform="translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})" class="cursor-pointer">
                    <title>${p.name}: Alt ${p.altitude.toFixed(1)}°, Az ${p.azimuth.toFixed(1)}° (${p.direction})</title>
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
                  <g transform="translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})" class="cursor-pointer">
                    <title>${s.name} (${s.constellation}): Alt ${s.altitude.toFixed(1)}°, Az ${s.azimuth.toFixed(1)}°</title>
                    <circle cx="0" cy="0" r="${r}" fill="${s.color}" />
                    <text x="0" y="${labelY}" text-anchor="middle" font-size="5" fill="#cbd5e1" stroke="#090d16" stroke-width="1.6" paint-order="stroke" opacity="0.9">${s.name}</text>
                  </g>
                `);
              }
            }
          });

          // Add Satellites to dome if above horizon (ISS, Tiangong CSS, Hubble)
          sky.satellites?.forEach((sat) => {
            if (sat.isAboveHorizon && sat.altitude > 0) {
              const pos = projectToSkyDome(sat.altitude, sat.azimuth, 80, 100, 100);
              if (pos.isVisible) {
                const isPass = sat.isCurrentlyVisible;
                const glow = isPass ? 'filter="drop-shadow(0 0 5px #38bdf8)"' : "";
                domeElements.push(`
                  <g transform="translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})" class="cursor-pointer">
                    <title>${sat.name}: Alt ${sat.altitude.toFixed(1)}°, Az ${sat.azimuth.toFixed(1)}° (${sat.statusText})</title>
                    <text x="0" y="3" text-anchor="middle" font-size="6.5" ${glow}>🛰️</text>
                    <text x="0" y="-4.5" text-anchor="middle" font-size="4" font-weight="bold" fill="#38bdf8" stroke="#090d16" stroke-width="1.4" paint-order="stroke">${sat.id.toUpperCase()}</text>
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

        // 6. Render Solar System Bodies (Sun, Moon & Planets)
        const primaryBodies = [];
        if (sky.sun) {
          primaryBodies.push({
            name: "Sun",
            icon: "☀️",
            subtitle: "Daylight Luminary",
            mag: -26.7,
            direction: sky.sun.direction,
            altitude: sky.sun.altitude,
            isAboveHorizon: sky.sun.isAboveHorizon,
            isCurrentlyVisible: sky.sun.isCurrentlyVisible,
            badgeText: sky.sun.isAboveHorizon ? "Daylight" : "Below",
            badgeClass: sky.sun.isAboveHorizon
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
              : "bg-slate-200/50 dark:bg-slate-800/50 text-slate-400"
          });
        }
        if (sky.moon) {
          primaryBodies.push({
            name: "Moon",
            icon: sky.moon.icon || "🌙",
            subtitle: `${sky.moon.phaseName || "Phase"} (${sky.moon.phasePercent}% lit)`,
            mag: sky.moon.magnitude,
            direction: sky.moon.direction,
            altitude: sky.moon.altitude,
            isAboveHorizon: sky.moon.isAboveHorizon,
            isCurrentlyVisible: sky.moon.isCurrentlyVisible,
            badgeText: sky.moon.isCurrentlyVisible ? "Visible" : sky.moon.isAboveHorizon ? "In Sky" : "Below",
            badgeClass: sky.moon.isCurrentlyVisible
              ? "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
              : sky.moon.isAboveHorizon
                ? "bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                : "bg-slate-200/50 dark:bg-slate-800/50 text-slate-400"
          });
        }
        if (sky.planets) {
          sky.planets.forEach((p) => {
            primaryBodies.push({
              name: p.name,
              icon: p.icon,
              subtitle: null,
              mag: p.magnitude,
              direction: p.direction,
              altitude: p.altitude,
              isAboveHorizon: p.isAboveHorizon,
              isCurrentlyVisible: p.isCurrentlyVisible,
              badgeText: p.isCurrentlyVisible ? "Visible" : p.isAboveHorizon ? "In Sky" : "Below",
              badgeClass: p.isCurrentlyVisible
                ? "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                : p.isAboveHorizon
                  ? "bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                  : "bg-slate-200/50 dark:bg-slate-800/50 text-slate-400"
            });
          });
        }

      if (planetsList) {
        planetsList.innerHTML = primaryBodies.map((body) => {
          return `
            <div class="bg-slate-100/70 dark:bg-slate-800/60 rounded-xl p-2.5 flex items-center justify-between border border-slate-200/50 dark:border-slate-700/50 transition-all hover:border-slate-300 dark:hover:border-slate-600">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="text-xl flex-shrink-0" aria-hidden="true">${body.icon}</span>
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs font-bold text-slate-800 dark:text-slate-200">${body.name}</span>
                    <span class="text-[9px] text-slate-400">${body.subtitle ? body.subtitle : `mag ${body.mag.toFixed(1)}`}</span>
                  </div>
                  <div class="text-[9px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                    <span>${body.direction}</span>
                    <span>•</span>
                    <span>Alt: ${Math.round(body.altitude)}°</span>
                  </div>
                </div>
              </div>
              <span class="text-[8px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${body.badgeClass}">
                ${body.badgeText}
              </span>
            </div>
          `;
        }).join("");
      }

      // 7. Render Stars List
      if (starsList) {
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
      }

      // 8. Render Fullscreen Topdown Side Panels (Left: Planets/Satellites/Meteors, Right: Constellations/Stars)
      renderFullscreenSkyPanels(sky);
    } catch (err) {
      console.warn("Celestial calculation error:", err);
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

let skyRadarPlaceholder = null;

function wireSkyRadarFullscreen(app) {
  const btn = document.getElementById("expandSkyRadarBtn");
  const section = document.getElementById("celestialRadarSection");
  const expandIcon = document.getElementById("skyRadarExpandIcon");
  const compressIcon = document.getElementById("skyRadarCompressIcon");
  const expandText = document.getElementById("skyRadarExpandText");
  const footer = document.getElementById("skyRadarFullscreenFooter");

  if (!btn || !section || section._hasFullscreenWired) return;
  section._hasFullscreenWired = true;

  const toggleFullscreen = (force) => {
    const isCurrentlyFull = section.classList.contains("sky-radar-fullscreen");
    const becomeFull = typeof force === "boolean" ? force : !isCurrentlyFull;

    if (becomeFull === isCurrentlyFull) return;

    if (becomeFull) {
      // Teleport to document.body to escape the containing block created by
      // .weather-panel (transform: translateX(0) & contain: paint)
      if (!skyRadarPlaceholder) {
        skyRadarPlaceholder = document.createElement("div");
        skyRadarPlaceholder.id = "celestialRadarPlaceholder";
        skyRadarPlaceholder.style.display = "none";
      }
      if (section.parentNode) {
        section.parentNode.insertBefore(skyRadarPlaceholder, section);
      }
      document.body.appendChild(section);

      section.classList.add("sky-radar-fullscreen");
      document.body.classList.add("sky-radar-fullscreen-active");
      app?.pushHistoryOverlay?.("skyRadar");
    } else {
      section.classList.remove("sky-radar-fullscreen");
      document.body.classList.remove("sky-radar-fullscreen-active");
      app?.popHistoryOverlay?.("skyRadar");

      // Clean up open mobile panels
      document.getElementById("skyRadarLeftPanel")?.classList.remove("panel-open-mobile");
      document.getElementById("skyRadarRightPanel")?.classList.remove("panel-open-mobile");
      document.getElementById("toggleLeftSkyPanelBtn")?.classList.remove("active");
      document.getElementById("toggleRightSkyPanelBtn")?.classList.remove("active");
      document.body.classList.remove("sky-panel-dropdown-open");

      // Restore back to original slot in Astronomy tab
      if (skyRadarPlaceholder && skyRadarPlaceholder.parentNode) {
        skyRadarPlaceholder.parentNode.insertBefore(section, skyRadarPlaceholder);
        skyRadarPlaceholder.remove();
        skyRadarPlaceholder = null;
      }
    }

    btn.setAttribute("aria-expanded", becomeFull ? "true" : "false");
    btn.setAttribute("title", becomeFull ? "Exit Full Screen (Esc)" : "Full Screen Sky Radar");
    btn.setAttribute("aria-label", becomeFull ? "Exit Full Screen" : "Full Screen Sky Radar");

    if (expandIcon) expandIcon.classList.toggle("hidden", becomeFull);
    if (compressIcon) compressIcon.classList.toggle("hidden", !becomeFull);
    if (expandText) {
      expandText.textContent = becomeFull ? "Close" : "Expand";
    }
    if (footer) footer.classList.toggle("hidden", !becomeFull);

    if (becomeFull) {
      const timeStr = app?.weatherData?.hourly?.time?.[app?.currentHourIndex];
      const currentTime = timeStr ? new Date(timeStr) : (app?.currentTime || new Date());
      if (typeof app?.updateCelestialBodies === "function") {
        app.updateCelestialBodies(currentTime);
      }
    }
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFullscreen();
    app?._haptic?.("selection");
  });

  // Wire Mobile Quick-Toggle Buttons and Side Panels
  const toggleLeftBtn = document.getElementById("toggleLeftSkyPanelBtn");
  const toggleRightBtn = document.getElementById("toggleRightSkyPanelBtn");
  const leftPanel = document.getElementById("skyRadarLeftPanel");
  const rightPanel = document.getElementById("skyRadarRightPanel");

  const syncBodyDropdownState = () => {
    const isAnyOpen = Boolean(
      leftPanel?.classList.contains("panel-open-mobile") ||
      rightPanel?.classList.contains("panel-open-mobile")
    );
    document.body.classList.toggle("sky-panel-dropdown-open", isAnyOpen);
  };

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && section.classList.contains("sky-radar-fullscreen")) {
      if (document.body.classList.contains("sky-panel-dropdown-open")) {
        leftPanel?.classList.remove("panel-open-mobile");
        rightPanel?.classList.remove("panel-open-mobile");
        toggleLeftBtn?.classList.remove("active");
        toggleLeftBtn?.setAttribute("aria-expanded", "false");
        toggleRightBtn?.classList.remove("active");
        toggleRightBtn?.setAttribute("aria-expanded", "false");
        syncBodyDropdownState();
        return;
      }
      toggleFullscreen(false);
    }
  });

  // Wire Topdown Tab Switchers for Left and Right Panels
  const tabButtons = section.querySelectorAll(".sky-tab-btn");
  tabButtons.forEach((tabBtn) => {
    tabBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const side = tabBtn.dataset.side;
      const tabName = tabBtn.dataset.tab;
      const panel = side === "left" ? document.getElementById("skyRadarLeftPanel") : document.getElementById("skyRadarRightPanel");
      if (!panel) return;

      // Update button active state in this group
      panel.querySelectorAll(".sky-tab-btn").forEach((b) => b.classList.toggle("active", b === tabBtn));

      // Update visible pane
      panel.querySelectorAll(".sky-tab-pane").forEach((pane) => {
        const paneId = pane.id.toLowerCase();
        pane.classList.toggle("active", paneId.includes(tabName.toLowerCase()));
      });
      app?._haptic?.("selection");
    });
  });

  // Wire Mobile Quick-Toggle Buttons
  if (toggleLeftBtn && leftPanel) {
    toggleLeftBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = leftPanel.classList.toggle("panel-open-mobile");
      if (isOpen && rightPanel) {
        rightPanel.classList.remove("panel-open-mobile");
        if (toggleRightBtn) {
          toggleRightBtn.classList.remove("active");
          toggleRightBtn.setAttribute("aria-expanded", "false");
        }
      }
      toggleLeftBtn.classList.toggle("active", isOpen);
      toggleLeftBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      syncBodyDropdownState();
      app?._haptic?.("selection");
    });
  }

  if (toggleRightBtn && rightPanel) {
    toggleRightBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = rightPanel.classList.toggle("panel-open-mobile");
      if (isOpen && leftPanel) {
        leftPanel.classList.remove("panel-open-mobile");
        if (toggleLeftBtn) {
          toggleLeftBtn.classList.remove("active");
          toggleLeftBtn.setAttribute("aria-expanded", "false");
        }
      }
      toggleRightBtn.classList.toggle("active", isOpen);
      toggleRightBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      syncBodyDropdownState();
      app?._haptic?.("selection");
    });
  }

  // Wire Close buttons
  section.querySelectorAll(".sky-panel-close-btn").forEach((closeBtn) => {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const panelSide = closeBtn.dataset.panel;
      const targetPanel = panelSide === "left" ? leftPanel : rightPanel;
      if (targetPanel) targetPanel.classList.remove("panel-open-mobile");
      if (toggleLeftBtn) {
        toggleLeftBtn.classList.remove("active");
        toggleLeftBtn.setAttribute("aria-expanded", "false");
      }
      if (toggleRightBtn) {
        toggleRightBtn.classList.remove("active");
        toggleRightBtn.setAttribute("aria-expanded", "false");
      }
      syncBodyDropdownState();
      app?._haptic?.("selection");
    });
  });

  // Tap outside dismissal: tapping dome area or background closes mobile dropdown panel
  section.addEventListener("click", (e) => {
    if (!document.body.classList.contains("sky-panel-dropdown-open")) return;
    const isInsidePanel = e.target.closest(".sky-radar-side-panel.panel-open-mobile");
    const isInsideToggle = e.target.closest("#toggleLeftSkyPanelBtn, #toggleRightSkyPanelBtn");
    if (!isInsidePanel && !isInsideToggle) {
      leftPanel?.classList.remove("panel-open-mobile");
      rightPanel?.classList.remove("panel-open-mobile");
      toggleLeftBtn?.classList.remove("active");
      toggleLeftBtn?.setAttribute("aria-expanded", "false");
      toggleRightBtn?.classList.remove("active");
      toggleRightBtn?.setAttribute("aria-expanded", "false");
      syncBodyDropdownState();
    }
  });

  if (app) {
    app.toggleSkyRadarFullscreen = toggleFullscreen;
  }
}

export function init(app) {
  app.updateAstronomyWidget = updateAstronomyWidget;
  app.updateCelestialBodies = updateCelestialBodies;
  app.getMoonSvgPath = getMoonSvgPath;
  app._renderPolarDayCycle = _renderPolarDayCycle;
  app._nextSunEvent = _nextSunEvent;
  app._renderMoonPhase = _renderMoonPhase;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => wireSkyRadarFullscreen(app), { once: true });
    } else {
      wireSkyRadarFullscreen(app);
    }
  }
}

export { getMoonSvgPath };

/**
 * Renders data into the Left and Right Topdown Tabs for Fullscreen Live Sky Dome.
 */
function renderFullscreenSkyPanels(sky) {
  if (!sky) return;

  // Performance optimization: skip re-rendering 42 heavy HTML cards when sky radar is not fullscreen
  const isFullscreen = document.body.classList.contains("sky-radar-fullscreen-active") ||
    document.getElementById("celestialRadarSection")?.classList.contains("sky-radar-fullscreen");
  if (!isFullscreen) return;

  // ── LEFT PANEL: Tab 1 (Solar System: Sun, Moon & Planets) ──
  const fsPlanets = document.getElementById("skyFullscreenPlanetsList");
  if (fsPlanets) {
    const cards = [];

    // 1. Sun Card
    if (sky.sun) {
      const isSunUp = sky.sun.isAboveHorizon;
      const statusClass = isSunUp
        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.25)]"
        : "bg-slate-800/60 text-slate-400 border border-slate-700/40";
      cards.push(`
        <div class="sky-panel-card flex items-center justify-between text-xs border-amber-500/30 bg-amber-500/5">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-base flex-shrink-0">☀️</span>
            <div class="min-w-0">
              <div class="font-bold text-amber-100 flex items-center gap-1.5">
                <span>Sun</span>
                <span class="text-[9px] font-normal text-amber-300/70">mag -26.7</span>
              </div>
              <div class="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                <span>${sky.sun.direction}</span>
                <span>•</span>
                <span>Alt ${Math.round(sky.sun.altitude)}°</span>
                ${isSunUp ? '<span class="text-amber-300/80">• Daylight</span>' : ''}
              </div>
            </div>
          </div>
          <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${statusClass}">
            ${isSunUp ? "In Sky ☀️" : "Below"}
          </span>
        </div>
      `);
    }

    // 2. Moon Card
    if (sky.moon) {
      const isVis = sky.moon.isCurrentlyVisible;
      const statusClass = isVis
        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.25)]"
        : sky.moon.isAboveHorizon
          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
          : "bg-slate-800/60 text-slate-400 border border-slate-700/40";

      cards.push(`
        <div class="sky-panel-card flex items-center justify-between text-xs border-indigo-400/25 bg-indigo-500/5">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-base flex-shrink-0">${sky.moon.icon || '🌙'}</span>
            <div class="min-w-0">
              <div class="font-bold text-slate-100 flex items-center gap-1.5">
                <span>Moon</span>
                <span class="text-[9px] font-normal text-slate-400">${sky.moon.phaseName || ''} (${sky.moon.phasePercent}% lit)</span>
              </div>
              <div class="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                <span>${sky.moon.direction}</span>
                <span>•</span>
                <span>Alt ${Math.round(sky.moon.altitude)}°</span>
              </div>
            </div>
          </div>
          <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${statusClass}">
            ${isVis ? "Visible 🌙" : sky.moon.isAboveHorizon ? "In Sky" : "Below"}
          </span>
        </div>
      `);
    }

    // Divider for Planets
    cards.push(`
      <div class="text-[9.5px] font-bold uppercase tracking-wider text-slate-400/80 px-1 pt-1 pb-0.5 flex items-center gap-1.5">
        <span>🪐 Planets</span>
        <div class="h-px flex-1 bg-white/10"></div>
      </div>
    `);

    // 3. Planets
    if (sky.planets) {
      sky.planets.forEach((planet) => {
        const isVis = planet.isCurrentlyVisible;
        const statusClass = isVis
          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
          : planet.isAboveHorizon
            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
            : "bg-slate-800/60 text-slate-400 border border-slate-700/40";

        cards.push(`
          <div class="sky-panel-card flex items-center justify-between text-xs">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-base flex-shrink-0">${planet.icon}</span>
              <div class="min-w-0">
                <div class="font-bold text-slate-100 flex items-center gap-1.5">
                  <span>${planet.name}</span>
                  <span class="text-[9px] font-normal text-slate-400">mag ${planet.magnitude.toFixed(1)}</span>
                </div>
                <div class="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                  <span>${planet.direction}</span>
                  <span>•</span>
                  <span>Alt ${Math.round(planet.altitude)}°</span>
                </div>
              </div>
            </div>
            <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${statusClass}">
              ${isVis ? "Visible" : planet.isAboveHorizon ? "In Sky" : "Below"}
            </span>
          </div>
        `);
      });
    }

    fsPlanets.innerHTML = cards.join("");
  }

  // ── LEFT PANEL: Tab 2 (Satellites: ISS, Tiangong, Hubble) ──
  const fsSatellites = document.getElementById("skyFullscreenSatellitesList");
  if (fsSatellites && sky.satellites) {
    fsSatellites.innerHTML = sky.satellites.map((sat) => {
      const isVis = sat.isCurrentlyVisible;
      const statusClass = isVis
        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.3)] animate-pulse"
        : sat.isAboveHorizon
          ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
          : "bg-slate-800/60 text-slate-400 border border-slate-700/40";

      return `
        <div class="sky-panel-card flex flex-col gap-1 text-xs">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-base">${sat.icon}</span>
              <span class="font-bold text-slate-100">${sat.name}</span>
            </div>
            <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${statusClass}">
              ${isVis ? "Visible Pass 🔥" : sat.isAboveHorizon ? "Overhead" : "In Orbit"}
            </span>
          </div>
          <div class="text-[10px] text-slate-300 flex items-center gap-2 mt-0.5">
            <span>Alt ${Math.round(sat.altitude)}° (${sat.direction})</span>
            <span>•</span>
            <span>Range ${sat.distanceKm} km</span>
          </div>
          <div class="text-[9.5px] text-slate-400 font-medium">
            ${sat.statusText}
          </div>
        </div>
      `;
    }).join("");
  }

  // ── LEFT PANEL: Tab 3 (Meteors & Eclipses) ──
  const fsMeteors = document.getElementById("skyFullscreenMeteorsList");
  if (fsMeteors) {
    const parts = [];
    if (sky.meteorShowers?.length > 0) {
      sky.meteorShowers.slice(0, 3).forEach((m) => {
        const isPeak = m.isActive;
        parts.push(`
          <div class="sky-panel-card flex flex-col gap-1 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-bold text-slate-100 flex items-center gap-1">
                <span>🌠</span> ${m.name} Shower
              </span>
              <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${isPeak ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}">
                ${isPeak ? "Active Now 🔥" : `In ${m.daysUntilPeak}d`}
              </span>
            </div>
            <div class="text-[10px] text-slate-300 flex items-center gap-2">
              <span>Peak: ${m.peakDateStr}</span>
              <span>•</span>
              <span>~${m.zhr} meteors/hr</span>
            </div>
            <div class="text-[9.5px] text-slate-400">Radiant: ${m.constellation}</div>
          </div>
        `);
      });
    }
    if (sky.eclipses) {
      const nextEclipse = sky.eclipses.lunar || sky.eclipses.solar;
      if (nextEclipse) {
        const isLunar = Boolean(sky.eclipses.lunar);
        parts.push(`
          <div class="sky-panel-card flex flex-col gap-1 text-xs border-purple-500/30">
            <div class="flex items-center justify-between">
              <span class="font-bold text-slate-100 flex items-center gap-1">
                <span>${isLunar ? '🌕' : '☀️'}</span> Next Eclipse
              </span>
              <span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                ${isLunar ? 'Lunar' : 'Solar'}
              </span>
            </div>
            <div class="text-[10px] text-slate-300">${nextEclipse.kind} on ${nextEclipse.dateStr}</div>
          </div>
        `);
      }
    }
    fsMeteors.innerHTML = parts.join("");
  }

  // ── RIGHT PANEL: Tab 1 (Constellations) ──
  const fsConstellations = document.getElementById("skyFullscreenConstellationsList");
  if (fsConstellations && sky.constellations) {
    fsConstellations.innerHTML = sky.constellations.map((c) => {
      const isVis = c.isCurrentlyVisible;
      const statusClass = isVis
        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
        : c.isAboveHorizon
          ? "bg-slate-700/50 text-slate-300 border border-slate-600/30"
          : "bg-slate-800/40 text-slate-500 border border-slate-800/40";

      return `
        <div class="sky-panel-card flex flex-col gap-1 text-xs">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-base">${c.icon}</span>
              <div class="min-w-0">
                <span class="font-bold text-slate-100 truncate block">${c.name}</span>
                <span class="text-[9px] text-slate-400 block">${c.english}</span>
              </div>
            </div>
            <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${statusClass}">
              ${isVis ? (c.altitude > 45 ? "Overhead" : "Visible") : c.isAboveHorizon ? "Day" : "Set"}
            </span>
          </div>
          <div class="text-[9.5px] text-slate-400 flex items-center justify-between mt-1 pt-1 border-t border-white/5">
            <span>${c.statusText}</span>
            <span class="text-[8.5px] text-slate-500">${c.season}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  // ── RIGHT PANEL: Tab 2 (Prominent Stars) ──
  const fsStars = document.getElementById("skyFullscreenStarsList");
  if (fsStars && sky.stars) {
    fsStars.innerHTML = sky.stars.map((s) => {
      const isVis = s.isCurrentlyVisible;
      const statusClass = isVis
        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
        : "bg-slate-800/60 text-slate-500 border border-slate-700/40";

      return `
        <div class="sky-panel-card flex items-center justify-between text-xs">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${s.color}; box-shadow: 0 0 6px ${s.color}"></span>
            <div class="min-w-0">
              <div class="font-bold text-slate-100 flex items-center gap-1.5">
                <span>${s.name}</span>
                <span class="text-[9px] font-normal text-slate-400">m ${s.magnitude.toFixed(1)}</span>
              </div>
              <div class="text-[10px] text-slate-400 mt-0.5">${s.constellation} • Alt ${Math.round(s.altitude)}° in ${s.direction}</div>
            </div>
          </div>
          <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${statusClass}">
            ${isVis ? "Visible" : s.isAboveHorizon ? "Day" : "Set"}
          </span>
        </div>
      `;
    }).join("");
  }

  // ── RIGHT PANEL: Tab 3 (Dark Sky & Quality) ──
  const fsQuality = document.getElementById("skyFullscreenQualityContent");
  if (fsQuality && sky.lightPollution) {
    const lp = sky.lightPollution;
    fsQuality.innerHTML = `
      <div class="sky-panel-card flex flex-col gap-1.5 text-xs">
        <div class="flex items-center justify-between">
          <span class="font-bold text-slate-100">Bortle Dark Sky Scale</span>
          <span class="text-[9px] font-bold px-2 py-0.5 rounded-full" style="background: ${lp.color}25; color: ${lp.color}; border: 1px solid ${lp.color}40">${lp.badge}</span>
        </div>
        <div class="text-xs font-bold text-slate-200">${lp.title}</div>
        <div class="text-[10px] text-slate-400">${lp.description}</div>
      </div>
      <div class="sky-panel-card flex flex-col gap-1 text-xs">
        <div class="text-slate-300 font-semibold text-[11px]">Naked-Eye Visibility</div>
        <div class="text-[10px] text-slate-400">
          ${sky.isDarkNight ? '🌌 Astronomical dark night. High contrast naked-eye viewing.' : sky.isNight ? '🌃 Night sky with twilight glow.' : '☀️ Sun above horizon. Visible objects limited to Sun and Moon.'}
        </div>
      </div>
    `;
  }
}
