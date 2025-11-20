// ==============================
// CONFIG – UPDATE THIS PART ONLY
// ==============================

// If you use Google Sheet, publish as CSV and put the URL here.
const DATA_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQOfuB3T9ozdzxhTVT_vcudJsTv0khkrd-iIBJmSgi0UWGdOoZ_ObbPzsZ445VX-2XhYwIlKFYhd0V7/pub?output=csv';

// Map your column headers here.
const COL = {
    week: 'Week',
    type: 'Type',
    brand: 'Platform Name',
    totalPosts: 'Total Posts',
    totalEngagement: 'Total Engagement',
    followers: 'Followers',
    engagementRate: 'Engagement Rate (%)',
};

// Number of brands to show in charts
const TOP_N_BRANDS = 10;
const TOP_N_MOVERS = 10;

// ==============================
// CORE LOGIC
// ==============================

let rawRows = [];
let weekOptions = [];
let typeOptions = [];

let charts = {
    typeChart: null,
    brandChart: null,
    moverChart: null,
};

document.addEventListener('DOMContentLoaded', () => {
    loadData();
});

function loadData() {
    Papa.parse(DATA_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            rawRows = results.data.map(normalizeRow).filter((r) => !!r[COL.week]);

            weekOptions = [...new Set(rawRows.map((r) => r[COL.week]))].sort();
            typeOptions = [...new Set(rawRows.map((r) => r[COL.type]))].sort();

            initSelectors();
            updateDashboard();
        },
        error: (err) => {
            console.error('CSV parse error', err);
            alert('Failed to load data. Check DATA_URL or CSV format.');
        },
    });
}

function normalizeRow(row) {
    const num = (v) => {
        if (v === null || v === undefined || v === '') return 0;
        const cleaned = String(v).replace(/,/g, '');
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
    };

    row[COL.totalPosts] = num(row[COL.totalPosts]);
    row[COL.totalEngagement] = num(row[COL.totalEngagement]);
    row[COL.followers] = num(row[COL.followers]);
    row[COL.engagementRate] = num(row[COL.engagementRate]);

    return row;
}

// -----------------------------
// UI INIT
// -----------------------------

function initSelectors() {
    const weekASelect = document.getElementById('weekASelect');
    const weekBSelect = document.getElementById('weekBSelect');
    const typeSelect = document.getElementById('typeSelect');

    weekASelect.innerHTML = '';
    weekBSelect.innerHTML = '';

    weekOptions.forEach((w) => {
        const optA = document.createElement('option');
        optA.value = w;
        optA.textContent = w;
        weekASelect.appendChild(optA);

        const optB = document.createElement('option');
        optB.value = w;
        optB.textContent = w;
        weekBSelect.appendChild(optB);
    });

    // default: weekA = latest, weekB = previous
    if (weekOptions.length > 0) {
        weekASelect.value = weekOptions[weekOptions.length - 1];
        if (weekOptions.length > 1) {
            weekBSelect.value = weekOptions[weekOptions.length - 2];
        } else {
            weekBSelect.value = weekOptions[weekOptions.length - 1];
        }
    }

    // type select
    typeOptions.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        typeSelect.appendChild(opt);
    });

    weekASelect.addEventListener('change', updateDashboard);
    weekBSelect.addEventListener('change', updateDashboard);
    typeSelect.addEventListener('change', updateDashboard);
}

// -----------------------------
// DASHBOARD UPDATE
// -----------------------------

function updateDashboard() {
    const weekA = document.getElementById('weekASelect').value;
    const weekB = document.getElementById('weekBSelect').value;
    const typeFilter = document.getElementById('typeSelect').value;

    const rowsA = filterRows(rawRows, weekA, typeFilter);
    const rowsB = filterRows(rawRows, weekB, typeFilter);

    updateKpis(rowsA, rowsB, weekA, weekB, typeFilter);
    renderTypeChart(rowsA, weekA);
    renderBrandChart(rowsA, weekA);
    renderMoversChart(rowsA, rowsB, weekA, weekB);
    renderTable(rowsA, rowsB, weekA, weekB);
}

function filterRows(rows, week, typeFilter) {
    return rows.filter((r) => {
        const matchWeek = r[COL.week] === week;
        const matchType = typeFilter === 'ALL' || r[COL.type] === typeFilter;
        return matchWeek && matchType;
    });
}

