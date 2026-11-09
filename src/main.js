import "./style.css";
import { parseSelection, summarizeSelection, RECITERS } from "./quran.js";

const $ = (id) => document.getElementById(id);
const form = $("generator-form");
let audioUrl = null;
let ffmpegInstance = null;
let activeController = null;

const isCompactDevice = window.matchMedia("(max-width: 800px)").matches;
const MAX_VERSES = isCompactDevice ? 25 : 40;
const MAX_VERSE_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_BYTES = (isCompactDevice ? 48 : 96) * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30000;

function getSettings() {
  return {
    reciter: $("reciter").value,
    verses: $("verses").value,
    speed: Number(form.elements.speed.value),
    gap: Number(form.elements.gap.value),
  };
}

function showError(message) {
  $("validation").textContent = message;
  $("validation").hidden = !message;
}

function setProgress(message, percent) {
  $("progress-text").textContent = message;
  $("progress").value = Math.min(100, Math.max(0, percent));
}

function updateSummary() {
  const settings = getSettings();
  $("current-speed").textContent = `${settings.speed}×`;
  try {
    const selection = parseSelection(settings.verses, MAX_VERSES);
    $("count").textContent = String(selection.length);
    $("order").textContent = summarizeSelection(selection);
    showError("");
  } catch (_error) {
    $("count").textContent = "—";
    $("order").textContent = "أدخل آيات صحيحة لرؤية الترتيب.";
  }
}

const PRESETS = {
  fatiha: "1:1-7",
  kursi: "2:255",
  muawwidhat: "113:1-5\n114:1-6",
};

for (const button of document.querySelectorAll("[data-preset]")) {
  button.addEventListener("click", () => {
    const value = PRESETS[button.dataset.preset];
    $("verses").value = $("verses").value.trim()
      ? `${$("verses").value.trim()}\n${value}`
      : value;
    updateSummary();
  });
}
$("clear-verses").addEventListener("click", () => {
  $("verses").value = "";
  updateSummary();
  $("verses").focus();
});
form.addEventListener("input", updateSummary);
form.addEventListener("change", updateSummary);
updateSummary();

async function ensureFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
  ]);
  // The single-threaded core does not require SharedArrayBuffer / COOP + COEP.
  const engine = new FFmpeg();
  const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
  setProgress("تحميل محرك معالجة الصوت داخل المتصفح (مرة واحدة لكل جلسة)…", 8);
  const [coreURL, wasmURL] = await Promise.all([
    toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
    toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
  ]);
  try {
    await engine.load({ coreURL, wasmURL });
  } finally {
    URL.revokeObjectURL(coreURL);
    URL.revokeObjectURL(wasmURL);
  }
  ffmpegInstance = engine;
  return engine;
}

function abortError() {
  return new DOMException("تم إلغاء العملية.", "AbortError");
}

async function readLimitedBody(response, maximumBytes, signal) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("تعذر قراءة الملف الصوتي من المصدر.");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw abortError();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes)
        throw new Error("حجم ملف إحدى الآيات أكبر من الحد الآمن.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function downloadVerse(reciter, verse, index, signal) {
  const parameters = new URLSearchParams({
    edition: reciter,
    ayah: String(verse.number),
  });
  const timeoutController = new AbortController();
  const timeout = setTimeout(
    () => timeoutController.abort(),
    REQUEST_TIMEOUT_MS,
  );
  const relayAbort = () => timeoutController.abort();
  signal.addEventListener("abort", relayAbort, { once: true });
  try {
    const response = await fetch(`/api/audio?${parameters}`, {
      signal: timeoutController.signal,
    });
    if (!response.ok)
      throw new Error(
        `فشل جلب تلاوة الآية ${verse.reference}. جرّب قارئًا آخر أو أعد المحاولة لاحقًا.`,
      );
    const declaredLength = Number(
      response.headers.get("content-length") || "0",
    );
    if (declaredLength > MAX_VERSE_BYTES)
      throw new Error(`ملف الآية ${verse.reference} كبير جدًا.`);
    const bytes = await readLimitedBody(
      response,
      MAX_VERSE_BYTES,
      timeoutController.signal,
    );
    if (bytes.byteLength < 300)
      throw new Error(`الملف الصوتي للآية ${verse.reference} غير صالح.`);
    return {
      index,
      filename: `ayah-${String(index).padStart(3, "0")}.mp3`,
      bytes,
    };
  } catch (error) {
    if (signal.aborted) throw abortError();
    if (timeoutController.signal.aborted)
      throw new Error(
        `انتهت مهلة جلب الآية ${verse.reference}. حاول مرة أخرى.`,
      );
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", relayAbort);
  }
}

