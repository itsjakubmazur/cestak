/* ============================================
   Cestovní příkaz – App Logic
   ============================================ */

// ---- Safe localStorage helpers ----
function storageGet(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        console.warn('localStorage read error for', key, e);
        return fallback;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn('localStorage write error for', key, e);
        showToast('Nelze uložit data – úložiště je plné.', 'error');
    }
}

// ---- Toast Notification System ----
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ---- State ----
const state = {
    formType: 'club', // 'club' or 'cbas'
    legs: [],
    favorites: storageGet('cestak_favorites', []),
    history: storageGet('cestak_history', []),
    profile: storageGet('cestak_profile', null),
};

let legIdCounter = 0;

// ---- Cached DOM references ----
const DOM = {};

function cacheDom() {
    ['fullName', 'address', 'department', 'personalNumber', 'phone', 'bankAccount',
     'tripPurpose', 'tripStart', 'tripStartDate', 'tripDestination', 'tripEndDate', 'tripEnd',
     'companions', 'vehicleType', 'vehiclePlate', 'ratePerKm', 'surchargePercent',
     'mealAllowance', 'accommodation', 'otherCosts', 'advance', 'freeFood',
     'opNumber', 'workHoursFrom', 'workHoursTo', 'expectedCosts', 'advanceDate', 'reportDate',
     'legsContainer', 'legsSummary', 'totalKm', 'totalFare', 'grandTotal',
     'btnAddLeg', 'btnSaveProfile', 'btnGenerate', 'btnSaveDraft', 'btnReset',
     'btnFavorites', 'btnHistory',
     'sectionCbas', 'modalFavorites', 'modalHistory',
     'favoritesBody', 'historyBody', 'toastContainer',
     'mealHint',
    ].forEach(id => {
        DOM[id] = document.getElementById(id);
    });
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    cacheDom();
    loadProfile();
    addLeg(); // Start with one leg
    addLeg(); // Two legs (there and back)
    bindEvents();
    updateTotals();
    updateMealHint();
});

// ---- Event Binding ----
function bindEvents() {
    // Type selector
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.formType = btn.dataset.type;
            DOM.sectionCbas.style.display = state.formType === 'cbas' ? 'block' : 'none';
        });
    });

    // Add leg
    DOM.btnAddLeg.addEventListener('click', () => addLeg());

    // Save profile
    DOM.btnSaveProfile.addEventListener('click', saveProfile);

    // Generate PDF
    DOM.btnGenerate.addEventListener('click', generatePDF);

    // Save draft
    DOM.btnSaveDraft.addEventListener('click', saveDraft);

    // Reset form
    DOM.btnReset.addEventListener('click', resetForm);

    // Modals
    DOM.btnFavorites.addEventListener('click', () => openModal('modalFavorites'));
    DOM.btnHistory.addEventListener('click', () => openModal('modalHistory'));

    document.querySelectorAll('.modal-backdrop, .modal-close').forEach(el => {
        el.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.remove('open');
        });
    });

    // Recalculate on any cost input change
    ['mealAllowance', 'accommodation', 'otherCosts', 'advance', 'ratePerKm', 'surchargePercent'].forEach(id => {
        DOM[id].addEventListener('input', updateTotals);
    });

    // Auto meal hint on date change
    DOM.tripStartDate.addEventListener('change', updateMealHint);
    DOM.tripEndDate.addEventListener('change', updateMealHint);

    // ---- Event delegation for legs container ----
    DOM.legsContainer.addEventListener('click', handleLegClick);
    DOM.legsContainer.addEventListener('change', handleLegChange);

    // ---- Event delegation for modals ----
    DOM.favoritesBody.addEventListener('click', handleFavoriteClick);
    DOM.historyBody.addEventListener('click', handleHistoryClick);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveDraft();
        }
    });
}

// ---- Event Delegation Handlers ----
function handleLegClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const legItem = btn.closest('.leg-item');
    const legId = parseInt(legItem.dataset.id);

    switch (btn.dataset.action) {
        case 'save-favorite':
            saveFavorite(legId);
            break;
        case 'remove-leg':
            if (state.legs.length <= 1) {
                showToast('Musíte mít alespoň jeden úsek.', 'error');
                return;
            }
            if (!confirm('Opravdu odebrat tento úsek?')) return;
            removeLeg(legId);
            break;
        case 'return-trip':
            addReturnLeg(legId);
            break;
        case 'lookup':
            lookupDistance(legId);
            break;
    }
}

function handleLegChange(e) {
    const input = e.target;
    const legItem = input.closest('.leg-item');
    if (!legItem) return;
    const legId = parseInt(legItem.dataset.id);
    const field = input.dataset.field;

    if (field === 'km') {
        updateLegKm(legId, input.value);
    } else if (field) {
        updateLegField(legId, field, input.value);
    }
}

function handleFavoriteClick(e) {
    const removeBtn = e.target.closest('[data-action="remove-favorite"]');
    if (removeBtn) {
        e.stopPropagation();
        const index = parseInt(removeBtn.dataset.index);
        removeFavorite(index);
        return;
    }
    const item = e.target.closest('.favorite-item');
    if (item) {
        useFavorite(parseInt(item.dataset.index));
    }
}

