const STORAGE_KEY = "shift_tracker_state_v1";

const state = {
  currentShift: null,
  lastCompletedShift: null,
};

// ---------- Helpers ----------

function nowIso() {
  return new Date().toISOString();
}

function formatDate(dateString) {
  if (!dateString) return "-";
  const d = new Date(dateString);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(dateString) {
  if (!dateString) return "-";
  const d = new Date(dateString);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return "0m";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

function getPatrolDurationMs(patrol) {
  if (!patrol.startTime || !patrol.endTime) return 0;
  return new Date(patrol.endTime) - new Date(patrol.startTime);
}

function safeCounter(value) {
  return typeof value === "number" && !isNaN(value) && value >= 0 ? value : 0;
}

// ---------- Counter helpers ----------

// Engagements
function getCurrentEngagements() {
  if (!state.currentShift) return 0;
  return safeCounter(state.currentShift.engagements);
}
function setCurrentEngagements(newValue) {
  if (!state.currentShift || state.currentShift.endTime) return;
  state.currentShift.engagements = Math.max(0, newValue);
  saveState();
  renderShiftSection();
}

// Street drinkers
function getCurrentStreetDrinkers() {
  if (!state.currentShift) return 0;
  return safeCounter(state.currentShift.streetDrinkers);
}
function setCurrentStreetDrinkers(newValue) {
  if (!state.currentShift || state.currentShift.endTime) return;
  state.currentShift.streetDrinkers = Math.max(0, newValue);
  saveState();
  renderShiftSection();
}

// ASB incidents
function getCurrentAsbIncidents() {
  if (!state.currentShift) return 0;
  return safeCounter(state.currentShift.asbIncidents);
}
function setCurrentAsbIncidents(newValue) {
  if (!state.currentShift || state.currentShift.endTime) return;
  state.currentShift.asbIncidents = Math.max(0, newValue);
  saveState();
  renderShiftSection();
}

// ---------- Persistence ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      state.currentShift = parsed.currentShift || null;
      state.lastCompletedShift = parsed.lastCompletedShift || null;

      if (state.currentShift) {
        if (typeof state.currentShift.engagements !== "number") {
          state.currentShift.engagements = 0;
        }
        if (typeof state.currentShift.streetDrinkers !== "number") {
          state.currentShift.streetDrinkers = 0;
        }
        if (typeof state.currentShift.asbIncidents !== "number") {
          state.currentShift.asbIncidents = 0;
        }
      }
      if (state.lastCompletedShift) {
        if (typeof state.lastCompletedShift.engagements !== "number") {
          state.lastCompletedShift.engagements = 0;
        }
        if (typeof state.lastCompletedShift.streetDrinkers !== "number") {
          state.lastCompletedShift.streetDrinkers = 0;
        }
        if (typeof state.lastCompletedShift.asbIncidents !== "number") {
          state.lastCompletedShift.asbIncidents = 0;
        }
      }
    }
  } catch (e) {
    console.warn("Failed to load state:", e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to save state:", e);
  }
}

// ---------- DOM refs (assigned after DOMContentLoaded) ----------

let todayLabelEl;
let shiftStatusEl;
let shiftTimesEl;
let startShiftBtn;
let endShiftBtn;
let resetDataBtn;
let patrolsContainer;
let summaryContainer;
let headerBadgeEl;

// Counters
let engagementCountEl, engagementMinusBtn, engagementPlusBtn;
let streetCountEl, streetMinusBtn, streetPlusBtn;
let asbCountEl, asbMinusBtn, asbPlusBtn;

// ---------- Actions ----------

function startShift() {
  if (state.currentShift && !state.currentShift.endTime) {
    return; // already active
  }

  const now = nowIso();
  const dateOnly = now.slice(0, 10);

  state.currentShift = {
    id: now,
    date: dateOnly,
    startTime: now,
    endTime: null,
    engagements: 0,
    streetDrinkers: 0,
    asbIncidents: 0,
    patrols: Array.from({ length: 5 }).map((_, idx) => ({
      index: idx + 1,
      startTime: null,
      endTime: null,
    })),
  };

  saveState();
  render();
}

function endShift() {
  if (!state.currentShift || state.currentShift.endTime) return;

  const now = nowIso();

  // auto-finish any active patrol
  const activePatrol = state.currentShift.patrols.find(
    (p) => p.startTime && !p.endTime
  );
  if (activePatrol) {
    activePatrol.endTime = now;
  }

  state.currentShift.endTime = now;
  state.lastCompletedShift = state.currentShift;
  state.currentShift = null;

  saveState();
  render();
}

