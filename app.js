const $=id=>document.getElementById(id);

const NOAA={
  kp:"https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
  wind:"https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json",
  mag:"https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json",
  aurora:"https://services.swpc.noaa.gov/json/ovation_aurora_latest.json"
};

const GEO="https://geocoding-api.open-meteo.com/v1/search";
const WEATHER="https://api.open-meteo.com/v1/forecast";

const state={
  mode:"earth",
  kp:0,wind:0,bz:0,aurora:0,history:[],live:false,
  stars:[],tick:0,rotation:0,
  location:{name:"Kuressaare",country:"Estonia",latitude:58.2528,longitude:22.4851}
};

const canvas=$("spaceCanvas"),ctx=canvas.getContext("2d");
const chart=$("chartCanvas"),cctx=chart.getContext("2d");
ctx.imageSmoothingEnabled=false;
cctx.imageSmoothingEnabled=false;

function log(msg,cls=""){
  const p=document.createElement("p");
  const t=new Date().toISOString().slice(11,19);
  p.innerHTML=`<span class="time">[${t}]</span> ${msg}`;
  if(cls)p.className=cls;
  $("log").prepend(p);
  while($("log").children.length>7)$("log").lastChild.remove();
}

const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;

async function getJSON(url){
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

/* ---------------- SPACE WEATHER ---------------- */

function parseKp(rows){
  const h=rows[0].map(x=>String(x).toLowerCase());
  const ki=h.findIndex(x=>x.includes("kp"));
  const ti=h.findIndex(x=>x.includes("time"));
  return rows.slice(1)
    .map(r=>({time:ti>=0?r[ti]:"",kp:num(r[ki>=0?ki:1],NaN)}))
    .filter(x=>Number.isFinite(x.kp));
}

function parseSummary(d){
  if(typeof d==="number"||typeof d==="string")return num(d,NaN);
  if(Array.isArray(d)){
    const a=d.flat(Infinity).map(v=>num(v,NaN)).filter(Number.isFinite);
    return a.at(-1);
  }
  for(const k of ["WindSpeed","wind_speed","speed","value","Bz","bz","Bt"]){
    if(d&&k in d&&Number.isFinite(num(d[k],NaN)))return num(d[k]);
  }
  return NaN;
}

function parseBz(d){
  if(d&&typeof d==="object"){
    for(const k of ["Bz","bz","BzGSM","bz_gsm"]){
      if(Number.isFinite(num(d[k],NaN)))return num(d[k]);
    }
  }
  return parseSummary(d);
}

function parseAurora(d){
  const a=d?.coordinates||[];
  let m=0;
  for(const x of a){
    m=Math.max(m,Array.isArray(x)?num(x.at(-1)):num(x?.probability??x?.value));
  }
  return Math.min(100,m);
}

function demoSpace(){
  state.kp=3.7;
  state.wind=438;
  state.bz=-3.2;
  state.aurora=46;
  state.live=false;
  state.history=Array.from({length:24},(_,i)=>({
    kp:Math.max(0,Math.min(9,2.8+Math.sin(i/2)*1.3))
  }));
  log("NOAA unavailable — demo space packet loaded.","warn");
}

async function refreshSpace(){
  $("signalText").textContent="CONNECTING";
  $("signalDot").className="";

  try{
    const [k,w,m,a]=await Promise.all([
      getJSON(NOAA.kp),
      getJSON(NOAA.wind),
      getJSON(NOAA.mag),
      getJSON(NOAA.aurora)
    ]);

    const s=parseKp(k);
    if(!s.length)throw new Error("No Kp values");

    state.kp=s.at(-1).kp;
    state.history=s.slice(-24);
    state.wind=parseSummary(w);
    state.bz=parseBz(m);
    state.aurora=parseAurora(a);
    state.live=true;
    log(`NOAA telemetry acquired. Kp ${state.kp.toFixed(1)}.`);
  }catch(e){
    console.warn(e);
    demoSpace();
  }

  renderSpace();
  drawChart();

  $("signalText").textContent=state.live?"LIVE LINK":"DEMO LINK";
  $("signalDot").className=state.live?"live":"offline";
  $("updatedAt").textContent=`SYNC ${new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`;
}

function kpInfo(k){
  if(k<4)return["QUIET","Normal geomagnetic conditions"];
  if(k<5)return["ACTIVE","Geomagnetic field is active"];
  if(k<6)return["G1","Minor geomagnetic storm"];
  if(k<7)return["G2","Moderate geomagnetic storm"];
  if(k<8)return["G3","Strong geomagnetic storm"];
  if(k<9)return["G4","Severe geomagnetic storm"];
  return["G5","Extreme geomagnetic storm"];
}

function renderSpace(){
  const [level,desc]=kpInfo(state.kp);

  $("kpValue").textContent=state.kp.toFixed(1);
  $("kpState").textContent=level;

  $("windValue").textContent=Math.round(state.wind||0);
  $("windState").textContent=state.wind>600?"FAST":state.wind>450?"ELEVATED":"NORMAL";

  $("bzValue").textContent=Number.isFinite(state.bz)?state.bz.toFixed(1):"--";
  $("bzState").textContent=state.bz<-5?"SOUTHWARD":state.bz>5?"NORTHWARD":"STABLE";

  $("auroraValue").textContent=`${Math.round(state.aurora)}%`;
  $("auroraState").textContent=state.aurora>60?"HIGH":state.aurora>30?"POSSIBLE":"LOW";

  $("stormLevel").textContent=level;
  $("stormDesc").textContent=desc;
  $("kpMeter").style.width=`${Math.min(100,state.kp/9*100)}%`;

  $("statusLine").textContent=
    state.kp>=5
      ?`STORM WATCH: Kp ${state.kp.toFixed(1)}. Aurora may expand toward lower latitudes.`
      :`NOMINAL: Kp ${state.kp.toFixed(1)}. No major geomagnetic storm detected.`;
}

/* ---------------- WEATHER ---------------- */

const WEATHER_CODES={
  0:["CLEAR","☀"],
  1:["MAINLY CLEAR","◒"],
  2:["PARTLY CLOUDY","◓"],
  3:["OVERCAST","☁"],
  45:["FOG","≋"],48:["RIME FOG","≋"],
  51:["LIGHT DRIZZLE","⌁"],53:["DRIZZLE","⌁"],55:["HEAVY DRIZZLE","⌁"],
  61:["LIGHT RAIN","☂"],63:["RAIN","☂"],65:["HEAVY RAIN","☂"],
  71:["LIGHT SNOW","✦"],73:["SNOW","✦"],75:["HEAVY SNOW","✦"],
  80:["RAIN SHOWERS","☂"],81:["RAIN SHOWERS","☂"],82:["HEAVY SHOWERS","☂"],
  85:["SNOW SHOWERS","✦"],86:["HEAVY SNOW","✦"],
  95:["THUNDERSTORM","ϟ"],96:["THUNDER + HAIL","ϟ"],99:["SEVERE STORM","ϟ"]
};

function weatherInfo(code){
  return WEATHER_CODES[code]||["UNKNOWN","?"];
}

async function loadWeather(){
  const p=new URLSearchParams({
    latitude:state.location.latitude,
    longitude:state.location.longitude,
    timezone:"auto",
    forecast_days:"3",
    current:"temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    daily:"weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max"
  });

  try{
    const d=await getJSON(`${WEATHER}?${p}`);
    const c=d.current;
    const [text,icon]=weatherInfo(c.weather_code);

    $("currentTemp").textContent=Math.round(c.temperature_2m);
    $("feelsLike").textContent=Math.round(c.apparent_temperature);
    $("humidity").textContent=Math.round(c.relative_humidity_2m);
    $("weatherWind").textContent=Math.round(c.wind_speed_10m);
    $("precipitation").textContent=num(c.precipitation).toFixed(1);
    $("currentWeatherText").textContent=text;
    $("currentWeatherIcon").textContent=icon;
    $("weatherUpdated").textContent=`LIVE ${c.time.slice(11,16)}`;

    $("forecastCards").innerHTML=d.daily.time.slice(0,3).map((date,i)=>{
      const dt=new Date(`${date}T12:00:00`);
      const day=i===0?"TODAY":dt.toLocaleDateString("en-US",{weekday:"short"}).toUpperCase();
      const [txt,sym]=weatherInfo(d.daily.weather_code[i]);

      return `
        <div class="forecast-card">
          <div class="forecast-day">${day}</div>
          <div class="forecast-date">${date}</div>
          <div class="forecast-symbol">${sym}</div>
          <div class="forecast-range">
            ${Math.round(d.daily.temperature_2m_max[i])}°
            <span class="muted">/ ${Math.round(d.daily.temperature_2m_min[i])}°</span>
          </div>
          <div class="forecast-meta">
            ${txt}<br>
            RAIN ${num(d.daily.precipitation_probability_max[i])}%<br>
            WIND ${Math.round(d.daily.wind_speed_10m_max[i])} km/h
          </div>
        </div>`;
    }).join("");

    log(`Weather updated for ${state.location.name}.`);
  }catch(e){
    console.warn(e);
    $("weatherUpdated").textContent="LINK ERROR";
    $("currentWeatherText").textContent="Weather data unavailable";
    $("forecastCards").innerHTML=`<div class="forecast-card">Could not contact Open-Meteo.</div>`;
    log("Weather link failed.","warn");
  }
}

$("locationForm").addEventListener("submit",async e=>{
  e.preventDefault();

  const q=$("locationInput").value.trim();
  if(q.length<2)return;

  $("locationResults").hidden=false;
  $("locationResults").innerHTML=`<button class="result" type="button">SEARCHING...</button>`;

  try{
    const d=await getJSON(`${GEO}?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
    const results=d.results||[];

    if(!results.length){
      $("locationResults").innerHTML=`<button class="result" type="button">NO LOCATIONS FOUND</button>`;
      return;
    }

    $("locationResults").innerHTML=results.map((x,i)=>`
      <button class="result" data-i="${i}" type="button">
        <strong>${x.name}</strong>
        <small>${[x.admin1,x.country].filter(Boolean).join(", ")}</small>
      </button>`
    ).join("");

    [...$("locationResults").querySelectorAll("[data-i]")].forEach(button=>{
      button.addEventListener("click",()=>{
        const x=results[Number(button.dataset.i)];

        state.location={
          name:x.name,
          country:x.country||"",
          latitude:x.latitude,
          longitude:x.longitude
        };

        $("locationName").textContent=[x.name,x.country].filter(Boolean).join(", ");
        $("locationInput").value="";
        $("locationResults").hidden=true;
        loadWeather();
      });
    });
  }catch(e){
    console.warn(e);
    $("locationResults").innerHTML=`<button class="result" type="button">LOCATION SEARCH FAILED</button>`;
  }
});

document.addEventListener("click",e=>{
  if(!e.target.closest(".location"))$("locationResults").hidden=true;
});

/* ---------------- ROTATING EARTH ---------------- */

function initStars(){
  let seed=1337;
  const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);

  state.stars=Array.from({length:150},()=>({
    x:rand()*canvas.width,
    y:rand()*330,
    s:rand()>.88?2:1,
    p:rand()*Math.PI*2
  }));
}

function drawSky(){
  ctx.fillStyle="#02040b";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  for(const s of state.stars){
    ctx.globalAlpha=.3+.7*(Math.sin(state.tick*.025+s.p)+1)/2;
    ctx.fillStyle=s.s===2?"#d7f7ff":"#687c9c";
    ctx.fillRect(s.x|0,s.y|0,s.s,s.s);
  }

  ctx.globalAlpha=1;
}

function globePoint(lon,lat,rotation,cx,cy,r){
  const latR=lat*Math.PI/180;
  const lonR=(lon+rotation)*Math.PI/180;

  const z=Math.cos(latR)*Math.cos(lonR);
  if(z<=0)return null;

  return {
    x:cx+r*Math.cos(latR)*Math.sin(lonR),
    y:cy-r*Math.sin(latR),
    z
  };
}

/* Simplified continent outlines. More points = much more detailed than v1. */
const continents=[
  [[-168,72],[-155,70],[-145,67],[-136,60],[-126,55],[-122,48],[-114,46],[-106,49],[-97,50],[-88,47],[-82,43],[-76,35],[-81,27],[-89,20],[-98,18],[-107,24],[-114,31],[-123,39],[-135,54],[-150,60]],
  [[-82,12],[-75,10],[-70,5],[-64,-3],[-59,-11],[-55,-20],[-58,-29],[-64,-38],[-70,-47],[-75,-55],[-79,-38],[-76,-25],[-74,-12]],
  [[-10,36],[-4,44],[4,50],[13,55],[23,58],[34,59],[45,55],[55,57],[68,60],[82,58],[96,55],[110,50],[124,50],[138,46],[148,39],[143,31],[132,23],[120,18],[110,10],[102,4],[92,10],[80,18],[72,24],[61,28],[52,32],[42,36],[33,40],[24,38],[16,42],[9,43],[3,40]],
  [[-17,35],[-8,36],[1,35],[12,32],[22,31],[32,27],[40,15],[42,5],[38,-7],[33,-18],[27,-28],[20,-35],[12,-36],[5,-31],[-1,-23],[-5,-12],[-10,0],[-15,13]],
  [[112,-10],[121,-13],[131,-12],[141,-14],[151,-23],[153,-32],[146,-39],[133,-38],[120,-35],[115,-27]],
  [[-52,82],[-39,81],[-27,77],[-23,70],[-30,62],[-42,59],[-53,62],[-60,70]],
  [[47,-13],[50,-18],[51,-24],[47,-27],[44,-21]]
];

function drawContinent(poly,rotation,cx,cy,r){
  const points=poly.map(([lon,lat])=>globePoint(lon,lat,rotation,cx,cy,r));

  ctx.beginPath();
  let drawing=false;

  for(const p of points){
    if(!p){
      drawing=false;
      continue;
    }

    if(!drawing){
      ctx.moveTo(p.x,p.y);
      drawing=true;
    }else{
      ctx.lineTo(p.x,p.y);
    }
  }

  ctx.fillStyle="#26865f";
  ctx.strokeStyle="#8dffc0";
  ctx.lineWidth=1.5;
  ctx.globalAlpha=.86;
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha=1;
}

function drawEarth() {
    const cx = 515, cy = 215, r = 132;

    ctx.beginPath();
    ctx.arc(cx, cy, r + 13, 0, Math.PI * 2);
    ctx.fillStyle = "#47f7ff22";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#0c4f8d";
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    /* Latitude/grid lines */
    ctx.strokeStyle = "#65c9f52b";
    ctx.lineWidth = 1;

    for (const lat of [-60, -30, 0, 30, 60]) {
        const y = cy - r * Math.sin(lat * Math.PI / 180);
        const rx = r * Math.cos(lat * Math.PI / 180);
        ctx.beginPath();
        ctx.ellipse(cx, y, rx, rx * .13, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    for (const lon of [-60, -30, 0, 30, 60]) {
        ctx.beginPath();
        for (let lat = -88; lat <= 88; lat += 4) {
            const p = globePoint(lon, lat, state.rotation, cx, cy, r);
            if (!p) continue;
            if (lat === -88) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    }

    continents.forEach(poly => drawContinent(poly, state.rotation, cx, cy, r));

    /* Independent cloud strips */
    ctx.globalAlpha = .24;
    ctx.strokeStyle = "#e9fbff";
    ctx.lineWidth = 5;

    for (let i = 0; i < 6; i++) {
        const y = cy - 80 + i * 31;
        const x = cx - 110 + ((state.tick * .16 + i * 58) % 220);
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI);
        ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();

    /* Globe depth/shadow */
    const shade = ctx.createRadialGradient(cx - 45, cy - 38, 30, cx, cy, r);
    shade.addColorStop(.48, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,.68)");

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = shade;
    ctx.fill();

    ctx.strokeStyle = "#47f7ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    if (state.kp >= 4 || state.mode === "aurora") {
        ctx.globalAlpha = .6;
        ctx.strokeStyle = state.kp >= 6 ? "#b875ff" : "#64ff9a";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 72, 78, 15, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}

function drawSatellite() {
    const x = 245 + Math.sin(state.tick * .012) * 35;
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
}

function drawSun() {
    ctx.globalAlpha = .18;
    ctx.beginPath();
    ctx.arc(590, 200, 112, 0, Math.PI * 2);
    ctx.fillStyle = "#ff9f43";
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(590, 200, 88, 0, Math.PI * 2);
    ctx.fillStyle = "#ffcc4d";
    ctx.fill();

    ctx.fillStyle = "#9c4d28";
    ctx.fillRect(610, 166, 18, 10);
    ctx.fillRect(548, 220, 22, 12);
}

