// lifts.js — Citymapper-style lift status panel

let liftsData = [];
let currentFilter = 'all';
let onLiftTap = null;

const LIFT_ICONS = {
  'gondola': '🚡',
  'cable-car': '🚠',
  'chairlift-6': '🪑',
  'chairlift-4': '🪑',
  'chairlift-2': '🪑',
  'draglift': '⛷️'
};

const LIFT_TYPE_LABELS = {
  'gondola': 'Gondola',
  'cable-car': 'Cable Car',
  'chairlift-6': '6-Seat Chairlift',
  'chairlift-4': '4-Seat Chairlift',
  'chairlift-2': '2-Seat Chairlift',
  'draglift': 'Drag Lift'
};

const STATUS_CONFIG = {
  'open': { label: 'Open', class: 'status-open', color: '#22c55e' },
  'closed': { label: 'Closed', class: 'status-closed', color: '#ef4444' },
  'on-hold': { label: 'On Hold', class: 'status-hold', color: '#f59e0b' },
  'scheduled': { label: 'Scheduled', class: 'status-scheduled', color: '#3b82f6' }
};

export function initLifts(data, tapCallback) {
  liftsData = data || [];
  onLiftTap = tapCallback;
}

export function renderLiftsPanel(container) {
  const openCount = liftsData.filter(l => l.status === 'open').length;
  const totalCount = liftsData.length;

  const filtered = currentFilter === 'all'
    ? liftsData
    : liftsData.filter(l => l.status === currentFilter);

  container.innerHTML = `
    <div class="lifts-panel">
      <div class="lifts-header">
        <div class="lifts-summary">
          <span class="lifts-count">${openCount}</span>
          <span class="lifts-total">of ${totalCount} lifts open</span>
        </div>
        <div class="lifts-updated">Updated just now</div>
      </div>

      <div class="lifts-filters">
        <button class="filter-btn ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">
          All <span class="filter-count">${totalCount}</span>
        </button>
        <button class="filter-btn ${currentFilter === 'open' ? 'active' : ''}" data-filter="open">
          Open <span class="filter-count">${liftsData.filter(l => l.status === 'open').length}</span>
        </button>
        <button class="filter-btn ${currentFilter === 'closed' ? 'active' : ''}" data-filter="closed">
          Closed <span class="filter-count">${liftsData.filter(l => l.status === 'closed').length}</span>
        </button>
        <button class="filter-btn ${currentFilter === 'on-hold' ? 'active' : ''}" data-filter="on-hold">
          On Hold <span class="filter-count">${liftsData.filter(l => l.status === 'on-hold').length}</span>
        </button>
      </div>

      <div class="lifts-list">
        ${filtered.map(lift => renderLiftCard(lift)).join('')}
      </div>
    </div>
  `;

  // Filter button handlers
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      renderLiftsPanel(container);
    });
  });

  // Lift card tap handlers
  container.querySelectorAll('.lift-card').forEach(card => {
    card.addEventListener('click', () => {
      const liftId = card.dataset.liftId;
      const lift = liftsData.find(l => l.id === liftId);
      if (lift && onLiftTap) onLiftTap(lift);
    });
  });
}

function renderLiftCard(lift) {
  const status = STATUS_CONFIG[lift.status] || STATUS_CONFIG.closed;
  const icon = LIFT_ICONS[lift.type] || '🚡';
  const typeLabel = LIFT_TYPE_LABELS[lift.type] || lift.type;

  return `
    <div class="lift-card" data-lift-id="${lift.id}">
      <div class="lift-icon">${icon}</div>
      <div class="lift-info">
        <div class="lift-name">${lift.name}</div>
        <div class="lift-type">${typeLabel} · ${lift.capacity}p</div>
        ${lift.verticalRise ? `<div class="lift-vertical">↑ ${lift.verticalRise}m</div>` : ''}
      </div>
      <div class="lift-status">
        <span class="status-pill ${status.class}">${status.label}</span>
        ${lift.waitTime && lift.status === 'open' ? `<div class="lift-wait">~${lift.waitTime} min</div>` : ''}
      </div>
    </div>
  `;
}

export function getOpenLifts() {
  return liftsData.filter(l => l.status === 'open');
}

export function getLiftById(id) {
  return liftsData.find(l => l.id === id);
}
