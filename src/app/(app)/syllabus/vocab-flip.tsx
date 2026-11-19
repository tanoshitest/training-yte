"use client";

/* eslint-disable @next/next/no-img-element -- Flashcard fronts may be user-uploaded data URLs. */

import { useState } from "react";

import { cn } from "@/lib/utils";
import { flashcardImageUrl } from "../../../../cloudflare/flashcard-images";

import type { VocabCard } from "./vocab";

export function VocabFlipGrid({ cards }: { cards: VocabCard[] }) {
  if (cards.length === 0) {
    return <p className="text-sm text-slate-400">Chưa có flashcard.</p>;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((card, index) => (
        <li key={`${card.front}-${index}`}>
          <VocabFlipCard card={card} />
        </li>
      ))}
    </ul>
  );
}

export function VocabFlipCard({
  card,
  className,
}: {
  card: VocabCard;
  className?: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const imageUrl = flashcardImageUrl(card.front, card.imageUrl || card.image);

  return (
    <button
      type="button"
      onClick={() => setFlipped((open) => !open)}
      className={cn("sy-flashcard", flipped && "is-flipped", className)}
      aria-label={card.front || "Flashcard"}
    >
      <span className="sy-flashcard-inner">
        <span className="sy-flashcard-face sy-flashcard-front">
          {imageUrl ? (
            <img src={imageUrl} alt="" />
          ) : (
            <span className="sy-flashcard-empty">{card.front || "—"}</span>
          )}
        </span>
        <span className="sy-flashcard-face sy-flashcard-back">
          <span className="sy-flashcard-word">{card.front || "—"}</span>
        </span>
      </span>
    </button>
  );
}