async function buildMp3(engine, verses, reciter, { speed, gap }, signal) {
  const usedFiles = [];
  const cleanup = async () => {
    for (const filename of usedFiles) {
      try {
        await engine.deleteFile(filename);
      } catch (_error) {
        /* ignore cleanup */
      }
    }
  };
  try {
    const files = [];
    let totalBytes = 0;
    for (let i = 0; i < verses.length; i++) {
      if (signal.aborted) throw abortError();
      setProgress(
        `جلب وتحضير التلاوات: ${i + 1} من ${verses.length}`,
        18 + (i / verses.length) * 52,
      );
      const file = await downloadVerse(reciter, verses[i], i, signal);
      totalBytes += file.bytes.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES)
        throw new Error("الحجم الإجمالي كبير على هذا الجهاز. قلّل عدد الآيات.");
      await engine.writeFile(file.filename, file.bytes);
      usedFiles.push(file.filename);
      files.push({ filename: file.filename });
    }
    let silence = null;
    if (gap > 0 && files.length > 1) {
      silence = "silence.mp3";
      // Pre-scale pause so atempo keeps the requested pause length in the output.
      const code = await engine.exec([
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=mono",
        "-t",
        String(gap * speed),
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        silence,
      ]);
      if (code !== 0)
        throw new Error("تعذر إنشاء الفواصل الصامتة. جرّب الاختيار «بدون».");
      usedFiles.push(silence);
    }
    const playlist = [];
    for (const [index, file] of files.entries()) {
      playlist.push(`file '${file.filename}'`);
      if (silence && index !== files.length - 1)
        playlist.push(`file '${silence}'`);
    }
    await engine.writeFile(
      "concat.txt",
      new TextEncoder().encode(`${playlist.join("\n")}\n`),
    );
    usedFiles.push("concat.txt");
    const output = "ruqyah-output.mp3";
    usedFiles.push(output);
    setProgress("دمج الآيات وتسريع التلاوة مع الحفاظ على طبقة الصوت…", 83);
    if (signal.aborted) throw abortError();
    const code = await engine.exec([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "concat.txt",
      "-vn",
      "-af",
      `atempo=${speed}`,
      "-ar",
      "44100",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      "-metadata",
      "title=Ruqyah Studio - Selected Quran Recitation",
      "-y",
      output,
    ]);
    if (code !== 0)
      throw new Error("فشل دمج أو تصدير الصوت. جرّب تقليل عدد الآيات.");
    if (signal.aborted) throw abortError();
    const data = await engine.readFile(output);
    if (!(data instanceof Uint8Array) || data.byteLength < 300)
      throw new Error("تعذر الحصول على ملف MP3 صالح.");
    setProgress("تم إعداد التلاوة بنجاح.", 100);
    return new Blob([data.slice()], { type: "audio/mpeg" });
  } finally {
    await cleanup();
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  let settings, selection;
  try {
    settings = getSettings();
    selection = parseSelection(settings.verses, MAX_VERSES);
    if (!RECITERS[settings.reciter]) throw new Error("اختر قارئًا صالحًا.");
    if (![1, 1.25, 1.5].includes(settings.speed))
      throw new Error("سرعة التلاوة غير صالحة.");
    if (![0, 0.5, 1].includes(settings.gap))
      throw new Error("الفاصل الزمني غير صالح.");
  } catch (error) {
    showError(error.message);
    return;
  }
  $("generate").disabled = true;
  $("generate-text").textContent = "جارٍ الإنشاء…";
  $("placeholder").hidden = true;
  $("output-area").hidden = true;
  $("progress-area").hidden = false;
  $("cancel").hidden = false;
  setProgress("بدء إعداد التلاوة…", 2);
  activeController = new AbortController();
  try {
    const engine = await ensureFFmpeg();
    if (activeController.signal.aborted) throw abortError();
    const mp3 = await buildMp3(
      engine,
      selection,
      settings.reciter,
      settings,
      activeController.signal,
    );
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(mp3);
    $("player").src = audioUrl;
    $("download").href = audioUrl;
    $("download").download =
      `ruqyah-studio-${settings.reciter.replace("ar.", "")}-${settings.speed}x.mp3`;
    $("output-area").hidden = false;
    $("progress-area").hidden = true;
  } catch (error) {
    console.error("Ruqyah Studio error:", error);
    $("progress-area").hidden = true;
    $("placeholder").hidden = false;
    showError(
      error?.name === "AbortError"
        ? "تم إلغاء إنشاء الملف."
        : error instanceof Error
          ? error.message
          : "حدث خطأ غير متوقع. حاول مرة أخرى.",
    );
  } finally {
    activeController = null;
    $("cancel").hidden = true;
    $("generate").disabled = false;
    $("generate-text").textContent = "إنشاء ملف MP3";
  }
});

$("cancel").addEventListener("click", () => activeController?.abort());

window.addEventListener("beforeunload", () => {
  if (audioUrl) URL.revokeObjectURL(audioUrl);
});
