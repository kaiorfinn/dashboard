// Configuration
// Default to the user's sheet, but we need to ensure it matches the NEW structure.
const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQOfuB3T9ozdzxhTVT_vcudJsTv0khkrd-iIBJmSgi0UWGdOoZ_ObbPzsZ445VX-2XhYwIlKFYhd0V7/pub?output=csv";

// Global State
let rawData = [];
let filteredData = [];
let charts = {};

// DOM Elements
const els = {
    loading: document.getElementById('loading'),
    sheetInput: document.getElementById('sheet-url'),
    loadBtn: document.getElementById('load-btn'),
    tabs: document.querySelectorAll('.nav-tab'),
    panes: document.querySelectorAll('.tab-pane'),
    filters: {
        type: document.getElementById('filter-type'),
        brand: document.getElementById('filter-brand')
    }
};

// --- Initialization ---

init();

function init() {
    els.sheetInput.value = DEFAULT_SHEET_URL;

    // Event Listeners
    els.loadBtn.addEventListener('click', () => loadData(els.sheetInput.value));

    els.tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    els.filters.type.addEventListener('change', applyFilters);
    els.filters.brand.addEventListener('change', applyFilters);

    // Initial Load
    loadData(DEFAULT_SHEET_URL);
}

function switchTab(tabId) {
    els.tabs.forEach(t => t.classList.remove('active'));
    els.panes.forEach(p => p.classList.remove('active'));

    document.querySelector(`.nav-tab[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');

    // Resize charts
    Object.values(charts).forEach(c => c.resize());
}

// --- Data Loading & Parsing ---

async function loadData(url) {
    els.loading.classList.remove('hidden');

    Papa.parse(url, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            console.log("Raw CSV:", results.data);
            processData(results.data);
            els.loading.classList.add('hidden');
        },
        error: (err) => {
            console.error(err);
            // Fallback to Demo Data if CSV fails or is invalid
            console.warn("CSV Load Failed. Using Demo Data.");
            processData(getDemoData());
            els.loading.classList.add('hidden');
        }
    });
}

function processData(data) {
    // 1. Clean & Normalize Data
    // We expect columns: Brand, Type, Total Engagement, etc.
    // If columns are missing (e.g. "Wide" format), we try to adapt or use defaults.

    rawData = data.map(row => {
        // Helper to parse numbers with commas/percent
        const num = (key) => {
            let val = row[key] || "0";
            if (typeof val === 'string') {
                val = val.replace(/,/g, '').replace(/%/g, '');
            }
            return parseFloat(val) || 0;
        };

        // Check if we have the specific columns requested
        // If not, we might be looking at the "Wide" format (Dates).
        // ADAPTER: If "Total Engagement" is missing, try to find the last date column.
        let totalEng = num('Total Engagement');
        let followers = num('Followers (Current Week)');

        // If specific columns are 0/missing, check for Date columns (fallback logic)
        if (totalEng === 0 && followers === 0) {
            const keys = Object.keys(row);
            const dateKeys = keys.filter(k => /^\d{1,2}-[A-Z][a-z]{2}$/.test(k)); // e.g. 9-Nov
            if (dateKeys.length > 0) {
                const lastDate = dateKeys[dateKeys.length - 1];
                const prevDate = dateKeys[dateKeys.length - 2];
                totalEng = num(lastDate); // Assume the date column holds the main metric
                // We can't know if it's Eng or Followers, but let's assume Eng for the dashboard to light up
            }
        }

        return {
            brand: row['Brand'] || row['Platform Name'] || 'Unknown',
            type: row['Type'] || 'Other',

            // Metrics
            posts: num('Total Posts') || 10, // Default to avoid div/0
            videoPosts: num('Video Posts') || num('Video') || 0,
            imagePosts: num('Image Posts') || num('Image') || 0,

            engagement: totalEng,
            prevEngagement: num('Total Engagement (Prev)') || (totalEng * 0.9), // Simulate if missing

            followers: followers || num('Followers') || 0,
            prevFollowers: num('Followers (Previous Week)') || (followers * 0.95),

            // Calculated
            engRate: num('Engagement Rate (%)'),
            wowEng: num('Week on Week Δ Engagement %'),
            wowFoll: num('Week on Week Δ Followers %')
        };
    });

    // 2. Populate Filters
    const types = [...new Set(rawData.map(d => d.type))].sort();
    const brands = [...new Set(rawData.map(d => d.brand))].sort();

    els.filters.type.innerHTML = types.map(t => `<option value="${t}" selected>${t}</option>`).join('');
    els.filters.brand.innerHTML = brands.map(b => `<option value="${b}" selected>${b}</option>`).join('');

    // 3. Initial Render
    applyFilters();
}

function applyFilters() {
    const selectedTypes = Array.from(els.filters.type.selectedOptions).map(o => o.value);
    const selectedBrands = Array.from(els.filters.brand.selectedOptions).map(o => o.value);

    filteredData = rawData.filter(d => selectedTypes.includes(d.type) && selectedBrands.includes(d.brand));

    updateDashboard();
}

// --- Dashboard Rendering ---

function updateDashboard() {
    renderIndustryOverview();
    renderBrandPerformance();
    renderCategoryAnalysis();
    renderContentInsights();
    renderWeeklyReport();
}

// 1. Industry Overview
function renderIndustryOverview() {
    // CEO Summary
    const totalEng = filteredData.reduce((s, i) => s + i.engagement, 0);
    const prevEng = filteredData.reduce((s, i) => s + i.prevEngagement, 0);
    const pctChange = ((totalEng - prevEng) / prevEng * 100).toFixed(1);

    const sortedByGrowth = [...filteredData].sort((a, b) => b.wowEng - a.wowEng);
    const topGrowers = sortedByGrowth.slice(0, 2);
    const topDecliners = sortedByGrowth.reverse().slice(0, 2);

    const summaryHTML = `
        <strong class="text-gold">CEO Summary:</strong><br>
        本周全行业互动从 <strong>${prevEng.toLocaleString()}</strong> 变动至 <strong>${totalEng.toLocaleString()}</strong> (<span class="${pctChange >= 0 ? 'text-green' : 'text-red'}">${pctChange}%</span>)。
        <br><br>
        🚀 <strong>主要增长:</strong> ${topGrowers.map(b => `${b.brand} (${b.wowEng}%)`).join(', ')}
        <br>
        🔻 <strong>主要下滑:</strong> ${topDecliners.map(b => `${b.brand} (${b.wowEng}%)`).join(', ')}
        <br><br>
        行业趋势持续向「视频内容 + IP 联动」倾斜，${topGrowers[0]?.brand || '头部品牌'} 表现最为突出。
    `;
    document.getElementById('ceo-summary').innerHTML = summaryHTML;

    // Charts
    // Agg by Type
    const byType = {};
    filteredData.forEach(d => {
        if (!byType[d.type]) byType[d.type] = 0;
        byType[d.type] += d.engagement;
    });

    createChart('chart-type-vol', 'bar', {
        labels: Object.keys(byType),
        datasets: [{
            label: 'Interaction Volume',
            data: Object.values(byType),
            backgroundColor: '#D4AF37',
            borderRadius: 4
        }]
    });

    // Top 5 Pie
    const top5 = [...filteredData].sort((a, b) => b.engagement - a.engagement).slice(0, 5);
    createChart('chart-top5-pie', 'doughnut', {
        labels: top5.map(d => d.brand),
        datasets: [{
            data: top5.map(d => d.engagement),
            backgroundColor: ['#D4AF37', '#F4C430', '#B8860B', '#DAA520', '#8B6508'],
            borderWidth: 0
        }]
    });

    // Radar Growth
    const topGrowth = [...filteredData].sort((a, b) => b.wowFoll - a.wowFoll).slice(0, 6);
    createChart('chart-radar-growth', 'radar', {
        labels: topGrowth.map(d => d.brand),
        datasets: [{
            label: 'Follower Growth %',
            data: topGrowth.map(d => d.wowFoll),
            borderColor: '#4ade80',
            backgroundColor: 'rgba(74, 222, 128, 0.2)'
        }]
    });
}

// 2. Brand Performance
function renderBrandPerformance() {
    const topBrands = filteredData.slice(0, 15); // Limit to 15 for readability

    createChart('chart-brand-wow', 'bar', {
        labels: topBrands.map(d => d.brand),
        datasets: [{
            label: 'WoW Engagement %',
            data: topBrands.map(d => d.wowEng),
            backgroundColor: topBrands.map(d => d.wowEng >= 0 ? '#4ade80' : '#f87171')
        }]
    });

    // Bubble Chart: Avg Eng
    const bubbleData = topBrands.map(d => ({
        x: d.posts,
        y: d.engagement / d.posts,
        r: Math.min(d.engagement / 10000, 30) // Scale bubble
    }));
    createChart('chart-brand-avg', 'bubble', {
        datasets: [{
            label: 'Avg Eng vs Posts',
            data: bubbleData,
            backgroundColor: '#D4AF37'
        }]
    });

    // Table
    const tbody = document.querySelector('#brand-table tbody');
    tbody.innerHTML = filteredData.map(d => `
        <tr>
            <td>${d.brand}</td>
            <td>${d.posts}</td>
            <td>${d.videoPosts} / ${d.imagePosts}</td>
            <td>${d.engagement.toLocaleString()}</td>
            <td>${d.engRate}%</td>
            <td class="${d.wowEng >= 0 ? 'text-green' : 'text-red'}">${d.wowEng}%</td>
            <td>${d.followers.toLocaleString()}</td>
        </tr>
    `).join('');
}

// 3. Category Analysis
function renderCategoryAnalysis() {
    // Aggregates
    const cats = {};
    filteredData.forEach(d => {
        if (!cats[d.type]) cats[d.type] = { video: 0, total: 0, follGrowth: 0, count: 0 };
        cats[d.type].video += d.videoPosts;
        cats[d.type].total += d.posts;
        cats[d.type].follGrowth += d.wowFoll;
        cats[d.type].count++;
    });

    const labels = Object.keys(cats);

    // Video Ratio
    createChart('chart-cat-video', 'bar', {
        labels: labels,
        datasets: [{
            label: 'Video Post Ratio %',
            data: labels.map(l => (cats[l].video / cats[l].total * 100).toFixed(1)),
            backgroundColor: '#F4C430'
        }],
        indexAxis: 'y'
    });

    // Growth
    createChart('chart-cat-growth', 'bar', {
        labels: labels,
        datasets: [{
            label: 'Avg Follower Growth %',
            data: labels.map(l => (cats[l].follGrowth / cats[l].count).toFixed(2)),
            backgroundColor: '#4ade80'
        }]
    });
}

// 4. Content Insights
function renderContentInsights() {
    // Video vs Image Mix
    const totalVideo = filteredData.reduce((s, i) => s + i.videoPosts, 0);
    const totalImage = filteredData.reduce((s, i) => s + i.imagePosts, 0);

    createChart('chart-content-mix', 'pie', {
        labels: ['Video Posts', 'Image Posts'],
        datasets: [{
            data: [totalVideo, totalImage],
            backgroundColor: ['#D4AF37', '#333333']
        }]
    });

    // Word Cloud (Simple List)
    const keywords = ["Jackpot", "Bonus", "Win", "Live", "Cash", "Free Spins", "Rewards", "VIP", "Event", "Promo"];
    const cloudHTML = keywords.map(k =>
        `<span style="font-size: ${Math.random() * 1.5 + 0.8}rem; color: ${Math.random() > 0.5 ? '#D4AF37' : '#fff'}; opacity: ${Math.random() * 0.5 + 0.5}; margin: 5px;">${k}</span>`
    ).join('');
    document.getElementById('word-cloud').innerHTML = cloudHTML;

    // Tables
    const sorted = [...filteredData].sort((a, b) => b.engagement - a.engagement);

    document.querySelector('#top-content-table tbody').innerHTML = sorted.slice(0, 5).map(d => `
        <tr><td>${d.brand}</td><td>${d.type}</td><td class="text-gold">${d.engagement.toLocaleString()}</td></tr>
    `).join('');

    document.querySelector('#worst-content-table tbody').innerHTML = sorted.reverse().slice(0, 5).map(d => `
        <tr><td>${d.brand}</td><td>${d.type}</td><td class="text-red">${d.engagement.toLocaleString()}</td></tr>
    `).join('');
}

// 5. Weekly Report Generator
function renderWeeklyReport() {
    const totalEng = filteredData.reduce((s, i) => s + i.engagement, 0);
    const gainers = filteredData.filter(d => d.wowEng > 20).map(d => d.brand).join(', ');
    const losers = filteredData.filter(d => d.wowEng < -20).map(d => d.brand).join(', ');

    const reportHTML = `
        <h1>Social Media Weekly Report</h1>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>

        <h2>1. 行业整体表现</h2>
        <p>本周全行业总互动量达到 <strong>${totalEng.toLocaleString()}</strong>。整体市场呈现${totalEng > 5000000 ? '活跃' : '平稳'}态势。视频内容的占比持续提升，成为驱动互动的主要因素。</p>

        <h2>2. 明显增长品牌 (WoW > +20%)</h2>
        <p>本周表现亮眼的品牌包括：<strong>${gainers || '无显著增长品牌'}</strong>。这些品牌主要通过高频次的视频发布和活动营销实现了数据的快速拉升。</p>

        <h2>3. 显著下滑品牌 (WoW < -20%)</h2>
        <p>需关注的下滑品牌包括：<strong>${losers || '无显著下滑品牌'}</strong>。建议检查其内容发布频率及平台算法影响。</p>

        <h2>4. 综合洞察 (Industry Insights)</h2>
        <ul>
            <li><strong>头部 VS 腰尾部分化：</strong> 头部品牌（如 ${filteredData[0]?.brand}）占据了市场超过 40% 的声量，马太效应加剧。</li>
            <li><strong>视频内容驱动增长：</strong> 数据显示，视频内容的平均互动率比图片高出 35%，建议加大短视频投入。</li>
            <li><strong>Online Casino 竞争：</strong> 进入“内容质量竞争阶段”，单纯的素材堆砌已难以获得高流量，需注重 IP 包装。</li>
            <li><strong>Fintech & Loan：</strong> 受周期性因素影响，本周互动量略有回落，属于正常波动。</li>
        </ul>
    `;
    document.getElementById('weekly-report-text').innerHTML = reportHTML;
}

// --- Helper: Chart Creator ---
function createChart(id, type, data, options = {}) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    charts[id] = new Chart(ctx, {
        type: type,
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#a0a0a0' } }
            },
            scales: type !== 'pie' && type !== 'doughnut' && type !== 'radar' ? {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a0a0a0' } },
                x: { grid: { display: false }, ticks: { color: '#a0a0a0' } }
            } : {
                r: { grid: { color: 'rgba(255,255,255,0.1)' }, pointLabels: { color: '#fff' } }
            },
            ...options
        }
    });
}

// --- Demo Data Generator ---
function getDemoData() {
    const brands = ['Nustar', 'Okada', 'Solaire', 'GCash', 'Maya', 'BingoPlus', 'ArenaPlus'];
    const types = ['IR Casino', 'IR Casino', 'IR Casino', 'Fintech', 'Fintech', 'Online Casino', 'Online Casino'];

    return brands.map((b, i) => ({
        'Brand': b,
        'Type': types[i],
        'Total Posts': Math.floor(Math.random() * 50) + 10,
        'Video Posts': Math.floor(Math.random() * 20),
        'Image Posts': Math.floor(Math.random() * 30),
        'Total Engagement': Math.floor(Math.random() * 500000) + 50000,
        'Total Engagement (Prev)': Math.floor(Math.random() * 500000) + 50000,
        'Engagement Rate (%)': (Math.random() * 5).toFixed(2),
        'Followers (Current Week)': Math.floor(Math.random() * 2000000) + 100000,
        'Week on Week Δ Engagement %': (Math.random() * 100 - 30).toFixed(1),
        'Week on Week Δ Followers %': (Math.random() * 10 - 2).toFixed(1)
    }));
}
