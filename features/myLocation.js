// -- MY LOCATION --

function getMyLocation() {
    if (!navigator.geolocation) {
      this.showToast("Geolocation is not supported by your browser.", "error");
      return;
    }

    // Instant response (0ms) if pre-warmed GPS coordinates are available
    let optimisticCoords = null;
    if (this._lastKnownGpsCoords) {
      const { latitude, longitude } = this._lastKnownGpsCoords;
      optimisticCoords = { latitude, longitude };
      this._debouncedHandleMapClick(latitude, longitude);
    } else {
      this.showToast("Finding your location...", "info");
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this._lastKnownGpsCoords = pos.coords;
        const { latitude, longitude } = pos.coords;
        // Skip the second full fetch when the fresh fix rounds to the same
        // place we already showed optimistically — otherwise every click runs
        // selectLocation twice (two forecast + AQI pairs, two reverse geocodes)
        // and the panel visibly flickers.
        if (
          optimisticCoords &&
          Math.abs(optimisticCoords.latitude - latitude) < 0.001 &&
          Math.abs(optimisticCoords.longitude - longitude) < 0.001
        ) {
          return;
        }
        this._debouncedHandleMapClick(latitude, longitude);
      },
      (err) => {
        if (!this._lastKnownGpsCoords) {
          const messages = {
            1: "Location permission denied.",
            2: "Location unavailable.",
            3: "Location request timed out.",
          };
          this.showToast(
            messages[err.code] || "Could not get your location.",
            "error",
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }

export function init(app) {
  app.getMyLocation = getMyLocation;
}