function handleHistoryClick(e) {
    const removeBtn = e.target.closest('[data-action="remove-history"]');
    if (removeBtn) {
        e.stopPropagation();
        const index = parseInt(removeBtn.dataset.index);
        removeHistory(index);
        return;
    }
    const item = e.target.closest('.history-item');
    if (item) {
        loadDraft(parseInt(item.dataset.index));
    }
}

// ---- Legs Management ----
function addLeg(data = null) {
    const id = ++legIdCounter;
    const leg = {
        id,
        from: data?.from || '',
        to: data?.to || '',
        date: data?.date || '',
        departTime: data?.departTime || '',
        arriveTime: data?.arriveTime || '',
        km: data?.km || 0,
        kmRaw: data?.kmRaw || 0,
    };
    state.legs.push(leg);
    renderLeg(leg);
    return leg;
}

function renderLeg(leg) {
    const div = document.createElement('div');
    div.className = 'leg-item';
    div.dataset.id = leg.id;

    const escFrom = escapeHtml(leg.from);
    const escTo = escapeHtml(leg.to);

    div.innerHTML = `
        <div class="leg-header">
            <span class="leg-number">Úsek ${leg.id}</span>
            <div class="leg-actions">
                <button title="Přidat zpáteční úsek" data-action="return-trip">↩</button>
                <button title="Uložit jako oblíbenou trasu" data-action="save-favorite">⭐</button>
                <button title="Odebrat úsek" data-action="remove-leg">✕</button>
            </div>
        </div>
        <div class="leg-grid">
            <div class="leg-route">
                <div class="form-group" style="flex:1">
                    <label>Odkud</label>
                    <input type="text" placeholder="např. Brno" value="${escFrom}" data-field="from">
                </div>
                <span class="leg-arrow">→</span>
                <div class="form-group" style="flex:1">
                    <label>Kam</label>
                    <input type="text" placeholder="např. Ostrava" value="${escTo}" data-field="to">
                </div>
            </div>
            <div class="form-group">
                <label>Datum</label>
                <input type="date" value="${leg.date}" data-field="date">
            </div>
            <div class="form-group">
                <label>Odjezd</label>
                <input type="time" value="${leg.departTime}" data-field="departTime">
            </div>
            <div class="form-group">
                <label>Příjezd</label>
                <input type="time" value="${leg.arriveTime}" data-field="arriveTime">
            </div>
            <div class="form-group">
                <label>Km</label>
                <div class="leg-km-group">
                    <input type="number" value="${leg.km}" min="0" step="5" data-field="km">
                    <button class="btn-lookup" data-action="lookup">Najít km</button>
                </div>
            </div>
            <div class="form-group">
                <label>Km s přirážkou</label>
                <span class="km-badge" id="kmBadge_${leg.id}">${leg.km ? leg.km + ' km' : '—'}</span>
            </div>
        </div>
    `;
    DOM.legsContainer.appendChild(div);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function removeLeg(id) {
    state.legs = state.legs.filter(l => l.id !== id);
    const el = document.querySelector(`.leg-item[data-id="${id}"]`);
    if (el) el.remove();
    updateTotals();
}

function addReturnLeg(legId) {
    const leg = state.legs.find(l => l.id === legId);
    if (!leg || !leg.from || !leg.to) {
        showToast('Vyplňte odkud a kam.', 'error');
        return;
    }
    addLeg({ from: leg.to, to: leg.from, km: leg.km, kmRaw: leg.kmRaw });
    updateTotals();
    showToast(`Zpáteční úsek ${leg.to} → ${leg.from} přidán.`, 'success');
}

function updateLegField(id, field, value) {
    const leg = state.legs.find(l => l.id === id);
    if (leg) leg[field] = value;
}

function updateLegKm(id, value) {
    const leg = state.legs.find(l => l.id === id);
    if (!leg) return;
    leg.km = parseInt(value) || 0;
    leg.kmRaw = leg.km;
    document.getElementById(`kmBadge_${id}`).textContent = leg.km ? leg.km + ' km' : '—';
    updateTotals();
}

// ---- Reset Form ----
function resetForm() {
    if (!confirm('Opravdu vymazat celý formulář? Neuložená data budou ztracena.')) return;

    // Clear all text/number inputs in the form (not profile fields if desired)
    ['tripPurpose', 'tripStart', 'tripStartDate', 'tripDestination', 'tripEndDate', 'tripEnd',
     'companions', 'mealAllowance', 'accommodation', 'otherCosts', 'advance',
     'opNumber', 'workHoursFrom', 'workHoursTo', 'expectedCosts', 'advanceDate', 'reportDate',
    ].forEach(id => {
        const el = DOM[id];
        if (el) el.value = el.type === 'number' ? '0' : '';
    });
    DOM.freeFood.checked = false;

    // Clear legs and recreate two empty ones
    state.legs = [];
    DOM.legsContainer.innerHTML = '';
    addLeg();
    addLeg();
    updateTotals();
    updateMealHint();

    showToast('Formulář vymazán.', 'info');
}

// ---- Distance Lookup ----
async function lookupDistance(legId) {
    const leg = state.legs.find(l => l.id === legId);
    if (!leg || !leg.from || !leg.to) {
        showToast('Vyplňte odkud a kam.', 'error');
        return;
    }

    const badge = document.getElementById(`kmBadge_${legId}`);
    badge.textContent = 'Hledám...';
    badge.className = 'km-badge loading';

    try {
        const km = await getDistanceMapyCz(leg.from, leg.to);
        if (km) {
            applyDistance(legId, km);
            return;
        }
    } catch (e) {
        console.warn('Mapy.cz lookup failed:', e);
    }

    // Fallback: use a simple Czech distance table
    const fallbackKm = getCzechDistance(leg.from, leg.to);
    if (fallbackKm) {
        applyDistance(legId, fallbackKm);
    } else {
        badge.textContent = 'Nenalezeno – zadejte ručně';
        badge.className = 'km-badge';
        showToast('Vzdálenost nenalezena. Zadejte km ručně.', 'error');
    }
}

const MAPY_CZ_API_KEY = 'kUe_XgdGTUfuCilUdjIwpb1VmJ63HbOlheqbX8uaBdc';

async function getDistanceMapyCz(from, to) {
    const geocode = async (query) => {
        const resp = await fetch(`https://api.mapy.cz/v1/suggest?lang=cs&limit=1&type=regional.municipality&query=${encodeURIComponent(query)}&apikey=${MAPY_CZ_API_KEY}`, {
            headers: { 'Accept': 'application/json' }
        });
        if (!resp.ok) throw new Error(`API error: ${resp.status}`);
        const data = await resp.json();
        if (data.items && data.items.length > 0) {
            return { lat: data.items[0].position.lat, lon: data.items[0].position.lon };
        }
        return null;
    };

    const fromCoords = await geocode(from);
    const toCoords = await geocode(to);

    if (!fromCoords || !toCoords) return null;

    // Try Mapy.cz Routing API for precise road distance
    try {
        const routeResp = await fetch(
            `https://api.mapy.cz/v1/routing/route?apikey=${MAPY_CZ_API_KEY}&start=${fromCoords.lon},${fromCoords.lat}&end=${toCoords.lon},${toCoords.lat}&routeType=car_fast&lang=cs`,
            { headers: { 'Accept': 'application/json' } }
        );
        if (routeResp.ok) {
            const routeData = await routeResp.json();
            // Mapy.cz routing returns { length: <meters>, duration: <seconds>, geometry: ... }
            // Check for numeric length property (not Array.length)
            const distMeters = routeData && typeof routeData.length === 'number' && !Array.isArray(routeData)
                ? routeData.length
                : routeData?.routes?.[0]?.length ?? routeData?.result?.length ?? null;
            if (distMeters && distMeters > 0) {
                return Math.round(distMeters / 1000);
            }
        }
    } catch (e) {
        console.warn('Routing API failed, falling back to haversine:', e);
    }

    // Fallback: haversine × road factor
    const straightLine = haversineKm(fromCoords.lat, fromCoords.lon, toCoords.lat, toCoords.lon);
    return Math.round(straightLine * 1.3);
}

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function applyDistance(legId, rawKm) {
    const surcharge = parseFloat(DOM.surchargePercent.value) || 0;
    const withSurcharge = rawKm * (1 + surcharge / 100);
    const rounded = roundToFive(withSurcharge);

    const leg = state.legs.find(l => l.id === legId);
    if (leg) {
        leg.kmRaw = rawKm;
        leg.km = rounded;
    }

    const badge = document.getElementById(`kmBadge_${legId}`);
    badge.textContent = `${rounded} km (z ${rawKm})`;
    badge.className = 'km-badge';

    const legEl = document.querySelector(`.leg-item[data-id="${legId}"]`);
    if (legEl) {
        const kmInput = legEl.querySelector('input[data-field="km"]');
        if (kmInput) kmInput.value = rounded;
    }

    updateTotals();
}

function roundToFive(n) {
    return Math.round(n / 5) * 5;
}

// ---- Czech Distance Table (fallback) ----
// Keys are always sorted alphabetically to avoid duplicates
function getCzechDistance(from, to) {
    const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const key = [normalize(from), normalize(to)].sort().join('|');

    const distances = {
        'brno|ceske budejovice': 190,
        'brno|hradec kralove': 150,
        'brno|jihlava': 90,
        'brno|karlovy vary': 330,
        'brno|liberec': 250,
        'brno|olomouc': 78,
        'brno|ostrava': 170,
        'brno|pardubice': 130,
        'brno|plzen': 285,
        'brno|praha': 205,
        'brno|usti nad labem': 305,
        'brno|wien': 145,
        'brno|zlin': 100,
        'bratislava|brno': 130,
        'ceske budejovice|praha': 150,
        'hradec kralove|praha': 115,
        'karlovy vary|praha': 130,
        'liberec|praha': 110,
        'olomouc|ostrava': 100,
        'olomouc|praha': 280,
        'ostrava|praha': 370,
        'plzen|praha': 90,
    };

    return distances[key] || null;
}

// ---- Automatic Meal Allowance Hint ----
function calculateMealAllowance(startDate, endDate) {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const hours = (end - start) / (1000 * 60 * 60);

    if (hours < 5) return { amount: 0, hours: hours, bracket: 'pod 5 h' };

    // 2025 sazby stravného (tuzemsko) dle vyhlášky MPSV
    if (hours >= 18) return { amount: 398, hours: hours, bracket: 'nad 18 h' };
    if (hours >= 12) return { amount: 256, hours: hours, bracket: '12–18 h' };
    return { amount: 166, hours: hours, bracket: '5–12 h' };
}

function updateMealHint() {
    if (!DOM.mealHint) return;
    const startDate = DOM.tripStartDate.value;
    const endDate = DOM.tripEndDate.value;
    const result = calculateMealAllowance(startDate, endDate);

    if (!result) {
        DOM.mealHint.textContent = '';
        DOM.mealHint.style.display = 'none';
        return;
    }

    if (result.amount === 0) {
        DOM.mealHint.textContent = `Cesta ${result.hours.toFixed(1)} h – nárok na stravné nevzniká`;
    } else {
        DOM.mealHint.textContent = `Návrh: ${result.amount} Kč (${result.bracket}, ${result.hours.toFixed(1)} h)`;
    }
    DOM.mealHint.style.display = 'block';
    DOM.mealHint.style.cursor = 'pointer';
    DOM.mealHint.onclick = () => {
        if (result.amount > 0) {
            DOM.mealAllowance.value = result.amount;
            updateTotals();
            showToast(`Stravné nastaveno na ${result.amount} Kč.`, 'success');
        }
    };
}

// ---- Totals ----
function updateTotals() {
    const rate = parseFloat(DOM.ratePerKm.value) || 0;
    let totalKm = 0;
    let totalFare = 0;

    state.legs.forEach(leg => {
        totalKm += leg.km || 0;
        totalFare += (leg.km || 0) * rate;
    });

    const meal = parseFloat(DOM.mealAllowance.value) || 0;
    const accomm = parseFloat(DOM.accommodation.value) || 0;
    const other = parseFloat(DOM.otherCosts.value) || 0;
    const advance = parseFloat(DOM.advance.value) || 0;

    const grandTotal = totalFare + meal + accomm + other - advance;

    DOM.totalKm.textContent = totalKm;
    DOM.totalFare.textContent = totalFare.toFixed(0) + ' Kč';
    DOM.grandTotal.textContent = grandTotal.toFixed(0) + ' Kč';
}

// ---- Profile ----
function saveProfile() {
    const profile = {
        fullName: DOM.fullName.value,
        address: DOM.address.value,
        department: DOM.department.value,
        personalNumber: DOM.personalNumber.value,
        phone: DOM.phone.value,
        bankAccount: DOM.bankAccount.value,
        vehicleType: DOM.vehicleType.value,
        vehiclePlate: DOM.vehiclePlate.value,
        ratePerKm: DOM.ratePerKm.value,
    };
    storageSet('cestak_profile', profile);
    state.profile = profile;
    showToast('Profil uložen.', 'success');
}

function loadProfile() {
    if (!state.profile) return;
    const p = state.profile;
    const fields = ['fullName', 'address', 'department', 'personalNumber', 'phone',
                    'bankAccount', 'vehicleType', 'vehiclePlate', 'ratePerKm'];
    fields.forEach(id => {
        if (p[id] && DOM[id]) DOM[id].value = p[id];
    });
}

// ---- Favorites ----
function saveFavorite(legId) {
    const leg = state.legs.find(l => l.id === legId);
    if (!leg || !leg.from || !leg.to) {
        showToast('Vyplňte odkud a kam.', 'error');
        return;
    }

    const exists = state.favorites.find(f => f.from === leg.from && f.to === leg.to);
    if (exists) {
        showToast('Tato trasa už je v oblíbených.', 'info');
        return;
    }

    state.favorites.push({ from: leg.from, to: leg.to, km: leg.km });
    storageSet('cestak_favorites', state.favorites);
    showToast(`Trasa ${leg.from} → ${leg.to} uložena do oblíbených.`, 'success');
}

function renderFavorites() {
    const body = DOM.favoritesBody;
    if (state.favorites.length === 0) {
        body.innerHTML = '<p class="empty-state">Zatím žádné oblíbené trasy. Uložte trasu pomocí ⭐ u úseku cesty.</p>';
        return;
    }

    body.innerHTML = state.favorites.map((fav, i) => `
        <div class="favorite-item" data-index="${i}">
            <div class="favorite-meta">
                <span class="favorite-title">${escapeHtml(fav.from)} → ${escapeHtml(fav.to)}</span>
                <span class="favorite-detail">${fav.km} km</span>
            </div>
            <button class="btn btn-sm btn-danger" data-action="remove-favorite" data-index="${i}">✕</button>
        </div>
    `).join('');
}

function useFavorite(index) {
    const fav = state.favorites[index];
    addLeg({ from: fav.from, to: fav.to, km: fav.km, kmRaw: fav.km });
    DOM.modalFavorites.classList.remove('open');
    updateTotals();
    showToast(`Úsek ${fav.from} → ${fav.to} přidán.`, 'success');
}

function removeFavorite(index) {
    state.favorites.splice(index, 1);
    storageSet('cestak_favorites', state.favorites);
    renderFavorites();
}

// ---- History ----
function saveDraft() {
    const draft = collectFormData();
    draft.savedAt = new Date().toISOString();
    draft.id = Date.now();

    // Calculate and store grandTotal for display in history
    const rate = parseFloat(draft.ratePerKm) || 0;
    let totalFare = 0;
    (draft.legs || []).forEach(l => { totalFare += (l.km || 0) * rate; });
    const meal = parseFloat(draft.mealAllowance) || 0;
    const accomm = parseFloat(draft.accommodation) || 0;
    const other = parseFloat(draft.otherCosts) || 0;
    const advance = parseFloat(draft.advance) || 0;
    draft.grandTotal = totalFare + meal + accomm + other - advance;

    state.history.unshift(draft);
    if (state.history.length > 20) state.history.pop();
    storageSet('cestak_history', state.history);

    showToast('Koncept uložen.', 'success');
}

function renderHistory() {
    const body = DOM.historyBody;
    if (state.history.length === 0) {
        body.innerHTML = '<p class="empty-state">Zatím žádné uložené výkazy.</p>';
        return;
    }

    body.innerHTML = state.history.map((h, i) => {
        const total = h.grandTotal != null ? `${Math.round(h.grandTotal)} Kč` : '';
        return `
        <div class="history-item" data-index="${i}">
            <div class="history-meta">
                <span class="history-title">${escapeHtml(h.tripPurpose || 'Bez názvu')} – ${escapeHtml(h.tripDestination || '?')}</span>
                <span class="history-date">${new Date(h.savedAt).toLocaleDateString('cs-CZ')} ${new Date(h.savedAt).toLocaleTimeString('cs-CZ', {hour:'2-digit', minute:'2-digit'})}${total ? ' · ' + total : ''}</span>
            </div>
            <button class="btn btn-sm btn-danger" data-action="remove-history" data-index="${i}">✕</button>
        </div>
    `;
    }).join('');
}

function loadDraft(index) {
    const draft = state.history[index];
    ['fullName', 'address', 'department', 'personalNumber', 'phone', 'bankAccount',
     'tripPurpose', 'tripStart', 'tripStartDate', 'tripDestination', 'tripEndDate', 'tripEnd',
     'companions', 'vehiclePlate', 'ratePerKm', 'surchargePercent',
     'mealAllowance', 'accommodation', 'otherCosts', 'advance'].forEach(id => {
        if (DOM[id] && draft[id] !== undefined) DOM[id].value = draft[id];
    });
    if (draft.vehicleType) DOM.vehicleType.value = draft.vehicleType;
    if (draft.freeFood) DOM.freeFood.checked = draft.freeFood;

    // ČBaS fields
    ['opNumber', 'workHoursFrom', 'workHoursTo', 'expectedCosts', 'advanceDate', 'reportDate'].forEach(id => {
        if (DOM[id] && draft[id] !== undefined) DOM[id].value = draft[id];
    });

    // Form type
    if (draft.formType) {
        state.formType = draft.formType;
        document.querySelectorAll('.type-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.type === draft.formType);
        });
        DOM.sectionCbas.style.display = state.formType === 'cbas' ? 'block' : 'none';
    }

    // Clear and recreate legs
    state.legs = [];
    DOM.legsContainer.innerHTML = '';
    (draft.legs || []).forEach(l => addLeg(l));

    DOM.modalHistory.classList.remove('open');
    updateTotals();
    updateMealHint();
    showToast('Koncept načten.', 'success');
}

