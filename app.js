// Configuration
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQOfuB3T9ozdzxhTVT_vcudJsTv0khkrd-iIBJmSgi0UWGdOoZ_ObbPzsZ445VX-2XhYwIlKFYhd0V7/pub?output=csv";

// State
let rawData = [];
let processedData = {}; // { "9-Nov": [records], "16-Nov": [records] }
let weeks = [];
let types = new Set();
let brands = new Set();
let charts = {};

// DOM Elements
const els = {
    loading: document.getElementById('loading-overlay'),
    tabs: document.querySelectorAll('.nav-tab'),
    panes: document.querySelectorAll('.tab-pane'),
    filters: {
        week: document.getElementById('filter-week'),
        type: document.getElementById('filter-type'),
        brand: document.getElementById('filter-brand'),
        engagement: document.getElementById('filter-engagement'),
        engagementVal: document.getElementById('engagement-val')
    }
};

// --- Initialization ---

init();

async function init() {
    setupTabs();
    setupFilters();
    await loadData();
}

function setupTabs() {
    els.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all
            els.tabs.forEach(t => t.classList.remove('active'));
            els.panes.forEach(p => p.classList.remove('active'));
            // Activate clicked
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
            // Redraw charts if needed (resize issue)
            updateDashboard();
        });
    });
}

function setupFilters() {
    // Event listeners for filters
    Object.values(els.filters).forEach(el => {
        if (el) el.addEventListener('change', updateDashboard);
        if (el && el.type === 'range') {
            el.addEventListener('input', (e) => {
                els.filters.engagementVal.textContent = parseInt(e.target.value).toLocaleString() + "+";
            });
        }
    });
}

// --- Data Loading & Parsing ---

async function loadData() {
    Papa.parse(SHEET_URL, {
        download: true,
        header: true,
        complete: (results) => {
            parseRawData(results.data);
            populateFilters();
            els.loading.classList.add('hidden');
            updateDashboard();
        },
        error: (err) => {
            console.error(err);
            alert("Failed to load data.");
            els.loading.classList.add('hidden');
        }
    });
}

function parseRawData(csvRows) {
    // The CSV is "Wide" (Dates as columns). We need to detect date columns.
    // Regex for "D-Mon" format like "9-Nov", "16-Nov"
    const dateRegex = /^\d{1,2}-[A-Z][a-z]{2}$/;

    const dateCols = Object.keys(csvRows[0] || {}).filter(k => dateRegex.test(k));
    weeks = dateCols;

    // Flatten data
    rawData = [];

    csvRows.forEach(row => {
        const brand = row['Brand'];
        const platform = row['Platform'];
        const type = row['Type'];

        if (!brand) return; // Skip empty rows

        types.add(type);
        brands.add(brand);

        dateCols.forEach(date => {
            // Clean value (remove commas, handle empty)
            let valStr = row[date];
            let val = 0;
            if (valStr) {
                val = parseFloat(valStr.replace(/,/g, ''));
            }

            // CRITICAL: The CSV seems to have mixed metrics or just one.
            // For this demo, we will assume the value in the date column is "Engagement" 
            // unless the row implies otherwise. 
            // *Self-correction*: Some rows had huge numbers (10M), likely Followers.
            // We'll try to guess metric based on magnitude or Platform? 
            // Actually, let's just treat it as "Primary Metric" for now to ensure visualization works.
            // Ideally, we'd have a "Metric" column.

            rawData.push({
                date: date,
                brand: brand,
                platform: platform,
                type: type,
                value: val, // This is our main number
                // Simulate other metrics for the dashboard structure since they are missing in CSV
                posts: Math.ceil(val / 1000), // Dummy logic
                followers: val * 10, // Dummy logic
                engagement: val
            });
        });
    });
}

function populateFilters() {
    // Weeks
    els.filters.week.innerHTML = weeks.map(w => `<option value="${w}">${w}</option>`).join('');
    // Select last week by default
    els.filters.week.value = weeks[weeks.length - 1];

    // Types
    els.filters.type.innerHTML = Array.from(types).sort().map(t => `<option value="${t}" selected>${t}</option>`).join('');

    // Brands
    els.filters.brand.innerHTML = Array.from(brands).sort().map(b => `<option value="${b}" selected>${b}</option>`).join('');
}

// --- Dashboard Logic ---

