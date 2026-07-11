// Heavy compute moved off the main thread (Phase-1 goal). Receives the raw
// per-model snapshots and returns aggregated stats. Keeps the UI thread free
// even when comparing several forecast models.
self.onmessage = (e) => {
  const { id, snapshots } = e.data;
  const temps = snapshots
    .map((s) => s.temp)
    .filter((v) => typeof v === "number");
  if (!temps.length) {
    self.postMessage({
      id,
      result: {
        min: 0,
        max: 0,
        avg: 0,
        spread: 0,
        agreement: "Low",
        maxPrecip: 0,
      },
    });
    return;
  }
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
  const spread = max - min;
  const agreement = spread <= 1 ? "High" : spread <= 3 ? "Medium" : "Low";
  let maxPrecip = 0;
  snapshots.forEach((s) =>
    (s.precipProb || []).forEach((p) => {
      if (p > maxPrecip) maxPrecip = p;
    }),
  );
  self.postMessage({
    id,
    result: { min, max, avg, spread, agreement, maxPrecip },
  });
};
