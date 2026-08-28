const admin = require("firebase-admin");
const functions = require("firebase-functions");

admin.initializeApp();

exports.sendHourlyWeather = functions.pubsub
  .schedule("every 1 hours")
  .onRun(async () => {
    const db = admin.firestore();
    const usersSnap = await db.collection("users").get();
    const now = Date.now();

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const tokens = data.fcmTokens || [];
      if (
        !tokens.length ||
        !data.defaultLocationNotify ||
        !data.defaultLocation
      )
        continue;

      const last = data.lastWeatherPush || 0;
      if (now - last < 55 * 60 * 1000) continue;

      const loc = data.defaultLocation;
      let body = "Weather update available.";
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&current=temperature_2m,weather_code&timezone=auto`;
        const res = await fetch(url);
        const j = await res.json();
        const t = j.current && j.current.temperature_2m;
        if (t !== null && t !== undefined) body = `It's ${Math.round(t)}° at ${loc.name}.`;
      } catch (e) {
        /* keep fallback body */
      }

      const locName = loc.name || "your location";
      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens,
          notification: { title: `Weather Update: ${locName}`, body },
          data: { lat: String(loc.lat || 0), lng: String(loc.lng || 0), name: String(locName) },
        });

        // Prune invalid / unregistered tokens if any failed
        if (response.failureCount > 0) {
          const validTokens = [];
          response.responses.forEach((resp, idx) => {
            if (resp.success) {
              validTokens.push(tokens[idx]);
            }
          });
          await doc.ref.update({
            fcmTokens: validTokens,
            lastWeatherPush: now,
          });
        } else {
          await doc.ref.update({ lastWeatherPush: now });
        }
      } catch (e) {
        console.error("Push failed for", doc.id, e);
      }
    }
    return null;
  });