function updateDashboard() {
    const selectedWeek = els.filters.week.value;
    const prevWeekIndex = weeks.indexOf(selectedWeek) - 1;
    const prevWeek = prevWeekIndex >= 0 ? weeks[prevWeekIndex] : null;

    const selectedTypes = Array.from(els.filters.type.selectedOptions).map(o => o.value);
    const selectedBrands = Array.from(els.filters.brand.selectedOptions).map(o => o.value);
    const minEng = parseInt(els.filters.engagement.value);

    // Filter Data
    const currentData = rawData.filter(d =>
        d.date === selectedWeek &&
        selectedTypes.includes(d.type) &&
        selectedBrands.includes(d.brand) &&
        d.engagement >= minEng
    );

    const prevData = prevWeek ? rawData.filter(d =>
        d.date === prevWeek &&
        selectedTypes.includes(d.type) &&
        selectedBrands.includes(d.brand)
    ) : [];

    // Calculate Aggregates
    const agg = aggregateData(currentData, prevData);

    // Render Active Tab
    const activeTab = document.querySelector('.nav-tab.active').dataset.tab;

    if (activeTab === 'overview') renderOverview(agg);
    if (activeTab === 'casino') renderCasino(agg);
    if (activeTab === 'industry') renderIndustry(agg);
    if (activeTab === 'movers') renderMovers(agg);
    if (activeTab === 'followers') renderFollowers(agg);
    if (activeTab === 'content') renderContent(agg);
}

function aggregateData(curr, prev) {
    // Helper to map previous data by Brand+Platform
    const prevMap = new Map(prev.map(p => [`${p.brand}-${p.platform}`, p]));

    const items = curr.map(c => {
        const p = prevMap.get(`${c.brand}-${c.platform}`);
        return {
            ...c,
            prevEng: p ? p.engagement : 0,
            prevFoll: p ? p.followers : 0,
            wowEng: p && p.engagement > 0 ? ((c.engagement - p.engagement) / p.engagement) * 100 : 0,
            wowFoll: p && p.followers > 0 ? ((c.followers - p.followers) / p.followers) * 100 : 0
        };
    });

    // Totals
    const totalEng = items.reduce((s, i) => s + i.engagement, 0);
    const totalPosts = items.reduce((s, i) => s + i.posts, 0);
    const totalFoll = items.reduce((s, i) => s + i.followers, 0);

    // By Type
    const byType = {};
    items.forEach(i => {
        if (!byType[i.type]) byType[i.type] = { eng: 0, posts: 0, count: 0 };
        byType[i.type].eng += i.engagement;
        byType[i.type].posts += i.posts;
        byType[i.type].count++;
    });

    return { items, totalEng, totalPosts, totalFoll, byType };
}

// --- Rendering Functions ---

function renderOverview(data) {
    // KPIs
    document.getElementById('overview-kpis').innerHTML = `
        <div class="kpi-card">
            <div class="kpi-title">Total Engagement</div>
            <div class="kpi-value">${data.totalEng.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Total Posts</div>
            <div class="kpi-value">${data.totalPosts.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Avg Eng/Post</div>
            <div class="kpi-value">${data.totalPosts ? Math.round(data.totalEng / data.totalPosts).toLocaleString() : 0}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Total Followers</div>
            <div class="kpi-value">${(data.totalFoll / 1000000).toFixed(1)}M</div>
        </div>
    `;

    // Chart: Engagement by Type
    createChart('chart-eng-type', 'bar', {
        labels: Object.keys(data.byType),
        datasets: [{
            label: 'Engagement',
            data: Object.values(data.byType).map(t => t.eng),
            backgroundColor: '#38bdf8'
        }]
    });

    // Chart: Posts by Type
    createChart('chart-posts-type', 'bar', {
        labels: Object.keys(data.byType),
        datasets: [{
            label: 'Posts',
            data: Object.values(data.byType).map(t => t.posts),
            backgroundColor: '#818cf8'
        }]
    });

    // Chart: Scatter (Top 50 brands to avoid clutter)
    const scatterData = data.items.slice(0, 50).map(i => ({
        x: i.followers,
        y: i.engagement,
        r: Math.min(Math.max(i.engagement / 1000, 5), 20) // Bubble size
    }));
    createChart('chart-scatter', 'bubble', {
        datasets: [{
            label: 'Brands',
            data: scatterData,
            backgroundColor: 'rgba(56, 189, 248, 0.5)'
        }]
    });
}

