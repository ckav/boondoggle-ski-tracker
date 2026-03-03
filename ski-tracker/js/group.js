// group.js — Group location sharing, plans, leaderboard

import { loadGroup, saveGroup, clearGroup } from './storage.js';
import { haversine } from './gps-tracker.js';
import { formatSpeed, formatTime } from './stats.js';

let group = null;
let myId = null;
let myName = '';
let broadcastChannel = null;
let onGroupUpdate = null;

const ABILITIES = ['beginner', 'intermediate', 'advanced', 'expert'];
const ABILITY_COLORS = {
  beginner: '#22c55e',
  intermediate: '#3b82f6',
  advanced: '#ef4444',
  expert: '#1e1e1e'
};

const STATUS_OPTIONS = [
  { id: 'skiing', label: '⛷️ Skiing', icon: '⛷️' },
  { id: 'on-lift', label: '🚡 On Lift', icon: '🚡' },
  { id: 'at-lunch', label: '🍽️ At Lunch', icon: '🍽️' },
  { id: 'last-run', label: '🏁 Last Run', icon: '🏁' },
  { id: 'done', label: '✅ Done for the day', icon: '✅' },
  { id: 'waiting', label: '⏳ Waiting', icon: '⏳' },
  { id: 'apres-ski', label: '🍺 Après-Ski', icon: '🍺' }
];

