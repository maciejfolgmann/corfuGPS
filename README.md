# Korfu GPS — nawigacja offline na skuter

Aplikacja webowa (PWA) do jazdy skuterem po Korfu. Działa w pełni offline po pobraniu mapy.
Zawiera 6 gotowych tras (start z Benitses), punkty z opisami, prędkość,
nagrywanie przejazdów i eksport GPX. Jest też trasa testowa po Olsztynie.

## Jak zainstalować na iPhone (15 Pro / iOS 17+)

Aplikacja musi być serwowana przez HTTPS, żeby działała lokalizacja i tryb offline.

Gotowy adres (GitHub Pages):

**https://maciejfolgmann.github.io/corfuGPS/**

Albo wrzuć folder przez **Netlify Drop** (`https://app.netlify.com/drop`).

1. **Otwórz adres na iPhone** (Safari — nie inna przeglądarka)

2. **Zainstaluj apkę**
   - Dół ekranu: **Udostępnij** (kwadrat ze strzałką)
   - Wybierz **„Dodaj do ekranu głównego"** → **Dodaj**
   - Ikona Korfu GPS pojawi się na ekranie głównym — otwórz ją stamtąd

3. **Daj zgodę na lokalizację**
   - Przy pierwszym użyciu Safari zapyta o lokalizację → **Zezwól**
   - Jeżeli nic nie pyta: Ustawienia → Safari → Lokalizacja → „Podczas korzystania z witryny"

4. **Pobierz całą mapę Korfu (zanim wyruszysz, na wifi)**
   - W apce: zębatka (⚙️) → **Pobierz całą mapę Korfu** (~100 MB, zoom 10–15, cała wyspa)
   - Opcjonalnie **Bliższy zoom (z16)** (~200 MB extra) — ulice z bliska
   - Zielone chipy `z10…z16` = ten poziom jest w telefonie
   - **Sprawdź trybem samolot**, czy mapa nie jest szara (iPhone lubi czyścić cache)

Gotowe — apka działa **bez zasięgu**: mapa, trasy, GPS, nawigacja, nagrywanie.

## Jak używać

| Co | Jak |
|----|-----|
| Wybór trasy | Przycisk ☰ → wybierz dzień. Trasa zapamiętuje się między sesjami |
| Nawigacja | Gruba pomarańczowa linia + niebieska strzałka Twojej pozycji. HUD pokazuje prędkość, dystans, wysokość i odległość do następnego punktu |
| Podążanie za sobą | Przycisk celownika (🎯) — mapa sama się centruje. Przeciągnięcie mapy wyłącza |
| Kompas | Przycisk kompasu — strzałka pokazuje kierunek zamiast kursu GPS |
| Nagrywanie | Krótkie kliknięcie ● — start / pauza / wznów. **Przytrzymaj ●**, żeby zakończyć i zapisać. Albo Ustawienia → „Zakończ i zapisz". Niedokończony przejazd wraca po restarcie apki. Eksport GPX w Ustawieniach |
| Cel na mapie | Przycisk pinezki → dotknij mapę. Żółta linia i HUD prowadzą do tego punktu. Na pętli trasy wybiera krótszy kierunek. Ponowne kliknięcie pinezki kasuje cel. Przytrzymanie na mapie też stawia cel |
| Zoom | Przyciski + / − po prawej |

## Gdyby coś nie działało

- **Brak zgody na lokalizację** → Ustawienia iPhone → Prywatność → Usługi lokalizacji → Safari (i Korfu GPS, jeśli jest na liście)
- **Kompas nie działa** → Ustawienia iPhone → Prywatność → Ruch i orientacja → Safari → Zezwól
- **Ekran gaśnie w trakcie jazdy** → Ustawienia → Jazda → „Ekran bez wygaszania" (wymaga iOS 16.4+). Po restarcie apki lock startuje sam, jeśli był włączony
- **Mapa nie pobiera się** → apka musi być otwarta z adresu HTTPS i odświeżona raz po instalacji (żeby włączył się tryb offline)
- **Zielone chipy, a mapa pusta** → iOS wyrzucił cache. Pobierz paczkę jeszcze raz na wifi

## Ograniczenia

- GPS działa, gdy ekran jest włączony (Safari nie pozwala na pracę w tle — trzymaj telefon w uchwycie, ekran do góry)
- Mapy pochodzą z OpenStreetMap (licencja ODbL). **Kafelki z `tile.openstreetmap.org` nie są do hurtowego pobierania** — paczka offline jest pod osobisty wyjazd. Publiczny serwis powinien iść na własny tile server albo MapTiler / podobny. Na Korfu OSM jest bardzo dokładne, łącznie z serwisówkami

## Lokalny podgląd na komputerze

```
cd /Users/maciek/corfuGPS
python3 -m http.server 8765
```
Otwórz `http://localhost:8765` (geolokalizacja i offline działają też na localhost).

## Aktualizacja tras

Wymień pliki w `routes/` (nazwy muszą zostać takie same), a potem **podnieś numer
`VERSION` w `sw.js`** (np. `corfu-gps-app-v6`) — inaczej iPhone pokaże stare trasy z cache.

## Struktura

```
corfuGPS/
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
├── routes/*.gpx        # 6 tras Korfu + test Olsztyn
└── icons/              # ikony apki
```
