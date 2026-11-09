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
  for (const host of SOURCE_HOSTS) {
    const cdnUrl = `${host}/quran/audio/${bitrate}/${edition}/${number}.mp3`;
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
