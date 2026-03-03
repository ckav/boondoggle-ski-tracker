// map.js — Leaflet map with ski trail/lift overlays and GPS tracking

let map = null;
let trailsLayer = null;
let liftsLayer = null;
let restaurantsLayer = null;
let notesLayer = null;
let gpsMarker = null;
let trackLine = null;
let routeLine = null;
let groupMarkers = {};
let meetupMarker = null;
let resortData = null;

const DIFFICULTY_COLORS = {
  green: '#22c55e',
  blue: '#3b82f6',
  red: '#ef4444',
  black: '#1e1e1e'
};

const LIFT_COLOR = '#a855f7';
const TRACK_COLOR = '#22d3ee';
const ROUTE_COLOR = '#f59e0b';

const GROUP_COLORS = [
  '#f472b6', '#fb923c', '#a3e635', '#2dd4bf',
  '#818cf8', '#fbbf24', '#f87171', '#34d399'
];

export function initMap(containerId) {
  map = L.map(containerId, {
    center: [46.1796, 6.7092],
    zoom: 13,
    zoomControl: false
  });

  // OpenTopoMap for ski terrain
  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '&copy; OpenTopoMap'
  }).addTo(map);

  // Zoom control top-right
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Layer groups
  trailsLayer = L.layerGroup().addTo(map);
  liftsLayer = L.layerGroup().addTo(map);
  restaurantsLayer = L.layerGroup().addTo(map);
  notesLayer = L.layerGroup().addTo(map);

  // GPS track polyline
  trackLine = L.polyline([], {
    color: TRACK_COLOR,
    weight: 3,
    opacity: 0.8
  }).addTo(map);

  return map;
}

