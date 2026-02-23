// --- Constants & Global State ---
const API_BASE = 'https://api.open-meteo.com/v1/';
const GEO_API = 'https://geocoding-api.open-meteo.com/v1/';
const AQI_API = 'https://air-quality-api.open-meteo.com/v1/';

let currentUnit = 'C'; // 'C' or 'F'
let tempChartInstance = null;
let mapInstance = null;

// --- DOM Elements ---
const dom = {
    searchBtn: document.getElementById('city-input').parentNode, // Click on container to focus input or add listener to input
    searchInput: document.getElementById('city-input'),
    geoBtn: document.getElementById('geo-btn'),
    unitToggle: document.getElementById('unit-toggle'),
    loadingOverlay: document.getElementById('loading-overlay'),
    errorOverlay: document.getElementById('error-overlay'),
    retryBtn: document.getElementById('retry-btn'),
    body: document.getElementById('body-bg'),

    // Main UI
    cityName: document.getElementById('city-name'),
    dateTime: document.getElementById('date-time'),
    temp: document.getElementById('temperature'),
    condition: document.getElementById('condition'),
    tempMax: document.getElementById('temp-max'),
    tempMin: document.getElementById('temp-min'),
    wind: document.getElementById('wind-speed'),
    humidity: document.getElementById('humidity'),
    feelsLike: document.getElementById('feels-like'),
    pressure: document.getElementById('pressure'),
    iconBg: document.getElementById('weather-icon-bg'),

    // Containers
    forecast: document.getElementById('forecast-container'),

    // Highlights
    sunrise: document.getElementById('sunrise-time'),
    sunset: document.getElementById('sunset-time'),
    uvValue: document.getElementById('uv-value'),
    uvLabel: document.getElementById('uv-label'),
    uvMsg: document.getElementById('uv-msg'),
    aqiValue: document.getElementById('aqi-value'),
    aqiBadge: document.getElementById('aqi-badge'),
    aqiMsg: document.getElementById('aqi-msg'),
};

// --- Helper Functions ---
function getWmoInfo(code, isDay = 1) {
    const codes = {
        0: { day: 'Sunny', night: 'Clear', icon: '01d', bg: 'bg-sunny' },
        1: { day: 'Mainly Clear', night: 'Mainly Clear', icon: '02d', bg: 'bg-cloudy' },
        2: { day: 'Partly Cloudy', night: 'Partly Cloudy', icon: '03d', bg: 'bg-cloudy' },
        3: { day: 'Overcast', night: 'Overcast', icon: '04d', bg: 'bg-cloudy' },
        45: { day: 'Fog', night: 'Fog', icon: '50d', bg: 'bg-cloudy' },
        48: { day: 'Fog', night: 'Fog', icon: '50d', bg: 'bg-cloudy' },
        51: { day: 'Drizzle', night: 'Drizzle', icon: '09d', bg: 'bg-rainy' },
        53: { day: 'Drizzle', night: 'Drizzle', icon: '09d', bg: 'bg-rainy' },
        55: { day: 'Drizzle', night: 'Drizzle', icon: '09d', bg: 'bg-rainy' },
        61: { day: 'Rain', night: 'Rain', icon: '10d', bg: 'bg-rainy' },
        63: { day: 'Rain', night: 'Rain', icon: '10d', bg: 'bg-rainy' },
        65: { day: 'Heavy Rain', night: 'Heavy Rain', icon: '10d', bg: 'bg-rainy' },
        80: { day: 'Rain Showers', night: 'Rain Showers', icon: '09d', bg: 'bg-rainy' },
        81: { day: 'Rain Showers', night: 'Rain Showers', icon: '09d', bg: 'bg-rainy' },
        82: { day: 'Rain Showers', night: 'Rain Showers', icon: '09d', bg: 'bg-rainy' },
        71: { day: 'Snow', night: 'Snow', icon: '13d', bg: 'bg-rainy' },
        73: { day: 'Snow', night: 'Snow', icon: '13d', bg: 'bg-rainy' },
        75: { day: 'Heavy Snow', night: 'Heavy Snow', icon: '13d', bg: 'bg-rainy' },
        95: { day: 'Thunderstorm', night: 'Thunderstorm', icon: '11d', bg: 'bg-rainy' },
        96: { day: 'Thunderstorm', night: 'Thunderstorm', icon: '11d', bg: 'bg-rainy' },
        99: { day: 'Thunderstorm', night: 'Thunderstorm', icon: '11d', bg: 'bg-rainy' },
    };

    const info = codes[code] || codes[0];
    const condition = isDay ? info.day : info.night;
    const iconBase = isDay ? info.icon : info.icon.replace('d', 'n');
    const bg = code > 2 ? 'bg-cloudy' : (isDay ? 'bg-sunny' : 'bg-night');
    // Using OpenWeather icons for consistency
    const iconUrl = `https://openweathermap.org/img/wn/${iconBase}@4x.png`;

    return { condition, icon: iconUrl, bg: info.bg };
}