function removeHistory(index) {
    state.history.splice(index, 1);
    storageSet('cestak_history', state.history);
    renderHistory();
}

// ---- Collect Form Data ----
function collectFormData() {
    const data = { formType: state.formType };
    // Automatically collect all DOM-cached fields that are inputs
    ['fullName', 'address', 'department', 'personalNumber', 'phone', 'bankAccount',
     'tripPurpose', 'tripStart', 'tripStartDate', 'tripDestination', 'tripEndDate', 'tripEnd',
     'companions', 'vehicleType', 'vehiclePlate', 'ratePerKm', 'surchargePercent',
     'mealAllowance', 'accommodation', 'otherCosts', 'advance',
     'opNumber', 'workHoursFrom', 'workHoursTo', 'expectedCosts', 'advanceDate', 'reportDate',
    ].forEach(id => {
        if (DOM[id]) data[id] = DOM[id].value;
    });
    data.freeFood = DOM.freeFood.checked;
    data.legs = state.legs.map(l => ({
        from: l.from, to: l.to, date: l.date,
        departTime: l.departTime, arriveTime: l.arriveTime,
        km: l.km, kmRaw: l.kmRaw
    }));
    return data;
}

// ---- Modals ----
function openModal(id) {
    if (id === 'modalFavorites') renderFavorites();
    if (id === 'modalHistory') renderHistory();
    document.getElementById(id).classList.add('open');
}

