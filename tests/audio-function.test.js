import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/audio.js";

function request(query) {
  return new Request(`https://example.test/api/audio?${query}`);
}

test("audio function rejects unknown reciters and invalid ayahs", async () => {
  assert.equal(
    (await onRequestGet({ request: request("edition=unknown&ayah=1") })).status,
    400,
  );
  assert.equal(
    (await onRequestGet({ request: request("edition=ar.alafasy&ayah=6237") }))
      .status,
    400,
  );
});

test("audio function falls back to the documented mirror", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (urls.length === 1) return new Response("missing", { status: 403 });
    return new Response(new Uint8Array(512), {
      status: 200,
      headers: { "content-type": "audio/mpeg", "content-length": "512" },
    });
  };
  const response = await onRequestGet({
    request: request("edition=ar.alafasy&ayah=1"),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.arrayBuffer()).byteLength, 512);
  assert.match(urls[0], /cdn\.islamic\.network/);
  assert.match(urls[1], /cdn\.alislam\.ru/);
});

test("affected reciters use working EveryAyah files with correct verse mapping", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return new Response(new Uint8Array(512), {
      status: 200,
      headers: { "content-type": "audio/mpeg", "content-length": "512" },
    });
  };
  for (const edition of ["ar.abdulbasit", "ar.sudais"]) {
    const response = await onRequestGet({
      request: request(`edition=${edition}&ayah=262`),
    });
    assert.equal(response.status, 200);
    await response.body.cancel();
  }
  assert.match(
    urls[0],
    /everyayah\.com\/data\/Abdul_Basit_Murattal_64kbps\/002255\.mp3/,
  );
  assert.match(
    urls[1],
    /everyayah\.com\/data\/Abdurrahmaan_As-Sudais_192kbps\/002255\.mp3/,
  );
});

test("audio function refuses an oversized declared response", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    new Response("x", {
      status: 200,
      headers: { "content-length": String(13 * 1024 * 1024) },
    });
  const response = await onRequestGet({
    request: request("edition=ar.alafasy&ayah=1"),
  });
  assert.equal(response.status, 502);
});
