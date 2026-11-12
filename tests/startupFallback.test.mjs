import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Startup Location Fallback Hierarchy", () => {
  let app;
  let mockLocalCache;

  beforeEach(() => {
    mockLocalCache = {};
    app = {
      _localCache: mockLocalCache,
      defaultLocation: null,
      defaultLocationNotify: false,
      selectedLat: null,
      selectedLng: null,
      selectedName: null,
      _sweepStaleCache: vi.fn(),
      _checkUrlParamsOnStartup: vi.fn().mockReturnValue(false),
      _hasPendingShareTarget: false,
      setLoadingProgress: vi.fn(),
      _loadLocalCache: vi.fn().mockResolvedValue(),
      _getTimezoneDefaultLocation: vi.fn().mockReturnValue({
        lat: 12.9716,
        lng: 77.5946,
        name: "Bengaluru"
      }),
      getLocalizedLocationName: vi.fn((loc) => loc?.name),
      setupHourlyNotifications: vi.fn(),
      getMyLocation: vi.fn(),
      selectLocation: vi.fn((lat, lng, name, opts) => {
        app.selectedLat = lat;
        app.selectedLng = lng;
        app.selectedName = name;
        if (!opts?.isFallback && !opts?.isAutomaticDefault && !opts?.restored) {
          app._persistSession(lat, lng, name, true);
        }
      }),
      _persistSession: vi.fn((lat, lng, name, userExplicit = true) => {
        if (!userExplicit) return;
        app._localCache._lastSession = { lat, lng, name, userExplicit: true };
      }),
      _restoreSession: function() {
        const saved = this._localCache?._lastSession;
        if (saved && saved.lat != null && saved.lng != null) {
          if (saved.isFallback || saved.userExplicit === false) {
            return false;
          }
          const tzDef = this._getTimezoneDefaultLocation();
          const isLegacyAutoDefault =
            saved.userExplicit === undefined &&
            ((Math.abs(saved.lat - tzDef.lat) < 0.005 && Math.abs(saved.lng - tzDef.lng) < 0.005) ||
             (Math.abs(saved.lat - 12.9716) < 0.005 && Math.abs(saved.lng - 77.5946) < 0.005));
          if (isLegacyAutoDefault) {
            return false;
          }
          this.selectLocation(saved.lat, saved.lng, saved.name, { restored: true });
          return true;
        }
        return false;
      },
      _loadInitialStartupLocation: async function() {
        this._sweepStaleCache();
        if (this._checkUrlParamsOnStartup() || this._hasPendingShareTarget) {
          return;
        }
        this.setLoadingProgress(70, "Finding your location");
        await this._loadLocalCache();

        // 2. Previous location: if user changed previously, restore it!
        if (this._restoreSession()) {
          return;
        }

        // 3. Fallback to live device coordinates
        const onCoordsUnavailable = () => {
          // 4. Fall back to Home Location if set
          if (this.defaultLocation && this.defaultLocation.lat != null) {
            this.selectLocation(
              this.defaultLocation.lat,
              this.defaultLocation.lng,
              this.getLocalizedLocationName(this.defaultLocation) || this.defaultLocation.name,
              { isHomeFallback: true }
            );
            if (this.defaultLocationNotify) this.setupHourlyNotifications();
            return;
          }
          if (this._restoreSession()) {
            return;
          }
          // Regional timezone default removed: do not force any arbitrary city
          this.setLoadingProgress(100);
        };

        this.getMyLocation({
          silent: false,
          precise: true,
          onFail: () => {
            onCoordsUnavailable();
          }
        });
      }
    };
  });

  it("Priority 1: restores previous location if user explicitly changed to one previously", async () => {
    app._localCache._lastSession = {
      lat: 13.0827,
      lng: 80.2707,
      name: "Chennai",
      userExplicit: true
    };

    await app._loadInitialStartupLocation();

    expect(app.selectLocation).toHaveBeenCalledWith(13.0827, 80.2707, "Chennai", { restored: true });
    expect(app.getMyLocation).not.toHaveBeenCalled();
  });

  it("Priority 2: falls back to live device coordinates when no previous user location exists", async () => {
    // Fresh user, no previous location
    app.getMyLocation.mockImplementation(({ onSuccess }) => {
      // Simulate GPS acquiring live coordinates
      app.selectLocation(12.5186, 78.2137, "Krishnagiri");
    });

    await app._loadInitialStartupLocation();

    expect(app.getMyLocation).toHaveBeenCalled();
    expect(app.selectedName).toBe("Krishnagiri");
  });

  it("Priority 3: if device coordinates are unavailable, falls back to user's set Home location", async () => {
    app.defaultLocation = {
      lat: 11.6643,
      lng: 78.1460,
      name: "Salem (Home)"
    };

    // Simulate GPS failing (e.g. permission denied or indoors)
    app.getMyLocation.mockImplementation(({ onFail }) => {
      if (typeof onFail === "function") onFail(new Error("permission_denied"));
    });

    await app._loadInitialStartupLocation();

    expect(app.getMyLocation).toHaveBeenCalled();
    expect(app.selectLocation).toHaveBeenCalledWith(
      11.6643,
      78.1460,
      "Salem (Home)",
      { isHomeFallback: true }
    );
  });

  it("Priority 4: if coordinates unavailable AND Home location not set, does NOT select any arbitrary timezone city", async () => {
    app.defaultLocation = null;

    app.getMyLocation.mockImplementation(({ onFail }) => {
      if (typeof onFail === "function") onFail(new Error("timeout"));
    });

    await app._loadInitialStartupLocation();

    // Ensures arbitrary regional timezone city is NEVER forced onto the user
    expect(app.selectLocation).not.toHaveBeenCalled();
    expect(app._localCache._lastSession).toBeUndefined();
    expect(app.setLoadingProgress).toHaveBeenCalledWith(100);
  });

  it("disregards legacy auto-saved Bengaluru default so mobile users are not permanently stuck", async () => {
    // Old legacy session without userExplicit flag
    app._localCache._lastSession = {
      lat: 12.9716,
      lng: 77.5946,
      name: "Bengaluru"
      // userExplicit is undefined
    };

    app.defaultLocation = {
      lat: 15.3647,
      lng: 75.1240,
      name: "Hubballi"
    };

    app.getMyLocation.mockImplementation(({ onFail }) => {
      onFail(new Error("denied"));
    });

    await app._loadInitialStartupLocation();

    // Because legacy Bengaluru was rejected, it tried GPS, then fell back to Home (Hubballi) instead of Bengaluru!
    expect(app.selectLocation).toHaveBeenCalledWith(
      15.3647,
      75.1240,
      "Hubballi",
      { isHomeFallback: true }
    );
  });
});