export function loadResortData(data) {
  resortData = data;

  if (data.resort) {
    map.setView(data.resort.center, data.resort.zoom || 13);
  }

  // Draw trails
  if (data.trails) {
    trailsLayer.clearLayers();
    data.trails.forEach(trail => {
      if (!trail.coordinates || trail.coordinates.length < 2) return;
      const color = DIFFICULTY_COLORS[trail.difficulty] || '#94a3b8';
      const line = L.polyline(trail.coordinates, {
        color,
        weight: trail.difficulty === 'black' ? 4 : 3,
        opacity: trail.status === 'closed' ? 0.3 : 0.85,
        dashArray: trail.status === 'closed' ? '8 8' : null
      });
      line.bindPopup(trailPopup(trail));
      line.trailData = trail;
      trailsLayer.addLayer(line);
    });
  }

  // Draw lifts
  if (data.lifts) {
    liftsLayer.clearLayers();
    data.lifts.forEach(lift => {
      if (!lift.coordinates || lift.coordinates.length < 2) return;
      const line = L.polyline(lift.coordinates, {
        color: LIFT_COLOR,
        weight: 3,
        opacity: lift.status === 'open' ? 0.9 : 0.3,
        dashArray: '10 6'
      });
      line.bindPopup(liftPopup(lift));
      liftsLayer.addLayer(line);

      // Markers at top and bottom
      const startIcon = liftIcon(lift.status);
      L.marker(lift.coordinates[0], { icon: startIcon })
        .bindPopup(liftPopup(lift))
        .addTo(liftsLayer);
    });
  }

  // Draw restaurants
  if (data.restaurants) {
    restaurantsLayer.clearLayers();
    data.restaurants.forEach(resto => {
      const icon = L.divIcon({
        className: 'restaurant-marker',
        html: `<div class="marker-restaurant">🍽</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      const marker = L.marker(resto.coordinates, { icon });
      marker.bindPopup(restaurantPopup(resto));
      marker.restoData = resto;
      restaurantsLayer.addLayer(marker);
    });
  }
}

function trailPopup(trail) {
  const statusClass = trail.status === 'open' ? 'status-open' : 'status-closed';
  return `
    <div class="map-popup">
      <strong>${trail.name}</strong><br>
      <span class="difficulty-badge difficulty-${trail.difficulty}">${trail.difficulty.toUpperCase()}</span>
      <span class="popup-${statusClass}">${trail.status}</span><br>
      ${trail.length ? trail.length + ' km' : ''}
      ${trail.verticalDrop ? '↓' + trail.verticalDrop + 'm' : ''}
    </div>
  `;
}

function liftPopup(lift) {
  const statusColors = { open: '#22c55e', closed: '#ef4444', 'on-hold': '#f59e0b' };
  return `
    <div class="map-popup">
      <strong>${lift.name}</strong><br>
      <span style="color:${statusColors[lift.status] || '#94a3b8'}">${lift.status.toUpperCase()}</span><br>
      Type: ${lift.type} | Capacity: ${lift.capacity}p<br>
      ${lift.verticalRise ? '↑' + lift.verticalRise + 'm' : ''}
      ${lift.waitTime ? '~' + lift.waitTime + ' min wait' : ''}
    </div>
  `;
}

function restaurantPopup(resto) {
  return `
    <div class="map-popup">
      <strong>${resto.name}</strong><br>
      ${resto.cuisine} | ${resto.priceRange}<br>
      <em>${resto.description || ''}</em><br>
      Alt: ${resto.altitude}m
      <button class="popup-btn" onclick="window.dispatchEvent(new CustomEvent('set-meetup', {detail: ${JSON.stringify(resto)}}))">
        📍 Set as meetup
      </button>
    </div>
  `;
}

function liftIcon(status) {
  const colors = { open: '#22c55e', closed: '#ef4444', 'on-hold': '#f59e0b' };
  return L.divIcon({
    className: 'lift-marker',
    html: `<div class="marker-lift" style="background:${colors[status] || '#94a3b8'}">🚡</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

// GPS position marker
export function updateGPSPosition(lat, lng) {
  if (!map) return;
  const pos = [lat, lng];
  if (!gpsMarker) {
    gpsMarker = L.circleMarker(pos, {
      radius: 8,
      fillColor: '#3b82f6',
      fillOpacity: 1,
      color: '#fff',
      weight: 3,
      className: 'gps-pulse'
    }).addTo(map);
  } else {
    gpsMarker.setLatLng(pos);
  }
}

export function addTrackPoint(lat, lng) {
  if (trackLine) {
    trackLine.addLatLng([lat, lng]);
  }
}

export function clearTrack() {
  if (trackLine) trackLine.setLatLngs([]);
}

export function centerOnPosition(lat, lng, zoom) {
  if (map) map.flyTo([lat, lng], zoom || 14, { duration: 1 });
}

// Route display
export function showRoute(coordinates) {
  if (routeLine) {
    map.removeLayer(routeLine);
  }
  if (coordinates && coordinates.length >= 2) {
    routeLine = L.polyline(coordinates, {
      color: ROUTE_COLOR,
      weight: 5,
      opacity: 0.9,
      dashArray: '12 8'
    }).addTo(map);
  }
}

export function clearRoute() {
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }
}

// Notes markers
export function addNoteMarker(note, onClick) {
  if (!notesLayer) return;
  const isWarning = note.tags && note.tags.some(t =>
    ['flat-bit', 'icy', 'unstrap-needed', 'skating-section'].includes(t)
  );
  const isPositive = note.tags && note.tags.some(t =>
    ['powder', 'scenic'].includes(t)
  );
  const color = isWarning ? '#f59e0b' : isPositive ? '#22c55e' : '#3b82f6';

  const icon = L.divIcon({
    className: 'note-marker',
    html: `<div class="marker-note" style="background:${color}">📝</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  const marker = L.marker([note.lat, note.lng], { icon });
  marker.bindPopup(`
    <div class="map-popup">
      <strong>Note</strong><br>
      ${note.tags ? note.tags.map(t => `<span class="note-tag">${t}</span>`).join(' ') : ''}
      ${note.text ? '<br>' + note.text : ''}
      <br><small>${new Date(note.timestamp).toLocaleTimeString()}</small>
    </div>
  `);
  if (onClick) marker.on('click', () => onClick(note));
  marker.noteId = note.id;
  notesLayer.addLayer(marker);
  return marker;
}

export function clearNoteMarkers() {
  if (notesLayer) notesLayer.clearLayers();
}

// Group member markers
export function updateGroupMember(member, colorIndex) {
  if (!map) return;
  const color = GROUP_COLORS[colorIndex % GROUP_COLORS.length];
  const pos = [member.location.lat, member.location.lng];

  if (groupMarkers[member.id]) {
    groupMarkers[member.id].setLatLng(pos);
  } else {
    const icon = L.divIcon({
      className: 'group-marker',
      html: `<div class="marker-group" style="background:${color}">
        <span class="member-name">${member.name.charAt(0)}</span>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    groupMarkers[member.id] = L.marker(pos, { icon })
      .bindPopup(`<strong>${member.name}</strong><br>${member.ability || ''}`)
      .addTo(map);
  }
}

export function removeGroupMember(memberId) {
  if (groupMarkers[memberId]) {
    map.removeLayer(groupMarkers[memberId]);
    delete groupMarkers[memberId];
  }
}

// Meetup point
export function setMeetupPoint(lat, lng, name) {
  if (meetupMarker) map.removeLayer(meetupMarker);
  const icon = L.divIcon({
    className: 'meetup-marker',
    html: `<div class="marker-meetup">📍</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });
  meetupMarker = L.marker([lat, lng], { icon })
    .bindPopup(`<strong>Meetup: ${name}</strong>`)
    .addTo(map)
    .openPopup();
}

export function clearMeetupPoint() {
  if (meetupMarker) {
    map.removeLayer(meetupMarker);
    meetupMarker = null;
  }
}

// Layer toggles
export function toggleTrails(show) {
  if (show) map.addLayer(trailsLayer);
  else map.removeLayer(trailsLayer);
}

export function toggleLifts(show) {
  if (show) map.addLayer(liftsLayer);
  else map.removeLayer(liftsLayer);
}

export function toggleRestaurants(show) {
  if (show) map.addLayer(restaurantsLayer);
  else map.removeLayer(restaurantsLayer);
}

// Map click handler for notes
export function onMapLongPress(callback) {
  if (!map) return;
  let pressTimer = null;
  map.on('mousedown', (e) => {
    pressTimer = setTimeout(() => {
      callback(e.latlng.lat, e.latlng.lng);
    }, 600);
  });
  map.on('mouseup', () => clearTimeout(pressTimer));
  map.on('mousemove', () => clearTimeout(pressTimer));
  // Touch support
  map.on('touchstart', (e) => {
    pressTimer = setTimeout(() => {
      const touch = e.originalEvent.touches[0];
      const point = map.containerPointToLatLng([touch.clientX, touch.clientY]);
      callback(point.lat, point.lng);
    }, 600);
  });
  map.on('touchend', () => clearTimeout(pressTimer));
  map.on('touchmove', () => clearTimeout(pressTimer));
}

export function getResortData() {
  return resortData;
}

export function invalidateSize() {
  if (map) setTimeout(() => map.invalidateSize(), 100);
}
