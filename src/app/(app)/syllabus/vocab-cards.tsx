import { parseVocab, type VocabCard } from "./vocab";

export function VocabCards({
  value,
  empty = "Chưa có từ vựng.",
}: {
  value: string | null | VocabCard[];
  empty?: string;
}) {
  const cards = Array.isArray(value) ? value : parseVocab(value);
  if (cards.length === 0) return <p className="text-sm text-slate-400">{empty}</p>;

  return (
    <ul className="flex flex-wrap gap-2">
      {cards.map((card, index) => (
        <li
          key={`${card.front}-${index}`}
          className="min-w-[8rem] overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          {card.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- User flashcard thumbnails.
            <img src={card.imageUrl} alt={card.front || "Flashcard"} className="h-20 w-full object-cover" />
          ) : null}
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-slate-900">{card.front || "—"}</p>
            {card.back ? <p className="mt-0.5 text-xs text-slate-500">{card.back}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
