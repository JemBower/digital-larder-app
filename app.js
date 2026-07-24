// ---------- State ----------
const STORAGE_KEY = 'digitalLarderData';

let state = {
  shopping: { 1: [] },
  currentTrip: 1,
  larder: [],       // { id, name, location, qty, source: 'receipt'|'manual', loggedDate, storeName }
  corrections: {}   // { rawTextLower: correctedName }
};

const CAT_TO_LOCATION = {
  Produce: 'Fridge', Dairy: 'Fridge', Meat: 'Fridge',
  Frozen: 'Freezer', Pantry: 'Pantry', Other: 'Pantry'
};

// A receipt line at or after any of these is the payment/auth block, not items.
// We stop parsing item lines once one of these appears — that data is never
// extracted or stored, by design (see PRD Boundaries).
const STOP_KEYWORDS = [
  'BALANCE DUE', 'MASTERCARD', 'VISA', 'MAESTRO', 'ICC', 'PIN VERIFIED',
  'PLEASE RETAIN', 'AUTH CODE', 'CARDHOLDER', 'TOKEN ID', 'ACCOUNT ON FILE',
  'APP SEQ', 'CHANGE', 'THANK YOU FOR SHOPPING'
];

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    } catch (e) { /* corrupt data — start fresh rather than crash */ }
  }
  if (!state.shopping[state.currentTrip]) state.shopping[state.currentTrip] = [];
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- Tabs ----------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// ---------- Larder helpers ----------
function normalizeName(name) {
  return name.trim().toLowerCase();
}

// Simple, brand-blind matching: same generic name merges into one line,
// regardless of brand — this was a deliberate v1 choice (see PRD Core Capabilities).
function mergeIntoLarder({ name, qty, location, source, storeName }) {
  const norm = normalizeName(name);
  const existing = state.larder.find((i) => normalizeName(i.name) === norm);
  const today = new Date().toISOString().slice(0, 10);
  if (existing) {
    existing.qty += qty;
    existing.location = location || existing.location;
    existing.source = source;
    existing.loggedDate = today;
    existing.storeName = storeName || existing.storeName;
  } else {
    state.larder.push({
      id: Date.now() + Math.random(),
      name: name.trim(),
      location: location || 'Pantry',
      qty,
      source,
      loggedDate: today,
      storeName: storeName || null
    });
  }
}

function larderQtyFor(name) {
  const norm = normalizeName(name);
  const item = state.larder.find((i) => normalizeName(i.name) === norm);
  return item ? item.qty : 0;
}

// ---------- Shopping list rendering ----------
function renderTripSelector() {
  const trips = Object.keys(state.shopping).map(Number).sort((a, b) => b - a);
  const row = document.getElementById('tripRow');
  row.innerHTML = trips.map((t) => {
    const count = state.shopping[t].filter((i) => !i.checked).length;
    const active = t === state.currentTrip ? 'active' : '';
    return `<button class="trip-chip ${active}" data-trip="${t}">Trip ${t}${count ? ` (${count})` : ''}</button>`;
  }).join('') + `<button class="trip-chip new" id="newTripBtn">+ New trip</button>`;

  row.querySelectorAll('.trip-chip[data-trip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.currentTrip = Number(btn.dataset.trip);
      renderTripSelector();
      renderShoppingList();
    });
  });
  document.getElementById('newTripBtn').addEventListener('click', newTrip);
}

function newTrip() {
  const nums = Object.keys(state.shopping).map(Number);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  state.shopping[next] = [];
  state.currentTrip = next;
  saveState();
  renderTripSelector();
  renderShoppingList();
}

