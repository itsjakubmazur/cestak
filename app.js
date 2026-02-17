/* ============================================
   Cestovní příkaz – App Logic
   ============================================ */

// ---- State ----
const state = {
    formType: 'club', // 'club' or 'cbas'
    legs: [],
    favorites: JSON.parse(localStorage.getItem('cestak_favorites') || '[]'),
    history: JSON.parse(localStorage.getItem('cestak_history') || '[]'),
    profile: JSON.parse(localStorage.getItem('cestak_profile') || 'null'),
};

let legIdCounter = 0;

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    loadProfile();
    addLeg(); // Start with one leg
    addLeg(); // Two legs (there and back)
    bindEvents();
    updateTotals();
});

// ---- Event Binding ----
function bindEvents() {
    // Type selector
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.formType = btn.dataset.type;
            document.getElementById('sectionCbas').style.display =
                state.formType === 'cbas' ? 'block' : 'none';
        });
    });

    // Add leg
    document.getElementById('btnAddLeg').addEventListener('click', () => addLeg());

    // Save profile
    document.getElementById('btnSaveProfile').addEventListener('click', saveProfile);

    // Generate PDF
    document.getElementById('btnGenerate').addEventListener('click', generatePDF);

    // Save draft
    document.getElementById('btnSaveDraft').addEventListener('click', saveDraft);

    // Modals
    document.getElementById('btnFavorites').addEventListener('click', () => openModal('modalFavorites'));
    document.getElementById('btnHistory').addEventListener('click', () => openModal('modalHistory'));

    document.querySelectorAll('.modal-backdrop, .modal-close').forEach(el => {
        el.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.remove('open');
        });
    });

    // Recalculate on any cost input change
    ['mealAllowance', 'accommodation', 'otherCosts', 'advance', 'ratePerKm', 'surchargePercent'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateTotals);
    });
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
    const container = document.getElementById('legsContainer');
    const div = document.createElement('div');
    div.className = 'leg-item';
    div.dataset.id = leg.id;
    div.innerHTML = `
        <div class="leg-header">
            <span class="leg-number">Úsek ${leg.id}</span>
            <div class="leg-actions">
                <button title="Uložit jako oblíbenou trasu" onclick="saveFavorite(${leg.id})">⭐</button>
                <button title="Odebrat úsek" onclick="removeLeg(${leg.id})">✕</button>
            </div>
        </div>
        <div class="leg-grid">
            <div class="leg-route">
                <div class="form-group" style="flex:1">
                    <label>Odkud</label>
                    <input type="text" placeholder="např. Brno" value="${leg.from}"
                        onchange="updateLegField(${leg.id}, 'from', this.value)">
                </div>
                <span class="leg-arrow">→</span>
                <div class="form-group" style="flex:1">
                    <label>Kam</label>
                    <input type="text" placeholder="např. Ostrava" value="${leg.to}"
                        onchange="updateLegField(${leg.id}, 'to', this.value)">
                </div>
            </div>
            <div class="form-group">
                <label>Datum</label>
                <input type="date" value="${leg.date}"
                    onchange="updateLegField(${leg.id}, 'date', this.value)">
            </div>
            <div class="form-group">
                <label>Odjezd</label>
                <input type="time" value="${leg.departTime}"
                    onchange="updateLegField(${leg.id}, 'departTime', this.value)">
            </div>
            <div class="form-group">
                <label>Příjezd</label>
                <input type="time" value="${leg.arriveTime}"
                    onchange="updateLegField(${leg.id}, 'arriveTime', this.value)">
            </div>
            <div class="form-group">
                <label>Km</label>
                <div class="leg-km-group">
                    <input type="number" value="${leg.km}" min="0" step="5"
                        onchange="updateLegKm(${leg.id}, this.value)">
                    <button class="btn-lookup" onclick="lookupDistance(${leg.id})">🔍 Najít</button>
                </div>
            </div>
            <div class="form-group">
                <label>Km (upraveno)</label>
                <span class="km-badge" id="kmBadge_${leg.id}">${leg.km ? leg.km + ' km' : '—'}</span>
            </div>
        </div>
    `;
    container.appendChild(div);
}

