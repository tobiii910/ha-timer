/**
 * Kitchen Timer – app.js
 * Supports: named presets, custom timer, extend, alarm (Web Audio),
 *           pause, reset, repeat on expiry.
 */

// ── State ────────────────────────────────────────────────────
const state = {
  presets: [],
  timer: {
    name: '',
    totalSeconds: 0,
    remainingSeconds: 0,
    originalSeconds: 0,
    status: 'idle', // 'idle' | 'running' | 'paused' | 'alarm'
  },
};

let countdownInterval = null;
let audioCtx = null;
let alarmTimeout = null;    // handle for the repeating alarm pattern
let alarmActive = false;

// ── Bootstrap ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadPresets();
  renderPresets();
  updateTimerUI();

  // Close modals by tapping the backdrop
  document.querySelectorAll('.overlay').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target === el && el.id !== 'alarmOverlay') {
        el.style.display = 'none';
      }
    });
  });

  // Unlock AudioContext on first touch (required by some browsers)
  document.addEventListener('touchstart', unlockAudio, { once: true });
  document.addEventListener('click',      unlockAudio, { once: true });
});

// ── Audio context ────────────────────────────────────────────
function unlockAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

/**
 * Play a single beep.
 * @param {number} freq   - frequency in Hz
 * @param {number} dur    - duration in seconds
 * @param {number} when   - audioCtx.currentTime offset
 */