function repeatLastTrip() {
  const nums = Object.keys(state.shopping).map(Number).filter((n) => n !== state.currentTrip);
  if (!nums.length) { alert('No previous trip to repeat yet.'); return; }
  const lastTrip = Math.max(...nums);
  const sourceItems = state.shopping[lastTrip];
  if (!sourceItems.length) { alert('That trip was empty.'); return; }

  const next = Math.max(...Object.keys(state.shopping).map(Number)) + 1;
  state.shopping[next] = sourceItems.map((item) => {
    const stock = larderQtyFor(item.name);
    return {
      id: Date.now() + Math.random(),
      name: item.name,
      category: item.category,
      checked: false,
      nudge: stock >= 2 ? `You're well stocked — ${stock} already in the larder` : null
    };
  });
  state.currentTrip = next;
  saveState();
  renderTripSelector();
  renderShoppingList();
}

function renderShoppingList() {
  const items = state.shopping[state.currentTrip] || [];
  const pending = items.filter((i) => !i.checked).length;
  const completed = items.filter((i) => i.checked).length;
  document.getElementById('pendingCount').textContent = pending;
  document.getElementById('completedCount').textContent = `${completed}/${items.length}`;

  const byCat = {};
  items.forEach((item) => {
    if (!byCat[item.category]) byCat[item.category] = [];
    byCat[item.category].push(item);
  });

  const list = document.getElementById('shoppingList');
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">Nothing on this trip yet. Add something below.</div>';
    return;
  }

  list.innerHTML = Object.keys(byCat).sort().map((cat) => {
    const rows = byCat[cat].map((item) => `
      <div class="item ${item.checked ? 'done' : ''}">
        <input type="checkbox" class="check" ${item.checked ? 'checked' : ''} data-toggle="${item.id}">
        <div class="item-body">
          <div class="item-name">${escapeHtml(item.name)}</div>
          ${item.nudge ? `<div class="nudge">${escapeHtml(item.nudge)}</div>` : ''}
        </div>
        <div class="item-actions">
          <button class="icon-btn" data-delete="${item.id}" aria-label="Delete">✕</button>
        </div>
      </div>`).join('');
    return `<div class="cat-title">${cat}</div>${rows}`;
  }).join('');

  list.querySelectorAll('[data-toggle]').forEach((el) => {
    el.addEventListener('change', () => toggleShoppingItem(Number(el.dataset.toggle)));
  });
  list.querySelectorAll('[data-delete]').forEach((el) => {
    el.addEventListener('click', () => deleteShoppingItem(Number(el.dataset.delete)));
  });
}

function toggleShoppingItem(id) {
  const item = state.shopping[state.currentTrip].find((i) => i.id === id);
  if (item) item.checked = !item.checked;
  saveState();
  renderTripSelector();
  renderShoppingList();
}

function deleteShoppingItem(id) {
  state.shopping[state.currentTrip] = state.shopping[state.currentTrip].filter((i) => i.id !== id);
  saveState();
  renderTripSelector();
  renderShoppingList();
}

document.getElementById('addItemBtn').addEventListener('click', () => {
  const input = document.getElementById('itemInput');
  const name = input.value.trim();
  if (!name) return;
  const category = document.getElementById('categorySelect').value;
  state.shopping[state.currentTrip].push({ id: Date.now() + Math.random(), name, category, checked: false, nudge: null });
  input.value = '';
  saveState();
  renderTripSelector();
  renderShoppingList();
});

document.getElementById('repeatTripBtn').addEventListener('click', repeatLastTrip);

// Fallback path: receipt lost/missed — ticked items become the larder update
// instead. Deliberately a separate, explicit action, not automatic on every
// checkbox tap (that's the receipt's job normally — see PRD Core Capabilities).
document.getElementById('fallbackToLarderBtn').addEventListener('click', () => {
  const checked = (state.shopping[state.currentTrip] || []).filter((i) => i.checked);
  if (!checked.length) { alert('Nothing ticked off on this trip yet.'); return; }
  checked.forEach((item) => {
    mergeIntoLarder({
      name: item.name,
      qty: 1,
      location: CAT_TO_LOCATION[item.category] || 'Pantry',
      source: 'manual (no receipt)'
    });
  });
  saveState();
  renderLarderList();
  alert(`Added ${checked.length} item(s) to the larder.`);
});

