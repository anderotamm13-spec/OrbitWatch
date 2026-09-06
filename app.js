const NOAA = {
      kp: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
      wind: "https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json",
      mag: "https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json",
      aurora: "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json"
};

const $ = (id) => document.getElementById(id);

const state = {
    mode: "earth",
    kp: 0,
    wind: 0,
    bz: 0,
    aurora: 0,
    history: [],
    live: false,
    stars: [],
    tick: 0
};

const canvas = $("spaceCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const chart = $("chartCanvas");
const cctx = chart.getContext("2d");
cctx.imageSmoothingEnabled = false;

function log(message, className = "") {
    const p = document.createElement("p");
    const now = new Date().toISOString().slice(11, 19);
    p.innerHTML = `<span class="time">[${now}]</span> ${message}`;
    if (className) p.className = className;
    $("log").prepend(p);
    while ($("log").children.length > 7) $("log").lastChild.remove();
}

function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

async function getJSON(url) {
    const r = await fetch(url, {cache: "no-store"});
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
}

function parseKp(rows) {
    // SWPC product is normally an array whose first row contains headings.
    if (!Array.isArray(rows) || rows.length < 2) throw new Error("Invalid Kp packet");
    const header = rows[0].map(x => String(x).toLowerCase());
    const kpIndex = header.findIndex(x => x.includes("kp"));
    const timeIndex = header.findIndex(x => x.includes("time"));
    const values = rows.slice(1)
        .map(row => ({
            time: timeIndex >= 0 ? row[timeIndex] : "",
            kp: num(row[kpIndex >= 0 ? kpIndex : 1], NaN)
        }))
        .filter(x => Number.isFinite(x.kp));
    if (!values.length) throw new Error("No Kp values");
    return values;
}

function parseSummary(data) {
    // Summary endpoints return a tiny object; accept several field spellings
    // so the dashboard is resilient to minor schema changes.
    if (typeof data === "number" || typeof data === "string") return num(data, NaN);
    if (Array.isArray(data)) {
        const flat = data.flat(Infinity).map(v => num(v, NaN)).filter(Number.isFinite);
        return flat.at(-1);
    }
    const preferred = ["WindSpeed", "wind_speed", "speed", "value", "Bt", "Bz", "bz"];
    for (const key of preferred) {
        if (key in data && Number.isFinite(num(data[key], NaN))) return num(data[key]);
    }
    for (const value of Object.values(data)) {
        const n = num(value, NaN);
        if (Number.isFinite(n)) return n;
    }
    return NaN;
}

function parseBz(data) {
    if (data && typeof data === "object" && !Array.isArray(data)) {
        for (const key of ["Bz", "bz", "BzGSM", "bz_gsm"]) {
            const n = num(data[key], NaN);
            if (Number.isFinite(n)) return n;
        }
    }
    return parseSummary(data);
}

function parseAurora(data) {
    // OVATION contains many geographic points with aurora probability.
    // Use the maximum forecast probability as a simple global activity indicator.
    const coords = data?.coordinates || data?.Coordinate || [];
    if (!Array.isArray(coords) || !coords.length) throw new Error("No aurora points");
    let max = 0;
    for (const item of coords) {
        if (Array.isArray(item)) {
            max = Math.max(max, num(item[item.length - 1]));
        } else if (item && typeof item === "object") {
            max = Math.max(max, num(item.probability ?? item.Probability ?? item.value));
        }
    }
    return Math.min(100, Math.max(0, max));
}

function demoData() {
    const base = 3.7 + Math.sin(Date.now() / 600000) * 0.8;
    state.kp = Math.max(0, Math.min(9, base));
    state.wind = 438;
    state.bz = -3.2;
    state.aurora = 46;
    state.history = Array.from({length: 24}, (_, i) => ({
        time: `${String(i).padStart(2, "0")}:00`,
        kp: Math.max(0, Math.min(9, 2.5 + Math.sin(i / 2.2) * 1.8 + (i > 17 ? 1.2 : 0)))
    }));
    state.live = false;
    log("NOAA link unavailable — simulation packet loaded.", "warn");
}

async function refreshData() {
    $("signalText").textContent = "CONNECTING";
    $("signalDot").className = "";
    log("Opening NOAA SWPC telemetry link...");

    try {
        const [kpRaw, windRaw, magRaw, auroraRaw] = await Promise.all([
            getJSON(NOAA.kp),
            getJSON(NOAA.wind),
            getJSON(NOAA.mag),
            getJSON(NOAA.aurora)
        ]);

        const kpSeries = parseKp(kpRaw);
        state.kp = kpSeries.at(-1).kp;
        state.history = kpSeries.slice(-24);
        state.wind = parseSummary(windRaw);
        state.bz = parseBz(magRaw);
        state.aurora = parseAurora(auroraRaw);
        state.live = true;
        log(`Telemetry acquired. Planetary Kp ${state.kp.toFixed(1)}.`);
    } catch (err) {
        console.warn(err);
        demoData();
    }

    renderTelemetry();
    drawChart();
    $("updatedAt").textContent = `SYNC ${new Date().toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}`;
    $("signalText").textContent = state.live ? "LIVE LINK" : "DEMO LINK";
    $("signalDot").className = state.live ? "live" : "offline";
}

function kpInfo(kp) {
    if (kp < 4) return ["QUIET", "Normal geomagnetic conditions"];
    if (kp < 5) return ["ACTIVE", "Geomagnetic field is active"];
    if (kp < 6) return ["G1", "Minor geomagnetic storm"];
    if (kp < 7) return ["G2", "Moderate geomagnetic storm"];
    if (kp < 8) return ["G3", "Strong geomagnetic storm"];
    if (kp < 9) return ["G4", "Severe geomagnetic storm"];
    return ["G5", "Extreme geomagnetic storm"];
}

function renderTelemetry() {
    const [level, desc] = kpInfo(state.kp);
    $("kpValue").textContent = state.kp.toFixed(1);
    $("kpState").textContent = level;
    $("windValue").textContent = Math.round(state.wind || 0);
    $("windState").textContent = state.wind > 600 ? "FAST" : state.wind > 450 ? "ELEVATED" : "NORMAL";
    $("bzValue").textContent = Number.isFinite(state.bz) ? state.bz.toFixed(1) : "--";
    $("bzState").textContent = state.bz < -5 ? "SOUTHWARD" : state.bz > 5 ? "NORTHWARD" : "STABLE";
    $("auroraValue").textContent = `${Math.round(state.aurora)}%`;
    $("auroraState").textContent = state.aurora > 60 ? "HIGH" : state.aurora > 30 ? "POSSIBLE" : "LOW";
    $("stormLevel").textContent = level;
    $("stormDesc").textContent = desc;
    $("kpMeter").style.width = `${Math.min(100, (state.kp / 9) * 100)}%`;
    $("statusLine").textContent =
        state.kp >= 5
            ? `STORM WATCH: Kp ${state.kp.toFixed(1)}. Aurora may expand toward lower latitudes.`
            : `NOMINAL: Kp ${state.kp.toFixed(1)}. No major geomagnetic storm detected.`;
}

function initStars() {
    let seed = 1337;
    const random = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    };
    state.stars = Array.from({length: 125}, () => ({
        x: Math.floor(random() * canvas.width),
        y: Math.floor(random() * 310),
        s: random() > .86 ? 2 : 1,
        phase: random() * Math.PI * 2
    }));
}

