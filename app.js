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

    // AI Tour Planner
    aiBtn: document.getElementById('ai-plan-btn'),
    aiBtnMobile: document.getElementById('ai-plan-btn-mobile'),
    tourModal: document.getElementById('tour-modal'),
    tourModalContent: document.getElementById('tour-modal-content'),
    closeTourBtn: document.getElementById('close-tour-btn'),
    tourCityName: document.getElementById('tour-city-name'),
    tourItinerary: document.getElementById('tour-itinerary-container'),
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
        dom.body.className = `bg-black min-h-screen text-white font-sans transition-all duration-500 ease-in-out selection:bg-blue-500 selection:text-white`;

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

    // 5. Background Animations
    updateWeatherAnimation(daily.weather_code[index], index === 0 ? current.is_day : 1);
}

const WEATHER_BACKGROUNDS = {
    sunny: 'https://images.unsplash.com/photo-1622278647429-71bc97e904e8?q=80&w=1920&auto=format&fit=crop',
    clear_night: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1920&auto=format&fit=crop',
    cloudy: 'https://images.unsplash.com/photo-1611928482473-7b27d24eab80?q=80&w=1920&auto=format&fit=crop',
    cloudy_night: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1920&auto=format&fit=crop',
    rainy: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?q=80&w=1920&auto=format&fit=crop',
    snowy: 'https://images.unsplash.com/photo-1478265409131-1f65c88f965c?q=80&w=1920&auto=format&fit=crop',
    thunderstorm: 'https://images.unsplash.com/photo-1605727216801-e27ce1d0ce18?q=80&w=1920&auto=format&fit=crop',
    default: 'https://images.unsplash.com/photo-1504608524841-42ce6c20b0fa?q=80&w=1920&auto=format&fit=crop'
};

