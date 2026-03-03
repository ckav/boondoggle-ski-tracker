// gps-tracker.js — Battery-optimized GPS tracking

export class GPSTracker {
  constructor() {
    this.watchId = null;
    this.positions = [];
    this.lastPosition = null;
    this.onPosition = null;
    this.onError = null;
    this.onBattery = null;
    this.batteryLevel = null;
    this.batteryCharging = false;
    this._stationaryCount = 0;
    this._initBattery();
  }

  async _initBattery() {
    try {
      if ('getBattery' in navigator) {
        const battery = await navigator.getBattery();
        this._updateBattery(battery);
        battery.addEventListener('levelchange', () => this._updateBattery(battery));
        battery.addEventListener('chargingchange', () => this._updateBattery(battery));
      }
    } catch {
      // Battery API not available
    }
  }

  _updateBattery(battery) {
    this.batteryLevel = Math.round(battery.level * 100);
    this.batteryCharging = battery.charging;
    if (this.onBattery) {
      this.onBattery({
        level: this.batteryLevel,
        charging: this.batteryCharging,
        low: this.batteryLevel < 15 && !this.batteryCharging
      });
    }
  }

  start() {
    if (this.watchId !== null) return;
    if (!('geolocation' in navigator)) {
      if (this.onError) this.onError({ code: 0, message: 'Geolocation not supported' });
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this._handlePosition(pos),
      (err) => { if (this.onError) this.onError(err); },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000
      }
    );
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  _handlePosition(pos) {
    const { latitude, longitude, altitude, speed, accuracy, heading } = pos.coords;
    const timestamp = pos.timestamp;

    // Filter out low-accuracy readings
    if (accuracy > 30) return;

    // Deduplicate: skip if less than 2m from last position
    if (this.lastPosition) {
      const dist = haversine(
        this.lastPosition.lat, this.lastPosition.lng,
        latitude, longitude
      );
      if (dist < 2) {
        this._stationaryCount++;
        // When stationary, reduce update frequency
        if (this._stationaryCount < 3) return;
        this._stationaryCount = 0;
      } else {
        this._stationaryCount = 0;
      }
    }

    const point = {
      lat: latitude,
      lng: longitude,
      alt: altitude || 0,
      speed: speed !== null ? speed : 0, // m/s
      accuracy,
      heading: heading || 0,
      timestamp
    };

    this.lastPosition = point;
    this.positions.push(point);

    if (this.onPosition) {
      this.onPosition(point);
    }
  }

  getTrack() {
    return [...this.positions];
  }

  getLastPosition() {
    return this.lastPosition;
  }

  clearTrack() {
    this.positions = [];
    this.lastPosition = null;
  }

  isTracking() {
    return this.watchId !== null;
  }
}

// Haversine distance in meters
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