function pixelCircle(cx, cy, r, color) {
    ctx.fillStyle = color;
    const step = 4;
    for (let y = -r; y <= r; y += step) {
        const half = Math.sqrt(Math.max(0, r * r - y * y));
        ctx.fillRect(Math.floor((cx - half) / step) * step, Math.floor((cy + y) / step) * step, Math.floor((half * 2) / step) * step, step);
    }
}

function drawStars() {
    ctx.fillStyle = "#02040b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const s of state.stars) {
        const a = .35 + .65 * ((Math.sin(state.tick * .03 + s.phase) + 1) / 2);
        ctx.globalAlpha = a;
        ctx.fillStyle = s.s === 2 ? "#bfeeff" : "#5f7699";
        ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
}

function drawEarth() {
    const cx = 510, cy = 210, r = 126;
    ctx.globalAlpha = .18;
    pixelCircle(cx, cy, r + 14, "#47f7ff");
    ctx.globalAlpha = 1;
    pixelCircle(cx, cy, r, "#123c79");

    ctx.fillStyle = "#34c787";
    const land = [
        [454, 140, 30, 18], [478, 150, 44, 20], [505, 163, 28, 23],
        [427, 190, 48, 30], [458, 210, 25, 38], [530, 126, 45, 18],
        [557, 143, 38, 31], [575, 177, 30, 26], [548, 212, 53, 32],
        [525, 238, 29, 35], [580, 237, 28, 20], [487, 268, 40, 20]
    ];
    for (const [x, y, w, h] of land) {
        ctx.fillRect(Math.round(x / 4) * 4, Math.round(y / 4) * 4, Math.round(w / 4) * 4, Math.round(h / 4) * 4);
    }

    ctx.strokeStyle = "#47f7ff";
    ctx.globalAlpha = .22;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r + 28, r * 0.43, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (state.kp >= 4 || state.mode === "aurora") {
        ctx.strokeStyle = state.kp >= 6 ? "#b875ff" : "#64ff9a";
        ctx.lineWidth = 7;
        ctx.globalAlpha = .55 + Math.sin(state.tick * .08) * .15;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 51, 84, 20, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}

function drawSatellite() {
    const x = 250 + Math.sin(state.tick * .012) * 35;
    const y = 135 + Math.cos(state.tick * .016) * 16;
    ctx.fillStyle = "#b8cbe2";
    ctx.fillRect(x, y, 30, 20);
    ctx.fillStyle = "#eaf7ff";
    ctx.fillRect(x + 8, y + 5, 14, 10);
    ctx.fillStyle = "#1c62a8";
    ctx.fillRect(x - 39, y + 2, 35, 16);
    ctx.fillRect(x + 34, y + 2, 35, 16);
    ctx.fillStyle = "#47f7ff";
    for (let i = 0; i < 4; i++) {
        ctx.fillRect(x - 36 + i * 8, y + 5, 5, 10);
        ctx.fillRect(x + 37 + i * 8, y + 5, 5, 10);
    }
    ctx.strokeStyle = "#ffdc75";
    ctx.beginPath();
    ctx.moveTo(x + 15, y);
    ctx.lineTo(x + 24, y - 18);
    ctx.stroke();
    ctx.fillStyle = "#ffdc75";
    ctx.fillRect(x + 22, y - 21, 5, 5);
}

function drawSun() {
    const x = 590, y = 195;
    ctx.globalAlpha = .18;
    pixelCircle(x, y, 110, "#ff9f43");
    ctx.globalAlpha = 1;
    pixelCircle(x, y, 90, "#ffcc4d");
    pixelCircle(x - 15, y - 9, 63, "#ff9f43");
    ctx.fillStyle = "#ff7b39";
    for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2 + state.tick * .006;
        const rx = x + Math.cos(a) * 108, ry = y + Math.sin(a) * 108;
        ctx.fillRect(Math.round(rx / 4) * 4, Math.round(ry / 4) * 4, 12, 12);
    }
    ctx.fillStyle = "#5f261d";
    ctx.fillRect(x + 15, y - 30, 14, 9);
    ctx.fillRect(x - 45, y + 15, 20, 10);
}

