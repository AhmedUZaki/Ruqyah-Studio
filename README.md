# Ruqyah Studio — استوديو الرقية

A free, **non-commercial** Quran verse audio assembler. Built as a **Vite static frontend + Cloudflare Pages Function** so it can be deployed from a GitHub repository to Cloudflare Pages. No Python server, paid cloud account, database, or API key is required for the app's basic functionality.

## Features

- Five reciters: Alafasy, Husary, Minshawi, Abdul Basit, Sudais. Abdul Basit and Sudais use verified EveryAyah verse files because their Al Quran Cloud paths can return 403; the other configured CDN sources remain available as fallbacks.
- Specify `surah:ayah` or `surah:first-last`, one or more per line, e.g. `1:1-7` and `2:255`.
- Validates all references, removes duplicates, and sorts in **mushaf order**.
- Defaults to **1.25×**, also offers **1×** and **1.5×**.
- Optional silence between verses: 0, 0.5, or 1 second.
- Creates **one downloadable MP3**. The `atempo` FFmpeg filter changes speed without intentionally changing pitch.
- Mobile-friendly Arabic RTL interface.
- Browser-side FFmpeg.WASM audio processing; Cloudflare Functions only streams original per-verse audio from Al Quran Cloud and EveryAyah.

## 1. Publish from GitHub to Cloudflare Pages

1. Create a **new GitHub repository** named e.g. `ruqyah-studio`.
2. Upload **the contents of this folder** (not the outer ZIP folder) into the repository, then commit to `main`. This includes the top-level `functions/api/audio.js` directory.
3. Open **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git**; select your GitHub repository.
4. Use these build settings:

   | Setting                | Value           |
   | ---------------------- | --------------- |
   | Framework preset       | Vite (or None)  |
   | Production branch      | `main`          |
   | Build command          | `npm run build` |
   | Build output directory | `dist`          |
   | Root directory         | `/`             |

5. Deploy. Cloudflare provisions a URL like `https://ruqyah-studio.pages.dev` (the actual address depends on availability).

**Important:** use Cloudflare **Pages with Git integration**, not only GitHub Pages. This app includes a Cloudflare Pages Function under `/functions/api/audio.js` that handles cross-origin audio streaming. GitHub is the repository, and Cloudflare Pages is the running host.

## 2. Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

The frontend starts at `http://localhost:5173`, but the `/api/audio` Cloudflare Function is **not emulated by Vite alone**. To test the complete audio path locally, use Wrangler with the built project:

```bash
npm run build
npx wrangler pages dev dist
```

Then open the URL Wrangler prints (usually `http://localhost:8788`). Wrangler reads the `functions/` directory beside `dist`.

To test verse references without external dependencies:

```bash
npm test
```

## 3. How it works

1. The browser parses verse references using the 114 surah lengths (`src/quran.js`). Quran verses are mapped to absolute ayah indexes **1–6236**.
2. `GET /api/audio?edition=ar.alafasy&ayah=262` in `functions/api/audio.js` streams the corresponding public audio CDN file. The Function has a hardcoded approved-reciter list; it never proxies arbitrary URLs.
3. The browser lazily loads `@ffmpeg/ffmpeg` plus the single-thread `@ffmpeg/core` WebAssembly runtime (about 30 MB) from jsDelivr. It appends the source files in order, inserts optional silent MP3 segments, applies `atempo` and encodes one MP3.
4. A browser Blob URL is used for playback and downloading. The combined recording is **not uploaded** to the cloud.

## Notes and limitations

- **Not yet verified end-to-end on a deployed Cloudflare Pages URL**. Unit tests validate the references and ordering; a live deploy test must confirm CDN availability, FFmpeg initialization and MP3 output on your target devices.
- FFmpeg.WASM can use significant browser memory. The app therefore processes downloads sequentially, enforces per-file and total-size limits, and allows cancellation. The maximum is **40 verses on desktop and 25 on compact/mobile screens**.
- The app requires a stable internet connection to load audio and the FFmpeg browser runtime. Initial compilation can be noticeably slow on phones.
- Some CDN editions and bitrates can be temporarily unavailable; if a reciter's URL fails, try another and inspect the network response.
- **Non-commercial use does not remove the requirement to respect reciters' rights**. Al Quran Cloud's published terms allow personal and educational streaming, downloading and free non-commercial redistribution, while recitations remain owned by the reciters or their estates. Attribute the source and review the [provider's current terms](https://alquran.cloud/terms-and-conditions) before public redistribution.
- This is a tool for Quran listening and is not a substitute for medical care. Selection names do not assert a proven medical treatment.

## Sources

- [Al Quran Cloud CDN: ayah audio URLs and bitrate identifiers](https://alquran.cloud/cdn)
- [Al Quran Cloud terms](https://alquran.cloud/terms-and-conditions)
- [EveryAyah verse-by-verse audio](https://everyayah.com/)
- [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/get-started/)
- [ffmpeg.wasm usage](https://ffmpegwasm.netlify.app/docs/getting-started/usage/)
