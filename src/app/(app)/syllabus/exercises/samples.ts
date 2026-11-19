import {
  nextId,
  type ClozeExercise,
  type DndExercise,
  type FillExercise,
  type McqExercise,
  type McqItem,
  type McqOption,
  type McqSubtype,
  type ReadingExercise,
  type ReadingKind,
  type TickExercise,
} from "./types";

const KAKAPO = `The kākāpō is a nocturnal, flightless parrot endemic to New Zealand. It is the world's only flightless parrot, and also the heaviest. Adult males can weigh up to 4 kilograms.

The species was once widespread across the country, but the arrival of Polynesian settlers and later European mammals drove it to the brink of extinction. Kākāpō breed only in years when rimu trees fruit heavily. In other years, adults may not produce chicks at all.

Their diet consists of fern fronds, various parts of a tree, and fruit. Conservation staff now manage the remaining birds on predator-free islands.`;

const BRITAIN = `A. The first large group of settlers from continental Europe arrived in Britain after the last Ice Age. They brought new tools and a way of life based on farming rather than hunting.

B. Later waves of migration changed the language spoken in the islands. Place names still show where these groups lived and how they moved inland from the coast.

C. Trade with neighbouring regions grew quickly once harbours were established. Goods such as pottery and metalwork have been found far from where they were made.

D. Written records from this period are scarce. Most of what we know comes from archaeology and from later writers looking back on events they did not see.

E. Some communities remained isolated for long periods. Their customs survived even when political control of the area changed several times.

F. Climate also played a part. Colder decades pushed people south, while warmer years allowed farms to expand into higher ground.

G. Modern historians still debate how sudden these changes were. A few sites suggest a gradual mix of peoples rather than a single invasion.`;

const TREES = `Planting trees

by Mark Rotherham, aged 13

Last year our class decided to plant trees around the school field. We wanted more shade in summer and a quieter place to sit at break. [[16]] The caretaker showed us which spots would not interfere with sports.

We ordered saplings from a local nursery and carried them across the field in groups. [[17]] Some of the younger pupils watered the ground before we started digging.

The work took most of a Saturday morning. [[18]] By lunchtime the new row of trees already made the playground look different.

Our teacher said we would measure the trees each term. [[19]] A few parents stayed to help tidy the tools.

I hope the trees are still there when I leave school. [[20]]`;

export const FIXED_OPTIONS = {
  TFNG: ["True", "False", "Not given"],
  YNNG: ["Yes", "No", "Not given"],
} as const;

export function emptyMcqOptions(subtype: McqSubtype): McqOption[] {
  const labels =
    subtype === "TFNG" ? FIXED_OPTIONS.TFNG : subtype === "YNNG" ? FIXED_OPTIONS.YNNG : ["", "", ""];
  return labels.map((text) => ({ id: nextId("opt"), text, correct: false }));
}

export function emptyMcqItem(subtype: McqSubtype): McqItem {
  return { id: nextId("q"), text: "", options: emptyMcqOptions(subtype) };
}

export function createMcq(): McqExercise {
  return {
    id: nextId("ex"),
    skill: "READING",
    kind: "MCQ",
    subtype: "TFNG",
    allowTwo: false,
    title: "Reading — Trắc nghiệm",
    passageTitle: "The kākāpō",
    passage: KAKAPO,
    instruction:
      "Do the following statements agree with the information given in this passage? Choose TRUE if the statement agrees with the information, FALSE if the statement contradicts the information, and NOT GIVEN if it is impossible to say.",
    startNo: 1,
    items: [emptyMcqItem("TFNG")],
  };
}

export function createFill(): FillExercise {
  return {
    id: nextId("ex"),
    skill: "READING",
    kind: "FILL",
    layout: "NOTES",
    title: "The kākāpō — Complete the notes",
    passageTitle: "The kākāpō",
    passage: KAKAPO,
    instruction:
      "Questions 7–11. Complete the notes below. Choose ONE WORD AND/OR A NUMBER from the passage for each answer.",
    startNo: 7,
    notesTitle: "New Zealand's kākāpō",
    body: `Arrival of Polynesian settlers
• once widespread, later driven towards [[7]]
• diet consists of fern fronds, various parts of a tree and [[8]]

Breeding
• only in years when [[9]] trees fruit heavily
• in other years adults may not produce [[10]]

Today
• remaining birds live on [[11]] islands`,
    tableTitle: "Intensive farming versus aeroponic urban farming",
    tableHeaders: ["", "Growth", "Selection"],
    tableRows: [
      [
        "Intensive farming",
        "• plants grow in soil\n• harvest depends on [[4]]",
        "• farmers choose crops for [[5]]",
      ],
      [
        "Aeroponic urban farming",
        "• roots hang in the air\n• water and nutrients are sprayed in a [[6]]",
        "• growers can change the mix for each [[7]]",
      ],
    ],
  };
}

