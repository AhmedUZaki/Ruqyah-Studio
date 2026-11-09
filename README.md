# Ruqyah Studio

**English** | [العربية](README_AR.md)

Ruqyah Studio is an Arabic web application that combines selected Quran verses into one MP3 file. The user chooses a reciter, verse references, playback speed, and spacing between verses. The app sorts the selection in Mushaf order and processes the audio in the browser.

The project uses **Vite** and **Cloudflare Pages Functions**. It requires no database or API key.

## Features

- Five reciters: Mishary Alafasy, Mahmoud Al-Husary, Mohamed Al-Minshawi, Abdul Basit Abdus Samad, and Abdul Rahman Al-Sudais.
- Select a single verse with `2:255` or a continuous range with `1:1-7`.
- Enter multiple selections, one per line.
- Validate surah and verse numbers, remove duplicates, and sort verses in Mushaf order.
- Display the real surah names and grouped verse ranges, one surah per line.
- Playback speeds of `1×`, `1.25×`, and `1.5×`.
- Optional spacing between verses: none, half a second, or one second.
- Create one MP3 file for playback and download.
- Process audio in the browser with FFmpeg.WASM; the finished file is not uploaded to a server.
- Responsive Arabic RTL interface optimized for phones.
- Cancellation, request timeouts, file-size limits, and device-aware memory limits.

## Verse input

Enter the surah number, a colon, and the verse number:

```text
2:255
```

For a continuous range, add a hyphen between the first and last verse:

```text
1:1-7
```

You can combine several selections, one per line:

```text
1:1-7
2:255
2:285-286
113:1-5
114:1-6
```

The summary is displayed with the actual surah names:

```text
Surah Al-Fatihah: verses 1–7
Surah Al-Baqarah: verses 255, 285–286
Surah Al-Falaq: verses 1–5
Surah An-Nas: verses 1–6
```

## Run locally

Requirements: **Node.js 20 or later** and npm.

To run the frontend only:

```bash
npm install
npm run dev
```

Open the URL printed in the terminal, usually `http://localhost:5173`.

Vite alone does not emulate the Cloudflare audio function. To run the complete application locally:

```bash
npm run build
npx wrangler pages dev dist
```

Open the URL printed by Wrangler, usually `http://localhost:8788`.

## Tests and production build

```bash
npm test
npm run build
```

The tests cover verse-reference parsing, Mushaf ordering, surah names, range grouping, the Cloudflare Function, audio-source failover, and response-size limits.

## Deploy to Cloudflare Pages

Connect this repository to a Cloudflare Pages project and use the following settings:

| Setting                | Value           |
| ---------------------- | --------------- |
| Framework preset       | Vite or None    |
| Production branch      | `main`          |
| Build command          | `npm run build` |
| Build output directory | `dist`          |
| Root directory         | `/`             |

Use **Cloudflare Pages**, not GitHub Pages alone. The application depends on `functions/api/audio.js` to stream approved audio sources and handle browser CORS restrictions.

## How it works

1. The browser parses verse references using the 114 surah lengths in `src/quran.js`.
2. Each verse is mapped to its global Quran verse number from 1 to 6236.
3. `functions/api/audio.js` retrieves the verse from an approved audio source. It never proxies a URL supplied by the user.
4. Abdul Basit and Al-Sudais use verified EveryAyah files, while the configured CDN endpoints remain available as fallbacks.
5. The browser loads FFmpeg.WASM when needed, inserts optional gaps, adjusts playback speed, and creates one MP3 file.
6. The result is exposed through a temporary browser URL for playback and download.

## Limits

- Maximum of 40 verses on desktop and 25 verses on compact screens.
- Audio processing can require noticeable time and memory, especially for long verses or older phones.
- Keep the page open until MP3 generation finishes.
- An internet connection is required to retrieve recitations and load the FFmpeg runtime initially.
- External audio providers can experience temporary outages; the function tries a fallback source when one is available.

## Project structure

```text
functions/api/audio.js   Cloudflare Function for audio retrieval
src/main.js              UI, download, and MP3-generation logic
src/quran.js             Surah data and verse-reference parsing
src/style.css             Interface and responsive mobile styles
tests/                    Verse and audio-function tests
index.html                Main page
```

## Sources and rights

- [Al Quran Cloud CDN](https://alquran.cloud/cdn)
- [Al Quran Cloud terms](https://alquran.cloud/terms-and-conditions)
- [EveryAyah](https://everyayah.com/)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [ffmpeg.wasm](https://ffmpegwasm.netlify.app/)

Recitation and recording rights remain with their reciters and respective rights holders. Review the providers' terms before redistributing recordings or using them outside personal listening.

This application is intended for assembling and listening to recitations. It is not a substitute for medical advice or care.
