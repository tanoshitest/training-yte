export type VocabCard = {
  front: string;
  back: string;
  image?: string;
  imageUrl?: string;
  backImageUrl?: string;
};

function readImage(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Đọc cột `vocabulary`: JSON flashcard, hoặc dữ liệu cũ mỗi dòng một từ. */
export function parseVocab(value: string | null | undefined): VocabCard[] {
  if (!value?.trim()) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        const front = typeof row.front === "string" ? row.front.trim() : typeof row.word === "string" ? row.word.trim() : "";
        const back = typeof row.back === "string" ? row.back.trim() : typeof row.meaning === "string" ? row.meaning.trim() : "";
        const imageUrl = readImage(row.imageUrl);
        const backImageUrl = readImage(row.backImageUrl);
        if (!front && !back && !imageUrl && !backImageUrl) return [];
        return [{ front, back, imageUrl, backImageUrl }];
      });
    } catch {
      return [];
    }
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const split = line.split(/\s*[|—–]\s*/);
      return { front: split[0] ?? line, back: split.slice(1).join(" | ") };
    });
}

export function serializeVocab(cards: VocabCard[]): string | null {
  const clean = cards
    .map((card) => ({
      front: card.front.trim(),
      back: card.back.trim(),
      ...(card.imageUrl?.trim() ? { imageUrl: card.imageUrl.trim() } : {}),
      ...(card.backImageUrl?.trim() ? { backImageUrl: card.backImageUrl.trim() } : {}),
    }))
    .filter((card) => card.front || card.back || card.imageUrl || card.backImageUrl);
  return clean.length ? JSON.stringify(clean) : null;
}

export function cardsFromForm(fd: FormData): VocabCard[] {
  const fronts = fd.getAll("vocabFront").map((value) => String(value));
  const backs = fd.getAll("vocabBack").map((value) => String(value));
  const images = fd.getAll("vocabImage").map((value) => String(value));
  const backImages = fd.getAll("vocabBackImage").map((value) => String(value));
  const count = Math.max(fronts.length, backs.length, images.length, backImages.length);
  const cards: VocabCard[] = [];
  for (let i = 0; i < count; i += 1) {
    cards.push({
      front: (fronts[i] ?? "").trim().slice(0, 200),
      back: (backs[i] ?? "").trim().slice(0, 500),
      imageUrl: (images[i] ?? "").trim() || undefined,
      backImageUrl: (backImages[i] ?? "").trim() || undefined,
    });
  }
  return cards;
}

export function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/\r?\n/).map((line) => line.replace(/^step\s*\d+\s*[:.\-–—]\s*/i, "").trim()).filter(Boolean);
  }
  return [];
}