// -----------------------------
// KPI CARDS
// -----------------------------

function updateKpis(rowsA, rowsB, weekA, weekB, typeFilter) {
    const totEngA = sum(rowsA, COL.totalEngagement);
    const totEngB = sum(rowsB, COL.totalEngagement);
    const wowAbs = totEngB - totEngA;
    const wowPct = totEngA === 0 ? 0 : (wowAbs / totEngA) * 100;

    const brandCount = new Set([...rowsA, ...rowsB].map((r) => r[COL.brand])).size;
    const typeCount = new Set([...rowsA, ...rowsB].map((r) => r[COL.type])).size;

    setText('kpi-eng-weekA', formatNumber(totEngA));
    setText('kpi-eng-weekB', formatNumber(totEngB));

    setText(
        'kpi-eng-weekA-detail',
        `${weekA}${typeFilter !== 'ALL' ? ' · ' + typeFilter : ''}`
    );
    setText(
        'kpi-eng-weekB-detail',
        `${weekB}${typeFilter !== 'ALL' ? ' · ' + typeFilter : ''}`
    );

    const wowSpan = wowAbs >= 0 ? '+' + formatNumber(wowAbs) : formatNumber(wowAbs);
    const wowPctSpan = (wowPct >= 0 ? '+' : '') + wowPct.toFixed(1) + '%';

    setText('kpi-eng-wow', wowSpan);
    setText(
        'kpi-eng-wow-detail',
        `WoW change (${wowPctSpan}) – based on Total Engagement`
    );

    setText('kpi-brands', brandCount.toString());
    setText('kpi-types', `${typeCount} type(s)`);

    // small labels
    setText('typeChartWeekLabel', `Week A：${weekA}`);
    setText('brandChartWeekLabel', `Week A：${weekA}`);
    setText('moverChartWeekLabel', `Week A vs Week B：${weekA} → ${weekB}`);
    setText('tableWeekLabel', `Comparing ${weekA} (A) vs ${weekB} (B)`);
}

// -----------------------------
// CHARTS
// -----------------------------

function renderTypeChart(rowsA, weekA) {
    const ctx = document.getElementById('typeChart').getContext('2d');
    const grouped = groupBy(rowsA, COL.type);
    const labels = Object.keys(grouped);
    const data = labels.map((t) => sum(grouped[t], COL.totalEngagement));

    if (charts.typeChart) charts.typeChart.destroy();

    charts.typeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: `Total Engagement – ${weekA}`,
                    data,
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: {
                    ticks: { color: '#9ca3af', font: { size: 10 } },
                    grid: { display: false },
                },
                y: {
                    ticks: {
                        color: '#9ca3af',
                        callback: (v) => formatShortNumber(v),
                    },
                    grid: { color: 'rgba(55,65,81,0.5)' },
                },
            },
        },
    });
}

function renderBrandChart(rowsA, weekA) {
    const ctx = document.getElementById('brandChart').getContext('2d');
    const grouped = groupBy(rowsA, COL.brand);
    const brands = Object.keys(grouped).map((b) => ({
        brand: b,
        type: grouped[b][0][COL.type],
        engagement: sum(grouped[b], COL.totalEngagement),
    }));

    brands.sort((a, b) => b.engagement - a.engagement);
    const top = brands.slice(0, TOP_N_BRANDS);

    const labels = top.map((b) => b.brand);
    const data = top.map((b) => b.engagement);

    if (charts.brandChart) charts.brandChart.destroy();

    charts.brandChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: `Total Engagement – ${weekA}`,
                    data,
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: {
                    ticks: {
                        color: '#9ca3af',
                        callback: (v) => formatShortNumber(v),
                    },
                    grid: { color: 'rgba(55,65,81,0.5)' },
                },
                y: {
                    ticks: { color: '#9ca3af', font: { size: 10 } },
                    grid: { display: false },
                },
            },
        },
    });
}

