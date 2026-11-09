/**
 * Cloudflare Pages Function: small, constrained streaming proxy to the Quran CDN.
 * Prevents browser CORS issues and never accepts arbitrary upstream URLs.
 */
const RECITER_BITRATES = Object.freeze({
  "ar.alafasy": 128,
  "ar.husary": 128,
  "ar.minshawi": 128,
  "ar.abdulbasit": 192,
  "ar.sudais": 192,
});

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const SOURCE_HOSTS = Object.freeze([
  "https://cdn.islamic.network",
  "https://cdn.alislam.ru",
]);
const EVERYAYAH_PATHS = Object.freeze({
  "ar.abdulbasit": "Abdul_Basit_Murattal_64kbps",
  "ar.sudais": "Abdurrahmaan_As-Sudais_192kbps",
});
const AYAH_COUNTS = Object.freeze([
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111,
  110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45,
  83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55,
  78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20,
  56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21,
  11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
]);

function toEveryAyahKey(globalNumber) {
  let remaining = globalNumber;
  for (let surah = 1; surah <= AYAH_COUNTS.length; surah++) {
    if (remaining <= AYAH_COUNTS[surah - 1]) {
      return `${String(surah).padStart(3, "0")}${String(remaining).padStart(3, "0")}`;
    }
    remaining -= AYAH_COUNTS[surah - 1];
  }
  throw new Error("Invalid global ayah number.");
}

function audioSourceUrls(edition, bitrate, number) {
  const urls = [];
  const everyAyahPath = EVERYAYAH_PATHS[edition];
  if (everyAyahPath) {
    urls.push(
      `https://everyayah.com/data/${everyAyahPath}/${toEveryAyahKey(Number(number))}.mp3`,
    );
  }
  for (const host of SOURCE_HOSTS) {
    urls.push(`${host}/quran/audio/${bitrate}/${edition}/${number}.mp3`);
  }
  return urls;
}

function limitedAudioStream(body, maximumBytes) {
  let received = 0;
  return body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > maximumBytes) {
          controller.error(
            new Error("Upstream audio exceeded the size limit."),
          );
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

export async function onRequestGet({ request }) {
  const query = new URL(request.url).searchParams;
  const edition = query.get("edition") || "";
  const number = query.get("ayah") || "";
  if (
    !Object.hasOwn(RECITER_BITRATES, edition) ||
    !/^[1-9]\d{0,3}$/.test(number) ||
    Number(number) > 6236
  ) {
    return new Response("Invalid reciter or ayah.", { status: 400 });
  }

  const bitrate = RECITER_BITRATES[edition];
  let upstream = null;
  for (const cdnUrl of audioSourceUrls(edition, bitrate, number)) {
    try {
      const candidate = await fetch(cdnUrl, {
        cf: { cacheTtl: 86400, cacheEverything: true },
        signal: AbortSignal.timeout(15000),
      });
      if (candidate.ok) {
        upstream = candidate;
        break;
      }
      await candidate.body?.cancel().catch(() => {});
    } catch (_error) {
      // Try the documented mirror before reporting an upstream failure.
    }
  }
  if (!upstream)
    return new Response("Verse audio unavailable.", { status: 502 });
  if (!upstream.body)
    return new Response("Verse audio response was empty.", { status: 502 });
  const declaredLength = Number(upstream.headers.get("content-length") || "0");
  if (declaredLength > MAX_AUDIO_BYTES) {
    upstream.body?.cancel();
    return new Response("Verse audio is too large.", { status: 502 });
  }
  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    "Cache-Control": "public, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  });
  if (declaredLength) headers.set("Content-Length", String(declaredLength));
  return new Response(limitedAudioStream(upstream.body, MAX_AUDIO_BYTES), {
    status: 200,
    headers,
  });
}
