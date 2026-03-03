// storage.js — LocalStorage persistence layer for ski tracker

const KEYS = {
  SESSION: 'ski-session-current',
  PREFERENCES: 'ski-preferences',
  NOTES: 'ski-notes',
  GROUP: 'ski-group',
  HISTORY: 'ski-session-history',
  BEST_RUNS: 'ski-best-runs'
};

function load(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function save(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function getDefaultSession() {
  return {
    tracking: false,
    currentSpeed: 0,
    maxSpeed: 0,
    avgSpeed: 0,
    distance: 0,
    totalRuns: 0,
    runTime: 0,
    maxAlt: 0,
    verticalDrop: 0,
    positions: [],
    runState: 'IDLE',
    runAltitudeStart: 0,
    startTime: null,
    totalMovingTime: 0,
    lastMovingTimestamp: null
  };
}

export function loadSession() {
  return load(KEYS.SESSION) || getDefaultSession();
}

export function saveSession(session) {
  return save(KEYS.SESSION, session);
}

export function clearSession() {
  localStorage.removeItem(KEYS.SESSION);
  return getDefaultSession();
}

export function getDefaultPreferences() {
  return {
    units: 'metric',
    resort: 'morzine-avoriaz'
  };
}

export function loadPreferences() {
  return load(KEYS.PREFERENCES) || getDefaultPreferences();
}

export function savePreferences(prefs) {
  return save(KEYS.PREFERENCES, prefs);
}

export function loadNotes() {
  return load(KEYS.NOTES) || [];
}

export function saveNotes(notes) {
  return save(KEYS.NOTES, notes);
}

export function loadGroup() {
  return load(KEYS.GROUP) || null;
}

export function saveGroup(group) {
  return save(KEYS.GROUP, group);
}

export function clearGroup() {
  localStorage.removeItem(KEYS.GROUP);
}

export function loadHistory() {
  return load(KEYS.HISTORY) || [];
}

export function saveToHistory(session) {
  const history = loadHistory();
  history.push({
    ...session,
    savedAt: Date.now(),
    positions: [] // strip positions to save space
  });
  save(KEYS.HISTORY, history);
}

export function loadBestRuns() {
  return load(KEYS.BEST_RUNS) || [];
}

export function saveBestRun(run) {
  const runs = loadBestRuns();
  runs.push({ ...run, savedAt: Date.now() });
  // Keep only top 50 best runs
  runs.sort((a, b) => b.maxSpeed - a.maxSpeed);
  if (runs.length > 50) runs.length = 50;
  save(KEYS.BEST_RUNS, runs);
}