function formatTime(isoStr, timezone, isShort = false) {
    if (!isoStr) return '--:--';
    const date = new Date(isoStr);
    return date.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

function formatDate(timezone) {
    // Current date in target timezone
    return new Date().toLocaleDateString('en-US', {
        timeZone: timezone,
        weekday: 'long',
        day: 'numeric',
        month: 'short'
    }) + ' | ' + new Date().toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit'
    });
}

function convertTemp(c, unit) {
    if (unit === 'F') return Math.round((c * 9 / 5) + 32);
    return Math.round(c);
}

function toggleLoading(show) {
    if (show) {
        dom.loadingOverlay.classList.remove('hidden');
        dom.errorOverlay.classList.add('hidden');
    } else {
        dom.loadingOverlay.classList.add('hidden');
    }
}

function toggleError(show) {
    dom.loadingOverlay.classList.add('hidden');
    if (show) {
        dom.errorOverlay.classList.remove('hidden');
    } else {
        dom.errorOverlay.classList.add('hidden');
    }
}

// --- Main Logic ---

async function fetchWeatherData(lat, lon, name) {
    toggleLoading(true);

    try {
        // 1. Fetch Weather (Current, Hourly, Daily)
        const weatherUrl = `${API_BASE}forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,surface_pressure,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,pressure_msl,wind_speed_10m,weather_code,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=8`;
        const weatherRes = await fetch(weatherUrl);
        if (!weatherRes.ok) throw new Error('Weather API Error');
        const weatherData = await weatherRes.json();

        // 2. Fetch AQI (Separate API)
        let aqiData = null;
        try {
            const aqiUrl = `${AQI_API}air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi&hourly=us_aqi&timezone=auto&forecast_days=7`;
            const aqiRes = await fetch(aqiUrl);
            if (aqiRes.ok) aqiData = await aqiRes.json();
        } catch (e) {
            console.warn('AQI fetch failed', e);
        }

        // 3. Cache & Update UI
        lastDataCache = { weather: weatherData, aqi: aqiData, name: name };

        dom.cityName.innerHTML = name;
        selectDay(0);
        toggleLoading(false);

    } catch (error) {
        console.error(error);
        toggleError(true);
    }
}

// Global variable for selected day
let selectedDayIndex = 0;

function updateDashboard(data, aqiData, cityName) {
    // Kept for compatibility if called elsewhere, but we map to selectDay
    dom.cityName.innerHTML = cityName;
    selectDay(0);
}

