// ==========================================
// ⚙️ USER CONFIGURATION (EDIT THIS SECTION)
// ==========================================

// GOOGLE SHEET URL
// File -> Share -> Publish to web -> Select "Sheet1" -> Select "Comma-separated values (.csv)"
// Paste the link below:
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_SAMPLE_URL_HERE/pub?output=csv";

// ==========================================
// 🚀 APP LOGIC (DO NOT EDIT BELOW)
// ==========================================

// DOM Elements
const dashboardScreen = document.getElementById('dashboard-screen');
const loadingOverlay = document.getElementById('loading-overlay');
const logoutBtn = document.getElementById('logout-btn');

// State
let chartInstance = null;
let pieInstance = null;

// --- Initialization ---

// Load data immediately
loadData();

// Hide logout button since there is no login
if (logoutBtn) {
    logoutBtn.style.display = 'none';
}

function setLoading(isLoading) {
    if (isLoading) {
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

// --- Data & Charts ---

async function loadData() {
    setLoading(true);

    // Check if URL is the default placeholder
    if (SHEET_URL.includes("SAMPLE_URL")) {
        // Use dummy data for demonstration
        console.warn("Using Dummy Data (Sheet URL not set)");
        renderDashboard(getDummyData());
        setLoading(false);
        return;
    }

    try {
        Papa.parse(SHEET_URL, {
            download: true,
            header: true,
            complete: function (results) {
                console.log("Data fetched:", results.data);
                renderDashboard(processData(results.data));
                setLoading(false);
            },
            error: function (err) {
                console.error("CSV Error:", err);
                alert("Failed to load Google Sheet. Check the URL and ensure it is 'Published to Web'.");
                setLoading(false);
            }
        });
    } catch (error) {
        console.error(error);
        setLoading(false);
    }
}

function processData(data) {
    // This function assumes your CSV has columns like: Date, Value, Category
    // We will try to auto-detect or just use the first few rows for now.

    // For this template, we'll just return the raw data + some calculated stats
    // You can customize this parsing logic based on your actual sheet structure.
    return {
        labels: data.map(row => row.Date || row.date || `Row ${Math.random()}`),
        values: data.map(row => parseFloat(row.Value || row.value || row.Amount || 0)),
        categories: data.map(row => row.Category || row.Type || 'General')
    };
}

function getDummyData() {
    return {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        values: [120, 190, 300, 500, 200, 300, 450],
        categories: ['Sales', 'Sales', 'Marketing', 'Sales', 'Marketing', 'Dev', 'Dev']
    };
}

function renderDashboard(data) {
    // 1. Update Stats
    const total = data.values.reduce((a, b) => a + b, 0);
    const avg = Math.round(total / data.values.length);

    const statsContainer = document.getElementById('stats-container');
    statsContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-title">Total Revenue</div>
            <div class="stat-value">$${total.toLocaleString()}</div>
            <div class="stat-change positive">↑ 12% vs last week</div>
        </div>
        <div class="stat-card">
            <div class="stat-title">Daily Average</div>
            <div class="stat-value">${avg.toLocaleString()}</div>
        </div>
        <div class="stat-card">
            <div class="stat-title">Data Points</div>
            <div class="stat-value">${data.values.length}</div>
        </div>
    `;

    // 2. Render Main Chart
    const ctx = document.getElementById('mainChart').getContext('2d');

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Growth',
                data: data.values,
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });

    // 3. Render Pie Chart (Categories)
    const catCounts = {};
    data.categories.forEach(c => catCounts[c] = (catCounts[c] || 0) + 1);

    const pieCtx = document.getElementById('pieChart').getContext('2d');
    if (pieInstance) pieInstance.destroy();

    pieInstance = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(catCounts),
            datasets: [{
                data: Object.values(catCounts),
                backgroundColor: ['#38bdf8', '#818cf8', '#c084fc', '#2dd4bf'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#94a3b8' } }
            }
        }
    });
}
