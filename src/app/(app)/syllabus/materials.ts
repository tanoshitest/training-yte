export type Material = { title: string; url: string };

export function parseMaterials(value: unknown): Material[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { title, url } = item as Record<string, unknown>;
    if (typeof url !== "string" || !url) return [];
    return [{ title: typeof title === "string" ? title : "", url }];
  });
}