function renderMoversChart(rowsA, rowsB, weekA, weekB) {
    const ctx = document.getElementById('moverChart').getContext('2d');

    const byBrandWeek = {};
    [...rowsA, ...rowsB].forEach((r) => {
        const brand = r[COL.brand];
        const week = r[COL.week];
        const key = `${brand}__${week}`;
        byBrandWeek[key] = (byBrandWeek[key] || 0) + r[COL.totalEngagement];
    });

    const brands = new Set([...rowsA, ...rowsB].map((r) => r[COL.brand]));
    const movers = [];

    brands.forEach((brand) => {
        const a = byBrandWeek[`${brand}__${weekA}`] || 0;
        const b = byBrandWeek[`${brand}__${weekB}`] || 0;
        const diff = b - a;
        const pct = a === 0 ? (b === 0 ? 0 : 100) : (diff / a) * 100;
        if (!isFinite(pct)) return;
        movers.push({ brand, diff, pct });
    });

    movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    const top = movers.slice(0, TOP_N_MOVERS);

    const labels = top.map((m) => m.brand);
    const data = top.map((m) => m.pct);

    if (charts.moverChart) charts.moverChart.destroy();

    charts.moverChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: `WoW Δ% (${weekA}→${weekB})`,
                    data,
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: {
                    ticks: {
                        color: '#9ca3af',
                        callback: (v) => v + '%',
                    },
                    grid: { color: 'rgba(55,65,81,0.5)' },
                },
                y: {
                    ticks: { color: '#9ca3af', font: { size: 10 } },
                    grid: { display: false },
                },
            },
        },
    });
}

// -----------------------------
// TABLE
// -----------------------------

function renderTable(rowsA, rowsB, weekA, weekB) {
    const tbody = document.querySelector('#brandTable tbody');
    tbody.innerHTML = '';

    const byBrandWeek = {};
    const brandsSet = new Set();

    function addRow(row) {
        const brand = row[COL.brand];
        const week = row[COL.week];
        brandsSet.add(brand);
        const key = `${brand}__${week}`;
        if (!byBrandWeek[key]) {
            byBrandWeek[key] = {
                engagement: 0,
                posts: 0,
                followers: row[COL.followers] || 0,
                er: row[COL.engagementRate] || 0,
                type: row[COL.type],
            };
        }
        byBrandWeek[key].engagement += row[COL.totalEngagement];
        byBrandWeek[key].posts += row[COL.totalPosts];
    }

    rowsA.forEach(addRow);
    rowsB.forEach(addRow);

    const rows = [];

    brandsSet.forEach((brand) => {
        const a = byBrandWeek[`${brand}__${weekA}`] || {};
        const b = byBrandWeek[`${brand}__${weekB}`] || {};

        const engA = a.engagement || 0;
        const engB = b.engagement || 0;
        const diff = engB - engA;
        const pct = engA === 0 ? (engB === 0 ? 0 : 100) : (diff / engA) * 100;

        rows.push({
            brand,
            type: a.type || b.type || '',
            engA,
            engB,
            diff,
            pct,
            postsA: a.posts || 0,
            postsB: b.posts || 0,
            followersB: b.followers || a.followers || 0,
            erB: b.er || '',
        });
    });

    rows.sort((a, b) => b.engB - a.engB);

    rows.forEach((r, idx) => {
        const tr = document.createElement('tr');

        const diffClass = r.diff >= 0 ? 'badge-pos' : 'badge-neg';
        const pctClass = r.pct >= 0 ? 'badge-pos' : 'badge-neg';

        tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${r.brand}</td>
      <td>${r.type}</td>
      <td>${formatShortNumber(r.engA)}</td>
      <td>${formatShortNumber(r.engB)}</td>
      <td class="${diffClass}">${r.diff >= 0 ? '+' : ''}${formatShortNumber(
            r.diff
        )}</td>
      <td class="${pctClass}">${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%</td>
      <td>${r.postsA}</td>
      <td>${r.postsB}</td>
      <td>${r.followersB ? formatShortNumber(r.followersB) : '–'}</td>
      <td>${r.erB !== '' ? r.erB.toFixed ? r.erB.toFixed(2) + '%' : r.erB : '–'}</td>
    `;

        tbody.appendChild(tr);
    });
}

// -----------------------------
// HELPERS
// -----------------------------

function sum(rows, col) {
    return rows.reduce((acc, r) => acc + (r[col] || 0), 0);
}

function groupBy(rows, col) {
    return rows.reduce((acc, r) => {
        const key = r[col] || 'Unknown';
        if (!acc[key]) acc[key] = [];
        acc[key].push(r);
        return acc;
    }, {});
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function formatNumber(n) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatShortNumber(n) {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toFixed ? n.toFixed(0) : String(n);
}
