export const LANGUAGE_STAGES = [
  { id: "WORD", label: "WORD" },
  { id: "CHUNK", label: "CHUNK" },
  { id: "SENTENCE", label: "SENTENCE" },
  { id: "EXPANDED_SENTENCE", label: "EXPANDED SENTENCE" },
  { id: "QA", label: "Q&A" },
  { id: "PERSONAL", label: "PERSONAL LANGUAGE" },
  { id: "COMMUNICATION", label: "COMMUNICATION" },
] as const;

export type LanguageStageId = (typeof LANGUAGE_STAGES)[number]["id"];

export type LanguageProgression = Record<LanguageStageId, string>;

export function emptyLanguageProgression(): LanguageProgression {
  return {
    WORD: "",
    CHUNK: "",
    SENTENCE: "",
    EXPANDED_SENTENCE: "",
    QA: "",
    PERSONAL: "",
    COMMUNICATION: "",
  };
}

export function encodeLanguageMap(values: LanguageProgression): string[] {
  return LANGUAGE_STAGES.map((stage) => `${stage.label}: ${values[stage.id] || ""}`.replace(/\s+$/, ""));
}

function stageFromLine(line: string) {
  const raw = line.trim();
  return LANGUAGE_STAGES.find((stage) => raw.toUpperCase().startsWith(`${stage.label}:`) || raw.toUpperCase().startsWith(`${stage.id}:`));
}

export function decodeLanguageMap(lines: string[] | undefined): LanguageProgression | null {
  const values = emptyLanguageProgression();
  let found = false;
  for (const line of lines || []) {
    const stage = stageFromLine(line);
    if (!stage) continue;
    values[stage.id] = line.slice(line.indexOf(":") + 1).trim();
    found = true;
  }
  return found ? values : null;
}

function firstVocabWord(items: string[] | undefined) {
  const raw = String(items?.[0] || "").split("—")[0].split("/")[0].trim();
  return raw.replace(/\s+/g, " ");
}

export function languageMapValues(unit: {
  languageMap?: string[];
  coreVocabulary?: string[];
  coreProduction?: string[];
  expandedProduction?: string[];
}): LanguageProgression {
  const decoded = decodeLanguageMap(unit.languageMap);
  if (decoded) return decoded;

  const lines = (unit.languageMap || []).map((item) => item.trim()).filter(Boolean);
  const questions = lines.filter((item) => item.includes("?"));
  const statements = lines.filter((item) => !item.includes("?"));
  const word = firstVocabWord(unit.coreVocabulary);
  const personal = unit.coreProduction?.find((item) => /^I\b/i.test(item)) || statements.find((item) => /^I\b/i.test(item)) || "";
  const question = questions[0] || "";
  const answer = (unit.coreProduction?.[0] || personal || statements[0] || "").replace(/_+/g, word || "…");

  return {
    WORD: word,
    CHUNK: statements.find((item) => item.split(/\s+/).length <= 4 && !item.endsWith(".")) || (word ? `a ${word}` : ""),
    SENTENCE: unit.coreProduction?.[0] || statements.find((item) => item.endsWith(".")) || statements[0] || "",
    EXPANDED_SENTENCE: unit.expandedProduction?.[0] || "",
    QA: questions.length ? questions.join("\n") : question,
    PERSONAL: personal.replace(/_+/g, word || "…"),
    COMMUNICATION: question && answer ? `${question} → ${answer}\nWhat about you?` : lines.slice(-1)[0] || "",
  };
}
