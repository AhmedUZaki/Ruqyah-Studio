/** Quran ayah counts in standard Hafs mushaf order (114 surahs; total 6236). */
export const AYAH_COUNTS = Object.freeze([
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
  123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
  34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
  60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
  28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
  15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
  5, 4, 5, 6,
]);

export const RECITERS = Object.freeze({
  'ar.alafasy': { name: 'مشاري راشد العفاسي', bitrate: 128 },
  'ar.husary': { name: 'محمود خليل الحصري', bitrate: 128 },
  'ar.minshawi': { name: 'محمد صديق المنشاوي', bitrate: 128 },
  'ar.abdulbasit': { name: 'عبد الباسط عبد الصمد', bitrate: 192 },
  'ar.sudais': { name: 'عبد الرحمن السديس', bitrate: 192 },
});

export function toAsciiDigits(value) {
  return String(value)
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x06f0));
}

export function toGlobalNumber(surah, ayah) {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) throw new Error('رقم السورة غير صحيح.');
  if (!Number.isInteger(ayah) || ayah < 1 || ayah > AYAH_COUNTS[surah - 1]) throw new Error(`الآية ${surah}:${ayah} غير موجودة.`);
  let offset = 0;
  for (let i = 0; i < surah - 1; i++) offset += AYAH_COUNTS[i];
  return offset + ayah;
}

/** Parse '1:1-7\n2:255' etc. Deduplicate and sort in mushaf order. */
export function parseSelection(raw, limit = 80) {
  const normalized = toAsciiDigits(raw).replace(/[–—−]/g, '-');
  const parts = normalized.split(/[,،;؛\n]+/).map(p => p.trim()).filter(Boolean);
  if (!parts.length) throw new Error('أدخل آية واحدة على الأقل. مثال: 2:255');
  const references = new Map();
  for (const part of parts) {
    const match = /^(\d{1,3})\s*:\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?$/.exec(part);
    if (!match) throw new Error(`صيغة غير صحيحة: ${part} — استخدم 2:255 أو 1:1-7`);
    const surah = Number(match[1]);
    const first = Number(match[2]);
    const last = match[3] ? Number(match[3]) : first;
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) throw new Error(`رقم السورة ${surah} غير صحيح (1–114).`);
    if (first < 1 || last < first || last > AYAH_COUNTS[surah - 1]) throw new Error(`نطاق الآيات غير صحيح: ${part} (السورة بها ${AYAH_COUNTS[surah - 1]} آية).`);
    if (last - first + 1 > limit) throw new Error(`الحد الأقصى ${limit} آية لكل ملف.`);
    for (let ayah = first; ayah <= last; ayah++) {
      const number = toGlobalNumber(surah, ayah);
      references.set(number, { surah, ayah, number, reference: `${surah}:${ayah}` });
      if (references.size > limit) throw new Error(`الحد الأقصى ${limit} آية لكل ملف؛ اختصر الاختيار.`);
    }
  }
  return [...references.values()].sort((a, b) => a.number - b.number);
}

export function summarizeSelection(selection) {
  if (!selection.length) return '—';
  const labels = selection.map(v => v.reference);
  return labels.length <= 15 ? labels.join('، ') : `${labels.slice(0, 13).join('، ')}، … (+${labels.length - 13})`;
}