function selectDay(index) {
    if (!lastDataCache || !lastDataCache.weather) return;

    const data = lastDataCache.weather;
    const aqiData = lastDataCache.aqi;
    const current = data.current;
    const daily = data.daily;
    const hourly = data.hourly;
    const timezone = data.timezone;
    const name = lastDataCache.name;

    selectedDayIndex = index;

    // Update City Name / Back button
    dom.cityName.innerHTML = name + (index !== 0 ? ` <button onclick="selectDay(0)" class="text-sm bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full hover:bg-blue-500/40 transition-colors ml-3 cursor-pointer"><i class="fas fa-undo mr-1"></i> Today</button>` : '');

    if (index === 0) {
        // 1. Header & Current Weather
        dom.dateTime.textContent = formatDate(timezone);

        const wmo = getWmoInfo(current.weather_code, current.is_day);
        dom.condition.textContent = wmo.condition;
        dom.iconBg.src = wmo.icon;
        dom.temp.textContent = convertTemp(current.temperature_2m, currentUnit);

        // Color Theme
        dom.body.className = `bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 min-h-screen text-white font-sans transition-all duration-500 ease-in-out selection:bg-blue-500 selection:text-white ${wmo.bg.replace('bg-', 'theme-')}`;

        // Details
        dom.wind.textContent = `${current.wind_speed_10m} km/h`;
        dom.humidity.textContent = `${current.relative_humidity_2m}%`;
        dom.feelsLike.textContent = `${convertTemp(current.apparent_temperature, currentUnit)}°`;
        dom.pressure.textContent = `${current.pressure_msl || current.surface_pressure} hPa`;
    } else {
        const [year, month, day] = daily.time[index].split('-');
        const date = new Date(year, month - 1, day);
        dom.dateTime.textContent = date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });

        const wmo = getWmoInfo(daily.weather_code[index], 1);
        dom.condition.textContent = wmo.condition;
        dom.iconBg.src = wmo.icon;

        const noonIndex = index * 24 + 12;
        if (hourly.temperature_2m && hourly.temperature_2m[noonIndex] !== undefined) {
            dom.temp.textContent = convertTemp(hourly.temperature_2m[noonIndex], currentUnit);

            // The other noon details:
            if (hourly.wind_speed_10m && hourly.wind_speed_10m[noonIndex] !== undefined) {
                dom.wind.textContent = `${hourly.wind_speed_10m[noonIndex]} km/h`;
                dom.humidity.textContent = `${hourly.relative_humidity_2m[noonIndex]}%`;
                dom.feelsLike.textContent = `${convertTemp(hourly.apparent_temperature[noonIndex], currentUnit)}°`;
                dom.pressure.textContent = `${hourly.pressure_msl[noonIndex]} hPa`;
            }
        } else {
            // Fallback to max temp if hourly data is missing for some reason
            dom.temp.textContent = convertTemp(daily.temperature_2m_max[index], currentUnit);
        }
    }

    // Both
    dom.tempMax.textContent = convertTemp(daily.temperature_2m_max[index], currentUnit);
    dom.tempMin.textContent = convertTemp(daily.temperature_2m_min[index], currentUnit);

    // 2. Forecast
    renderForecast(daily, index);

    // 3. Hourly Chart
    renderHourlyChart(hourly, index);

    // 4. Highlights
    renderSun(daily.sunrise[index], daily.sunset[index], timezone);
    renderUV(hourly, index);
    renderAQI(aqiData, index);

    if (index === 0) {
        renderMap(data.latitude, data.longitude);
    }
}

function renderForecast(daily, selectedIndex = 0) {
    dom.forecast.innerHTML = '';

    for (let i = 0; i < 7; i++) { // Current day + next 6
        if (!daily.time[i]) break;

        const [year, month, day] = daily.time[i].split('-');
        const date = new Date(year, month - 1, day);
        let dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        if (i === 0) dayName = "Today";

        const wmo = getWmoInfo(daily.weather_code[i]);
        const max = convertTemp(daily.temperature_2m_max[i], currentUnit);
        const min = convertTemp(daily.temperature_2m_min[i], currentUnit);

        const card = document.createElement('div');
        card.className = `flex items-center justify-between p-3 rounded-xl transition-colors cursor-pointer ${i === selectedIndex ? 'bg-white/20 border border-white/20 shadow-md' : 'hover:bg-white/5 border border-transparent'}`;
        card.onclick = () => selectDay(i);
        card.innerHTML = `
            <span class="w-16 font-medium text-gray-300">${dayName}</span>
            <div class="flex items-center gap-2">
                <img src="${wmo.icon}" class="w-8 h-8" alt="icon">
                <span class="text-xs text-gray-400 hidden md:block">${wmo.condition}</span>
            </div>
            <div class="flex gap-3 font-medium">
                <span>${max}°</span>
                <span class="text-gray-500">${min}°</span>
            </div>
        `;
        dom.forecast.appendChild(card);
    }
}

