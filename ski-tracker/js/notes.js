// notes.js — Trail notes & annotations

import { loadNotes, saveNotes } from './storage.js';
import { addNoteMarker, clearNoteMarkers } from './map.js';

let notes = [];
let onNotesChanged = null;

const QUICK_TAGS = [
  { id: 'flat-bit', label: 'Flat bit ⚠️', category: 'warning' },
  { id: 'icy', label: 'Icy', category: 'warning' },
  { id: 'unstrap-needed', label: 'Unstrap needed', category: 'warning' },
  { id: 'skating-section', label: 'Skating section', category: 'warning' },
  { id: 'good-morning', label: 'Good in morning', category: 'info' },
  { id: 'good-afternoon', label: 'Good in afternoon', category: 'info' },
  { id: 'moguls', label: 'Moguls', category: 'info' },
  { id: 'crowded', label: 'Crowded', category: 'info' },
  { id: 'powder', label: 'Powder', category: 'positive' },
  { id: 'scenic', label: 'Scenic', category: 'positive' },
  { id: 'great-run', label: 'Great run!', category: 'positive' }
];

export function initNotes(callback) {
  notes = loadNotes();
  onNotesChanged = callback;
}

export function getNotes() {
  return [...notes];
}

export function addNote(lat, lng, tags, text, author) {
  const note = {
    id: 'note-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    lat,
    lng,
    tags: tags || [],
    text: text || '',
    author: author || 'You',
    timestamp: Date.now()
  };
  notes.push(note);
  saveNotes(notes);
  addNoteMarker(note);
  if (onNotesChanged) onNotesChanged(notes);
  return note;
}

export function deleteNote(noteId) {
  notes = notes.filter(n => n.id !== noteId);
  saveNotes(notes);
  if (onNotesChanged) onNotesChanged(notes);
}

export function renderNotesOnMap() {
  clearNoteMarkers();
  notes.forEach(note => addNoteMarker(note));
}

export function showAddNoteDialog(lat, lng) {
  // Remove existing dialog
  const existing = document.getElementById('note-dialog');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.id = 'note-dialog';
  dialog.className = 'note-dialog-overlay';
  dialog.innerHTML = `
    <div class="note-dialog">
      <div class="note-dialog-header">
        <h3>Add Trail Note</h3>
        <button class="note-dialog-close" id="note-close">✕</button>
      </div>
      <div class="note-dialog-tags">
        ${QUICK_TAGS.map(tag => `
          <button class="note-tag-btn tag-${tag.category}" data-tag="${tag.id}">
            ${tag.label}
          </button>
        `).join('')}
      </div>
      <div class="note-dialog-input">
        <textarea id="note-text" placeholder="Add a custom note..." rows="2"></textarea>
      </div>
      <button class="note-dialog-save" id="note-save">Save Note</button>
    </div>
  `;
  document.body.appendChild(dialog);

  const selectedTags = new Set();

  // Tag toggle handlers
  dialog.querySelectorAll('.note-tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
        btn.classList.remove('selected');
      } else {
        selectedTags.add(tag);
        btn.classList.add('selected');
      }
    });
  });

  // Save handler
  document.getElementById('note-save').addEventListener('click', () => {
    const text = document.getElementById('note-text').value.trim();
    if (selectedTags.size > 0 || text) {
      addNote(lat, lng, Array.from(selectedTags), text);
    }
    dialog.remove();
  });

  // Close handler
  document.getElementById('note-close').addEventListener('click', () => {
    dialog.remove();
  });

  // Close on overlay click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.remove();
  });
}

export function getQuickTags() {
  return QUICK_TAGS;
}
