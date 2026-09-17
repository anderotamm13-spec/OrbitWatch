# OrbitWatch

**Pocket space weather.** A retro pixel-art dashboard that pulls live space weather from NOAA SWPC and local ground weather from Open-Meteo, and puts both on one screen through an animated spacecraft-style interface.

🛰️ **Live demo:** [orbit-watch-beta.vercel.app](https://orbit-watch-beta.vercel.app/)

---

## What it does

OrbitWatch answers two questions at a glance: *what is the sun doing right now*, and *should I go outside and look up*.

**Space weather (NOAA SWPC)**
- **Kp index** with a plain-language severity label
- **Solar wind speed** in km/s
- **Bz** — interplanetary magnetic field orientation in nT, the number that decides whether a storm actually couples to Earth
- **Aurora probability** for your location
- **Geomagnetic status** readout with current storm conditions
- **24-hour Kp trace** so you can see whether things are ramping up or settling down

**Ground weather (Open-Meteo)**
- Current temperature, feels-like, humidity, wind, and precipitation
- 3-day forecast
- Location search with geocoding, so you can check conditions anywhere

**Viewer panels**
- `[1] EARTH` — planetary view
- `[2] SUN` — solar imagery
- `[3] AURORA` — auroral oval forecast
- `[4] SATELLITE` — satellite view

**Plus**
- Live UTC mission clock
- Scrolling mission log of telemetry events
- Manual `REFRESH ALL` for when you don't want to wait for the next poll

---

## Data sources

| Source | Used for | Auth |
| --- | --- | --- |
| [NOAA SWPC](https://services.swpc.noaa.gov/) | Kp index, solar wind, Bz, aurora forecast, storm status | None — public JSON |
| [Open-Meteo](https://open-meteo.com/) | Current conditions, 3-day forecast, geocoding | None — free tier, no key |

Both APIs are keyless, so the app runs with zero configuration.

---

## Use it

Go to **[orbit-watch-beta.vercel.app](https://orbit-watch-beta.vercel.app/)**. Nothing to install.

## Tech

Plain HTML/CSS/JS — no framework, no build step. Hosted on [Vercel](https://vercel.com).

---

## Notes and caveats

- **Nothing here is operational.** Space weather data is unvalidated and delivered as-is. Don't fly anything, ground anything, or plan a power grid around it.
- NOAA SWPC endpoints update on their own cadence (minutes for solar wind, longer for forecast products), so a refresh won't always produce new numbers.
- Aurora visibility depends on far more than Kp — cloud cover, moon phase, light pollution, and your magnetic latitude all matter. A high Kp is an invitation, not a promise.
- Open-Meteo's free tier is rate limited. Heavy refreshing will throttle you.

---

## Roadmap

- [ ] Browser notifications on Kp threshold crossings
- [ ] Longer historical Kp window (7d / 30d)
- [ ] Saved locations
- [ ] Offline cache of the last good telemetry packet
- [ ] X-ray flux and proton event panels

---

## License

MIT

---

<sub>SPACE: NOAA SWPC // WEATHER: OPEN-METEO — ORBITWATCH v2.0</sub>