export function createTick(): TickExercise {
  return {
    id: nextId("ex"),
    skill: "READING",
    kind: "TICK",
    title: "To Britain — Which paragraph?",
    passageTitle: "To Britain",
    passage: BRITAIN,
    instruction:
      "Questions 14–18. Which paragraph contains the following information? You may use any letter more than once.",
    startNo: 14,
    columns: ["A", "B", "C", "D", "E", "F", "G"],
    items: [
      { id: nextId("t"), number: 14, text: "Evidence that goods travelled a long way from where they were produced" },
      { id: nextId("t"), number: 15, text: "A reason why written sources are limited" },
      { id: nextId("t"), number: 16, text: "The idea that change may have been slow rather than sudden" },
      { id: nextId("t"), number: 17, text: "How weather influenced where people lived" },
      { id: nextId("t"), number: 18, text: "A group that introduced farming to the islands" },
    ],
  };
}

export function createDnd(): DndExercise {
  return {
    id: nextId("ex"),
    skill: "READING",
    kind: "DND",
    layout: "SENTENCES",
    title: "Complete each sentence",
    passageTitle: "The kākāpō",
    passage: KAKAPO,
    instruction: "Questions 36–40. Complete each sentence with the correct ending, A–G, below.",
    startNo: 36,
    stems: [
      { number: 36, text: "The arrival of people and mammals" },
      { number: 37, text: "In years without heavy fruiting, adult birds" },
      { number: 38, text: "The kākāpō is unusual among parrots because it" },
      { number: 39, text: "Staff now look after the remaining population on" },
      { number: 40, text: "A male kākāpō can weigh" },
    ],
    options: [
      { id: nextId("o"), text: "cannot fly and is the heaviest of its kind." },
      { id: nextId("o"), text: "pushed the species close to extinction." },
      { id: nextId("o"), text: "may not produce any chicks." },
      { id: nextId("o"), text: "islands that have no predators." },
      { id: nextId("o"), text: "up to four kilograms." },
      { id: nextId("o"), text: "made them feel optimistic." },
      { id: nextId("o"), text: "took relatively little notice of bad news." },
    ],
  };
}

export function createDndGaps(): DndExercise {
  return {
    id: nextId("ex"),
    skill: "READING",
    kind: "DND",
    layout: "GAPS",
    title: "Planting trees — missing sentences",
    passageTitle: "Planting trees",
    passage: TREES,
    instruction:
      "Questions 16–20. Five sentences have been removed from the text below. For each question, choose the correct answer. There are three extra sentences which you do not need to use.",
    startNo: 16,
    stems: [],
    options: [
      { id: nextId("o"), text: "So we tried to avoid areas where students were very active." },
      { id: nextId("o"), text: "However, our parents did offer to help with the digging!" },
      { id: nextId("o"), text: "It was harder work than we had expected." },
      { id: nextId("o"), text: "That way we can see how quickly they grow." },
      { id: nextId("o"), text: "They will remind me of this project." },
      { id: nextId("o"), text: "A few children wanted to take a sapling home." },
      { id: nextId("o"), text: "The nursery was much farther than the map suggested." },
      { id: nextId("o"), text: "Rain the night before had made the soil soft." },
    ],
  };
}

export function createCloze(): ClozeExercise {
  return {
    id: nextId("ex"),
    skill: "READING",
    kind: "CLOZE",
    title: "Wivenhoe hotel — choose a word",
    passageTitle: "Wivenhoe hotel",
    passage:
      "The notes below form the reading text for this task. Students choose a word for each numbered gap so the paragraph reads as a complete passage.",
    instruction: "Questions 19–24. Choose the correct word for each gap. Click a box, then pick one option.",
    startNo: 19,
    body: `The Wivenhoe hotel offers guests a surprising [[19]] of rooms, from compact singles to suites that overlook the river. Staff can [[20]] a booking if you call the day before arrival. The kitchen is known for the [[21]] of its breakfast, and many visitors return for that reason alone. A short walk leads to the old harbour, where the [[22]] between the town and the water is still easy to see. In winter the hotel feels quiet, but summer brings a [[23]] of walkers and cyclists. The owners hope the next season will [[24]] even more families to stay.`,
    blanks: [
      { number: 19, options: ["change", "variety", "difference"] },
      { number: 20, options: ["alter", "cancel", "delay"] },
      { number: 21, options: ["quality", "price", "size"] },
      { number: 22, options: ["link", "gap", "border"] },
      { number: 23, options: ["crowd", "lack", "list"] },
      { number: 24, options: ["attract", "prevent", "remind"] },
    ],
  };
}

export function createReading(kind: ReadingKind): ReadingExercise {
  switch (kind) {
    case "MCQ":
      return createMcq();
    case "FILL":
      return createFill();
    case "TICK":
      return createTick();
    case "DND":
      return createDnd();
    case "CLOZE":
      return createCloze();
  }
}