function updateWeatherAnimation(weatherCode, isDay) {
    const wmo = getWmoInfo(weatherCode, isDay);
    const condition = wmo.condition.toLowerCase();

    // 1. Update Background Picture
    const bgImage = document.getElementById('bg-image');
    if (bgImage) {
        let bgUrl = WEATHER_BACKGROUNDS.default;

        if (condition.includes('thunderstorm')) {
            bgUrl = WEATHER_BACKGROUNDS.thunderstorm;
        } else if (condition.includes('snow')) {
            bgUrl = WEATHER_BACKGROUNDS.snowy;
        } else if (condition.includes('rain') || condition.includes('drizzle')) {
            bgUrl = WEATHER_BACKGROUNDS.rainy;
        } else if (condition.includes('cloud') || condition.includes('overcast') || condition.includes('fog')) {
            bgUrl = isDay ? WEATHER_BACKGROUNDS.cloudy : WEATHER_BACKGROUNDS.cloudy_night;
        } else if (condition.includes('sunny') || condition.includes('clear')) {
            bgUrl = isDay ? WEATHER_BACKGROUNDS.sunny : WEATHER_BACKGROUNDS.clear_night;
        }

        bgImage.style.backgroundImage = `url('${bgUrl}')`;
    }

    // 2. CSS Element Animations
    const container = document.getElementById('weather-animations');
    if (!container) return;

    container.innerHTML = ''; // Clear previous

    // The variables below were already declared at the top of the function

    // Night Stars
    if (!isDay && !condition.includes('overcast') && !condition.includes('rain') && !condition.includes('snow') && !condition.includes('thunderstorm') && !condition.includes('fog')) {
        const starCount = 60;
        for (let i = 0; i < starCount; i++) {
            const star = document.createElement('div');
            star.className = 'star';
            const size = Math.random() * 2 + 1;
            star.style.width = `${size}px`;
            star.style.height = `${size}px`;
            star.style.left = `${Math.random() * 100}vw`;
            star.style.top = `${Math.random() * 100}vh`;
            star.style.animationDelay = `${Math.random() * 2}s`;
            star.style.animationDuration = `${Math.random() * 2 + 2}s`;
            container.appendChild(star);
        }
    }

    // Sunny Day
    if (isDay && (condition === 'sunny' || condition === 'clear' || condition === 'mainly clear')) {
        const sun = document.createElement('div');
        sun.className = 'weather-sun';
        container.appendChild(sun);
    }

    // Rain
    if (condition.includes('rain') || condition.includes('drizzle')) {
        const dropCount = condition.includes('heavy') ? 120 : 60;
        for (let i = 0; i < dropCount; i++) {
            const drop = document.createElement('div');
            drop.className = 'raindrop';
            drop.style.left = `${Math.random() * 120 - 10}vw`; // Spread out to account for slant
            drop.style.animationDelay = `${Math.random() * 1}s`;
            drop.style.animationDuration = `${Math.random() * 0.3 + 0.5}s`;
            container.appendChild(drop);
        }
    }

    // Snow
    if (condition.includes('snow')) {
        const flakeCount = condition.includes('heavy') ? 150 : 80;
        for (let i = 0; i < flakeCount; i++) {
            const flake = document.createElement('div');
            flake.className = 'snowflake';
            const size = Math.random() * 4 + 2;
            flake.style.width = `${size}px`;
            flake.style.height = `${size}px`;
            flake.style.left = `${Math.random() * 100}vw`;
            flake.style.animationDelay = `${Math.random() * 5}s, ${Math.random() * 3}s`; // Fall, Sway delays
            flake.style.animationDuration = `${Math.random() * 3 + 4}s, ${Math.random() * 2 + 2}s`; // Fall, Sway durations
            flake.style.opacity = Math.random() * 0.5 + 0.3;
            container.appendChild(flake);
        }
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

// --- AI Tour Planner Logic ---
function initTourPlanner() {
    const openModal = () => {
        if (!lastDataCache) {
            alert('Please search for a city first to get a tour plan.');
            return;
        }

        // Populate Data
        dom.tourCityName.textContent = lastDataCache.name;
        generateTourPlan();

        // Show Modal
        dom.tourModal.classList.remove('hidden');
        // Small timeout for transition
        setTimeout(() => {
            dom.tourModal.classList.add('modal-show');
            dom.tourModalContent.classList.add('modal-content-show');
        }, 10);
        document.body.style.overflow = 'hidden'; // Prevent bg scrolling
    };

    const closeModal = () => {
        dom.tourModal.classList.remove('modal-show');
        dom.tourModalContent.classList.remove('modal-content-show');

        setTimeout(() => {
            dom.tourModal.classList.add('hidden');
            document.body.style.overflow = '';
        }, 300); // match transition duration
    };

    dom.aiBtn.addEventListener('click', openModal);
    if (dom.aiBtnMobile) dom.aiBtnMobile.addEventListener('click', openModal);
    dom.closeTourBtn.addEventListener('click', closeModal);

    // Close on backdrop click
    dom.tourModal.addEventListener('click', (e) => {
        if (e.target === dom.tourModal) {
            closeModal();
        }
    });
}

function generateTourPlan() {
    const data = lastDataCache.weather;
    const daily = data.daily;
    const city = lastDataCache.name;

    dom.tourItinerary.innerHTML = '';

    // Generate for next 3 days
    for (let i = 0; i < 3; i++) {
        if (!daily.time[i]) break;

        const [year, month, day] = daily.time[i].split('-');
        const date = new Date(year, month - 1, day);
        let dayName = i === 0 ? "Today" : (i === 1 ? "Tomorrow" : date.toLocaleDateString('en-US', { weekday: 'long' }));

        const weatherCode = daily.weather_code[i];
        const maxTemp = convertTemp(daily.temperature_2m_max[i], currentUnit);
        const wmo = getWmoInfo(weatherCode, 1);
        const condition = wmo.condition.toLowerCase();

        // Determine AI Suggestions based on condition
        let suggestion = "";
        let iconHtml = "";
        let themeColor = "border-blue-500/30";

        if (condition.includes('rain') || condition.includes('drizzle') || condition.includes('thunderstorm')) {
            themeColor = "border-indigo-500/30";
            iconHtml = `<div class="p-3 bg-indigo-500/20 rounded-xl text-indigo-400"><i class="fas fa-umbrella text-xl"></i></div>`;
            suggestion = `
                <div class="mb-2 text-sm text-gray-200">It's going to be rainy (${wmo.condition}). Perfect day for indoor activities in ${city}!</div>
                <ul class="list-disc pl-5 text-sm text-gray-300 space-y-1">
                    <li>Visit local museums or art galleries first thing in the morning.</li>
                    <li>Enjoy an indoor shopping spree at renowned malls or covered markets.</li>
                    <li>Have a cozy, warm lunch at a highly-rated indoor cafe.</li>
                    <li>Check out an evening theater performance or indoor entertainment center.</li>
                </ul>
            `;
        } else if (condition.includes('snow')) {
            themeColor = "border-sky-500/30";
            iconHtml = `<div class="p-3 bg-sky-500/20 rounded-xl text-sky-400"><i class="fas fa-snowflake text-xl"></i></div>`;
            suggestion = `
                <div class="mb-2 text-sm text-gray-200">Snowy weather expected (${wmo.condition}). Embrace the winter magic!</div>
                <ul class="list-disc pl-5 text-sm text-gray-300 space-y-1">
                    <li>Hit the nearby ski slopes or enjoy a morning of snowshoeing if applicable.</li>
                    <li>Build a snowman or have a snowball fight in a local ${city} park.</li>
                    <li>Warm up with hot chocolate and a hearty meal at a local tavern.</li>
                    <li>Attend a winter festival or enjoy an indoor spa session.</li>
                </ul>
            `;
        } else if (condition.includes('clear') || condition.includes('sunny') || condition.includes('mainly clear')) {
            themeColor = "border-yellow-500/30";
            iconHtml = `<div class="p-3 bg-yellow-500/20 rounded-xl text-yellow-500"><i class="fas fa-sun text-xl"></i></div>`;
            suggestion = `
                <div class="mb-2 text-sm text-gray-200">Beautiful sunny weather (${wmo.condition}). Maximize your outdoor time!</div>
                <ul class="list-disc pl-5 text-sm text-gray-300 space-y-1">
                    <li>Start early with a scenic hike or walking tour of ${city}'s famous landmarks.</li>
                    <li>Rent a bike or take a boat tour if near the water.</li>
                    <li>Enjoy a nice picnic or al fresco dining for lunch.</li>
                    <li>Catch the sunset at a prominent viewpoint, followed by a lively outdoor evening market.</li>
                </ul>
            `;
        } else {
            // Cloudy/Fog/Other
            themeColor = "border-gray-400/30";
            iconHtml = `<div class="p-3 bg-gray-500/20 rounded-xl text-gray-300"><i class="fas fa-cloud text-xl"></i></div>`;
            suggestion = `
                <div class="mb-2 text-sm text-gray-200">It's looking cloudy (${wmo.condition}). A great day for a mix of activities!</div>
                <ul class="list-disc pl-5 text-sm text-gray-300 space-y-1">
                    <li>Explore the city streets and historical districts without the intense sun.</li>
                    <li>Do a local food tour across different districts in ${city}.</li>
                    <li>Visit botanical gardens or architectural landmarks.</li>
                    <li>End the day with local street food or a casual dinner by the city center.</li>
                </ul>
            `;
        }

        // Build Day Card
        const card = document.createElement('div');
        card.className = `glass-card p-5 rounded-2xl border-l-4 ${themeColor} relative overflow-hidden`;

        card.innerHTML = `
            <div class="flex items-start justify-between mb-3 border-b border-white/5 pb-3">
                <div class="flex items-center gap-3">
                    ${iconHtml}
                    <div>
                        <h4 class="font-bold text-lg">${dayName} <span class="text-xs font-normal text-gray-400 ml-2">${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></h4>
                        <p class="text-xs text-blue-300 font-medium">High: ${maxTemp}°</p>
                    </div>
                </div>
            </div>
            <div class="mt-2">
                ${suggestion}
            </div>
        `;

        dom.tourItinerary.appendChild(card);
    }
}

// --- Indian States Weather Feature ---
const INDIAN_STATES = [
    { name: 'Andhra Pradesh', lat: 16.5062, lon: 80.6480 },
    { name: 'Arunachal Pradesh', lat: 27.0844, lon: 93.6053 },
    { name: 'Assam', lat: 26.1433, lon: 91.7898 },
    { name: 'Bihar', lat: 25.5941, lon: 85.1376 },
    { name: 'Chhattisgarh', lat: 21.2514, lon: 81.6296 },
    { name: 'Goa', lat: 15.4909, lon: 73.8278 },
    { name: 'Gujarat', lat: 23.2156, lon: 72.6369 },
    { name: 'Haryana', lat: 30.7333, lon: 76.7794 },
    { name: 'Himachal Pradesh', lat: 31.1048, lon: 77.1734 },
    { name: 'Jharkhand', lat: 23.3441, lon: 85.3096 },
    { name: 'Karnataka', lat: 12.9716, lon: 77.5946 },
    { name: 'Kerala', lat: 8.5241, lon: 76.9366 },
    { name: 'Madhya Pradesh', lat: 23.2599, lon: 77.4126 },
    { name: 'Maharashtra', lat: 19.0760, lon: 72.8777 },
    { name: 'Manipur', lat: 24.8170, lon: 93.9368 },
    { name: 'Meghalaya', lat: 25.5788, lon: 91.8933 },
    { name: 'Mizoram', lat: 23.7271, lon: 92.7176 },
    { name: 'Nagaland', lat: 25.6751, lon: 94.1086 },
    { name: 'Odisha', lat: 20.2961, lon: 85.8245 },
    { name: 'Punjab', lat: 31.1471, lon: 75.3412 },
    { name: 'Rajasthan', lat: 26.9124, lon: 75.7873 },
    { name: 'Sikkim', lat: 27.3389, lon: 88.6065 },
    { name: 'Tamil Nadu', lat: 13.0827, lon: 80.2707 },
    { name: 'Telangana', lat: 17.3850, lon: 78.4867 },
    { name: 'Tripura', lat: 23.8315, lon: 91.2868 },
    { name: 'Uttar Pradesh', lat: 26.8467, lon: 80.9462 },
    { name: 'Uttarakhand', lat: 30.3165, lon: 78.0322 },
    { name: 'West Bengal', lat: 22.5726, lon: 88.3639 },
    { name: 'Delhi', lat: 28.6139, lon: 77.2090 },
    { name: 'Jammu & Kashmir', lat: 34.0837, lon: 74.7973 }
];

async function fetchIndiaWeather() {
    const lats = INDIAN_STATES.map(s => s.lat).join(',');
    const lons = INDIAN_STATES.map(s => s.lon).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code,is_day&timezone=Asia/Kolkata`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const container = document.getElementById('india-states-container');
        if (!container) return;

        container.innerHTML = ''; // Clear

        INDIAN_STATES.forEach((state, index) => {
            const stateData = data[index].current;
            const wmo = getWmoInfo(stateData.weather_code, stateData.is_day);
            const temp = Math.round(stateData.temperature_2m);

            // Build Card HTML
            const card = document.createElement('div');
            card.className = 'glass-card min-w-[140px] flex-shrink-0 p-4 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/20 transition-all border border-white/10 shadow-lg';

            card.innerHTML = `
                <h4 class="font-bold text-sm text-center mb-1 drop-shadow" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;" title="${state.name}">${state.name}</h4>
                <img src="${wmo.icon}" alt="${wmo.condition}" class="w-12 h-12 drop-shadow-md my-1" />
                <div class="text-2xl font-bold drop-shadow">${temp}°C</div>
                <div class="text-xs text-gray-300 text-center drop-shadow mt-1">${wmo.condition}</div>
            `;

            // Click to load specific state weather globally
            card.addEventListener('click', () => {
                fetchWeatherData(state.lat, state.lon, state.name);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });

            container.appendChild(card);
        });

    } catch (e) {
        console.error("Error fetching Indian States weather: ", e);
    }
}

// Init
initTourPlanner();
fetchWeatherData(30.7333, 76.7794, 'Chandigarh'); // Default
fetchIndiaWeather(); // Load all states at the bottom