function removeLeg(id) {
    state.legs = state.legs.filter(l => l.id !== id);
    const el = document.querySelector(`.leg-item[data-id="${id}"]`);
    if (el) el.remove();
    updateTotals();
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

// ---- Distance Lookup ----
async function lookupDistance(legId) {
    const leg = state.legs.find(l => l.id === legId);
    if (!leg || !leg.from || !leg.to) {
        alert('Vyplňte odkud a kam.');
        return;
    }

    const badge = document.getElementById(`kmBadge_${legId}`);
    badge.textContent = 'Hledám...';
    badge.className = 'km-badge loading';

    try {
        // Try Mapy.cz API first (free, no key needed for basic geocoding)
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
    }
}

async function getDistanceMapyCz(from, to) {
    // Geocode both cities via Mapy.cz Suggest API
    const geocode = async (query) => {
        const resp = await fetch(`https://api.mapy.cz/v1/suggest?lang=cs&limit=1&type=regional.municipality&query=${encodeURIComponent(query)}`, {
            headers: { 'Accept': 'application/json' }
        });
        const data = await resp.json();
        if (data.items && data.items.length > 0) {
            return { lat: data.items[0].position.lat, lon: data.items[0].position.lon };
        }
        return null;
    };

    // Note: Mapy.cz API requires an API key for routing.
    // For now we'll use the geocoded coordinates to calculate straight-line distance
    // and multiply by a road factor of ~1.3
    const fromCoords = await geocode(from);
    const toCoords = await geocode(to);

    if (!fromCoords || !toCoords) return null;

    const straightLine = haversineKm(fromCoords.lat, fromCoords.lon, toCoords.lat, toCoords.lon);
    // Road distance is typically 1.25-1.35x straight line in Central Europe
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
    const surcharge = parseFloat(document.getElementById('surchargePercent').value) || 0;
    const withSurcharge = rawKm * (1 + surcharge / 100);
    const rounded = roundToFive(withSurcharge);

    const leg = state.legs.find(l => l.id === legId);
    if (leg) {
        leg.kmRaw = rawKm;
        leg.km = rounded;
    }

    // Update UI
    const badge = document.getElementById(`kmBadge_${legId}`);
    badge.textContent = `${rounded} km (z ${rawKm})`;
    badge.className = 'km-badge';

    // Update the km input
    const legEl = document.querySelector(`.leg-item[data-id="${legId}"]`);
    if (legEl) {
        const kmInput = legEl.querySelector('input[type="number"]');
        if (kmInput) kmInput.value = rounded;
    }

    updateTotals();
}

function roundToFive(n) {
    return Math.round(n / 5) * 5;
}

// ---- Czech Distance Table (fallback) ----
function getCzechDistance(from, to) {
    const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const key = [normalize(from), normalize(to)].sort().join('|');

    const distances = {
        'brno|ostrava': 170,
        'brno|praha': 205,
        'brno|olomouc': 78,
        'brno|zlin': 100,
        'brno|hradec kralove': 150,
        'brno|pardubice': 130,
        'brno|jihlava': 90,
        'brno|ceske budejovice': 190,
        'brno|liberec': 250,
        'brno|plzen': 285,
        'brno|karlovy vary': 330,
        'brno|usti nad labem': 305,
        'brno|viden': 145,
        'brno|wien': 145,
        'brno|bratislava': 130,
        'ostrava|praha': 370,
        'ostrava|olomouc': 100,
        'praha|ostrava': 370,
        'praha|olomouc': 280,
        'praha|plzen': 90,
        'praha|ceske budejovice': 150,
        'praha|liberec': 110,
        'praha|hradec kralove': 115,
        'praha|karlovy vary': 130,
        'praha|brno': 205,
    };

    return distances[key] || null;
}

// ---- Totals ----
function updateTotals() {
    const rate = parseFloat(document.getElementById('ratePerKm').value) || 0;
    let totalKm = 0;
    let totalFare = 0;

    state.legs.forEach(leg => {
        totalKm += leg.km || 0;
        totalFare += (leg.km || 0) * rate;
    });

    const meal = parseFloat(document.getElementById('mealAllowance').value) || 0;
    const accomm = parseFloat(document.getElementById('accommodation').value) || 0;
    const other = parseFloat(document.getElementById('otherCosts').value) || 0;
    const advance = parseFloat(document.getElementById('advance').value) || 0;

    const grandTotal = totalFare + meal + accomm + other - advance;

    document.getElementById('totalKm').textContent = totalKm;
    document.getElementById('totalFare').textContent = totalFare.toFixed(0) + ' Kč';
    document.getElementById('grandTotal').textContent = grandTotal.toFixed(0) + ' Kč';
}

// ---- Profile ----
function saveProfile() {
    const profile = {
        fullName: document.getElementById('fullName').value,
        address: document.getElementById('address').value,
        department: document.getElementById('department').value,
        personalNumber: document.getElementById('personalNumber').value,
        phone: document.getElementById('phone').value,
        bankAccount: document.getElementById('bankAccount').value,
        vehicleType: document.getElementById('vehicleType').value,
        vehiclePlate: document.getElementById('vehiclePlate').value,
        ratePerKm: document.getElementById('ratePerKm').value,
    };
    localStorage.setItem('cestak_profile', JSON.stringify(profile));
    state.profile = profile;

    const btn = document.getElementById('btnSaveProfile');
    const orig = btn.textContent;
    btn.textContent = '✓ Uloženo';
    setTimeout(() => btn.textContent = orig, 2000);
}

function loadProfile() {
    if (!state.profile) return;
    const p = state.profile;
    if (p.fullName) document.getElementById('fullName').value = p.fullName;
    if (p.address) document.getElementById('address').value = p.address;
    if (p.department) document.getElementById('department').value = p.department;
    if (p.personalNumber) document.getElementById('personalNumber').value = p.personalNumber;
    if (p.phone) document.getElementById('phone').value = p.phone;
    if (p.bankAccount) document.getElementById('bankAccount').value = p.bankAccount;
    if (p.vehicleType) document.getElementById('vehicleType').value = p.vehicleType;
    if (p.vehiclePlate) document.getElementById('vehiclePlate').value = p.vehiclePlate;
    if (p.ratePerKm) document.getElementById('ratePerKm').value = p.ratePerKm;
}

// ---- Favorites ----
function saveFavorite(legId) {
    const leg = state.legs.find(l => l.id === legId);
    if (!leg || !leg.from || !leg.to) {
        alert('Vyplňte odkud a kam.');
        return;
    }

    const exists = state.favorites.find(f => f.from === leg.from && f.to === leg.to);
    if (exists) {
        alert('Tato trasa už je v oblíbených.');
        return;
    }

    state.favorites.push({ from: leg.from, to: leg.to, km: leg.km });
    localStorage.setItem('cestak_favorites', JSON.stringify(state.favorites));

    const btn = event.target;
    btn.textContent = '✓';
    setTimeout(() => btn.textContent = '⭐', 1500);
}

function renderFavorites() {
    const body = document.getElementById('favoritesBody');
    if (state.favorites.length === 0) {
        body.innerHTML = '<p class="empty-state">Zatím žádné oblíbené trasy. Uložte trasu pomocí ⭐ u úseku cesty.</p>';
        return;
    }

    body.innerHTML = state.favorites.map((fav, i) => `
        <div class="favorite-item" onclick="useFavorite(${i})">
            <div class="favorite-meta">
                <span class="favorite-title">${fav.from} → ${fav.to}</span>
                <span class="favorite-detail">${fav.km} km</span>
            </div>
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); removeFavorite(${i})">✕</button>
        </div>
    `).join('');
}

function useFavorite(index) {
    const fav = state.favorites[index];
    const leg = addLeg({ from: fav.from, to: fav.to, km: fav.km, kmRaw: fav.km });
    document.getElementById('modalFavorites').classList.remove('open');
    updateTotals();
}

function removeFavorite(index) {
    state.favorites.splice(index, 1);
    localStorage.setItem('cestak_favorites', JSON.stringify(state.favorites));
    renderFavorites();
}

// ---- History ----
function saveDraft() {
    const draft = collectFormData();
    draft.savedAt = new Date().toISOString();
    draft.id = Date.now();

    state.history.unshift(draft);
    if (state.history.length > 20) state.history.pop();
    localStorage.setItem('cestak_history', JSON.stringify(state.history));

    const btn = document.getElementById('btnSaveDraft');
    const orig = btn.textContent;
    btn.textContent = '✓ Uloženo';
    setTimeout(() => btn.textContent = orig, 2000);
}

function renderHistory() {
    const body = document.getElementById('historyBody');
    if (state.history.length === 0) {
        body.innerHTML = '<p class="empty-state">Zatím žádné uložené výkazy.</p>';
        return;
    }

    body.innerHTML = state.history.map((h, i) => `
        <div class="history-item" onclick="loadDraft(${i})">
            <div class="history-meta">
                <span class="history-title">${h.tripPurpose || 'Bez názvu'} – ${h.tripDestination || '?'}</span>
                <span class="history-date">${new Date(h.savedAt).toLocaleDateString('cs-CZ')} ${new Date(h.savedAt).toLocaleTimeString('cs-CZ', {hour:'2-digit', minute:'2-digit'})}</span>
            </div>
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); removeHistory(${i})">✕</button>
        </div>
    `).join('');
}

function loadDraft(index) {
    const draft = state.history[index];
    // Populate form fields
    ['fullName','address','department','personalNumber','phone','bankAccount',
     'tripPurpose','tripStart','tripStartDate','tripDestination','tripEndDate','tripEnd',
     'companions','vehiclePlate','ratePerKm','surchargePercent',
     'mealAllowance','accommodation','otherCosts','advance'].forEach(id => {
        const el = document.getElementById(id);
        if (el && draft[id] !== undefined) el.value = draft[id];
    });
    if (draft.vehicleType) document.getElementById('vehicleType').value = draft.vehicleType;
    if (draft.freeFood) document.getElementById('freeFood').checked = draft.freeFood;

    // Clear and recreate legs
    state.legs = [];
    document.getElementById('legsContainer').innerHTML = '';
    (draft.legs || []).forEach(l => addLeg(l));

    document.getElementById('modalHistory').classList.remove('open');
    updateTotals();
}

function removeHistory(index) {
    state.history.splice(index, 1);
    localStorage.setItem('cestak_history', JSON.stringify(state.history));
    renderHistory();
}

// ---- Collect Form Data ----
function collectFormData() {
    return {
        formType: state.formType,
        fullName: document.getElementById('fullName').value,
        address: document.getElementById('address').value,
        department: document.getElementById('department').value,
        personalNumber: document.getElementById('personalNumber').value,
        phone: document.getElementById('phone').value,
        bankAccount: document.getElementById('bankAccount').value,
        tripPurpose: document.getElementById('tripPurpose').value,
        tripStart: document.getElementById('tripStart').value,
        tripStartDate: document.getElementById('tripStartDate').value,
        tripDestination: document.getElementById('tripDestination').value,
        tripEndDate: document.getElementById('tripEndDate').value,
        tripEnd: document.getElementById('tripEnd').value,
        companions: document.getElementById('companions').value,
        vehicleType: document.getElementById('vehicleType').value,
        vehiclePlate: document.getElementById('vehiclePlate').value,
        ratePerKm: document.getElementById('ratePerKm').value,
        surchargePercent: document.getElementById('surchargePercent').value,
        mealAllowance: document.getElementById('mealAllowance').value,
        accommodation: document.getElementById('accommodation').value,
        otherCosts: document.getElementById('otherCosts').value,
        advance: document.getElementById('advance').value,
        freeFood: document.getElementById('freeFood').checked,
        legs: state.legs.map(l => ({
            from: l.from, to: l.to, date: l.date,
            departTime: l.departTime, arriveTime: l.arriveTime,
            km: l.km, kmRaw: l.kmRaw
        })),
        // ČBaS fields
        opNumber: document.getElementById('opNumber').value,
        workHoursFrom: document.getElementById('workHoursFrom').value,
        workHoursTo: document.getElementById('workHoursTo').value,
        expectedCosts: document.getElementById('expectedCosts').value,
        advanceDate: document.getElementById('advanceDate').value,
        reportDate: document.getElementById('reportDate').value,
    };
}

// ---- Modals ----
function openModal(id) {
    if (id === 'modalFavorites') renderFavorites();
    if (id === 'modalHistory') renderHistory();
    document.getElementById(id).classList.add('open');
}

// ---- PDF Generation ----
async function generatePDF() {
    const data = collectFormData();

    // Dynamically load jsPDF if not loaded
    if (!window.jspdf) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js';
        document.head.appendChild(script);
        await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
        });
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // We need a font that supports Czech characters
    // jsPDF default fonts don't support diacritics well, so we'll use built-in helvetica
    // and note that in production, a custom font should be embedded

    const rate = parseFloat(data.ratePerKm) || 0;

    if (data.formType === 'club') {
        generateClubPDF(doc, data, rate);
    } else {
        generateCbasPDF(doc, data, rate);
    }

    // Save
    const filename = `cestak_${data.formType}_${data.tripDestination || 'export'}_${new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(filename);

    // Also auto-save to history
    saveDraft();
}

function generateClubPDF(doc, data, rate) {
    const w = 210, h = 297;
    const m = 12; // margin

    doc.setFontSize(10);

    // ---- PAGE 1: Cestovní příkaz + Vyúčtování ----

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('C E S T O V N I   P R I K A Z', w / 2, 15, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');

    // Left column - personal info
    let y = 25;
    const labelX = m;
    const valueX = 55;
    const rightLabelX = 115;
    const rightValueX = 155;

    const field = (label, value, x1, x2, yPos) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(label, x1, yPos);
        doc.setFontSize(9);
        doc.text(value || '', x2, yPos);
        doc.line(x2, yPos + 1, x2 + 40, yPos + 1);
    };

    field('Firma - razitko:', '', labelX, valueX - 10, y);

    y += 8;
    field('1. Prijmeni, jmeno, titul', data.fullName, labelX, valueX, y);
    field('Osobni cislo', data.personalNumber, rightLabelX, rightValueX, y);

    y += 7;
    field('2. Bydliste', data.address, labelX, valueX, y);
    field('Utvar', data.department, rightLabelX, rightValueX, y);

    y += 7;
    field('Telefon', data.phone, rightLabelX, rightValueX, y);

    // Trip details box
    y += 10;
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(m, y, w - 2 * m, 16);

    doc.setFontSize(7);
    const colW = (w - 2 * m) / 4;
    ['Pocatek cesty (misto, datum, hodina)', 'Misto jednani', 'Ucel a prubeh cesty', 'Konec cesty (misto, dat.)'].forEach((header, i) => {
        doc.text(header, m + colW * i + 2, y + 4);
        if (i > 0) doc.line(m + colW * i, y, m + colW * i, y + 16);
    });

    doc.setFontSize(8);
    const startDateStr = data.tripStartDate ? new Date(data.tripStartDate).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const endDateStr = data.tripEndDate ? new Date(data.tripEndDate).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    doc.text(data.tripStart || '', m + 2, y + 10);
    doc.text(startDateStr, m + 2, y + 14);
    doc.text(data.tripDestination || '', m + colW + 2, y + 10);
    doc.text(data.tripPurpose || '', m + colW * 2 + 2, y + 10);
    doc.text(data.tripEnd || '', m + colW * 3 + 2, y + 10);
    doc.text(endDateStr, m + colW * 3 + 2, y + 14);

    y += 20;
    field('3. Spolucestujici', data.companions, labelX, valueX, y);

    y += 7;
    const vehicleDesc = `${data.vehicleType}, ${data.vehiclePlate}`;
    field('4. Urceny dopr. prostredek', vehicleDesc, labelX, valueX + 20, y);

    // ---- Vyúčtování table ----
    y += 15;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('V Y U C T O V A N I   P R A C O V N I   C E S T Y', w / 2, y, { align: 'center' });

    y += 8;

    // Table headers
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
    const tableX = (w - tableW) / 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);

    let cx = tableX;
    cols.forEach(col => {
        doc.rect(cx, y, col.w, 8);
        doc.text(col.label, cx + col.w / 2, y + 5, { align: 'center' });
        cx += col.w;
    });

    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);

    let totalFare = 0;
    let totalKm = 0;

    // Render each leg as two rows (odjezd/příjezd)
    data.legs.forEach((leg, i) => {
        const fare = (leg.km || 0) * rate;
        totalFare += fare;
        totalKm += leg.km || 0;

        const dateStr = leg.date ? new Date(leg.date + 'T00:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }) : '';

        // Odjezd row
        cx = tableX;
        const rowH = 6;
        doc.rect(cx, y, cols[0].w, rowH * 2); // date spans 2 rows
        doc.text(dateStr, cx + cols[0].w / 2, y + 4, { align: 'center' });
        cx += cols[0].w;

        // Odjezd line
        doc.rect(cx, y, cols[1].w, rowH);
        doc.text(`Odj: ${leg.from || ''} ${leg.departTime || ''}`, cx + 1, y + 4);
        cx += cols[1].w;

        doc.rect(cx, y, cols[2].w, rowH * 2);
        cx += cols[2].w;

        doc.rect(cx, y, cols[3].w, rowH * 2);
        doc.text(data.vehicleType, cx + cols[3].w / 2, y + 7, { align: 'center' });
        cx += cols[3].w;

        doc.rect(cx, y, cols[4].w, rowH * 2);
        doc.text(String(leg.km || ''), cx + cols[4].w / 2, y + 7, { align: 'center' });
        cx += cols[4].w;

        doc.rect(cx, y, cols[5].w, rowH * 2);
        doc.text(fare ? fare.toFixed(0) : '', cx + cols[5].w / 2, y + 7, { align: 'center' });
        cx += cols[5].w;

        // Stravné, nocležné, vedlejší – empty for individual legs
        for (let j = 6; j < cols.length; j++) {
            doc.rect(cx, y, cols[j].w, rowH * 2);
            cx += cols[j].w;
        }

        // Příjezd line
        y += rowH;
        cx = tableX + cols[0].w;
        doc.rect(cx, y, cols[1].w, rowH);
        doc.text(`Prij: ${leg.to || ''} ${leg.arriveTime || ''}`, cx + 1, y + 4);

        y += rowH;
    });

    // Totals row
    const meal = parseFloat(data.mealAllowance) || 0;
    const accomm = parseFloat(data.accommodation) || 0;
    const other = parseFloat(data.otherCosts) || 0;
    const grandTotal = totalFare + meal + accomm + other;

    doc.setFont('helvetica', 'bold');
    cx = tableX;
    doc.rect(cx, y, cols[0].w + cols[1].w + cols[2].w + cols[3].w, 7);
    doc.text('Celkem', cx + 2, y + 5);
    cx += cols[0].w + cols[1].w + cols[2].w + cols[3].w;

    doc.rect(cx, y, cols[4].w, 7);
    doc.text(String(totalKm), cx + cols[4].w / 2, y + 5, { align: 'center' });
    cx += cols[4].w;

    doc.rect(cx, y, cols[5].w, 7);
    doc.text(totalFare.toFixed(0), cx + cols[5].w / 2, y + 5, { align: 'center' });
    cx += cols[5].w;

    doc.rect(cx, y, cols[6].w, 7);
    doc.text(meal ? meal.toFixed(0) : '', cx + cols[6].w / 2, y + 5, { align: 'center' });
    cx += cols[6].w;

    doc.rect(cx, y, cols[7].w, 7);
    doc.text(accomm ? accomm.toFixed(0) : '', cx + cols[7].w / 2, y + 5, { align: 'center' });
    cx += cols[7].w;

    doc.rect(cx, y, cols[8].w, 7);
    doc.text(other ? other.toFixed(0) : '', cx + cols[8].w / 2, y + 5, { align: 'center' });
    cx += cols[8].w;

    doc.rect(cx, y, cols[9].w, 7);
    doc.text(grandTotal.toFixed(0), cx + cols[9].w / 2, y + 5, { align: 'center' });
    cx += cols[9].w;

    doc.rect(cx, y, cols[10].w, 7);

    // Advance and final
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const advanceVal = parseFloat(data.advance) || 0;
    doc.text(`Zaloha: ${advanceVal.toFixed(0)} Kc`, tableX + 100, y);
    y += 6;
    doc.text(`Doplatek / Preplatek: ${(grandTotal - advanceVal).toFixed(0)} Kc`, tableX + 100, y);

    y += 10;
    doc.setFontSize(7);
    doc.text('Prohlašuji, ze jsem vsechny udaje uvedl uplne a spravne.', tableX + 80, y);

    y += 15;
    doc.line(m + 5, y, m + 55, y);
    doc.line(w / 2 + 10, y, w / 2 + 70, y);
    doc.setFontSize(6);
    doc.text('Datum a podpis pracovnika', m + 10, y + 4);
    doc.text('Schvalil (datum a podpis)', w / 2 + 15, y + 4);

    // Bank account
    if (data.bankAccount) {
        y += 12;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(`Cislo meho uctu je: ${data.bankAccount}`, m, y);
    }
}

function generateCbasPDF(doc, data, rate) {
    // Page 1: Cestovní příkaz (front)
    generateClubPDF(doc, data, rate); // reuse club layout as base

    // In production, this would generate the exact ČBaS two-page layout
    // For now, add ČBaS-specific fields to the same page or a second page
    // This is a starting point to be refined in Claude Code
}

// ---- Service Worker Registration (PWA) ----
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
