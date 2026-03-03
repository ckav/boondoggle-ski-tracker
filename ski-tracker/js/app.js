// app.js — Main controller: view routing, state management, update loop

import { GPSTracker } from './gps-tracker.js';
import { StatsEngine, formatSpeed, formatDistance, formatAltitude, formatTime } from './stats.js';
import {
  initMap, loadResortData, updateGPSPosition, addTrackPoint, clearTrack,
  centerOnPosition, showRoute, clearRoute, onMapLongPress,
  toggleTrails, toggleLifts, toggleRestaurants, invalidateSize,
  addNoteMarker, clearNoteMarkers, updateGroupMember, setMeetupPoint as mapSetMeetup
} from './map.js';
import { initLifts, renderLiftsPanel } from './lifts.js';
import { initRoute, renderRoutePanel, getCurrentRoute } from './route.js';
import { initNotes, renderNotesOnMap, showAddNoteDialog, getNotes } from './notes.js';
import {
  initGroup, renderGroupPanel, getGroup, getMyId,
  updateMyLocation, updateMyStats, suggestMeetupPoint, setMeetupPoint
} from './group.js';
import {
  loadSession, saveSession, clearSession, getDefaultSession,
  loadPreferences, savePreferences, saveToHistory
} from './storage.js';

// State
let gps = null;
let stats = null;
let session = null;
let prefs = null;
let resortData = null;
let timerInterval = null;
let autoSaveInterval = null;
let mapInitialized = false;

// DOM refs (set in init)
let els = {};

async function init() {
  // Load preferences and session
  prefs = loadPreferences();
  session = loadSession();

  // Cache DOM refs
  els = {
    currentSpeed: document.getElementById('current-speed'),
    speedUnit: document.getElementById('speed-unit'),
    maxSpeed: document.getElementById('max-speed'),
    maxSpeedUnit: document.getElementById('max-speed-unit'),
    avgSpeed: document.getElementById('avg-speed'),
    avgSpeedUnit: document.getElementById('avg-speed-unit'),
    distance: document.getElementById('distance'),
    distanceUnit: document.getElementById('distance-unit'),
    totalRuns: document.getElementById('total-runs'),
    runTime: document.getElementById('run-time'),
    maxAlt: document.getElementById('max-alt'),
    maxAltUnit: document.getElementById('max-alt-unit'),
    verticalDrop: document.getElementById('vertical-drop'),
    verticalUnit: document.getElementById('vertical-unit'),
    totalVertical: document.getElementById('total-vertical'),
    totalVerticalUnit: document.getElementById('total-vertical-unit'),
    runState: document.getElementById('run-state'),
    trackBtn: document.getElementById('track-btn'),
    batteryLevel: document.getElementById('battery-level'),
    batteryIcon: document.getElementById('battery-icon'),
    battery: document.getElementById('battery')
  };

  // Init stats engine
  stats = new StatsEngine();
  if (session.maxSpeed > 0) {
    stats.loadFromSession(session);
  }

  // Init GPS tracker
  gps = new GPSTracker();
  gps.onPosition = onGPSPosition;
  gps.onError = onGPSError;
  gps.onBattery = onBatteryUpdate;

  // Load resort data
  try {
    const resp = await fetch('data/morzine-avoriaz.json');
    resortData = await resp.json();
  } catch (e) {
    console.error('Failed to load resort data:', e);
  }

  // Setup navigation
  setupNavigation();
  setupTrackButton();
  setupUnitsToggle();

  // Init sub-modules
  if (resortData) {
    initLifts(resortData.lifts, onLiftTap);
    initRoute(resortData);
  }
  initNotes(onNotesChanged);
  initGroup(onGroupUpdate);

  // Apply saved units
  setUnits(prefs.units);

  // Update dashboard with saved session
  updateDashboard();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Listen for meetup events from map popups
  window.addEventListener('set-meetup', (e) => {
    const resto = e.detail;
    if (getGroup()) {
      setMeetupPoint(resto);
      mapSetMeetup(resto.coordinates[0], resto.coordinates[1], resto.name);
    }
  });
}

// === Navigation ===
function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });
}

function switchView(viewName) {
  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-view="${viewName}"]`)?.classList.add('active');

  // Update views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${viewName}`)?.classList.add('active');

  // Initialize view-specific content
  switch (viewName) {
    case 'map':
      if (!mapInitialized) {
        initializeMap();
        mapInitialized = true;
      }
      invalidateSize();
      break;
    case 'lifts':
      renderLiftsPanel(document.getElementById('view-lifts'));
      break;
    case 'route':
      renderCurrentRoute();
      break;
    case 'group':
      renderGroupPanel(document.getElementById('view-group'), prefs.units);
      break;
  }
}

function initializeMap() {
  initMap('map');
  if (resortData) {
    loadResortData(resortData);
  }

  // Render saved notes on map
  renderNotesOnMap();

  // Long-press to add notes
  onMapLongPress((lat, lng) => {
    showAddNoteDialog(lat, lng);
  });

  // Map layer toggles
  document.querySelectorAll('.map-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const isActive = btn.classList.contains('active');
      switch (btn.dataset.layer) {
        case 'trails': toggleTrails(isActive); break;
        case 'lifts': toggleLifts(isActive); break;
        case 'restaurants': toggleRestaurants(isActive); break;
      }
    });
  });
}

// === Tracking ===
function setupTrackButton() {
  els.trackBtn.addEventListener('click', toggleTracking);
}

function toggleTracking() {
  if (gps.isTracking()) {
    stopTracking();
  } else {
    startTracking();
  }
}