function drawAuroraView() {
    drawEarth();
    ctx.globalAlpha = .28;
    for (let i = 0; i < 7; i++) {
        ctx.strokeStyle = i % 2 ? "#b875ff" : "#64ff9a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x += 12) {
            const y = 90 + i * 9 + Math.sin(x * .018 + state.tick * .04 + i) * 18;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

function drawMode() {
    drawStars();

    if (state.mode === "sun") {
        drawSun();
        drawSatellite();
    } else if (state.mode === "aurora") {
        drawAuroraView();
        drawSatellite();
    } else if (state.mode === "satellite") {
        drawEarth();
        drawSatellite();
        ctx.strokeStyle = "#47f7ff";
        ctx.globalAlpha = .45;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(285, 145);
        ctx.lineTo(420, 180);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    } else {
        drawEarth();
        drawSatellite();
    }

    state.tick++;
    requestAnimationFrame(drawMode);
}

function drawChart() {
    const w = chart.width, h = chart.height;
    cctx.clearRect(0, 0, w, h);
    cctx.fillStyle = "#050a16";
    cctx.fillRect(0, 0, w, h);

    cctx.strokeStyle = "#173047";
    cctx.lineWidth = 1;
    for (let k = 0; k <= 9; k += 3) {
        const y = h - 20 - (k / 9) * (h - 40);
        cctx.beginPath();
        cctx.moveTo(42, y);
        cctx.lineTo(w - 12, y);
        cctx.stroke();
        cctx.fillStyle = "#6b8aa0";
        cctx.font = "16px monospace";
        cctx.fillText(`Kp ${k}`, 4, y + 5);
    }

    const pts = state.history.length ? state.history : [{kp: 0}];
    cctx.strokeStyle = "#47f7ff";
    cctx.lineWidth = 3;
    cctx.beginPath();
    pts.forEach((p, i) => {
        const x = 42 + (i / (Math.max(1, pts.length - 1))) * (w - 60);
        const y = h - 20 - (Math.min(9, p.kp) / 9) * (h - 40);
        if (i === 0) cctx.moveTo(x, y); else cctx.lineTo(x, y);
    });
    cctx.stroke();

    cctx.fillStyle = "#47f7ff";
    pts.forEach((p, i) => {
        const x = 42 + (i / (Math.max(1, pts.length - 1))) * (w - 60);
        const y = h - 20 - (Math.min(9, p.kp) / 9) * (h - 40);
        cctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
    });
}

document.querySelectorAll(".tab").forEach(btn=> {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.mode = btn.dataset.mode;
        $("screenMode").textContent = `${state.mode.toUpperCase()} VIEW`;
        log(`Display switched to ${state.mode.toUpperCase()} channel.`);
    });
});

document.addEventListener("keydown",(e)=> {
    const map = {1: "earth", 2: "sun", 3: "aurora", 4: "satellite"};
    if (!map[e.key]) return;
    document.querySelector(`.tab[data-mode="${map[e.key]}"]`).click();
});

$("refreshBtn").addEventListener("click", refreshData);

setInterval(()=> {
    $("utcTime").textContent = new Date().toISOString().slice(11, 19);
},1000);

initStars();
drawMode();
refreshData();
setInterval(refreshData, 5*60*1000);

})
})
      })
})
                                })
                          })
                              }
                                  }
                    }
                  ]
          }
          }))
        }
            }
                    ])
            }
                }))
              }
        }
}