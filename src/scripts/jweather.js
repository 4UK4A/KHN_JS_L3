const API_KEY = 'YOUR_API_KEY'; // Replace with your OpenWeatherMap API key
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

// Get DOM elements
const cityInput = document.getElementById('cityInput');
const searchButton = document.getElementById('searchButton');
const currentWeather = document.getElementById('currentWeather');
const forecast = document.getElementById('forecast');
const suggestionsDiv = document.getElementById('suggestions');

// Функція для показу/приховання індикатора завантаження
function toggleLoader(show, message = 'Завантаження...') {
    let loader = document.querySelector('.loader-container');
    
    if (show) {
        if (!loader) {
            loader = document.createElement('div');
            loader.className = 'loader-container fade-in';
            loader.innerHTML = `
                <div class="loader"></div>
                <div class="loader-text">${message}</div>
            `;
            document.body.appendChild(loader);
        }
    } else if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => loader.remove(), 300);
    }
}

// Replace cityCoordinates object with getCityCoordinates function
const getCityCoordinates = async (cityName) => {
    toggleLoader(true, 'Пошук міста...');
    
    console.log('1. Starting city search for:', cityName);

    // Normalize input and ensure proper encoding
    const normalizedName = `${cityName.toLowerCase().trim()}, Україна`;
    
    try {
        // Add required headers and proper URL construction
        const response = await fetch(
            'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
                q: normalizedName,
                format: 'json',
                limit: '10',
                addressdetails: '1'
            }), {
                headers: {
                    'Accept-Language': 'uk,en',
                    'User-Agent': 'WeatherApp/1.0'
                }
            }
        );
        
        if (!response.ok) {
            console.error('Response status:', response.status);
            console.error('Response text:', await response.text());            
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('2. Raw search results:', data);

        if (!data || data.length === 0) {
            console.log('3. No results found for:', normalizedName);
            showError(`Місто "${cityName}" не знайдено`);
            return [];
        }

        
        const cities = data
            .filter(place => {
                const isSettlement = place.type === 'city' || 
                                   place.type === 'town' || 
                                   place.type === 'village' ||
                                   place.type === 'administrative' ||
                                   (place.class === 'place' && 
                                    ['city', 'town', 'village'].includes(place.type));
                
                const isInUkraine = place.address?.country === 'Україна' || 
                                  place.address?.country === 'Ukraine';
                
                console.log('4. Filtering place:', {
                    name: place.name,
                    type: place.type,
                    class: place.class,
                    isSettlement,
                    isInUkraine
                });
                
                return isSettlement && isInUkraine;
            })
            .map(place => {
                const city = place.address?.city || 
                           place.address?.town || 
                           place.address?.village || 
                           place.name;
                           
                const oblast = place.address?.state || 
                             place.address?.region || 
                             place.address?.county;

                const displayName = `${city}${oblast ? `, ${oblast}` : ''}`;
                
                console.log('5. Processing location:', {
                    city,
                    oblast,
                    displayName,
                    coordinates: [place.lat, place.lon]
                });

                return {
                    name: displayName,
                    lat: parseFloat(place.lat),
                    lng: parseFloat(place.lon),
                    type: place.type,
                    importance: place.importance
                };
            })
            .sort((a, b) => b.importance - a.importance);

        console.log('6. Processed cities:', cities);
        return cities;

    } catch (error) {
        console.error('7. Error fetching cities:', error);
        showError('Error fetching cities', error);
        return [];
    } finally {
        toggleLoader(false);
    }
};

// Create observables
const buttonClick$ = rxjs.fromEvent(searchButton, 'click');
const input$ = rxjs.fromEvent(cityInput, 'input').pipe(
    rxjs.operators.debounceTime(300),
    rxjs.operators.map(e => e.target.value.toLowerCase()),
    rxjs.operators.distinctUntilChanged()
);