function startPatrol(index) {
  if (!state.currentShift || state.currentShift.endTime) return;

  const patrols = state.currentShift.patrols;
  const thisPatrol = patrols[index];

  // Only one active patrol at a time
  const active = patrols.find((p) => p.startTime && !p.endTime);
  if (active) return;

  // Must complete previous patrol first (if any)
  if (index > 0) {
    const prev = patrols[index - 1];
    if (!prev.endTime) return;
  }

  if (!thisPatrol.startTime && !thisPatrol.endTime) {
    thisPatrol.startTime = nowIso();
    saveState();
    render();
  }
}

function endPatrol(index) {
  if (!state.currentShift || state.currentShift.endTime) return;

  const patrol = state.currentShift.patrols[index];
  if (patrol && patrol.startTime && !patrol.endTime) {
    patrol.endTime = nowIso();
    saveState();
    render();
  }
}

function resetAllData() {
  const hasAnyData = state.currentShift || state.lastCompletedShift;
  if (!hasAnyData) return;

  const ok = window.confirm(
    "This will clear your current shift, last summary and all stored data. Are you sure?"
  );
  if (!ok) return;

  state.currentShift = null;
  state.lastCompletedShift = null;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("Failed to clear localStorage, falling back to saveState:", e);
    saveState();
  }

  render();
}

// Engagement events
function incrementEngagements() {
  const current = getCurrentEngagements();
  setCurrentEngagements(current + 1);
}
function decrementEngagements() {
  const current = getCurrentEngagements();
  if (current <= 0) return;
  setCurrentEngagements(current - 1);
}

// Street drinkers events
function incrementStreetDrinkers() {
  const current = getCurrentStreetDrinkers();
  setCurrentStreetDrinkers(current + 1);
}
function decrementStreetDrinkers() {
  const current = getCurrentStreetDrinkers();
  if (current <= 0) return;
  setCurrentStreetDrinkers(current - 1);
}

// ASB incidents events
function incrementAsbIncidents() {
  const current = getCurrentAsbIncidents();
  setCurrentAsbIncidents(current + 1);
}
function decrementAsbIncidents() {
  const current = getCurrentAsbIncidents();
  if (current <= 0) return;
  setCurrentAsbIncidents(current - 1);
}

// ---------- Rendering ----------

function renderHeader() {
  const today = new Date();
  todayLabelEl.textContent = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (state.currentShift && !state.currentShift.endTime) {
    shiftStatusEl.textContent = "Shift in progress";
    headerBadgeEl.classList.add("active");
  } else {
    shiftStatusEl.textContent = "No active shift";
    headerBadgeEl.classList.remove("active");
  }
}

function renderShiftSection() {
  const shift = state.currentShift;

  if (!shift) {
    shiftTimesEl.innerHTML = `<p>No active shift. Tap <strong>Start Shift</strong> to begin your day.</p>`;
    startShiftBtn.disabled = false;
    endShiftBtn.disabled = true;

    if (engagementCountEl) engagementCountEl.textContent = "0";
    if (streetCountEl) streetCountEl.textContent = "0";
    if (asbCountEl) asbCountEl.textContent = "0";

    if (engagementMinusBtn) engagementMinusBtn.disabled = true;
    if (engagementPlusBtn) engagementPlusBtn.disabled = true;
    if (streetMinusBtn) streetMinusBtn.disabled = true;
    if (streetPlusBtn) streetPlusBtn.disabled = true;
    if (asbMinusBtn) asbMinusBtn.disabled = true;
    if (asbPlusBtn) asbPlusBtn.disabled = true;
  } else {
    let html = `
      <p><strong>Date:</strong> ${formatDate(shift.startTime)}</p>
      <p><strong>Started:</strong> ${formatTime(shift.startTime)}</p>
    `;

    if (shift.endTime) {
      const durationMs = new Date(shift.endTime) - new Date(shift.startTime);
      html += `
        <p><strong>Finished:</strong> ${formatTime(shift.endTime)}</p>
        <p><strong>Shift length:</strong> ${formatDuration(durationMs)}</p>
      `;
    } else {
      html += `<p><strong>Finished:</strong> –</p>`;
    }

    shiftTimesEl.innerHTML = html;
    startShiftBtn.disabled = !!shift && !shift.endTime;
    endShiftBtn.disabled = !!shift.endTime || !shift;

    const shiftEnded = !!shift.endTime;

    // Engagements
    const engagements = getCurrentEngagements();
    if (engagementCountEl) engagementCountEl.textContent = engagements.toString();
    if (engagementPlusBtn) engagementPlusBtn.disabled = shiftEnded;
    if (engagementMinusBtn) {
      engagementMinusBtn.disabled = shiftEnded || engagements <= 0;
    }

    // Street drinkers
    const street = getCurrentStreetDrinkers();
    if (streetCountEl) streetCountEl.textContent = street.toString();
    if (streetPlusBtn) streetPlusBtn.disabled = shiftEnded;
    if (streetMinusBtn) {
      streetMinusBtn.disabled = shiftEnded || street <= 0;
    }

    // ASB incidents
    const asb = getCurrentAsbIncidents();
    if (asbCountEl) asbCountEl.textContent = asb.toString();
    if (asbPlusBtn) asbPlusBtn.disabled = shiftEnded;
    if (asbMinusBtn) {
      asbMinusBtn.disabled = shiftEnded || asb <= 0;
    }
  }

  const hasAnyData = state.currentShift || state.lastCompletedShift;
  resetDataBtn.disabled = !hasAnyData;
}