const QUICK_MESSAGES = [
  'Heading to lunch!',
  'Meeting at the lift',
  'Done for the day',
  'Waiting at the top',
  'Waiting at the bottom',
  'One more run!',
  'Taking a break',
  'Heading to après!'
];

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'SKI-';
  for (let i = 0; i < 3; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateId() {
  return 'member-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

export function initGroup(updateCallback) {
  onGroupUpdate = updateCallback;
  myId = localStorage.getItem('ski-my-id') || generateId();
  myName = localStorage.getItem('ski-my-name') || '';
  localStorage.setItem('ski-my-id', myId);

  group = loadGroup();

  // Set up BroadcastChannel for same-device demo
  try {
    broadcastChannel = new BroadcastChannel('ski-tracker-group');
    broadcastChannel.onmessage = (e) => handleBroadcast(e.data);
  } catch {
    // BroadcastChannel not available
  }
}

function handleBroadcast(data) {
  if (!group || data.groupCode !== group.code) return;

  switch (data.type) {
    case 'location-update':
      updateMemberLocation(data.memberId, data.location);
      break;
    case 'message':
      addMessage(data.message, false);
      break;
    case 'status-update':
      updateMemberStatus(data.memberId, data.status);
      break;
    case 'join-request':
      // In a real app, show approval dialog
      break;
  }
}

function broadcast(data) {
  if (broadcastChannel && group) {
    broadcastChannel.postMessage({ ...data, groupCode: group.code });
  }
}

export function createGroup(name, ability, tripDuration) {
  myName = name;
  localStorage.setItem('ski-my-name', name);

  const tripEnd = tripDuration ? Date.now() + tripDuration * 24 * 60 * 60 * 1000 : null;

  group = {
    id: 'group-' + Date.now(),
    code: generateCode(),
    createdAt: Date.now(),
    tripEnd,
    members: [{
      id: myId,
      name,
      ability: ability || 'intermediate',
      status: 'skiing',
      location: null,
      sharing: 'live',
      stats: { maxSpeed: 0, totalRuns: 0, distance: 0, totalVertical: 0 },
      bestRuns: []
    }],
    messages: [],
    meetupPoint: null,
    plans: [],
    leaderboard: {}
  };

  saveGroup(group);
  if (onGroupUpdate) onGroupUpdate(group);
  return group;
}

export function joinGroup(code, name, ability) {
  myName = name;
  localStorage.setItem('ski-my-name', name);

  // In demo mode, create local group with the code
  group = loadGroup();
  if (!group || group.code !== code) {
    group = {
      id: 'group-' + Date.now(),
      code,
      createdAt: Date.now(),
      tripEnd: null,
      members: [],
      messages: [],
      meetupPoint: null,
      plans: [],
      leaderboard: {}
    };
  }

  const existing = group.members.find(m => m.id === myId);
  if (!existing) {
    group.members.push({
      id: myId,
      name,
      ability: ability || 'intermediate',
      status: 'skiing',
      location: null,
      sharing: 'live',
      stats: { maxSpeed: 0, totalRuns: 0, distance: 0, totalVertical: 0 },
      bestRuns: []
    });
  }

  saveGroup(group);
  broadcast({ type: 'join-request', memberId: myId, name });
  if (onGroupUpdate) onGroupUpdate(group);
  return group;
}

export function leaveGroup() {
  group = null;
  clearGroup();
  if (onGroupUpdate) onGroupUpdate(null);
}

export function updateMyLocation(lat, lng, speed, alt) {
  if (!group) return;
  const me = group.members.find(m => m.id === myId);
  if (!me || me.sharing === 'off') return;

  me.location = { lat, lng, speed, alt, timestamp: Date.now() };
  saveGroup(group);

  broadcast({
    type: 'location-update',
    memberId: myId,
    location: me.location
  });
}

export function updateMyStats(stats) {
  if (!group) return;
  const me = group.members.find(m => m.id === myId);
  if (!me) return;

  me.stats = {
    maxSpeed: Math.max(me.stats.maxSpeed, stats.maxSpeed || 0),
    totalRuns: stats.totalRuns || 0,
    distance: stats.distance || 0,
    totalVertical: stats.totalVertical || 0
  };

  saveGroup(group);
  updateLeaderboard();
}

function updateMemberLocation(memberId, location) {
  if (!group) return;
  const member = group.members.find(m => m.id === memberId);
  if (member) {
    member.location = location;
    saveGroup(group);
    if (onGroupUpdate) onGroupUpdate(group);
  }
}

function updateMemberStatus(memberId, status) {
  if (!group) return;
  const member = group.members.find(m => m.id === memberId);
  if (member) {
    member.status = status;
    saveGroup(group);
    if (onGroupUpdate) onGroupUpdate(group);
  }
}

export function setMyStatus(status) {
  if (!group) return;
  const me = group.members.find(m => m.id === myId);
  if (!me) return;
  me.status = status;
  saveGroup(group);
  broadcast({ type: 'status-update', memberId: myId, status });
  if (onGroupUpdate) onGroupUpdate(group);
}

export function setMySharingMode(mode) {
  if (!group) return;
  const me = group.members.find(m => m.id === myId);
  if (me) {
    me.sharing = mode;
    saveGroup(group);
  }
}

export function sendMessage(text) {
  if (!group) return;
  const msg = {
    id: 'msg-' + Date.now(),
    author: myName,
    authorId: myId,
    text,
    timestamp: Date.now()
  };
  addMessage(msg, true);
}

function addMessage(msg, shouldBroadcast) {
  if (!group) return;
  group.messages.push(msg);
  if (group.messages.length > 100) group.messages.shift();
  saveGroup(group);
  if (shouldBroadcast) broadcast({ type: 'message', message: msg });
  if (onGroupUpdate) onGroupUpdate(group);
}

export function setMeetupPoint(location) {
  if (!group) return;
  group.meetupPoint = {
    ...location,
    setBy: myName,
    timestamp: Date.now()
  };
  saveGroup(group);
  sendMessage(`📍 Set meetup at ${location.name}`);
}

export function addPlan(text, time) {
  if (!group) return;
  group.plans.push({
    id: 'plan-' + Date.now(),
    text,
    time,
    author: myName,
    timestamp: Date.now()
  });
  saveGroup(group);
  sendMessage(`📋 ${text}${time ? ' at ' + new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`);
}

function updateLeaderboard() {
  if (!group) return;
  const members = group.members;

  group.leaderboard = {
    topSpeed: [...members].sort((a, b) => (b.stats.maxSpeed || 0) - (a.stats.maxSpeed || 0)),
    mostRuns: [...members].sort((a, b) => (b.stats.totalRuns || 0) - (a.stats.totalRuns || 0)),
    mostDistance: [...members].sort((a, b) => (b.stats.distance || 0) - (a.stats.distance || 0)),
    mostVertical: [...members].sort((a, b) => (b.stats.totalVertical || 0) - (a.stats.totalVertical || 0))
  };

  saveGroup(group);
}

export function saveBestRun(run) {
  if (!group) return;
  const me = group.members.find(m => m.id === myId);
  if (!me) return;
  me.bestRuns.push({ ...run, savedAt: Date.now() });
  me.bestRuns.sort((a, b) => b.maxSpeed - a.maxSpeed);
  if (me.bestRuns.length > 10) me.bestRuns.length = 10;
  saveGroup(group);
}

export function suggestMeetupPoint(resortData) {
  if (!group || !resortData) return null;
  const membersWithLocation = group.members.filter(m => m.location);
  if (membersWithLocation.length === 0) return null;

  // Find average position of all members
  const avgLat = membersWithLocation.reduce((s, m) => s + m.location.lat, 0) / membersWithLocation.length;
  const avgLng = membersWithLocation.reduce((s, m) => s + m.location.lng, 0) / membersWithLocation.length;

  // Find nearest restaurant to centroid
  if (resortData.restaurants) {
    let nearest = null;
    let nearestDist = Infinity;
    resortData.restaurants.forEach(r => {
      const dist = haversine(avgLat, avgLng, r.coordinates[0], r.coordinates[1]);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = r;
      }
    });
    return nearest;
  }

  return { name: 'Central Point', coordinates: [avgLat, avgLng] };
}

export function getGroup() {
  return group;
}

export function getMyId() {
  return myId;
}

export function getTripCountdown() {
  if (!group || !group.tripEnd) return null;
  const remaining = group.tripEnd - Date.now();
  if (remaining <= 0) return { expired: true, text: 'Trip ended' };
  const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
  return { expired: false, days, text: `${days} day${days !== 1 ? 's' : ''} left` };
}

// Render functions
export function renderGroupPanel(container, units) {
  if (!group) {
    renderJoinCreate(container);
    return;
  }
  renderGroupView(container, units);
}

function renderJoinCreate(container) {
  container.innerHTML = `
    <div class="group-panel">
      <div class="group-setup">
        <h3>Ski Group</h3>
        <p class="group-subtitle">Track your group on the mountain</p>

        <div class="group-form">
          <input type="text" id="group-name" placeholder="Your name" class="group-input"
            value="${myName}" maxlength="20">

          <select id="group-ability" class="group-input">
            ${ABILITIES.map(a => `<option value="${a}">${a.charAt(0).toUpperCase() + a.slice(1)}</option>`).join('')}
          </select>

          <button class="btn-primary" id="group-create">Create New Group</button>

          <div class="group-divider"><span>or</span></div>

          <input type="text" id="group-code" placeholder="Enter group code (e.g. SKI-A7X)"
            class="group-input" maxlength="7" style="text-transform: uppercase">
          <button class="btn-secondary" id="group-join">Join Group</button>
        </div>

        <div class="group-trip-duration">
          <label>Trip Duration</label>
          <div class="duration-options">
            <button class="duration-btn" data-days="1">1 Day</button>
            <button class="duration-btn active" data-days="2">Weekend</button>
            <button class="duration-btn" data-days="7">1 Week</button>
            <button class="duration-btn" data-days="14">2 Weeks</button>
          </div>
        </div>
      </div>
    </div>
  `;

  let tripDays = 2;

  container.querySelectorAll('.duration-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tripDays = parseInt(btn.dataset.days);
    });
  });

  document.getElementById('group-create').addEventListener('click', () => {
    const name = document.getElementById('group-name').value.trim();
    const ability = document.getElementById('group-ability').value;
    if (!name) return;
    createGroup(name, ability, tripDays);
    renderGroupPanel(container);
  });

  document.getElementById('group-join').addEventListener('click', () => {
    const name = document.getElementById('group-name').value.trim();
    const code = document.getElementById('group-code').value.trim().toUpperCase();
    const ability = document.getElementById('group-ability').value;
    if (!name || !code) return;
    joinGroup(code, name, ability);
    renderGroupPanel(container);
  });
}