function playBeep(freq, dur, when) {
  if (!audioCtx) return;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(0.65, when + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

/**
 * Schedule one alarm pattern (3 beeps) and queue the next repetition.
 */
function scheduleAlarmPattern() {
  if (!alarmActive || !audioCtx) return;

  const now = audioCtx.currentTime;
  // Three descending-pitch beeps: A5 → A5 → E5
  playBeep(880, 0.35, now);
  playBeep(880, 0.35, now + 0.50);
  playBeep(659, 0.55, now + 1.00);

  // Repeat every 3 seconds
  alarmTimeout = setTimeout(scheduleAlarmPattern, 3000);
}

function startAlarmSound() {
  ensureAudio();
  alarmActive = true;
  scheduleAlarmPattern();
}

function stopAlarmSound() {
  alarmActive = false;
  if (alarmTimeout !== null) {
    clearTimeout(alarmTimeout);
    alarmTimeout = null;
  }
}

// ── Persistence ──────────────────────────────────────────────
function loadPresets() {
  try {
    const raw = localStorage.getItem('ha_timer_presets');
    state.presets = raw ? JSON.parse(raw) : defaultPresets();
  } catch {
    state.presets = defaultPresets();
  }
}

function persistPresets() {
  localStorage.setItem('ha_timer_presets', JSON.stringify(state.presets));
}

function defaultPresets() {
  return [
    { id: uid(), name: 'Ei weich',   seconds:  180 },
    { id: uid(), name: 'Ei mittel',  seconds:  300 },
    { id: uid(), name: 'Ei hart',    seconds:  420 },
    { id: uid(), name: 'Nudeln',     seconds:  600 },
    { id: uid(), name: '15 Minuten', seconds:  900 },
    { id: uid(), name: 'Reis',       seconds: 1200 },
    { id: uid(), name: '30 Minuten', seconds: 1800 },
    { id: uid(), name: '1 Stunde',   seconds: 3600 },
  ];
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Formatting ───────────────────────────────────────────────
function formatTime(totalSecs) {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function formatDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0)           return `${h}h`;
  if (m > 0 && s > 0) return `${m}m ${s}s`;
  if (m > 0)           return `${m}m`;
  return `${s}s`;
}

function pad(n) { return String(n).padStart(2, '0'); }

// ── Timer logic ──────────────────────────────────────────────

/** Load a preset into the active timer slot (idle state). */
function loadPreset(preset) {
  if (state.timer.status === 'running') {
    if (!confirm(`Timer "${state.timer.name}" läuft noch.\nNeuen Timer trotzdem laden?`)) return;
    stopCountdown();
  }
  state.timer = {
    name: preset.name,
    totalSeconds: preset.seconds,
    remainingSeconds: preset.seconds,
    originalSeconds: preset.seconds,
    status: 'idle',
  };
  updateTimerUI();
}

function toggleStartPause() {
  if (state.timer.status === 'idle' || state.timer.status === 'paused') {
    startTimer();
  } else if (state.timer.status === 'running') {
    pauseTimer();
  }
}

function startTimer() {
  if (state.timer.remainingSeconds <= 0) return;
  ensureAudio();
  state.timer.status = 'running';
  updateTimerUI();

  countdownInterval = setInterval(() => {
    state.timer.remainingSeconds--;
    if (state.timer.remainingSeconds <= 0) {
      state.timer.remainingSeconds = 0;
      state.timer.status = 'alarm';
      stopCountdown();
      triggerAlarm();
    }
    updateTimerUI();
  }, 1000);
}

function pauseTimer() {
  state.timer.status = 'paused';
  stopCountdown();
  updateTimerUI();
}

function resetTimer() {
  stopCountdown();
  state.timer.remainingSeconds = state.timer.originalSeconds;
  state.timer.totalSeconds     = state.timer.originalSeconds;
  state.timer.status = 'idle';
  updateTimerUI();
}

function stopCountdown() {
  if (countdownInterval !== null) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

/** Add seconds to the current timer (works during run, pause, and alarm). */
function extendTimer(extraSeconds) {
  state.timer.remainingSeconds += extraSeconds;
  state.timer.totalSeconds     += extraSeconds;
  // Clamp to at least remaining
  if (state.timer.totalSeconds < state.timer.remainingSeconds) {
    state.timer.totalSeconds = state.timer.remainingSeconds;
  }

  if (state.timer.status === 'alarm') {
    stopAlarmSound();
    closeAlarmOverlay();
    state.timer.status = 'paused';
  }
  updateTimerUI();
}

/** Extend AND immediately restart from the alarm overlay. */
function extendAndRestart(extraSeconds) {
  extendTimer(extraSeconds);
  startTimer();
}

/** Restart the timer with the same original duration. */
function repeatTimer() {
  stopAlarmSound();
  closeAlarmOverlay();
  state.timer.remainingSeconds = state.timer.originalSeconds;
  state.timer.totalSeconds     = state.timer.originalSeconds;
  state.timer.status = 'idle';
  updateTimerUI();
  startTimer();
}

/** Stop the alarm and return to idle without restarting. */
function stopAlarm() {
  stopAlarmSound();
  closeAlarmOverlay();
  state.timer.status = 'idle';
  updateTimerUI();
}

// ── Alarm ────────────────────────────────────────────────────
function triggerAlarm() {
  document.getElementById('alarmTimerName').textContent =
    state.timer.name || 'Timer';
  document.getElementById('alarmOverlay').style.display = 'flex';
  startAlarmSound();
}

function closeAlarmOverlay() {
  document.getElementById('alarmOverlay').style.display = 'none';
}

// ── Custom / free timer ──────────────────────────────────────
function startCustomTimer() {
  const name  = document.getElementById('customName').value.trim() || 'Freier Timer';
  const secs  = readTimeInputs('custom');
  if (secs <= 0) {
    flashInput('customMinutes');
    return;
  }
  if (state.timer.status === 'running') {
    if (!confirm(`Timer "${state.timer.name}" läuft noch.\nNeuen Timer trotzdem starten?`)) return;
    stopCountdown();
  }
  state.timer = {
    name,
    totalSeconds: secs,
    remainingSeconds: secs,
    originalSeconds: secs,
    status: 'idle',
  };
  updateTimerUI();
  startTimer();
}

function saveCustomAsPreset() {
  const name = document.getElementById('customName').value.trim();
  const secs = readTimeInputs('custom');
  if (!name) { flashInput('customName'); return; }
  if (secs <= 0) { flashInput('customMinutes'); return; }

  state.presets.push({ id: uid(), name, seconds: secs });
  persistPresets();
  renderPresets();
  // Visual confirmation
  showToast('Timer gespeichert!');
}

// ── Preset management ─────────────────────────────────────────

function renderPresets() {
  const grid = document.getElementById('presetsGrid');
  grid.innerHTML = '';

  state.presets.forEach(preset => {
    const card = document.createElement('div');
    card.className = 'preset-btn';
    card.innerHTML = `
      <span class="preset-name">${esc(preset.name)}</span>
      <span class="preset-duration">${formatDuration(preset.seconds)}</span>
      <button class="preset-edit-btn" title="Bearbeiten"
        onclick="openEditPresetModal('${preset.id}'); event.stopPropagation();">✏</button>
    `;
    card.addEventListener('click', () => loadPreset(preset));
    grid.appendChild(card);
  });
}

function openNewPresetModal() {
  document.getElementById('newPresetName').value = '';
  document.getElementById('newPresetHours').value = '0';
  document.getElementById('newPresetMinutes').value = '10';
  document.getElementById('newPresetSeconds').value = '0';
  document.getElementById('newPresetModal').style.display = 'flex';
  setTimeout(() => document.getElementById('newPresetName').focus(), 50);
}

function saveNewPreset() {
  const name = document.getElementById('newPresetName').value.trim();
  const secs = readTimeInputs('newPreset');
  if (!name) { flashInput('newPresetName'); return; }
  if (secs <= 0) { flashInput('newPresetMinutes'); return; }

  state.presets.push({ id: uid(), name, seconds: secs });
  persistPresets();
  renderPresets();
  closeModal('newPresetModal');
}

function openEditPresetModal(presetId) {
  const p = state.presets.find(x => x.id === presetId);
  if (!p) return;
  document.getElementById('editPresetId').value = presetId;
  document.getElementById('editPresetName').value = p.name;
  document.getElementById('editPresetHours').value = Math.floor(p.seconds / 3600);
  document.getElementById('editPresetMinutes').value = Math.floor((p.seconds % 3600) / 60);
  document.getElementById('editPresetSeconds').value = p.seconds % 60;
  document.getElementById('editPresetModal').style.display = 'flex';
  setTimeout(() => document.getElementById('editPresetName').focus(), 50);
}

function updatePreset() {
  const id   = document.getElementById('editPresetId').value;
  const name = document.getElementById('editPresetName').value.trim();
  const secs = readTimeInputs('editPreset');
  if (!name) { flashInput('editPresetName'); return; }
  if (secs <= 0) { flashInput('editPresetMinutes'); return; }

  const idx = state.presets.findIndex(p => p.id === id);
  if (idx >= 0) {
    state.presets[idx] = { id, name, seconds: secs };
    persistPresets();
    renderPresets();
    // Update active timer label if same preset is loaded
    if (state.timer.name === state.presets[idx]?.name) {
      state.timer.name = name;
      updateTimerUI();
    }
  }
  closeModal('editPresetModal');
}

function deletePreset() {
  const id = document.getElementById('editPresetId').value;
  if (!confirm('Diesen Timer-Eintrag wirklich löschen?')) return;
  state.presets = state.presets.filter(p => p.id !== id);
  persistPresets();
  renderPresets();
  closeModal('editPresetModal');
}

// ── Time input helpers ───────────────────────────────────────

/**
 * Read hours/minutes/seconds inputs for a given prefix and return total seconds.
 * Prefixes: 'custom' | 'newPreset' | 'editPreset'
 */
function readTimeInputs(prefix) {
  const h = parseInt(document.getElementById(`${prefix}Hours`).value)   || 0;
  const m = parseInt(document.getElementById(`${prefix}Minutes`).value) || 0;
  const s = parseInt(document.getElementById(`${prefix}Seconds`).value) || 0;
  return h * 3600 + m * 60 + s;
}

/**
 * Stepper ▲/▼ for any numeric time input.
 * Called from HTML: adjustTime('customMinutes', 1, 59)
 */
function adjustTime(inputId, delta, max) {
  const el  = document.getElementById(inputId);
  const min = 0;
  let val   = parseInt(el.value) || 0;
  val = Math.max(min, Math.min(max, val + delta));
  el.value = val;
}

// ── UI update ────────────────────────────────────────────────
function updateTimerUI() {
  const { status, remainingSeconds, totalSeconds, name } = state.timer;
  const urgent = status === 'running' && remainingSeconds <= 30 && remainingSeconds > 0;

  // Countdown digits
  const display = document.getElementById('timerDisplay');
  display.textContent = formatTime(remainingSeconds);
  display.className   = 'timer-display';
  if (status === 'running') display.classList.add(urgent ? 'urgent' : 'running');
  if (status === 'paused')  display.classList.add('paused');

  // Timer name
  document.getElementById('timerLabel').textContent =
    name || (totalSeconds === 0 ? 'Kein Timer aktiv' : 'Timer');

  // Start / Pause button
  const btn = document.getElementById('btnStartPause');
  if (status === 'running') {
    btn.textContent = '⏸ Pause';
    btn.className   = 'btn btn-secondary btn-large';
  } else {
    btn.textContent = status === 'paused' ? '▶ Weiter' : '▶ Start';
    btn.className   = 'btn btn-primary btn-large';
  }
  btn.disabled = (status === 'alarm') || totalSeconds === 0;

  // Progress bar
  const pct = totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 100;
  const bar = document.getElementById('progressBar');
  bar.style.width = `${Math.max(0, pct)}%`;
  if (urgent) bar.classList.add('urgent');
  else        bar.classList.remove('urgent');
}

// ── Modal helpers ─────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// ── Misc UI helpers ───────────────────────────────────────────

/** Briefly highlight an input to signal missing/invalid value. */
function flashInput(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.style.borderColor = 'var(--red)';
  el.focus();
  setTimeout(() => { el.style.borderColor = ''; }, 1800);
}

/** Show a brief toast message. */
function showToast(msg) {
  const existing = document.getElementById('_toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = '_toast';
  toast.textContent = msg;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '32px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--bg-card)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '12px 28px',
    fontSize: '1rem',
    fontWeight: '600',
    zIndex: '9999',
    pointerEvents: 'none',
    boxShadow: 'var(--shadow)',
  });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

/** Minimal HTML escape. */
function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