function renderPatrols() {
  patrolsContainer.innerHTML = "";

  if (!state.currentShift) {
    for (let i = 0; i < 5; i++) {
      const card = document.createElement("div");
      card.className = "patrol-card";
      card.innerHTML = `
        <div class="patrol-top">
          <span class="patrol-label">Patrol ${i + 1}</span>
          <span class="pill idle">Waiting</span>
        </div>
        <div class="patrol-times">
          <p>Start: –</p>
          <p>End: –</p>
          <p>Duration: 0m</p>
        </div>
        <button class="btn small ghost" disabled>Start patrol</button>
      `;
      patrolsContainer.appendChild(card);
    }
    return;
  }

  const patrols = state.currentShift.patrols;
  const shiftEnded = !!state.currentShift.endTime;

  patrols.forEach((patrol, idx) => {
    const card = document.createElement("div");
    let statusClass = "idle";
    let statusLabel = "Not started";

    if (patrol.startTime && !patrol.endTime) {
      statusClass = "active";
      statusLabel = "In progress";
      card.classList.add("active");
    } else if (patrol.startTime && patrol.endTime) {
      statusClass = "done";
      statusLabel = "Completed";
    }

    const durationMs = getPatrolDurationMs(patrol);

    let timesHtml = `
      <p>Start: ${formatTime(patrol.startTime)}</p>
      <p>End: ${formatTime(patrol.endTime)}</p>
      <p>Duration: ${formatDuration(durationMs)}</p>
    `;

    if (!patrol.startTime && !patrol.endTime) {
      timesHtml = `
        <p>Start: –</p>
        <p>End: –</p>
        <p>Duration: 0m</p>
      `;
    }

    card.classList.add("patrol-card");
    card.innerHTML = `
      <div class="patrol-top">
        <span class="patrol-label">Patrol ${patrol.index}</span>
        <span class="pill ${statusClass}">${statusLabel}</span>
      </div>
      <div class="patrol-times">
        ${timesHtml}
      </div>
    `;

    const btn = document.createElement("button");
    btn.className = "btn small";

    const prev = idx > 0 ? patrols[idx - 1] : null;
    const previousDone = idx === 0 || (prev && prev.endTime);

    if (!patrol.startTime && !patrol.endTime) {
      btn.textContent = "Start patrol";
      btn.classList.add("primary");
      const canStart =
        !shiftEnded &&
        previousDone &&
        !patrols.some((p) => p.startTime && !p.endTime);

      btn.disabled = !canStart;
      if (canStart) {
        btn.addEventListener("click", () => startPatrol(idx));
      }
    } else if (patrol.startTime && !patrol.endTime) {
      btn.textContent = "End patrol";
      btn.classList.add("danger");
      btn.disabled = shiftEnded;
      if (!shiftEnded) {
        btn.addEventListener("click", () => endPatrol(idx));
      }
    } else {
      btn.textContent = "Completed";
      btn.classList.add("ghost");
      btn.disabled = true;
    }

    card.appendChild(btn);
    patrolsContainer.appendChild(card);
  });
}