// ---- Form Validation ----
function validateForm(data) {
    const errors = [];
    if (!data.fullName.trim()) errors.push('Vyplňte jméno.');
    if (!data.tripPurpose.trim()) errors.push('Vyplňte účel cesty.');
    if (!data.tripDestination.trim()) errors.push('Vyplňte místo jednání.');
    if (data.legs.length === 0) errors.push('Přidejte alespoň jeden úsek cesty.');

    const hasKm = data.legs.some(l => l.km > 0);
    if (!hasKm) errors.push('Žádný úsek nemá vyplněné kilometry.');

    return errors;
}

// ---- PDF Generation ----
async function generatePDF() {
    const data = collectFormData();

    // Validate
    const errors = validateForm(data);
    if (errors.length > 0) {
        showToast(errors[0], 'error');
        return;
    }

    // Show loading state
    const btn = DOM.btnGenerate;
    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Generuji PDF...';

    try {
        // Try dynamic load if jsPDF wasn't loaded via <script> tag
        if (!window.jspdf) {
            const cdns = [
                'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js',
                'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js',
            ];
            let loaded = false;
            for (const src of cdns) {
                try {
                    const script = document.createElement('script');
                    script.src = src;
                    document.head.appendChild(script);
                    await new Promise((resolve, reject) => {
                        script.onload = resolve;
                        script.onerror = reject;
                    });
                    if (window.jspdf) { loaded = true; break; }
                } catch { /* try next CDN */ }
            }
            if (!loaded) throw new Error('Nelze načíst knihovnu pro PDF. Zkontrolujte připojení k internetu.');
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const rate = parseFloat(data.ratePerKm) || 0;

        if (data.formType === 'club') {
            generateClubPDF(doc, data, rate);
        } else {
            generateCbasPDF(doc, data, rate);
        }

        const filename = `cestak_${data.formType}_${data.tripDestination || 'export'}_${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(filename);

        // Auto-save to history
        saveDraft();
        showToast('PDF vygenerováno.', 'success');
    } catch (e) {
        console.error('PDF generation error:', e);
        showToast('Chyba při generování PDF: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHTML;
    }
}

// ---- PDF Layout Constants ----
const PDF = {
    PAGE_W: 210,
    PAGE_H: 297,
    MARGIN: 12,
    FONT_LABEL: 7,
    FONT_VALUE: 9,
    FONT_HEADER: 12,
    FONT_SUBHEADER: 10,
    FONT_TABLE: 6.5,
    FONT_TABLE_BODY: 7,
    ROW_HEIGHT: 6,
    SUMMARY_ROW_HEIGHT: 7,
    LINE_SPACING: 7,
};

function generateClubPDF(doc, data, rate) {
    const { PAGE_W, MARGIN, FONT_LABEL, FONT_VALUE, FONT_HEADER, FONT_SUBHEADER,
            FONT_TABLE, FONT_TABLE_BODY, ROW_HEIGHT, SUMMARY_ROW_HEIGHT, LINE_SPACING } = PDF;

    doc.setFontSize(10);

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT_HEADER);
    doc.text('C E S T O V N I   P R I K A Z', PAGE_W / 2, 15, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');

    // Personal info layout
    let y = 25;
    const labelX = MARGIN;
    const valueX = 55;
    const rightLabelX = 115;
    const rightValueX = 155;

    const field = (label, value, x1, x2, yPos) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(FONT_LABEL);
        doc.text(label, x1, yPos);
        doc.setFontSize(FONT_VALUE);
        doc.text(value || '', x2, yPos);
        doc.line(x2, yPos + 1, x2 + 40, yPos + 1);
    };

    field('Firma - razitko:', '', labelX, valueX - 10, y);

    y += 8;
    field('1. Prijmeni, jmeno, titul', data.fullName, labelX, valueX, y);
    field('Osobni cislo', data.personalNumber, rightLabelX, rightValueX, y);

    y += LINE_SPACING;
    field('2. Bydliste', data.address, labelX, valueX, y);
    field('Utvar', data.department, rightLabelX, rightValueX, y);

    y += LINE_SPACING;
    field('Telefon', data.phone, rightLabelX, rightValueX, y);

    // Trip details box
    y += 10;
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(MARGIN, y, PAGE_W - 2 * MARGIN, 16);

    doc.setFontSize(FONT_LABEL);
    const colW = (PAGE_W - 2 * MARGIN) / 4;
    ['Pocatek cesty (misto, datum, hodina)', 'Misto jednani', 'Ucel a prubeh cesty', 'Konec cesty (misto, dat.)'].forEach((header, i) => {
        doc.text(header, MARGIN + colW * i + 2, y + 4);
        if (i > 0) doc.line(MARGIN + colW * i, y, MARGIN + colW * i, y + 16);
    });

    doc.setFontSize(8);
    const startDateStr = data.tripStartDate ? new Date(data.tripStartDate).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const endDateStr = data.tripEndDate ? new Date(data.tripEndDate).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    doc.text(data.tripStart || '', MARGIN + 2, y + 10);
    doc.text(startDateStr, MARGIN + 2, y + 14);
    doc.text(data.tripDestination || '', MARGIN + colW + 2, y + 10);
    doc.text(data.tripPurpose || '', MARGIN + colW * 2 + 2, y + 10);
    doc.text(data.tripEnd || '', MARGIN + colW * 3 + 2, y + 10);
    doc.text(endDateStr, MARGIN + colW * 3 + 2, y + 14);

    y += 20;
    field('3. Spolucestujici', data.companions, labelX, valueX, y);

    y += LINE_SPACING;
    const vehicleDesc = `${data.vehicleType}, ${data.vehiclePlate}`;
    field('4. Urceny dopr. prostredek', vehicleDesc, labelX, valueX + 20, y);

    // ---- Vyúčtování table ----
    y += 15;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT_SUBHEADER);
    doc.text('V Y U C T O V A N I   P R A C O V N I   C E S T Y', PAGE_W / 2, y, { align: 'center' });

    y += 8;

    const cols = [
        { label: 'Datum', w: 14 },
        { label: 'Odjezd-Prijezd', w: 30 },
        { label: 'hod.', w: 10 },
        { label: 'Dopr.', w: 12 },
        { label: 'km', w: 12 },
        { label: 'Jizdne Kc', w: 18 },
        { label: 'Stravne Kc', w: 18 },
        { label: 'Noclezne Kc', w: 18 },
        { label: 'Vedl. Kc', w: 16 },
        { label: 'Celkem Kc', w: 18 },
        { label: 'Upraveno', w: 18 },
    ];

    const tableW = cols.reduce((s, c) => s + c.w, 0);
    const tableX = (PAGE_W - tableW) / 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT_TABLE);

    let cx = tableX;
    cols.forEach(col => {
        doc.rect(cx, y, col.w, 8);
        doc.text(col.label, cx + col.w / 2, y + 5, { align: 'center' });
        cx += col.w;
    });

    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FONT_TABLE_BODY);

    let totalFare = 0;
    let totalKm = 0;

    data.legs.forEach((leg) => {
        const fare = (leg.km || 0) * rate;
        totalFare += fare;
        totalKm += leg.km || 0;

        const dateStr = leg.date ? new Date(leg.date + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }) : '';

        cx = tableX;
        doc.rect(cx, y, cols[0].w, ROW_HEIGHT * 2);
        doc.text(dateStr, cx + cols[0].w / 2, y + 4, { align: 'center' });
        cx += cols[0].w;

        // Odjezd line
        doc.rect(cx, y, cols[1].w, ROW_HEIGHT);
        doc.text(`Odj: ${leg.from || ''} ${leg.departTime || ''}`, cx + 1, y + 4);
        cx += cols[1].w;

        doc.rect(cx, y, cols[2].w, ROW_HEIGHT * 2);
        cx += cols[2].w;

        doc.rect(cx, y, cols[3].w, ROW_HEIGHT * 2);
        doc.text(data.vehicleType, cx + cols[3].w / 2, y + 7, { align: 'center' });
        cx += cols[3].w;

        doc.rect(cx, y, cols[4].w, ROW_HEIGHT * 2);
        doc.text(String(leg.km || ''), cx + cols[4].w / 2, y + 7, { align: 'center' });
        cx += cols[4].w;

        doc.rect(cx, y, cols[5].w, ROW_HEIGHT * 2);
        doc.text(fare ? fare.toFixed(0) : '', cx + cols[5].w / 2, y + 7, { align: 'center' });
        cx += cols[5].w;

        for (let j = 6; j < cols.length; j++) {
            doc.rect(cx, y, cols[j].w, ROW_HEIGHT * 2);
            cx += cols[j].w;
        }

        // Příjezd line
        y += ROW_HEIGHT;
        cx = tableX + cols[0].w;
        doc.rect(cx, y, cols[1].w, ROW_HEIGHT);
        doc.text(`Prij: ${leg.to || ''} ${leg.arriveTime || ''}`, cx + 1, y + 4);

        y += ROW_HEIGHT;
    });

    // Totals row
    const meal = parseFloat(data.mealAllowance) || 0;
    const accomm = parseFloat(data.accommodation) || 0;
    const other = parseFloat(data.otherCosts) || 0;
    const advance = parseFloat(data.advance) || 0;
    const grandTotal = totalFare + meal + accomm + other - advance;

    doc.setFont('helvetica', 'bold');
    cx = tableX;
    doc.rect(cx, y, cols[0].w + cols[1].w + cols[2].w + cols[3].w, SUMMARY_ROW_HEIGHT);
    doc.text('Celkem', cx + 2, y + 5);
    cx += cols[0].w + cols[1].w + cols[2].w + cols[3].w;

    doc.rect(cx, y, cols[4].w, SUMMARY_ROW_HEIGHT);
    doc.text(String(totalKm), cx + cols[4].w / 2, y + 5, { align: 'center' });
    cx += cols[4].w;

    doc.rect(cx, y, cols[5].w, SUMMARY_ROW_HEIGHT);
    doc.text(totalFare.toFixed(0), cx + cols[5].w / 2, y + 5, { align: 'center' });
    cx += cols[5].w;

    doc.rect(cx, y, cols[6].w, SUMMARY_ROW_HEIGHT);
    doc.text(meal ? meal.toFixed(0) : '', cx + cols[6].w / 2, y + 5, { align: 'center' });
    cx += cols[6].w;

    doc.rect(cx, y, cols[7].w, SUMMARY_ROW_HEIGHT);
    doc.text(accomm ? accomm.toFixed(0) : '', cx + cols[7].w / 2, y + 5, { align: 'center' });
    cx += cols[7].w;

    doc.rect(cx, y, cols[8].w, SUMMARY_ROW_HEIGHT);
    doc.text(other ? other.toFixed(0) : '', cx + cols[8].w / 2, y + 5, { align: 'center' });
    cx += cols[8].w;

    doc.rect(cx, y, cols[9].w, SUMMARY_ROW_HEIGHT);
    doc.text((totalFare + meal + accomm + other).toFixed(0), cx + cols[9].w / 2, y + 5, { align: 'center' });
    cx += cols[9].w;

    doc.rect(cx, y, cols[10].w, SUMMARY_ROW_HEIGHT);

    // Advance and final amounts
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FONT_VALUE);
    doc.text(`Zaloha: ${advance.toFixed(0)} Kc`, tableX + 100, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text(`Doplatek / Preplatek: ${grandTotal.toFixed(0)} Kc`, tableX + 100, y);

    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FONT_LABEL);
    doc.text('Prohlašuji, ze jsem vsechny udaje uvedl uplne a spravne.', tableX + 80, y);

    y += 15;
    doc.line(MARGIN + 5, y, MARGIN + 55, y);
    doc.line(PAGE_W / 2 + 10, y, PAGE_W / 2 + 70, y);
    doc.setFontSize(6);
    doc.text('Datum a podpis pracovnika', MARGIN + 10, y + 4);
    doc.text('Schvalil (datum a podpis)', PAGE_W / 2 + 15, y + 4);

    // Bank account
    if (data.bankAccount) {
        y += 12;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(`Cislo meho uctu je: ${data.bankAccount}`, MARGIN, y);
    }
}

function generateCbasPDF(doc, data, rate) {
    // Page 1: Uses the same layout as club form
    generateClubPDF(doc, data, rate);

    // Page 2: ČBaS-specific additional info
    doc.addPage();
    const { PAGE_W, MARGIN, FONT_HEADER, FONT_LABEL, FONT_VALUE, LINE_SPACING } = PDF;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT_HEADER);
    doc.text('C B a S  –  D O P L N U J I C I   U D A J E', PAGE_W / 2, 20, { align: 'center' });

    let y = 35;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FONT_LABEL);

    const field = (label, value, yPos) => {
        doc.setFontSize(FONT_LABEL);
        doc.text(label, MARGIN, yPos);
        doc.setFontSize(FONT_VALUE);
        doc.text(value || '', MARGIN + 55, yPos);
        doc.line(MARGIN + 55, yPos + 1, MARGIN + 140, yPos + 1);
    };

    field('Cislo OP:', data.opNumber, y);
    y += LINE_SPACING + 2;
    field('Pracovni doba od:', data.workHoursFrom, y);
    y += LINE_SPACING + 2;
    field('Pracovni doba do:', data.workHoursTo, y);
    y += LINE_SPACING + 2;
    field('Predpokladana castka vydaju:', data.expectedCosts ? data.expectedCosts + ' Kc' : '', y);
    y += LINE_SPACING + 2;
    field('Zaloha vyplacena dne:', data.advanceDate ? new Date(data.advanceDate + 'T00:00:00').toLocaleDateString('cs-CZ') : '', y);
    y += LINE_SPACING + 2;
    field('Zprava podana dne:', data.reportDate ? new Date(data.reportDate + 'T00:00:00').toLocaleDateString('cs-CZ') : '', y);

    y += 20;
    doc.line(MARGIN + 5, y, MARGIN + 55, y);
    doc.line(PAGE_W / 2 + 10, y, PAGE_W / 2 + 70, y);
    doc.setFontSize(6);
    doc.text('Podpis pracovnika', MARGIN + 10, y + 4);
    doc.text('Schvalil (datum a podpis)', PAGE_W / 2 + 15, y + 4);
}

// ---- Service Worker Registration (PWA) ----
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
