# Korfu GPS — nawigacja offline na skuter

Aplikacja webowa (PWA) do jazdy skuterem po Korfu. Działa w pełni offline po pobraniu mapy.
Zawiera 6 gotowych tras z `corfu-gpx/` (start z Benitses), punkty z opisami, prędkość,
nagrywanie przejazdów i eksport GPX.

## Jak zainstalować na iPhone (15 Pro / iOS 17+)

Aplikacja musi być serwowana przez HTTPS, żeby działała lokalizacja i tryb offline.
Najprościej przez **Netlify Drop** — bez konta, bez terminala:

1. **Wrzuć apkę na Netlify Drop**
   - Na komputerze otwórz `https://app.netlify.com/drop`
   - Przeciągnij **cały folder** `C:\Users\Maciek\corfu-gps` w pole przeglądarki
   - Dostaniesz adres, np. `https://korfu-gps-xyz.netlify.app` (zapisz go)

2. **Otwórz adres na iPhone** (Safari — nie inna przeglądarka)

3. **Zainstaluj apkę**
   - Dół ekranu: **Udostępnij** (kwadrat ze strzałką)
   - Wybierz **„Dodaj do ekranu głównego"** → **Dodaj**
   - Ikona Korfu GPS pojawi się na ekranie głównym — otwórz ją stamtąd

4. **Daj zgodę na lokalizację**
   - Przy pierwszym użyciu Safari zapyta o lokalizację → **Zezwól**
   - Jeżeli nic nie pyta: Ustawienia → Safari → Lokalizacja → „Podczas korzystania z witryny"

5. **Pobierz mapę offline (zanim wyruszysz, najlepiej na wifi)**
   - W apce: zębatka (⚙️) → **Mapa offline**
   - Najpierw **Pobierz paczkę bazową** (cała wyspa, drogi lokalne, ~60 MB)
   - Opcjonalnie **Paczkę szczegółową** (+ serwisówki, ścieżki, budynki, ~160 MB)
   - Zielone chipy `z10…z15` pokazują, które zoomy są pobrane
   - Zoomy 16–19 zapamiętują się same, gdy przeglądasz mapę z internetem

Gotowe — apka działa **bez zasięgu**: mapa, trasy, GPS, nawigacja, nagrywanie.

## Jak używać

| Co | Jak |
|----|-----|
| Wybór trasy | Przycisk ☰ → wybierz dzień. Trasa zapamiętuje się między sesjami |
| Nawigacja | Gruba pomarańczowa linia + niebieska strzałka Twojej pozycji. HUD pokazuje prędkość, dystans, wysokość i odległość do następnego punktu |
| Podążanie za sobą | Przycisk celownika (🎯) — mapa sama się centruje. Dotknięcie mapy wyłącza |
| Kompas | Przycisk kompasu — strzałka pokazuje kierunek zamiast kursu GPS |
| Nagrywanie | Czerwony przycisk ● — nagrywa przejazd; ⏸ pauza. Nagrania w Ustawieniach → Eksport GPX |
| Zoom | Przyciski + / − po prawej |

## Gdyby coś nie działało

- **Brak zgody na lokalizację** → Ustawienia iPhone → Prywatność → Usługi lokalizacji → Safari (i Korfu GPS, jeśli jest na liście)
- **Kompas nie działa** → Ustawienia iPhone → Prywatność → Ruch i orientacja → Safari → Zezwól
- **Ekran gaśnie w trakcie jazdy** → Ustawienia → Jazda → „Ekran bez wygaszania" (wymaga iOS 16.4+)
- **Mapa nie pobiera się** → apka musi być otwarta z adresu HTTPS i odświeżona raz po instalacji (żeby włączył się tryb offline)

## Ograniczenia

- GPS działa, gdy ekran jest włączony (Safari nie pozwala na pracę w tle — trzymaj telefon w uchwycie, ekran do góry)
- Mapy pochodzą z OpenStreetMap (licencja ODbL) — to nie Google Maps, ale na Korfu OSM jest bardzo dokładne, łącznie z serwisówkami

## Lokalny podgląd na komputerze

```
cd C:\Users\Maciek\corfu-gps
python -m http.server 8765
```
Otwórz `http://localhost:8765` (geolokalizacja i offline działają też na localhost).

## Aktualizacja tras

Wymień pliki w `routes/` (nazwy muszą zostać takie same), a potem **podnieś numer
`VERSION` w `sw.js`** (np. `corfu-gps-v2`) — inaczej iPhone pokaże stare trasy z cache.

## Struktura

```
corfu-gps/
├── index.html          # interfejs
├── sw.js               # tryb offline (cache kafelków + aplikacji)
├── manifest.webmanifest
├── css/style.css
├── js/
│   ├── app.js          # nawigacja, GPS, HUD
│   ├── gpx.js          # parser GPX
│   ├── map-download.js # pobieranie mapy offline
│   ├── recording.js    # nagrywanie przejazdów
│   └── compass.js      # kompas
├── leaflet/            # biblioteka map (lokalnie, offline)
├── routes/*.gpx        # Twoje 6 tras
├── icons/              # ikony apki
└── build/              # skrypty pomocnicze + testy (nie wgrywaj na hosting)
```