function renderHourlyChart(hourly, dayIndex = 0) {
    const ctx = document.getElementById('hourly-chart').getContext('2d');

    let startIndex = dayIndex * 24;
    let endIndex = startIndex + 24;

    if (dayIndex === 0) {
        const now = new Date();
        const currentHour = now.getHours();
        startIndex = currentHour;
        endIndex = currentHour + 24;
    }

    const labels = [];
    const data = [];
    const conditions = [];

    for (let i = startIndex; i < endIndex; i++) {
        if (!hourly.time[i]) break;
        const t = new Date(hourly.time[i]);
        data.push(convertTemp(hourly.temperature_2m[i], currentUnit));

        // Estimate day vs night
        const isDayFlag = (t.getHours() >= 6 && t.getHours() < 18) ? 1 : 0;
        const wmo = getWmoInfo(hourly.weather_code[i] || 0, isDayFlag);
        conditions.push(wmo.condition);

        let iconStr = isDayFlag ? '🌤️' : '🌙☁️';
        if (wmo.condition.includes('Rain') || wmo.condition.includes('Drizzle')) iconStr = '🌧️';
        else if (wmo.condition.includes('Thunderstorm')) iconStr = '⛈️';
        else if (wmo.condition.includes('Snow')) iconStr = '❄️';
        else if (wmo.condition.includes('Fog')) iconStr = '🌫️';
        else if (wmo.condition === 'Clear' || wmo.condition === 'Sunny' || wmo.condition === 'Mainly Clear') iconStr = isDayFlag ? '☀️' : '🌙';
        else if (wmo.condition.includes('Cloud')) iconStr = isDayFlag ? '☁️' : '☁️';

        labels.push(`${t.toLocaleTimeString('en-US', { hour: 'numeric' })} ${iconStr}`);
    }

    if (tempChartInstance) tempChartInstance.destroy();

    tempChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Temp',
                data: data,
                borderColor: '#60a5fa', // Blue-400
                backgroundColor: (context) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, 'rgba(96, 165, 250, 0.4)');
                    gradient.addColorStop(1, 'rgba(96, 165, 250, 0)');
                    return gradient;
                },
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#60a5fa',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: '#fff',
                    bodyColor: '#e2e8f0',
                    displayColors: false,
                    callbacks: {
                        label: (ctx) => {
                            return `${ctx.parsed.y}° - ${conditions[ctx.dataIndex]}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', maxTicksLimit: 8 }
                },
                y: {
                    display: false,
                    grid: { display: false } // clean look
                }
            }
        }
    });
}

function renderSun(sunrise, sunset, timezone) {
    const canvas = document.getElementById('sun-chart');
    const ctx = canvas.getContext('2d');

    // Fix resolution
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // Time calcs
    const now = new Date();
    const sr = new Date(sunrise);
    const ss = new Date(sunset);

    // Convert all to minutes from midnight
    const getMins = (d) => d.getHours() * 60 + d.getMinutes();
    const nowMins = getMins(new Date(now.toLocaleString('en-US', { timeZone: timezone })));
    // Note: This timezone conversion approximation works because we just want relative progress
    // BUT converting date strings to Date objects defaults to local timezone if not careful.
    // OpenMeteo returns ISO8601 full strings attached to timezone usually, or local time string.
    // Actually API returns local time string "YYYY-MM-DDTHH:MM".
    // Let's assume input string is correct local time and just parse hours.

    const parseMins = (iso) => {
        const [_, t] = iso.split('T');
        const [hh, mm] = t.split(':').map(Number);
        return hh * 60 + mm;
    };

    const srM = parseMins(sunrise);
    const ssM = parseMins(sunset);

    // Calculate current time in target timezone manually to be safe
    const nowDateInTz = new Date().toLocaleString('en-US', { timeZone: timezone, hour12: false });
    // "MM/DD/YYYY, HH:MM:SS"
    const [__, timePart] = nowDateInTz.split(', ');
    const [nH, nM] = timePart.split(':').map(Number);
    const curM = nH * 60 + nM;

    // Progress
    let progress = 0;
    if (curM > srM && curM < ssM) {
        progress = (curM - srM) / (ssM - srM);
    } else if (curM >= ssM) {
        progress = 1;
    }

    // Draw Arc
    const cx = w / 2;
    const cy = h - 10;
    const r = Math.min(w / 2, h) - 10;

    // Track
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Progress Arc
    const angle = Math.PI + (progress * Math.PI);
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, angle);
    ctx.strokeStyle = '#facc15'; // Yellow-400
    ctx.lineWidth = 3;
    ctx.stroke();

    // Sun Icon
    const sx = cx + Math.cos(angle) * r;
    const sy = cy + Math.sin(angle) * r;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#facc15';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 10;
    ctx.fill();

    // Text Labels
    dom.sunrise.textContent = formatTime(sunrise, timezone);
    dom.sunset.textContent = formatTime(sunset, timezone);
}

function renderGauge(canvasId, value, max, colorFn) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h - 5;
    const r = Math.min(w / 2, h) - 10;

    // Bg
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Value
    const pct = Math.min(Math.max(value / max, 0), 1);
    const angle = Math.PI + (pct * Math.PI);

    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, angle);
    ctx.strokeStyle = colorFn(value);
    ctx.stroke();
}

function renderUV(hourly, dayIndex = 0) {
    let uvIndex = 0;
    if (dayIndex === 0) {
        const now = new Date().getHours();
        uvIndex = now;
    } else {
        uvIndex = dayIndex * 24 + 12; // Noon UV for future days
    }

    const uv = hourly.uv_index[uvIndex] || 0;

    // Color Logic
    const getColor = (v) => {
        if (v <= 2) return '#4ade80';
        if (v <= 5) return '#facc15';
        if (v <= 7) return '#fb923c';
        if (v <= 10) return '#f87171';
        return '#c084fc';
    };

    renderGauge('uv-gauge', uv, 11, getColor);

    dom.uvValue.textContent = uv;

    let label = 'Low';
    let msg = 'Safe';
    if (uv > 2) { label = 'Moderate'; msg = 'Seek Shade'; }
    if (uv > 5) { label = 'High'; msg = 'Wear Hat'; }
    if (uv > 7) { label = 'Very High'; msg = 'Use Sunscreen'; }
    if (uv > 10) { label = 'Extreme'; msg = 'Avoid Sun'; }

    dom.uvLabel.textContent = label;
    dom.uvLabel.style.color = getColor(uv);
    dom.uvMsg.textContent = msg;
}

function renderAQI(data, dayIndex = 0) {
    // Handling missing AQI gracefully
    let aqi = 0;
    const exists = !!data;

    if (exists) {
        if (dayIndex === 0 && data.current) {
            aqi = data.current.us_aqi;
        } else if (data.hourly && data.hourly.us_aqi) {
            // Take the max AQI for the given day to be safe/representative
            let startIndex = dayIndex * 24;
            let endIndex = startIndex + 24;
            let dayAqiValues = data.hourly.us_aqi.slice(startIndex, endIndex).filter(v => v !== null);
            if (dayAqiValues.length > 0) {
                aqi = Math.max(...dayAqiValues);
            }
        }
    }

    const getColor = (v) => {
        if (v <= 50) return '#4ade80'; // Good
        if (v <= 100) return '#facc15'; // Moderate
        if (v <= 150) return '#fb923c'; // Unhealthy Sensitive
        if (v <= 200) return '#f87171'; // Unhealthy
        if (v <= 300) return '#a855f7'; // Very Unhealthy
        return '#7e22ce'; // Hazardous
    };

    if (exists) {
        renderGauge('aqi-gauge', aqi, 300, getColor);
        dom.aqiValue.textContent = aqi;
        let label = 'Good';
        if (aqi > 50) label = 'Moderate';
        if (aqi > 100) label = 'Bad';
        if (aqi > 150) label = 'Unhealthy';
        if (aqi > 200) label = 'Very Unhealthy';
        if (aqi > 300) label = 'Hazardous';

        dom.aqiBadge.textContent = label;
        dom.aqiBadge.className = 'px-2 py-1 text-xs font-bold rounded-md';

        const badgeColor = getColor(aqi);
        dom.aqiBadge.style.color = badgeColor;
        // Semi-transparent background using rgba representation if possible, but simplest is just solid or border:
        dom.aqiBadge.style.backgroundColor = badgeColor + '33'; // 33 hex = 20% opacity

        dom.aqiMsg.textContent = 'US AQI';
    } else {
        dom.aqiValue.textContent = '--';
        dom.aqiBadge.textContent = 'N/A';
        dom.aqiBadge.className = 'px-2 py-1 text-xs font-bold rounded-md bg-gray-500/20 text-gray-400';
        dom.aqiBadge.style.color = '';
        dom.aqiBadge.style.backgroundColor = '';
        dom.aqiMsg.textContent = 'Data Unavailable';
    }
}

function renderMap(lat, lon) {
    const el = document.getElementById('map');
    if (!mapInstance) {
        mapInstance = L.map(el, {
            zoomControl: false,
            attributionControl: false,
            scrollWheelZoom: false,
            dragging: false
        }).setView([lat, lon], 8);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(mapInstance);

        L.tileLayer('https://tile.rainviewer.com/1/nowcast_480/{z}/{x}/{y}/2/1_1.png', {
            opacity: 0.6
        }).addTo(mapInstance);
    } else {
        mapInstance.setView([lat, lon], 8);
    }
}


// --- Global State ---
let lastDataCache = null;

// --- Event Listeners ---
dom.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        fetchGeocoding(dom.searchInput.value.trim());
    }
});

dom.geoBtn.addEventListener('click', () => {
    if (navigator.geolocation) {
        toggleLoading(true);
        navigator.geolocation.getCurrentPosition(pos => {
            // Reverse Geo
            fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&localityLanguage=en`)
                .then(r => r.json())
                .then(d => {
                    const name = d.city || d.locality || "My Location";
                    fetchWeatherData(pos.coords.latitude, pos.coords.longitude, name);
                })
                .catch(() => {
                    fetchWeatherData(pos.coords.latitude, pos.coords.longitude, "My Location");
                });
        }, () => {
            alert('Location access denied. Please ensure you have allowed location permissions in your browser settings.');
            toggleLoading(false);
        });
    }
});

dom.unitToggle.addEventListener('click', () => {
    currentUnit = currentUnit === 'C' ? 'F' : 'C';
    dom.unitToggle.textContent = '°' + currentUnit;
    if (lastDataCache) {
        selectDay(selectedDayIndex);
    }
});

dom.retryBtn.addEventListener('click', () => {
    toggleError(false);
    dom.searchInput.focus();
});

async function fetchGeocoding(query) {
    if (!query) return;
    toggleLoading(true);

    try {
        const res = await fetch(`${GEO_API}search?name=${query}&count=1&language=en&format=json`);
        const data = await res.json();

        if (!data.results || data.results.length === 0) {
            throw new Error('City Not Found');
        }

        const loc = data.results[0];
        // Wrapper to cache
        fetchWeatherData(loc.latitude, loc.longitude, loc.name);

    } catch (e) {
        console.error(e);
        toggleError(true);
    }
}

// Init
fetchWeatherData(30.7333, 76.7794, 'Chandigarh'); // Default