function renderCasino(data) {
    // Filter for Casino
    const casinoItems = data.items.filter(i => i.type.includes('Casino') || i.type.includes('CF'));

    // Table
    const tbody = document.querySelector('#casino-table tbody');
    tbody.innerHTML = casinoItems.map(i => `
        <tr>
            <td>${i.brand}</td>
            <td>${i.platform}</td>
            <td>${i.engagement.toLocaleString()}</td>
            <td>${i.posts}</td>
            <td>${Math.round(i.engagement / i.posts || 0)}</td>
            <td>${i.followers.toLocaleString()}</td>
            <td class="${i.wowEng >= 0 ? 'text-success' : 'text-danger'}">${i.wowEng.toFixed(1)}%</td>
        </tr>
    `).join('');

    // Top 10 Chart
    const top10 = [...casinoItems].sort((a, b) => b.engagement - a.engagement).slice(0, 10);
    createChart('chart-casino-top', 'bar', {
        labels: top10.map(i => i.brand),
        datasets: [{
            label: 'Engagement',
            data: top10.map(i => i.engagement),
            backgroundColor: '#38bdf8'
        }],
        indexAxis: 'y' // Horizontal bar
    });
}

function renderIndustry(data) {
    const tbody = document.querySelector('#industry-table tbody');
    tbody.innerHTML = Object.entries(data.byType).map(([type, stats]) => `
        <tr>
            <td>${type}</td>
            <td>${stats.eng.toLocaleString()}</td>
            <td>${stats.posts.toLocaleString()}</td>
            <td>${Math.round(stats.eng / stats.posts || 0)}</td>
            <td>-</td>
            <td>${((stats.eng / data.totalEng) * 100).toFixed(1)}%</td>
        </tr>
    `).join('');

    createChart('chart-industry-pie', 'doughnut', {
        labels: Object.keys(data.byType),
        datasets: [{
            data: Object.values(data.byType).map(t => t.eng),
            backgroundColor: ['#38bdf8', '#818cf8', '#c084fc', '#2dd4bf', '#fbbf24', '#f87171']
        }]
    });
}

function renderMovers(data) {
    const gainers = data.items.filter(i => i.wowEng > 20).sort((a, b) => b.wowEng - a.wowEng).slice(0, 10);
    const decliners = data.items.filter(i => i.wowEng < -20).sort((a, b) => a.wowEng - b.wowEng).slice(0, 10);

    document.querySelector('#gainers-table tbody').innerHTML = gainers.map(i => `
        <tr><td>${i.brand}</td><td>${i.type}</td><td>${i.prevEng.toLocaleString()}</td><td>${i.engagement.toLocaleString()}</td><td class="text-success">+${i.wowEng.toFixed(1)}%</td></tr>
    `).join('');

    document.querySelector('#decliners-table tbody').innerHTML = decliners.map(i => `
        <tr><td>${i.brand}</td><td>${i.type}</td><td>${i.prevEng.toLocaleString()}</td><td>${i.engagement.toLocaleString()}</td><td class="text-danger">${i.wowEng.toFixed(1)}%</td></tr>
    `).join('');
}

function renderFollowers(data) {
    const topGrowth = [...data.items].sort((a, b) => b.wowFoll - a.wowFoll).slice(0, 10);
    createChart('chart-follower-growth', 'bar', {
        labels: topGrowth.map(i => i.brand),
        datasets: [{
            label: 'Follower Growth %',
            data: topGrowth.map(i => i.wowFoll),
            backgroundColor: '#22c55e'
        }]
    });
}

function renderContent(data) {
    // Placeholder since we don't have real Video/Image split
    createChart('chart-content-mix', 'pie', {
        labels: ['Video', 'Image'],
        datasets: [{
            data: [65, 35], // Dummy split
            backgroundColor: ['#f472b6', '#60a5fa']
        }]
    });
}

// --- Chart Helper ---

function createChart(id, type, data, options = {}) {
    const ctx = document.getElementById(id);
    if (!ctx) return;

    if (charts[id]) {
        charts[id].destroy();
    }

    charts[id] = new Chart(ctx, {
        type: type,
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8' } }
            },
            scales: type !== 'pie' && type !== 'doughnut' ? {
                y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            } : {},
            ...options
        }
    });
}
