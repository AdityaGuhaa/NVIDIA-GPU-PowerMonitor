/* =====================================================================
   NVIDIA-GPU-PowerMonitor — Frontend Application
   Copyright (c) 2026 Aditya Guha
   Licensed under the MIT License. See LICENSE file in the project root for full license information.

   Real-time charting with Chart.js + Socket.IO
   ===================================================================== */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_DATA_POINTS = 120;

const COLORS = {
    power:      "#3ddc84",
    powerFill:  "rgba(61, 220, 132, 0.10)",
    powerFillTop: "rgba(61, 220, 132, 0.18)",
    vram:       "#4fc3f7",
    vramFill:   "rgba(79, 195, 247, 0.10)",
    vramFillTop: "rgba(79, 195, 247, 0.18)",
    limit:      "rgba(255, 180, 50, 0.40)",
    grid:       "rgba(255, 255, 255, 0.04)",
    tick:       "rgba(255, 255, 255, 0.25)",
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let powerChart = null;
let vramChart = null;
let powerAxisLocked = false;
let vramAxisLocked = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateTimeLabels(count) {
    const labels = [];
    for (let i = -(count - 1); i <= 0; i++) {
        labels.push(i === 0 ? "0s" : `${i}s`);
    }
    return labels;
}

function createGradient(ctx, height, topColor, bottomColor) {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, bottomColor);
    return grad;
}

// ---------------------------------------------------------------------------
// Chart Factory
// ---------------------------------------------------------------------------

function buildChart(canvasId, accentColor, fillTop, fillBottom, label, yMax) {
    const ctx = document.getElementById(canvasId).getContext("2d");
    const gradient = createGradient(ctx, ctx.canvas.parentElement.offsetHeight || 300, fillTop, fillBottom);

    return new Chart(ctx, {
        type: "line",
        data: {
            labels: generateTimeLabels(MAX_DATA_POINTS),
            datasets: [
                {
                    label: label,
                    data: [],
                    borderColor: accentColor,
                    backgroundColor: gradient,
                    borderWidth: 1.5,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    pointHoverBackgroundColor: accentColor,
                },
                {
                    label: "Limit",
                    data: [],
                    borderColor: COLORS.limit,
                    borderWidth: 1,
                    borderDash: [4, 3],
                    fill: false,
                    tension: 0,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                mode: "index",
                intersect: false,
            },
            layout: {
                padding: { top: 4, right: 4, bottom: 0, left: 0 },
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "rgba(0, 0, 0, 0.85)",
                    titleColor: "#ccc",
                    bodyColor: "#eee",
                    borderColor: "#222",
                    borderWidth: 1,
                    cornerRadius: 4,
                    padding: 8,
                    titleFont: { size: 10, family: "Inter" },
                    bodyFont: { size: 11, family: "Inter" },
                    displayColors: false,
                },
            },
            scales: {
                x: {
                    grid: {
                        color: COLORS.grid,
                        drawBorder: false,
                        lineWidth: 0.5,
                    },
                    ticks: {
                        color: COLORS.tick,
                        font: { size: 9, family: "Inter" },
                        maxTicksLimit: 7,
                        padding: 4,
                    },
                    border: { display: false },
                },
                y: {
                    min: 0,
                    max: yMax,
                    grid: {
                        color: COLORS.grid,
                        drawBorder: false,
                        lineWidth: 0.5,
                    },
                    ticks: {
                        color: COLORS.tick,
                        font: { size: 9, family: "Inter" },
                        maxTicksLimit: 5,
                        padding: 6,
                    },
                    border: { display: false },
                },
            },
        },
    });
}

function initCharts() {
    powerChart = buildChart(
        "powerChart",
        COLORS.power,
        COLORS.powerFillTop,
        COLORS.powerFill,
        "Power (W)",
        100
    );
    vramChart = buildChart(
        "vramChart",
        COLORS.vram,
        COLORS.vramFillTop,
        COLORS.vramFill,
        "VRAM (GB)",
        8
    );
}

