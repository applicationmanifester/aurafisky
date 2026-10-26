# Aurafisky Remodeling Roadmap (3–6 Months)

## Guiding Principles
- **Keep the existing visual language and map-first identity.**
- **Fix reliability first** — nothing else matters if data doesn't load.
- **Double down on the two unique strengths:** Route Weather Studio and Ask Aura.
- **Ship in vertical slices** so the product improves every 2–3 weeks.

---

## Phase 1: Stabilize the Foundation (Weeks 1–5)
**Goal:** Make the app feel reliable and trustworthy.  
**Success metric:** Any point on the map or searched city shows accurate current weather within 1–2 seconds, with clear loading and error states.

| Priority | Work Item | Impact | Effort | Status |
| :--- | :--- | :--- | :--- | :--- |
| **P0** | Fix location resolution & reverse geocoding | Critical | Medium | Completed |
| **P0** | Reliable current conditions + hourly data loading | Critical | Medium | Completed |
| **P0** | Proper error states + retry logic (no more silent "--°") | Critical | Low | Completed |
| **P1** | Fast initial map load + progressive weather overlay | High | Medium | Completed |
| **P1** | Basic offline cache (last viewed locations) | High | Medium | Completed |
| **P1** | Mobile layout refinements for the left panel | High | Medium | Completed |

---

## Phase 2: Core Weather Experience Upgrade (Weeks 5–10)
**Goal:** Match or exceed baseline expectations of top 2026 weather apps.

| Priority | Work Item | Impact | Effort | Status |
| :--- | :--- | :--- | :--- | :--- |
| **P0** | Minute-by-minute precipitation nowcast (next 1–2 hours) | Very High | High | Completed |
| **P0** | Animated radar + short historical playback | Very High | High | Completed |
| **P1** | Multi-model ensemble support + confidence indicators | High | High | In Progress |
| **P1** | Improved AQI (pollutants + pollen) + UV guidance | High | Medium | Completed |
| **P1** | Official severe weather alerts integration | High | Medium | Completed |
| **P2** | Pressure trends, wind gusts, visibility, dew-point comfort | Medium | Low | Completed |

---

## Phase 3: Elevate the Differentiating Features (Weeks 8–14)
**Goal:** Make Route Weather Studio and Ask Aura the reasons people stay.

### Route Weather Studio
- Time-aware weather along the entire route (conditions at the time you will actually be there) — [Completed]
- Color-coded route segments (clear 🟢 → moderate 🟡 → severe 🔴) — [Completed]
- AI-generated pre-trip briefing + smart departure time suggestions — [Completed]
- Weather-aware alternative routes.
- Better multi-stop support and realistic speeds for bike/walk/hike — [Completed]
- Stronger offline GPX + navigation handoff — [Completed]

### Ask Aura
- True conversational mode with context (current location, saved places, recent routes) — [Completed]
- Practical answers: *"Best time to leave?"*, *"Will it be good for outdoor photography?"*, *"Compare these three cities next week"* — [Completed]
- Ability to generate and share daily/weekly briefings — [Completed]

---

## Phase 4: Platform & Polish (Weeks 12–20+)
**Goal:** Turn it from a web app into a daily habit.
- Excellent PWA install experience + push notifications (rain start/end, severe alerts) — [Completed]
- Home-screen widgets / lock-screen complications (PWA AdaptiveCard widgets) — [Completed]
- User accounts for syncing saved locations, routes, and preferences — [Completed via Firebase sync]
- Performance optimization (map tiles, radar, LRU & localStorage data caching) — [Completed]
- Accessibility and high-contrast refinements — [Completed]
- Expanded localization — [In Progress]

---

## Team Focus & Execution Cadence
- **Weeks 1–5:** Reliability + data pipeline (do not skip this)
- **Weeks 5–10:** Nowcasting + radar
- **Weeks 8–14:** Route Weather intelligence + Ask Aura depth
- **Ongoing:** Mobile polish and performance

### Key Risks to Avoid
1. Polishing visuals before data is reliable.
2. Adding too many map layers before the core experience is solid.
3. Building complex AI features before the underlying weather data is trustworthy.