function startTracking() {
  gps.start();
  session.tracking = true;
  session.startTime = session.startTime || Date.now();
  session.lastMovingTimestamp = Date.now();

  els.trackBtn.textContent = 'STOP';
  els.trackBtn.classList.add('tracking');

  // Start timer
  timerInterval = setInterval(updateTimer, 1000);

  // Auto-save every 30s
  autoSaveInterval = setInterval(() => {
    saveCurrentSession();
  }, 30000);
}

function stopTracking() {
  gps.stop();
  session.tracking = false;

  els.trackBtn.textContent = 'START';
  els.trackBtn.classList.remove('tracking');

  clearInterval(timerInterval);
  clearInterval(autoSaveInterval);

  saveCurrentSession();
}

function saveCurrentSession() {
  const s = stats.getStats();
  session.currentSpeed = s.currentSpeed;
  session.maxSpeed = s.maxSpeed;
  session.avgSpeed = s.avgSpeed;
  session.distance = s.distance;
  session.totalRuns = s.totalRuns;
  session.maxAlt = s.maxAltitude;
  session.verticalDrop = s.verticalDrop;
  session.totalVertical = s.totalVertical;
  session.runState = s.runState;
  session.totalMovingTime = stats.totalMovingTime;
  saveSession(session);
}

// === GPS Callbacks ===
function onGPSPosition(point) {
  // Update stats engine
  stats.update(point);

  // Update map
  updateGPSPosition(point.lat, point.lng);
  addTrackPoint(point.lat, point.lng);

  // Update group location
  updateMyLocation(point.lat, point.lng, point.speed, point.alt);
  updateMyStats(stats.getStats());

  // Update dashboard
  updateDashboard();
}

function onGPSError(err) {
  console.error('GPS Error:', err.code, err.message);
}

function onBatteryUpdate(info) {
  els.batteryLevel.textContent = info.level + '%';
  els.batteryIcon.textContent = info.charging ? '🔌' : '🔋';
  if (info.low) {
    els.battery.classList.add('low');
  } else {
    els.battery.classList.remove('low');
  }
}

// === Dashboard Update ===
function updateDashboard() {
  const s = stats.getStats();
  const u = prefs.units;

  // Current speed
  const cs = formatSpeed(s.currentSpeed, u);
  els.currentSpeed.textContent = cs.value;
  els.speedUnit.textContent = cs.unit;

  // Max speed
  const ms = formatSpeed(s.maxSpeed, u);
  els.maxSpeed.textContent = ms.value;
  els.maxSpeedUnit.textContent = ms.unit;

  // Avg speed
  const as = formatSpeed(s.avgSpeed, u);
  els.avgSpeed.textContent = as.value;
  els.avgSpeedUnit.textContent = as.unit;

  // Distance
  const d = formatDistance(s.distance, u);
  els.distance.textContent = d.value;
  els.distanceUnit.textContent = d.unit;

  // Runs
  els.totalRuns.textContent = s.totalRuns;

  // Altitude
  const alt = formatAltitude(s.maxAltitude, u);
  els.maxAlt.textContent = alt.value;
  els.maxAltUnit.textContent = alt.unit;

  // Vertical drop
  const vd = formatAltitude(s.verticalDrop, u);
  els.verticalDrop.textContent = vd.value;
  els.verticalUnit.textContent = vd.unit;

  // Total vertical
  const tv = formatAltitude(s.totalVertical, u);
  els.totalVertical.textContent = tv.value;
  els.totalVerticalUnit.textContent = tv.unit;

  // Run state
  els.runState.textContent = s.runState;
  els.runState.className = 'run-state-badge ' + s.runState;
}

function updateTimer() {
  if (!session.startTime) return;
  const elapsed = stats.totalMovingTime;
  els.runTime.textContent = formatTime(elapsed);
}

// === Units Toggle ===
function setupUnitsToggle() {
  document.getElementById('unit-metric').addEventListener('click', () => setUnits('metric'));
  document.getElementById('unit-imperial').addEventListener('click', () => setUnits('imperial'));
}

function setUnits(units) {
  prefs.units = units;
  savePreferences(prefs);

  document.getElementById('unit-metric').classList.toggle('active', units === 'metric');
  document.getElementById('unit-imperial').classList.toggle('active', units === 'imperial');

  updateDashboard();
}

// === Lift tap handler ===
function onLiftTap(lift) {
  // Switch to map and center on lift
  switchView('map');
  if (lift.coordinates && lift.coordinates.length > 0) {
    centerOnPosition(lift.coordinates[0][0], lift.coordinates[0][1], 15);
  }
}

// === Route ===
function renderCurrentRoute() {
  const container = document.getElementById('view-route');
  const lastPos = gps.getLastPosition();
  const lat = lastPos ? lastPos.lat : (resortData?.resort?.center?.[0] || 46.1796);
  const lng = lastPos ? lastPos.lng : (resortData?.resort?.center?.[1] || 6.7092);
  const avgSpeed = stats.getAvgSpeed();

  const route = renderRoutePanel(container, lat, lng, avgSpeed, prefs.units);

  // Show route on map if map is initialized
  if (route && mapInitialized) {
    showRoute(route.coordinates);
  }
}

// === Notes changed ===
function onNotesChanged(notes) {
  // Notes are auto-saved by the notes module
}

// === Group update ===
function onGroupUpdate(group) {
  if (!group) return;
  // Update group member markers on map
  if (mapInitialized) {
    group.members.forEach((member, i) => {
      if (member.id !== getMyId() && member.location) {
        updateGroupMember(member, i);
      }
    });

    // Show meetup point
    if (group.meetupPoint) {
      mapSetMeetup(
        group.meetupPoint.coordinates[0],
        group.meetupPoint.coordinates[1],
        group.meetupPoint.name
      );
    }
  }
}

// === Start ===
document.addEventListener('DOMContentLoaded', init);