// ---------------------------------------------------------------------------
// DOM Updates
// ---------------------------------------------------------------------------

function updateConnectionStatus(connected) {
    const dot = document.getElementById("connection-dot");
    const text = document.getElementById("connection-status");
    dot.className = connected ? "connection-dot connected" : "connection-dot disconnected";
    text.textContent = connected ? "by Aditya Guha" : "Disconnected";
}

function updateDashboard(gpu) {
    const powerDraw = gpu.power_draw.toFixed(1);
    const powerLimit = gpu.power_limit.toFixed(0);
    const vramUsedGB = (gpu.vram_used / 1024).toFixed(1);
    const vramTotalGB = (gpu.vram_total / 1024).toFixed(1);
    const powerPct = gpu.power_limit > 0 ? ((gpu.power_draw / gpu.power_limit) * 100).toFixed(0) : "—";
    const vramPct = gpu.vram_total > 0 ? ((gpu.vram_used / gpu.vram_total) * 100).toFixed(0) : "—";

    // Summary strip
    document.getElementById("gpu-name").textContent = gpu.gpu_name;
    document.getElementById("gpu-temp").textContent = gpu.temperature + "°C";
    document.getElementById("gpu-util").textContent = gpu.gpu_utilization + "%";
    document.getElementById("power-current").textContent = powerDraw + " W";
    document.getElementById("power-limit").textContent = " / " + powerLimit + " W";
    document.getElementById("vram-used").textContent = vramUsedGB + " GB";
    document.getElementById("vram-total").textContent = " / " + vramTotalGB + " GB";

    // Panel big readings
    document.getElementById("reading-power").textContent = powerDraw;
    document.getElementById("reading-vram").textContent = vramUsedGB;

    // Footer stats
    document.getElementById("stat-power").textContent = powerDraw;
    document.getElementById("stat-limit").textContent = powerLimit;
    document.getElementById("stat-power-pct").textContent = powerPct;
    document.getElementById("stat-vram-used").textContent = vramUsedGB;
    document.getElementById("stat-vram-total").textContent = vramTotalGB;
    document.getElementById("stat-vram-pct").textContent = vramPct;
}

// ---------------------------------------------------------------------------
// Chart Data Push
// ---------------------------------------------------------------------------

function pushData(chart, value, limitValue) {
    const main = chart.data.datasets[0].data;
    const limit = chart.data.datasets[1].data;

    main.push(value);
    limit.push(limitValue);

    if (main.length > MAX_DATA_POINTS) {
        main.shift();
        limit.shift();
    }

    chart.update("none");
}

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------

function initSocket() {
    const socket = io();

    socket.on("connected", () => {
        updateConnectionStatus(true);
    });

    socket.on("disconnect", () => {
        updateConnectionStatus(false);
    });

    socket.on("gpu_data", (data) => {
        if (!data || data.length === 0) return;
        const gpu = data[0];

        updateDashboard(gpu);

        // Lock power Y-axis to max TGP on first data (never bounces)
        if (!powerAxisLocked && gpu.power_max_limit > 0) {
            powerChart.options.scales.y.max = Math.ceil(gpu.power_max_limit * 1.05);
            powerChart.update("none");
            powerAxisLocked = true;
        }

        // Lock VRAM Y-axis to total VRAM on first data
        const vramTotalGB = gpu.vram_total / 1024;
        if (!vramAxisLocked && vramTotalGB > 0) {
            vramChart.options.scales.y.max = Math.ceil(vramTotalGB * 1.05);
            vramChart.update("none");
            vramAxisLocked = true;
        }

        // Power chart — enforced limit shown as dashed line
        pushData(powerChart, gpu.power_draw, gpu.power_limit);

        // VRAM chart (MiB → GB)
        const vramGB = gpu.vram_used / 1024;
        pushData(vramChart, vramGB, vramTotalGB);
    });

    socket.on("gpu_error", (data) => {
        console.warn("[NVIDIA-GPU-PowerMonitor]", data.message);
    });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
    initCharts();
    initSocket();
});