// Combine latest input value with button clicks
const search$ = buttonClick$.pipe(
    rxjs.operators.map(() => cityInput.value),
    rxjs.operators.filter(city => city.length > 0),
    rxjs.operators.switchMap(city => 
        rxjs.from(getCityCoordinates(city)).pipe(
            rxjs.operators.map(cities => cities[0]), // Take first match
            rxjs.operators.filter(city => city !== undefined)
        )
    ),
    rxjs.operators.switchMap(coords => {
        const params = {
            lat: coords.lat,
            lon: coords.lng,
            appid: API_KEY,
            units: 'metric',
            lang: 'ua'
        };

        return rxjs.from(
            fetch(`${BASE_URL}/forecast?${new URLSearchParams(params)}`)
                .then(res => res.json())
                .then(data => ({
                    ...data,
                    cityName: coords.name
                }))
        );
    })
);

// Функція для відображення помилок
function showError(message, error = null) {
    // Логуємо в консоль з додатковими деталями
    console.error('Error occurred:', message);
    if (error) {
        console.error('Error details:', error);
        console.error('Stack trace:', error.stack);
    }

    

    // Перевіряємо тип помилки
    let errorMessage = message;
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        errorMessage = 'Помилка мережі. Перевірте підключення до інтернету.';
    }

    // Створюємо елемент для відображення помилки
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <strong>⚠️ Помилка:</strong> ${errorMessage}
        ${error?.message ? `<br><small>${error.message}</small>` : ''}
    `;
    
    // Вставляємо повідомлення про помилку перед контейнером погоди
    const weatherInfo = document.querySelector('.weather-info');
    weatherInfo.insertAdjacentElement('beforebegin', errorDiv);
    
    // Видаляємо повідомлення через 5 секунд
    setTimeout(() => errorDiv.remove(), 5000);
}

// Оновлюємо функцію handleFetchError
function handleFetchError(error, context) {
    console.error(`Error in ${context}:`, error);
    
    let errorMessage = 'Невідома помилка';
    
    if (!navigator.onLine) {
        errorMessage = 'Відсутнє підключення до інтернету. Перевірте мережу.';
    } else if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        errorMessage = 'Помилка мережі. Перевірте підключення до інтернету.';
    } else {
        errorMessage = `Помилка при ${context}: ${error.message}`;
    }
    
    showError(errorMessage, error);
}

// Оновлюємо всі fetch запити
function fetchWeatherData(params, cityName) {
    toggleLoader(true, `Отримуємо погоду для ${cityName}...`);
    
    return fetch(`${BASE_URL}/forecast?${new URLSearchParams(params)}`)
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
        })
        .then(data => ({
            ...data,
            cityName: cityName
        }))
        .catch(error => {
            handleFetchError(error, 'отриманні погоди');
            throw error; // Перекидаємо помилку далі
        })
        .finally(() => {
            toggleLoader(false);
        });
}

// Subscribe to results
search$.subscribe({
    next: (data) => {
        displayWeatherData(data, data.cityName);
    },
    error: err => showError('Помилка отримання погоди', err)
});

// Modify input handling for suggestions
input$.pipe(
    rxjs.operators.filter(value => value.length >= 2),
    rxjs.operators.debounceTime(500), // Збільшено затримку для зменшення кількості запитів
    rxjs.operators.switchMap(value => 
        rxjs.from(getCityCoordinates(value)).pipe(
            rxjs.operators.catchError(error => {
                showError('Помилка пошуку міста', error);
                return rxjs.of([]);
            })
        )
    )
).subscribe(cities => {
    if (cities.length > 0) {
        suggestionsDiv.style.display = 'block';
        suggestionsDiv.innerHTML = cities
            .map(city => `
                <div class="suggestion-item" 
                     data-lat="${city.lat}" 
                     data-lng="${city.lng}">
                    <span>${city.name}</span>
                    <small>${city.type}</small>
                </div>`)
            .join('');
    } else {
        suggestionsDiv.style.display = 'none';
    }
});

// Додаємо функціонал історії пошуку
const MAX_HISTORY_ITEMS = 5;
let searchHistory = [];

// Функція для збереження пошуку в історію
function addToHistory(cityData) {
    const historyItem = {
        city: cityData.name,
        lat: cityData.lat,
        lng: cityData.lng,
        timestamp: new Date().toISOString()
    };

    // Додаємо новий запит на початок масиву
    searchHistory.unshift(historyItem);
    
    // Обмежуємо кількість елементів
    if (searchHistory.length > MAX_HISTORY_ITEMS) {
        searchHistory = searchHistory.slice(0, MAX_HISTORY_ITEMS);
    }

    // Зберігаємо в localStorage
    localStorage.setItem('weatherSearchHistory', JSON.stringify(searchHistory));
    
    // Оновлюємо відображення історії
    updateHistoryDisplay();
}

// Функція для відображення історії
function updateHistoryDisplay() {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = searchHistory
        .map(item => {
            const date = new Date(item.timestamp);
            return `
                <div class="history-item" 
                     data-lat="${item.lat}" 
                     data-lng="${item.lng}"
                     data-city="${item.city}">
                    <span class="city">${item.city}</span>
                    <span class="time">${date.toLocaleTimeString()}</span>
                </div>
            `;
        })
        .join('');
}

// Завантажуємо історію при старті
document.addEventListener('DOMContentLoaded', () => {
    const savedHistory = localStorage.getItem('weatherSearchHistory');
    if (savedHistory) {
        searchHistory = JSON.parse(savedHistory);
        updateHistoryDisplay();
    }
});

// Додаємо обробник кліків по елементам історії
rxjs.fromEvent(document.getElementById('historyList'), 'click')
    .pipe(
        rxjs.operators.filter(e => e.target.closest('.history-item')),
        rxjs.operators.map(e => {
            const item = e.target.closest('.history-item');
            return {
                name: item.dataset.city,
                lat: parseFloat(item.dataset.lat),
                lng: parseFloat(item.dataset.lng)
            };
        })
    )
    .subscribe(city => {
        cityInput.value = city.name;
        toggleLoader(true, `Отримуємо погоду для ${city.name}...`);
        
        const params = {
            lat: city.lat,
            lon: city.lng,
            appid: API_KEY,
            units: 'metric',
            lang: 'ua'
        };

        fetchWeatherData(params, city.name)
            .then(data => displayWeatherData(data, city.name))
            .catch(error => console.error('Failed to update weather from history:', error))
            .finally(() => toggleLoader(false));
    });

// Modify suggestion click handling
rxjs.fromEvent(suggestionsDiv, 'click')
    .pipe(
        rxjs.operators.filter(e => e.target.classList.contains('suggestion-item')),
        rxjs.operators.map(e => ({
            name: e.target.textContent,
            lat: parseFloat(e.target.dataset.lat),
            lng: parseFloat(e.target.dataset.lng)
        }))
    )
    .subscribe(city => {
        cityInput.value = city.name;
        suggestionsDiv.style.display = 'none';
        
        // Додаємо місто в історію
        addToHistory(city);
        
        const params = {
            lat: city.lat,
            lon: city.lng,
            appid: API_KEY,
            units: 'metric',
            lang: 'ua'
        };

        fetchWeatherData(params, city.name)
            .then(data => displayWeatherData(data, city.name))
            .catch(error => console.error('Failed to update weather from suggestions:', error));
    });

// Close suggestions when clicking outside
rxjs.fromEvent(document, 'click')
    .pipe(
        rxjs.operators.filter(e => {
            const clickedElement = e.target;
            return !clickedElement.closest('.input-wrapper');
        })
    )
    .subscribe(() => {
        suggestionsDiv.style.display = 'none';
    });

// Додамо глобальну змінну для зберігання погодних даних
let weatherDataCache = null;

// Оновимо функцію displayWeatherData
function displayWeatherData(data, cityName) {
    // Зберігаємо дані в кеші
    weatherDataCache = data;
    
    console.log('1. Starting displayWeatherData with:', { cityName, data });

    if (!data || !data.list || !Array.isArray(data.list)) {
        console.error('2. Invalid data format:', data);
        document.querySelector('.weather-info').innerHTML = `
            <h2 class="city-title">${cityName}</h2>
            <div class="error-message">Не вдалося отримати дані про погоду</div>
        `;
        return;
    }

    try {
        // Group forecast data by days
        const groupedData = data.list.reduce((groups, item) => {
            const date = new Date(item.dt * 1000).toDateString();
            if (!groups[date]) {
                groups[date] = [];
            }
            groups[date].push(item);
            return groups;
        }, {});

        console.log('3. Grouped forecast data:', groupedData);

        // Get first 4 days
        const dailyData = Object.entries(groupedData)
            .slice(0, 4)
            .map(([date, items]) => {
                console.log(`4. Processing ${date} with ${items.length} items`);
                
                const avgTemp = average(items.map(item => item.main.temp));
                const avgHumidity = average(items.map(item => item.main.humidity));
                const avgWind = average(items.map(item => item.wind.speed));
                const avgPressure = average(items.map(item => item.main.pressure));
                const weatherIcon = items[0].weather[0].icon;

                console.log('5. Calculated averages:', {
                    temp: avgTemp,
                    humidity: avgHumidity,
                    wind: avgWind,
                    pressure: avgPressure
                });

                return {
                    date: new Date(date),
                    temp: Math.round(avgTemp),
                    humidity: Math.round(avgHumidity),
                    wind: Math.round(avgWind),
                    pressure: Math.round(avgPressure),
                    icon: weatherIcon
                };
            });

        console.log('6. Processed daily data:', dailyData);

        // Оновлюємо HTML розмітку
        document.querySelector('.weather-info').innerHTML = `
            <h2 class="city-title">${cityName}</h2>
            <div id="forecast" class="forecast-container">
                ${dailyData.map((day, index) => `
                    <div class="weather-card ${index === 0 ? 'today' : ''}" data-date="${day.date.toDateString()}">
                        <h3>${formatDate(day.date)}</h3>
                        <img src="http://openweathermap.org/img/wn/${day.icon}@2x.png" alt="Weather icon">
                        <div class="weather-details">
                            <p>🌡️ ${day.temp}°C</p>
                            <p>💧 ${day.humidity}%</p>
                            <p>💨 ${day.wind} м/с</p>
                            <p>🔄 ${day.pressure} hPa</p>
                        </div>
                        <div class="expand-indicator">▼</div>
                    </div>
                `).join('')}
                <div class="hourly-details"></div>
            </div>
        `;

        // Оновлюємо обробники подій
        const hourlyContainer = document.querySelector('.hourly-details');
        document.querySelectorAll('.weather-card').forEach(card => {
            card.addEventListener('click', () => {
                const date = card.dataset.date;
                const indicator = card.querySelector('.expand-indicator');
                
                // Прибираємо активний стан з усіх карток
                document.querySelectorAll('.weather-card').forEach(otherCard => {
                    otherCard.classList.remove('active');
                    otherCard.querySelector('.expand-indicator').textContent = '▼';
                });
                
                // Якщо натиснули на ту ж саму картку - ховаємо деталі
                if (card.classList.contains('active')) {
                    hourlyContainer.style.display = 'none';
                    card.classList.remove('active');
                    indicator.textContent = '▼';
                } else {
                    // Показуємо деталі для вибраної картки
                    const hoursData = groupedData[date];
                    console.log(`8. Showing details for ${date} with ${hoursData.length} hours`);
                    
                    hourlyContainer.innerHTML = `
                        <h3>Погодинний прогноз для ${formatDate(new Date(date))}</h3>
                        <div class="hourly-container">
                            ${hoursData.map(hour => `
                                <div class="hourly-item">
                                    <div class="hour">${new Date(hour.dt * 1000).getHours()}:00</div>
                                    <img src="http://openweathermap.org/img/wn/${hour.weather[0].icon}.png" alt="Weather icon">
                                    <div class="temp">${Math.round(hour.main.temp)}°C</div>
                                    <div class="humidity">💧 ${Math.round(hour.main.humidity)}%</div>
                                    <div class="wind">💨 ${Math.round(hour.wind.speed)} м/с</div>
                                    <div class="pressure">🔄 ${Math.round(hour.main.pressure)} hPa</div>
                                </div>
                            `).join('')}
                        </div>
                    `;
                    hourlyContainer.style.display = 'block';
                    card.classList.add('active');
                    indicator.textContent = '▲';
                    
                    // Прокручуємо до деталей
                    hourlyContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            });
        });
    } catch (e) {
        console.error('7. Error processing weather data:', e);
        document.querySelector('.weather-info').innerHTML = `
            <h2 class="city-title">${cityName}</h2>
            <div class="error-message">Помилка при обробці даних погоди</div>
        `;
    }
}

function groupByDays(hours) {
    console.log('17. Starting groupByDays with hours:', hours);
    const groups = hours.reduce((groups, hour) => {
        const date = new Date(hour.time).toDateString();
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date].push(hour);
        return groups;
    }, {});
    console.log('18. Grouped hours by days:', groups);
    return groups;
}

// Оновлена функція average з перевіркою на null/undefined
function average(numbers) {
    console.log('19. Calculating average for:', numbers);
    const validNumbers = numbers.filter(n => n !== null && n !== undefined);
    if (validNumbers.length === 0) {
        console.warn('20. No valid numbers to average');
        return 0;
    }
    const avg = validNumbers.reduce((a, b) => a + b, 0) / validNumbers.length;
    console.log('21. Calculated average:', avg);
    return avg;
}

// Add helper function for date formatting
function formatDate(date) {
    const options = { 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short' 
    };
    return date.toLocaleDateString('uk-UA', options);
}

// Створюємо потік для автоматичного оновлення кожні 10 хвилин
const autoRefresh$ = rxjs.interval(10 * 60 * 1000).pipe(
    rxjs.operators.filter(() => {
        // Перевіряємо чи є активне місто для оновлення
        const cityName = cityInput.value;
        console.log('Checking for auto-refresh:', { cityName });
        return cityName.length > 0;
    }),
    rxjs.operators.switchMap(() => {
        console.log('Auto-refreshing weather data...');
        const cityName = cityInput.value;
        return rxjs.from(getCityCoordinates(cityName)).pipe(
            rxjs.operators.map(cities => cities[0]),
            rxjs.operators.filter(city => city !== undefined)
        );
    }),
    rxjs.operators.switchMap(coords => {
        console.log('Fetching updated weather for:', coords.name);
        const params = {
            lat: coords.lat,
            lon: coords.lng,
            appid: API_KEY,
            units: 'metric',
            lang: 'ua'
        };

        return rxjs.from(
            fetch(`${BASE_URL}/forecast?${new URLSearchParams(params)}`)
                .then(res => res.json())
                .then(data => ({
                    ...data,
                    cityName: coords.name
                }))
        );
    })
);

// Підписуємося на автооновлення
const autoRefreshSubscription = autoRefresh$.subscribe({
    next: (data) => {
        console.log('Auto-refresh: Updating weather data');
        displayWeatherData(data, data.cityName);
        
        const notification = document.createElement('div');
        notification.className = 'update-notification';
        notification.textContent = `Дані оновлено: ${new Date().toLocaleTimeString()}`;
        document.querySelector('.weather-info').prepend(notification);
        setTimeout(() => notification.remove(), 3000);
    },
    error: err => {
        showError('Помилка автооновлення', err);
        toggleLoader(false);
    }
});

// Додаємо слухач для онлайн/офлайн статусу
window.addEventListener('online', () => {
    showError('З\'єднання з мережею відновлено', null);
    if (cityInput.value) {
        // Оновлюємо погоду, якщо було вибране місто
        const event = new Event('click');
        searchButton.dispatchEvent(event);
    }
});

window.addEventListener('offline', () => {
    showError('Втрачено з\'єднання з мережею', null);
});

// Додаємо CSS для покращення відображення помилок
const style = document.createElement('style');
style.textContent = `
    .error-message {
        color: #721c24;
        background-color: #f8d7da;
        border: 1px solid #f5c6cb;
        padding: 1rem;
        margin: 1rem 0;
        border-radius: 4px;
        text-align: center;
        animation: slideIn 0.3s ease-out;
        position: relative;
    }

    .error-message strong {
        display: block;
        margin-bottom: 0.5rem;
    }

    .error-message small {
        display: block;
        color: #856404;
        margin-top: 0.5rem;
    }

    @keyframes slideIn {
        from {
            transform: translateY(-20px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);