// ---------- Larder rendering ----------
function renderLarderList() {
  const groups = { Fridge: [], Freezer: [], Pantry: [] };
  state.larder.forEach((item) => { (groups[item.location] || groups.Pantry).push(item); });

  const list = document.getElementById('larderList');
  const hasAny = state.larder.length > 0;
  if (!hasAny) {
    list.innerHTML = '<div class="empty-state">Nothing logged yet. Add an item or scan a receipt.</div>';
    return;
  }

  list.innerHTML = ['Fridge', 'Freezer', 'Pantry'].map((loc) => {
    if (!groups[loc].length) return '';
    const rows = groups[loc].map((item) => {
      const meta = item.source === 'receipt'
        ? `Logged from ${item.storeName || 'a'} receipt, ${item.loggedDate}`
        : `Added manually, ${item.loggedDate}`;
      return `
        <div class="item">
          <div class="item-body">
            <div class="item-name">${escapeHtml(item.name)}</div>
            <div class="item-meta">${escapeHtml(meta)}</div>
          </div>
          <div class="qty-controls">
            <button class="qty-btn" data-qty-down="${item.id}" aria-label="Decrease">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" data-qty-up="${item.id}" aria-label="Increase">+</button>
          </div>
          <div class="item-actions">
            <button class="icon-btn" data-delete-larder="${item.id}" aria-label="Delete">✕</button>
          </div>
        </div>`;
    }).join('');
    return `<div class="cat-title">${loc}</div>${rows}`;
  }).join('');

  list.querySelectorAll('[data-qty-down]').forEach((el) => {
    el.addEventListener('click', () => adjustLarderQty(Number(el.dataset.qtyDown), -1));
  });
  list.querySelectorAll('[data-qty-up]').forEach((el) => {
    el.addEventListener('click', () => adjustLarderQty(Number(el.dataset.qtyUp), 1));
  });
  list.querySelectorAll('[data-delete-larder]').forEach((el) => {
    el.addEventListener('click', () => {
      state.larder = state.larder.filter((i) => i.id !== Number(el.dataset.deleteLarder));
      saveState();
      renderLarderList();
    });
  });
}

function adjustLarderQty(id, delta) {
  const item = state.larder.find((i) => i.id === id);
  if (!item) return;
  item.qty = Math.max(0, item.qty + delta);
  if (item.qty === 0) {
    state.larder = state.larder.filter((i) => i.id !== id);
  }
  saveState();
  renderLarderList();
}

document.getElementById('addLarderBtn').addEventListener('click', () => {
  const name = document.getElementById('larderInput').value.trim();
  if (!name) return;
  const qty = Math.max(1, parseInt(document.getElementById('larderQty').value, 10) || 1);
  const location = document.getElementById('larderLocation').value;
  mergeIntoLarder({ name, qty, location, source: 'manual' });
  document.getElementById('larderInput').value = '';
  document.getElementById('larderQty').value = '1';
  saveState();
  renderLarderList();
});

// ---------- Receipt scanning ----------
let tesseractLoading = null;
function ensureTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (tesseractLoading) return tesseractLoading;
  tesseractLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load the scanner — check your connection and try again.'));
    document.head.appendChild(script);
  });
  return tesseractLoading;
}

document.getElementById('scanBtn').addEventListener('click', () => {
  document.getElementById('receiptInput').click();
});

document.getElementById('receiptInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const status = document.getElementById('scanStatus');
  status.textContent = 'Loading scanner…';
  try {
    await ensureTesseract();
    status.textContent = 'Reading receipt… this can take a moment.';
    const { data } = await window.Tesseract.recognize(file, 'eng');
    status.textContent = '';
    const parsed = parseReceiptText(data.text);
    openConfirmModal(parsed);
  } catch (err) {
    status.textContent = err.message || 'Something went wrong reading that receipt.';
  } finally {
    e.target.value = '';
  }
});

// Fixes the systematic OCR misread found in testing: decimal points in
// prices coming through as "I" or "l" (e.g. "1 I 75" for "1.75").
function fixDecimalMisreads(line) {
  return line.replace(/(\d)\s*[Il]\s*(\d{2})\b/g, '$1.$2');
}

