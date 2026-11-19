const FLASHCARD_IMAGES: Record<string, string> = {
  frog: "/flashcards/frog.png?v=3",
  duck: "/flashcards/duck.png?v=3",
  elephant: "/flashcards/elephant.png?v=1",
  lizard: "/flashcards/lizard.png?v=1",
  tiger: "/flashcards/tiger.png?v=1",
  sheep: "/flashcards/sheep.png?v=1",
  horse: "/flashcards/horse.png?v=1",
  goat: "/flashcards/goat.png?v=1",
  cow: "/flashcards/cow.png?v=1",
  mouse: "/flashcards/mouse.png?v=1",
  giraffe: "/flashcards/giraffe.png?v=1",
  zebra: "/flashcards/zebra.png?v=1",
  bird: "/flashcards/bird.png?v=1",
  hippo: "/flashcards/hippo.png?v=1",
  crocodile: "/flashcards/crocodile.png?v=1",
  snake: "/flashcards/snake.png?v=1",
  spider: "/flashcards/spider.png?v=1",
  fish: "/flashcards/fish.png?v=1",
  in: "/flashcards/in.png?v=1",
  on: "/flashcards/on.png?v=1",
  under: "/flashcards/under.png?v=1",
  "next-to": "/flashcards/next-to.png?v=1",
};

export function flashcardImageKey(front: string) {
  return front.toLowerCase().split("/")[0].replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "";
}

export function flashcardImageUrl(front: string, existing?: string) {
  return FLASHCARD_IMAGES[flashcardImageKey(front)] || existing || "";
}
