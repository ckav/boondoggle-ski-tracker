// stats.js — Speed calculation, run detection, unit conversion

import { haversine } from './gps-tracker.js';

// Run detection states
const RUN_STATE = {
  IDLE: 'IDLE',
  ASCENDING: 'ASCENDING',
  DESCENDING: 'DESCENDING'
};

const MIN_ALTITUDE_CHANGE = 50; // meters to count as a run
const ALTITUDE_WINDOW = 10; // readings for trend detection
const LIFT_SPEED_MIN = 0.5; // m/s (~2 km/h)
const LIFT_SPEED_MAX = 7; // m/s (~25 km/h)
const SKI_SPEED_MIN = 1.4; // m/s (~5 km/h)

export class StatsEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.maxSpeed = 0;
    this.totalDistance = 0;
    this.totalMovingTime = 0;
    this.maxAltitude = 0;
    this.minAltitude = Infinity;
    this.currentSpeed = 0;
    this.totalRuns = 0;
    this.runState = RUN_STATE.IDLE;
    this.altitudeBuffer = [];
    this.runAltStart = 0;
    this.lastPoint = null;
    this.verticalDrop = 0;
    this.totalVertical = 0;
  }

  update(point) {
    const speedKmh = point.speed * 3.6; // m/s to km/h

    // Current speed (use GPS speed, fallback to calculation)
    if (point.speed > 0) {
      this.currentSpeed = point.speed;
    } else if (this.lastPoint) {
      const dist = haversine(this.lastPoint.lat, this.lastPoint.lng, point.lat, point.lng);
      const timeDelta = (point.timestamp - this.lastPoint.timestamp) / 1000;
      if (timeDelta > 0) {
        this.currentSpeed = dist / timeDelta;
      }
    }

    // Max speed
    if (this.currentSpeed > this.maxSpeed) {
      this.maxSpeed = this.currentSpeed;
    }

    // Distance (cumulative)
    if (this.lastPoint) {
      const dist = haversine(this.lastPoint.lat, this.lastPoint.lng, point.lat, point.lng);
      if (dist > 2) { // filter GPS jitter
        this.totalDistance += dist;
      }

      // Moving time (only count if speed > 1 km/h)
      if (this.currentSpeed > 0.28) {
        const timeDelta = (point.timestamp - this.lastPoint.timestamp) / 1000;
        if (timeDelta > 0 && timeDelta < 30) { // sanity check
          this.totalMovingTime += timeDelta;
        }
      }
    }

    // Altitude tracking
    if (point.alt > 0) {
      if (point.alt > this.maxAltitude) this.maxAltitude = point.alt;
      if (point.alt < this.minAltitude) this.minAltitude = point.alt;

      // Altitude buffer for trend detection
      this.altitudeBuffer.push(point.alt);
      if (this.altitudeBuffer.length > ALTITUDE_WINDOW) {
        this.altitudeBuffer.shift();
      }

      // Run detection
      this._detectRun(point);
    }

    this.lastPoint = point;
  }

  _detectRun(point) {
    if (this.altitudeBuffer.length < 5) return;

    const trend = this._getAltitudeTrend();
    const speed = this.currentSpeed;
    const prevState = this.runState;

    if (trend > 0 && speed >= LIFT_SPEED_MIN && speed <= LIFT_SPEED_MAX) {
      // Going up on a lift
      if (this.runState !== RUN_STATE.ASCENDING) {
        this.runState = RUN_STATE.ASCENDING;
        this.runAltStart = point.alt;
      }
    } else if (trend < 0 && speed >= SKI_SPEED_MIN) {
      // Skiing downhill
      if (this.runState !== RUN_STATE.DESCENDING) {
        this.runState = RUN_STATE.DESCENDING;
        if (this.runState !== RUN_STATE.DESCENDING) {
          this.runAltStart = point.alt;
        }
      }
      // Track vertical drop for current run
      const drop = this.runAltStart - point.alt;
      if (drop > this.verticalDrop) {
        this.verticalDrop = drop;
      }
    } else if (speed < LIFT_SPEED_MIN) {
      // Stationary or very slow
      if (this.runState === RUN_STATE.DESCENDING) {
        // Completed a run — check if it had enough vertical
        const altChange = this.runAltStart - point.alt;
        if (altChange >= MIN_ALTITUDE_CHANGE) {
          this.totalRuns++;
          this.totalVertical += altChange;
        }
      }
      this.runState = RUN_STATE.IDLE;
    }

    // Detect completed run on DESCENDING → ASCENDING transition
    if (prevState === RUN_STATE.DESCENDING && this.runState === RUN_STATE.ASCENDING) {
      const altChange = this.runAltStart - point.alt;
      if (altChange >= MIN_ALTITUDE_CHANGE) {
        this.totalRuns++;
        this.totalVertical += altChange;
      }
    }
  }

  _getAltitudeTrend() {
    const buf = this.altitudeBuffer;
    if (buf.length < 3) return 0;
    const half = Math.floor(buf.length / 2);
    const firstHalf = buf.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const secondHalf = buf.slice(half).reduce((a, b) => a + b, 0) / (buf.length - half);
    const diff = secondHalf - firstHalf;
    if (diff > 5) return 1; // ascending
    if (diff < -5) return -1; // descending
    return 0;
  }

  getAvgSpeed() {
    if (this.totalMovingTime === 0) return 0;
    return this.totalDistance / this.totalMovingTime; // m/s
  }

  getStats() {
    return {
      currentSpeed: this.currentSpeed,
      maxSpeed: this.maxSpeed,
      avgSpeed: this.getAvgSpeed(),
      distance: this.totalDistance,
      totalRuns: this.totalRuns,
      maxAltitude: this.maxAltitude,
      verticalDrop: this.verticalDrop,
      totalVertical: this.totalVertical,
      runState: this.runState
    };
  }

  loadFromSession(session) {
    this.maxSpeed = session.maxSpeed || 0;
    this.totalDistance = session.distance || 0;
    this.totalRuns = session.totalRuns || 0;
    this.maxAltitude = session.maxAlt || 0;
    this.verticalDrop = session.verticalDrop || 0;
    this.totalMovingTime = session.totalMovingTime || 0;
    this.runState = session.runState || RUN_STATE.IDLE;
  }
}

// Unit conversion utilities
export function msToKmh(ms) {
  return ms * 3.6;
}

export function msToMph(ms) {
  return ms * 2.237;
}

export function metersToFeet(m) {
  return m * 3.281;
}

export function metersToKm(m) {
  return m / 1000;
}

export function metersToMiles(m) {
  return m / 1609.344;
}

export function formatSpeed(ms, units) {
  if (units === 'imperial') {
    return { value: msToMph(ms).toFixed(1), unit: 'mph' };
  }
  return { value: msToKmh(ms).toFixed(1), unit: 'km/h' };
}

export function formatDistance(m, units) {
  if (units === 'imperial') {
    return { value: metersToMiles(m).toFixed(2), unit: 'mi' };
  }
  return { value: metersToKm(m).toFixed(2), unit: 'km' };
}

export function formatAltitude(m, units) {
  if (units === 'imperial') {
    return { value: Math.round(metersToFeet(m)).toLocaleString(), unit: 'ft' };
  }
  return { value: Math.round(m).toLocaleString(), unit: 'm' };
}

export function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