function parseReceiptText(rawText) {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const items = [];
  let date = null;
  const dateMatch = rawText.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  if (dateMatch) date = dateMatch[1];

  let stopped = false;
  for (const rawLine of lines) {
    const line = fixDecimalMisreads(rawLine);
    const upper = line.toUpperCase();
    if (STOP_KEYWORDS.some((kw) => upper.includes(kw))) { stopped = true; break; }
    // A plausible item line ends with a price like "1.75" or "12.40".
    const priceMatch = line.match(/^(.*?)\s+(-?\d+\.\d{2})$/);
    if (priceMatch) {
      const rawName = priceMatch[1].trim();
      if (rawName.length < 2) continue; // too short to be a real item line
      const rawKey = normalizeName(rawName);
      const learned = state.corrections[rawKey];
      items.push({
        raw: rawName,
        name: learned || rawName,
        location: 'Pantry',
        excluded: false,
        learned: !!learned
      });
    }
  }

  return { items, date, stopped };
}

let pendingConfirmItems = [];
function openConfirmModal(parsed) {
  pendingConfirmItems = parsed.items;
  const list = document.getElementById('confirmList');
  if (!pendingConfirmItems.length) {
    list.innerHTML = '<p class="hint">Couldn\'t make out any item lines on that scan — try again with better light or a flatter receipt.</p>';
  } else {
    list.innerHTML = pendingConfirmItems.map((item, idx) => `
      <div class="confirm-row" data-idx="${idx}">
        <div class="confirm-row-top">
          <input type="checkbox" class="check" checked data-confirm-include="${idx}">
          <input type="text" value="${escapeHtml(item.name)}" data-confirm-name="${idx}">
          <select data-confirm-location="${idx}">
            <option ${item.location === 'Fridge' ? 'selected' : ''}>Fridge</option>
            <option ${item.location === 'Pantry' ? 'selected' : ''}>Pantry</option>
            <option ${item.location === 'Freezer' ? 'selected' : ''}>Freezer</option>
          </select>
        </div>
        ${item.learned ? '<div class="learned">Auto-filled from a correction you made before</div>' : `<div class="raw">Read as: "${escapeHtml(item.raw)}"</div>`}
      </div>`).join('');
  }
  document.getElementById('confirmBackdrop').classList.add('open');
  document.getElementById('confirmBackdrop').dataset.date = parsed.date || '';
}

document.getElementById('cancelConfirmBtn').addEventListener('click', () => {
  document.getElementById('confirmBackdrop').classList.remove('open');
});

document.getElementById('commitConfirmBtn').addEventListener('click', () => {
  const backdrop = document.getElementById('confirmBackdrop');
  const rows = document.querySelectorAll('.confirm-row');
  let added = 0;
  rows.forEach((row) => {
    const idx = Number(row.dataset.idx);
    const include = row.querySelector(`[data-confirm-include="${idx}"]`).checked;
    if (!include) return;
    const nameInput = row.querySelector(`[data-confirm-name="${idx}"]`);
    const correctedName = nameInput.value.trim();
    if (!correctedName) return;
    const location = row.querySelector(`[data-confirm-location="${idx}"]`).value;
    const original = pendingConfirmItems[idx];

    // If Jeremy changed the name from the raw OCR text, remember that
    // correction locally so the same abbreviation auto-fills next time —
    // no AI call, no server, just a growing local lookup.
    if (correctedName.toLowerCase() !== original.raw.toLowerCase()) {
      state.corrections[normalizeName(original.raw)] = correctedName;
    }

    mergeIntoLarder({
      name: correctedName,
      qty: 1,
      location,
      source: 'receipt',
      storeName: 'Waitrose'
    });
    added += 1;
  });
  saveState();
  renderLarderList();
  backdrop.classList.remove('open');
  if (added) alert(`Added ${added} item(s) to the larder.`);
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Init ----------
loadState();
renderTripSelector();
renderShoppingList();
renderLarderList();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline install still works without it */ });
  });
}
