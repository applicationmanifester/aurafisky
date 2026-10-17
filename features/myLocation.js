// -- MY LOCATION --

function getMyLocation() {
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      this.showToast("Location requires HTTPS or localhost (insecure connection).", "error");
      return;
    }

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

    const onLocationSuccess = (pos) => {
      this._lastKnownGpsCoords = pos.coords;
      const { latitude, longitude } = pos.coords;
      // Skip the second full fetch when the fresh fix rounds to the same
      // place we already showed optimistically
      if (
        optimisticCoords &&
        Math.abs(optimisticCoords.latitude - latitude) < 0.001 &&
        Math.abs(optimisticCoords.longitude - longitude) < 0.001
      ) {
        return;
      }
      this._debouncedHandleMapClick(latitude, longitude);
    };

    const onLocationError = (err) => {
      if (!this._lastKnownGpsCoords) {
        if (err.code === 1) {
          this.showToast(
            "Location permission denied. Click the lock/site settings icon in your address bar to allow location.",
            "error",
          );
        } else if (err.code === 2) {
          this.showToast(
            "Location unavailable. Please verify device Location Services are enabled.",
            "error",
          );
        } else if (err.code === 3) {
          this.showToast("Location request timed out. Retrying or search manually.", "error");
        } else {
          this.showToast("Could not get your location.", "error");
        }
      }
    };

    // First attempt: High Accuracy (GPS hardware on mobile / cellular tablets)
    navigator.geolocation.getCurrentPosition(
      onLocationSuccess,
      (err) => {
        // If high accuracy fails due to unavailable GPS hardware (desktop/laptop/indoor) or timeout,
        // fallback seamlessly to low accuracy (Wi-Fi / network IP triangulation)
        if (err.code === 2 || err.code === 3) {
          navigator.geolocation.getCurrentPosition(
            onLocationSuccess,
            onLocationError,
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
          );
        } else {
          onLocationError(err);
        }
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 300000 },
    );
  }

export function init(app) {
  app.getMyLocation = getMyLocation;
}