function renderGroupView(container, units) {
  const countdown = getTripCountdown();
  const me = group.members.find(m => m.id === myId);

  container.innerHTML = `
    <div class="group-panel">
      <div class="group-header">
        <div class="group-code-display">
          <span class="group-code">${group.code}</span>
          <button class="btn-icon" id="copy-code" title="Copy code">📋</button>
        </div>
        ${countdown ? `<div class="trip-countdown ${countdown.expired ? 'expired' : ''}">${countdown.text}</div>` : ''}
        <button class="btn-small btn-danger" id="leave-group">Leave</button>
      </div>

      <div class="group-tabs">
        <button class="group-tab active" data-tab="members">Members</button>
        <button class="group-tab" data-tab="chat">Chat</button>
        <button class="group-tab" data-tab="leaderboard">Leaderboard</button>
      </div>

      <div class="group-tab-content" id="group-tab-content">
        ${renderMembersTab(units)}
      </div>

      <div class="group-status-bar">
        <label>My Status:</label>
        <div class="status-options">
          ${STATUS_OPTIONS.map(s => `
            <button class="status-btn ${me && me.status === s.id ? 'active' : ''}" data-status="${s.id}">
              ${s.icon}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="group-sharing">
        <label>Location Sharing:</label>
        <div class="sharing-options">
          <button class="sharing-btn ${me && me.sharing === 'live' ? 'active' : ''}" data-mode="live">Live</button>
          <button class="sharing-btn ${me && me.sharing === 'checkin' ? 'active' : ''}" data-mode="checkin">Check-in</button>
          <button class="sharing-btn ${me && me.sharing === 'off' ? 'active' : ''}" data-mode="off">Off</button>
        </div>
      </div>

      <div class="group-quick-msg">
        <select id="quick-msg" class="group-input">
          <option value="">Send quick message...</option>
          ${QUICK_MESSAGES.map(m => `<option value="${m}">${m}</option>`).join('')}
        </select>
        <div class="custom-msg-row">
          <input type="text" id="custom-msg" placeholder="Custom message..." class="group-input">
          <button class="btn-send" id="send-msg">→</button>
        </div>
      </div>
    </div>
  `;

  // Event handlers
  document.getElementById('copy-code')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(group.code);
  });

  document.getElementById('leave-group')?.addEventListener('click', () => {
    if (confirm('Leave this group?')) {
      leaveGroup();
      renderGroupPanel(container, units);
    }
  });

  // Tab switching
  container.querySelectorAll('.group-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.group-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const content = document.getElementById('group-tab-content');
      switch (tab.dataset.tab) {
        case 'members': content.innerHTML = renderMembersTab(units); break;
        case 'chat': content.innerHTML = renderChatTab(); break;
        case 'leaderboard': content.innerHTML = renderLeaderboardTab(units); break;
      }
    });
  });

  // Status buttons
  container.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setMyStatus(btn.dataset.status);
    });
  });

  // Sharing mode
  container.querySelectorAll('.sharing-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.sharing-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setMySharingMode(btn.dataset.mode);
    });
  });

  // Quick message
  document.getElementById('quick-msg')?.addEventListener('change', (e) => {
    if (e.target.value) {
      sendMessage(e.target.value);
      e.target.value = '';
      const content = document.getElementById('group-tab-content');
      if (container.querySelector('.group-tab.active')?.dataset.tab === 'chat') {
        content.innerHTML = renderChatTab();
      }
    }
  });

  // Custom message
  document.getElementById('send-msg')?.addEventListener('click', () => {
    const input = document.getElementById('custom-msg');
    if (input.value.trim()) {
      sendMessage(input.value.trim());
      input.value = '';
      const content = document.getElementById('group-tab-content');
      if (container.querySelector('.group-tab.active')?.dataset.tab === 'chat') {
        content.innerHTML = renderChatTab();
      }
    }
  });
}

function renderMembersTab(units) {
  return `
    <div class="members-list">
      ${group.members.map(m => {
        const statusOpt = STATUS_OPTIONS.find(s => s.id === m.status);
        const isMe = m.id === myId;
        return `
          <div class="member-card ${isMe ? 'member-me' : ''}">
            <div class="member-avatar" style="background:${ABILITY_COLORS[m.ability] || '#3b82f6'}">
              ${m.name.charAt(0).toUpperCase()}
            </div>
            <div class="member-info">
              <div class="member-name">${m.name} ${isMe ? '(You)' : ''}</div>
              <div class="member-ability">${m.ability}</div>
              <div class="member-status">${statusOpt ? statusOpt.icon + ' ' + statusOpt.label : ''}</div>
            </div>
            <div class="member-stats-mini">
              <div>${m.stats.totalRuns} runs</div>
              <div>${formatSpeed(m.stats.maxSpeed, units).value} ${formatSpeed(m.stats.maxSpeed, units).unit} max</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <button class="btn-secondary btn-regroup" id="suggest-meetup">📍 Suggest Meetup Point</button>
  `;
}

function renderChatTab() {
  const msgs = group.messages.slice(-20);
  return `
    <div class="chat-messages">
      ${msgs.length === 0 ? '<p class="chat-empty">No messages yet</p>' : ''}
      ${msgs.map(m => `
        <div class="chat-msg ${m.authorId === myId ? 'chat-msg-mine' : ''}">
          <span class="chat-author">${m.author}</span>
          <span class="chat-text">${m.text}</span>
          <span class="chat-time">${new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderLeaderboardTab(units) {
  if (!group.leaderboard || !group.leaderboard.topSpeed) {
    updateLeaderboard();
  }
  const lb = group.leaderboard;
  const medals = ['🥇', '🥈', '🥉'];

  return `
    <div class="leaderboard">
      <div class="leaderboard-section">
        <h4>🏔 King of the Mountain — Top Speed</h4>
        ${(lb.topSpeed || []).map((m, i) => `
          <div class="lb-row">
            <span class="lb-medal">${medals[i] || (i + 1)}</span>
            <span class="lb-name">${m.name}</span>
            <span class="lb-value">${formatSpeed(m.stats.maxSpeed, units).value} ${formatSpeed(m.stats.maxSpeed, units).unit}</span>
          </div>
        `).join('')}
      </div>

      <div class="leaderboard-section">
        <h4>🔄 Most Runs</h4>
        ${(lb.mostRuns || []).map((m, i) => `
          <div class="lb-row">
            <span class="lb-medal">${medals[i] || (i + 1)}</span>
            <span class="lb-name">${m.name}</span>
            <span class="lb-value">${m.stats.totalRuns} runs</span>
          </div>
        `).join('')}
      </div>

      <div class="leaderboard-section">
        <h4>📏 Most Distance</h4>
        ${(lb.mostDistance || []).map((m, i) => `
          <div class="lb-row">
            <span class="lb-medal">${medals[i] || (i + 1)}</span>
            <span class="lb-name">${m.name}</span>
            <span class="lb-value">${(m.stats.distance / 1000).toFixed(1)} km</span>
          </div>
        `).join('')}
      </div>

      <div class="leaderboard-section">
        <h4>⬇️ Most Vertical</h4>
        ${(lb.mostVertical || []).map((m, i) => `
          <div class="lb-row">
            <span class="lb-medal">${medals[i] || (i + 1)}</span>
            <span class="lb-name">${m.name}</span>
            <span class="lb-value">${Math.round(m.stats.totalVertical)}m</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export { STATUS_OPTIONS, ABILITIES, QUICK_MESSAGES };
