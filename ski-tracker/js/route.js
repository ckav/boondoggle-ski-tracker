// route.js — Best route home pathfinding

import { haversine } from './gps-tracker.js';
import { formatTime } from './stats.js';

let resortData = null;
let currentRoute = null;
let selectedDestination = 'base-morzine';

export function initRoute(data) {
  resortData = data;
}

export function setDestination(destId) {
  selectedDestination = destId;
}

export function calculateRoute(currentLat, currentLng, avgSpeedMs) {
  if (!resortData || !resortData.trails || !resortData.basePoints) return null;

  const dest = resortData.basePoints.find(b => b.id === selectedDestination);
  if (!dest) return null;

  const destLat = dest.coordinates[0];
  const destLng = dest.coordinates[1];

  // Find open trails that go generally toward the destination
  const openTrails = resortData.trails.filter(t => t.status === 'open');

  // Simple greedy pathfinding: find sequence of trails heading toward base
  const route = findRouteToBase(currentLat, currentLng, destLat, destLng, openTrails);

  if (!route || route.trails.length === 0) {
    // Fallback: direct line
    currentRoute = {
      destination: dest,
      trails: [],
      totalDistance: haversine(currentLat, currentLng, destLat, destLng),
      coordinates: [[currentLat, currentLng], dest.coordinates],
      eta: null,
      maxDifficulty: null
    };
  } else {
    currentRoute = route;
    currentRoute.destination = dest;
  }

  // Calculate ETA
  const speed = avgSpeedMs > 0 ? avgSpeedMs : 5; // default 5 m/s (~18 km/h)
  currentRoute.eta = Math.round(currentRoute.totalDistance / speed);
  currentRoute.etaFormatted = formatTime(currentRoute.eta);

  return currentRoute;
}

function findRouteToBase(startLat, startLng, destLat, destLng, trails) {
  // Score each trail by: closeness to current pos + directionality toward destination
  const scored = trails.map(trail => {
    const firstPt = trail.coordinates[0];
    const lastPt = trail.coordinates[trail.coordinates.length - 1];

    // Distance from current position to trail start
    const distToStart = haversine(startLat, startLng, firstPt[0], firstPt[1]);

    // Distance from trail end to destination
    const distEndToDest = haversine(lastPt[0], lastPt[1], destLat, destLng);

    // Distance from current position to destination (baseline)
    const distCurrentToDest = haversine(startLat, startLng, destLat, destLng);

    // Good trail: close to us AND gets us closer to destination
    const progress = distCurrentToDest - distEndToDest; // positive = makes progress
    const score = progress - distToStart * 0.5; // penalize distance to reach trail

    return { trail, score, distToStart, distEndToDest };
  });

  // Sort by score (best first)
  scored.sort((a, b) => b.score - a.score);

  // Build route by chaining best trails
  const routeTrails = [];
  const routeCoords = [[startLat, startLng]];
  let totalDist = 0;
  let maxDifficulty = 'green';
  const difficultyRank = { green: 0, blue: 1, red: 2, black: 3 };

  let curLat = startLat;
  let curLng = startLng;
  let distToDest = haversine(curLat, curLng, destLat, destLng);
  const used = new Set();

  for (let i = 0; i < 5 && distToDest > 200; i++) {
    // Find best unused trail from current position
    const best = scored.find(s => {
      if (used.has(s.trail.id)) return false;
      const startDist = haversine(curLat, curLng, s.trail.coordinates[0][0], s.trail.coordinates[0][1]);
      return startDist < 1500; // within 1.5km reach
    });

    if (!best) break;

    used.add(best.trail.id);
    routeTrails.push(best.trail);

    // Add trail coordinates to route
    best.trail.coordinates.forEach(coord => routeCoords.push(coord));

    // Update position to trail end
    const lastCoord = best.trail.coordinates[best.trail.coordinates.length - 1];
    totalDist += best.trail.length ? best.trail.length * 1000 : haversine(curLat, curLng, lastCoord[0], lastCoord[1]);
    curLat = lastCoord[0];
    curLng = lastCoord[1];
    distToDest = haversine(curLat, curLng, destLat, destLng);

    if (difficultyRank[best.trail.difficulty] > difficultyRank[maxDifficulty]) {
      maxDifficulty = best.trail.difficulty;
    }
  }

  // Add final segment to destination
  routeCoords.push([destLat, destLng]);
  totalDist += distToDest;

  return {
    trails: routeTrails,
    totalDistance: totalDist,
    coordinates: routeCoords,
    maxDifficulty
  };
}

export function renderRoutePanel(container, currentLat, currentLng, avgSpeedMs, units) {
  const route = calculateRoute(currentLat, currentLng, avgSpeedMs);

  if (!route) {
    container.innerHTML = `
      <div class="route-panel">
        <div class="route-empty">
          <p>Start tracking to calculate route home</p>
        </div>
      </div>
    `;
    return;
  }

  const distKm = (route.totalDistance / 1000).toFixed(1);
  const distMi = (route.totalDistance / 1609.344).toFixed(1);
  const distDisplay = units === 'imperial' ? `${distMi} mi` : `${distKm} km`;

  const bases = resortData.basePoints || [];

  container.innerHTML = `
    <div class="route-panel">
      <div class="route-header">
        <h3>Route to Base</h3>
        <div class="route-destination-picker">
          ${bases.map(b => `
            <button class="dest-btn ${selectedDestination === b.id ? 'active' : ''}" data-dest="${b.id}">
              ${b.name}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="route-summary">
        <div class="route-stat">
          <span class="route-stat-value">${distDisplay}</span>
          <span class="route-stat-label">Distance</span>
        </div>
        <div class="route-stat">
          <span class="route-stat-value">${route.etaFormatted}</span>
          <span class="route-stat-label">Est. Time</span>
        </div>
        <div class="route-stat">
          <span class="route-stat-value">
            <span class="difficulty-badge difficulty-${route.maxDifficulty || 'green'}">${(route.maxDifficulty || 'green').toUpperCase()}</span>
          </span>
          <span class="route-stat-label">Max Difficulty</span>
        </div>
      </div>

      <div class="route-steps">
        <h4>Route</h4>
        ${route.trails.length > 0 ? route.trails.map((trail, i) => `
          <div class="route-step">
            <div class="step-number">${i + 1}</div>
            <div class="step-info">
              <span class="difficulty-dot difficulty-${trail.difficulty}"></span>
              ${trail.name}
              ${trail.length ? `<span class="step-dist">${trail.length} km</span>` : ''}
            </div>
          </div>
        `).join('') : `
          <div class="route-step">
            <div class="step-number">→</div>
            <div class="step-info">Head directly to ${route.destination.name}</div>
          </div>
        `}
        <div class="route-step route-step-final">
          <div class="step-number">🏠</div>
          <div class="step-info">${route.destination.name} (${route.destination.altitude}m)</div>
        </div>
      </div>
    </div>
  `;

  // Destination picker handlers
  container.querySelectorAll('.dest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedDestination = btn.dataset.dest;
      renderRoutePanel(container, currentLat, currentLng, avgSpeedMs, units);
    });
  });

  return route;
}

export function getCurrentRoute() {
  return currentRoute;
}