function renderSummary() {
  const shift = state.lastCompletedShift;

  if (!shift) {
    summaryContainer.innerHTML =
      "<p>No completed shift yet. Finish a shift to see your totals.</p>";
    return;
  }

  const shiftDurationMs =
    new Date(shift.endTime) - new Date(shift.startTime || shift.endTime);

  let totalPatrolMs = 0;
  shift.patrols.forEach((p) => {
    totalPatrolMs += getPatrolDurationMs(p);
  });

  let patrolLines = "";
  shift.patrols.forEach((p) => {
    const patMs = getPatrolDurationMs(p);
    if (!p.startTime && !p.endTime) return;
    patrolLines += `
      <div class="summary-row">
        <span class="label">Patrol ${p.index}</span>
        <span class="value">${formatDuration(patMs)}</span>
      </div>
    `;
  });

  if (!patrolLines) {
    patrolLines = `<p class="muted">No patrols were started during this shift.</p>`;
  }

  const engagements = safeCounter(shift.engagements);
  const street = safeCounter(shift.streetDrinkers);
  const asb = safeCounter(shift.asbIncidents);

  summaryContainer.innerHTML = `
    <div class="summary-row">
      <span class="label">Date</span>
      <span class="value">${formatDate(shift.startTime)}</span>
    </div>
    <div class="summary-row">
      <span class="label">Shift start</span>
      <span class="value">${formatTime(shift.startTime)}</span>
    </div>
    <div class="summary-row">
      <span class="label">Shift end</span>
      <span class="value">${formatTime(shift.endTime)}</span>
    </div>
    <div class="summary-row total">
      <span class="label">Total shift length</span>
      <span class="value">${formatDuration(shiftDurationMs)}</span>
    </div>

    <div style="margin: 0.7rem 0 0.3rem; font-weight: 500;">Patrol breakdown</div>
    ${patrolLines}

    <div class="summary-row total">
      <span class="label">Total time in patrols (this shift)</span>
      <span class="value">${formatDuration(totalPatrolMs)}</span>
    </div>

    <div class="summary-row">
      <span class="label">Public engagements (this shift)</span>
      <span class="value">${engagements}</span>
    </div>
    <div class="summary-row">
      <span class="label">Street drinkers (this shift)</span>
      <span class="value">${street}</span>
    </div>
    <div class="summary-row">
      <span class="label">ASB incidents (this shift)</span>
      <span class="value">${asb}</span>
    </div>

    <div class="summary-highlight">
      <strong>Summary:</strong>
      You spent <strong>${formatDuration(
        totalPatrolMs
      )}</strong> actively on patrols and recorded
      <strong>${engagements}</strong> public engagement(s),
      <strong>${street}</strong> street drinker interaction(s), and
      <strong>${asb}</strong> ASB incident(s) this shift.
    </div>
  `;
}

function render() {
  renderHeader();
  renderShiftSection();
  renderPatrols();
  renderSummary();
}

// ---------- Init ----------

document.addEventListener("DOMContentLoaded", () => {
  // Grab elements once DOM is ready
  todayLabelEl = document.getElementById("todayLabel");
  shiftStatusEl = document.getElementById("shiftStatus");
  shiftTimesEl = document.getElementById("shiftTimes");
  startShiftBtn = document.getElementById("startShiftBtn");
  endShiftBtn = document.getElementById("endShiftBtn");
  resetDataBtn = document.getElementById("resetDataBtn");
  patrolsContainer = document.getElementById("patrolsContainer");
  summaryContainer = document.getElementById("summaryContainer");
  headerBadgeEl = document.querySelector(".header-badge");

  engagementCountEl = document.getElementById("engagementCount");
  engagementMinusBtn = document.getElementById("engagementMinusBtn");
  engagementPlusBtn = document.getElementById("engagementPlusBtn");

  streetCountEl = document.getElementById("streetCount");
  streetMinusBtn = document.getElementById("streetMinusBtn");
  streetPlusBtn = document.getElementById("streetPlusBtn");

  asbCountEl = document.getElementById("asbCount");
  asbMinusBtn = document.getElementById("asbMinusBtn");
  asbPlusBtn = document.getElementById("asbPlusBtn");

  loadState();
  render();

  startShiftBtn.addEventListener("click", startShift);
  endShiftBtn.addEventListener("click", endShift);
  resetDataBtn.addEventListener("click", resetAllData);

  if (engagementPlusBtn) engagementPlusBtn.addEventListener("click", incrementEngagements);
  if (engagementMinusBtn) engagementMinusBtn.addEventListener("click", decrementEngagements);

  if (streetPlusBtn) streetPlusBtn.addEventListener("click", incrementStreetDrinkers);
  if (streetMinusBtn) streetMinusBtn.addEventListener("click", decrementStreetDrinkers);

  if (asbPlusBtn) asbPlusBtn.addEventListener("click", incrementAsbIncidents);
  if (asbMinusBtn) asbMinusBtn.addEventListener("click", decrementAsbIncidents);
});
