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
    request: request("edition=ar.sudais&ayah=1"),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.arrayBuffer()).byteLength, 512);
  assert.match(urls[0], /cdn\.islamic\.network/);
  assert.match(urls[1], /cdn\.alislam\.ru/);
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
