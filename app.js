const NOAA = {
    kp: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
    wind: "https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json",
    mag: "https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json",
    aurora: "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json"
};

const $ = (id) =>document.getElementById(id);

const state = {
    mode: "earth",
    kp: 0,
    wind: 0,
    bz: 0,
    aurora: 0,
    history: [],
    live: false,
    stars [],
    tick: 0
};

const canvas = $("SpaceCanvas");
const ctx = chart.getContext("2d");
ctx.imageSmoothingEnabled = false;

const chart = $("chartCanvas");
const cctx = chart.getContext("2d");
cctx.imageSmoothingEnabled = false

function log(message, className = "") {
    const p = document.createElement("p");
    const now = new Date().toISOString().slice(11, 19);
    p.innerHTML = `<span class="time">[${now}]</span {message}`;
    if (className) p.className = className;
    $("log").prepend(p);
    while ($("log").children.length > 7) $("log").lastChild.remove()
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
    if (!Array.isArray(rows) || rows.length < 2) throw new Error("Invalid Kp packet");
    const header = rows[0].map(x => String(x).toLowerCase());
    const KpIndex = header.findIndex(x => x.includes("kp"))
}
