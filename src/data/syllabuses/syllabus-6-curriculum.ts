import type { CurriculumSectionType } from "../../generated/prisma/enums";

export type Syllabus6Lesson = {
  title: string;
  type?: string;
  pages?: string;
  skills?: Array<"L" | "S" | "R" | "W">;
  tasks: string[];
  vocabulary?: string;
  language?: string;
  outcomes: string[];
};

export type Syllabus6Section = {
  type: CurriculumSectionType;
  title: string;
  unitNumber?: number;
  objectives?: string[];
  days: Syllabus6Lesson[];
};

const unitDays = (
  _unit: number,
  pages: [string, string, string, string | undefined, string, string],
  days: Omit<Syllabus6Lesson, "title" | "type">[],
): Syllabus6Lesson[] => {
  const titles = [
    "Vocabulary 1",
    "Story / Language Practice 1",
    "Vocabulary 2 & Song / Language Practice 2",
    "Grammar Practice",
    "Cross-curricular / Literature",
    "A2 Flyers & Extra Practice / Mission in action",
    "Unit Test + Speaking Practice",
  ];
  const types = ["OTHER", "OTHER", "OTHER", "OTHER", "OTHER", "FLYERS_PRACTICE", "PROGRESS_TEST"];
  const pageList = [pages[0], pages[1], pages[2], pages[3], pages[4], pages[5], undefined];
  return titles.map((title, index) => ({
    title,
    type: types[index],
    pages: pageList[index],
    ...days[index],
  }));
};

const grammarPractice = (unit: number): Omit<Syllabus6Lesson, "title" | "type"> => ({
  skills: ["R", "W"],
  tasks: ["Do exercise", "Review Grammar 1 & 2", "Do extra exercise"],
  outcomes: [`Understand grammar in Unit ${unit} and practice.`],
});

const unitTest = (unit: number): Omit<Syllabus6Lesson, "title" | "type"> => ({
  skills: ["L", "S"],
  tasks: [`UNIT TEST ${unit}`, `Practise writing and speaking. Source: Write right 3 Unit ${unit}.`],
  outcomes: [
    `Review vocabulary and structures in Unit ${unit}.`,
    "Make a video to talk about your room.",
  ],
});

export const syllabus6Curriculum: Syllabus6Section[] = [
  {
    type: "UNIT",
    title: "THIS YEAR'S TRIP",
    unitNumber: 1,
    objectives: [
      "Say about the months of the year and the date.",
      "Use might and may to speculate about the future.",
      "Talk about journey.",
      "Read and understand about climates and climate zones.",
      "Read an encyclopedia entry and think about self-confidence and bravery.",
    ],
    days: unitDays(1, ["6-7", "8-9", "10-11", undefined, "12-15", "16-17"], [
      {
        skills: ["L", "S"],
        tasks: ["Teach vocabulary (follow the 5 steps)", "Do exercise", "Discuss using target vocabulary"],
        vocabulary: "Dates (the fifth of October); months; ordinal numbers (21st–31st). More: Brazil, leave (left), South Korea.",
        language: "What's the date today?",
        outcomes: [
          "Remember 80% of new words and pronounce correctly.",
          "Talk about months and dates.",
          "Practise pronouncing vocabulary of 12 months.",
        ],
      },
      {
        skills: ["L", "S"],
        tasks: ["Look and discuss", "Listen & Role-play", "Teach structures (5 steps)", "Do exercise", "Discuss using vocabulary & Structures 1"],
        vocabulary: "go skiing, ski centre, slopes, look (it looks good), by myself.",
        language: "may / might; It might be hot; You may need a pair of strong boots; I can't wait; I don't mind.",
        outcomes: [
          "Remember 80% of new words.",
          "Encounter and use might/may in context.",
          "Ask and answer questions with a range of question words.",
        ],
      },
      {
        skills: ["L"],
        tasks: ["Listen, sing the song and tick", "Teach vocabulary through song", "Teach structures", "Do exercise", "Discuss using vocabulary & Structures 2"],
        vocabulary: "Journeys: ambulance, bicycle, journey, motorway, passenger, platform, railway, taxi, traffic, give (someone) a lift.",
        language: "Indefinite pronouns: anyone, anything, anywhere, everyone, everything, everywhere, no-one, nothing, nowhere, someone, something, somewhere.",
        outcomes: ["Remember 80% of new words.", "Practise language through song.", "Use indefinite pronouns."],
      },
      grammarPractice(1),
      {
        skills: ["R", "W"],
        tasks: ["Teach vocabulary", "Introduce valuable lessons", "Practice reading aloud", "Do exercise"],
        vocabulary: "Seasons/climate: dry, equator, humid, ice, North/South Pole, polar, rainforest, rainy, season, temperature, tropical, zone, air-conditioned, keep cool, below/over (+temperature). More: artificial, in the past, modern, nomad.",
        language: "Review: What's the weather like?; comparative and superlative.",
        outcomes: [
          "Read and learn about climates and life in the Arabian Desert.",
          "Read an encyclopedia entry and talk about a famous person's life.",
          "Think about self-confidence.",
        ],
      },
      {
        tasks: ["Guide students to complete tasks in Flyers Exam", "Be a teacher"],
        vocabulary: "Listening Practice: Authentic Flyers 2 Test 1.",
        outcomes: [
          "Apply words to test sentences.",
          "Understand the Flyers Test format.",
          "Define unit words and role-play being a teacher.",
        ],
      },
      unitTest(1),
    ]),
  },
  {
    type: "UNIT",
    title: "OUR BEAUTIFUL PLANET",
    unitNumber: 2,
    objectives: [
      "Talk about the natural world and animals.",
      "Understand and use the past simple (regular/irregular verbs) and ago.",
      "Use too (many/much) and enough with nouns, adjectives and verbs.",
      "Read and understand about endangered animals and Australia.",
      "Read a poem and think about showing awareness of how others feel.",
    ],
    days: unitDays(2, ["18-19", "20-21", "22-23", undefined, "24-27", "28-29"], [
      {
        skills: ["L", "S"],
        tasks: ["Teach vocabulary (follow the 5 steps)", "Do exercise", "Discuss using target vocabulary"],
        vocabulary: "The natural world: cave, desert, environment, fire, hill(s), land, ocean, stone, stream, wood(s), air.",
        outcomes: [
          "Remember 80% of new words and pronounce correctly.",
          "Describe what happened to animals.",
          "Talk about the natural world and how to protect endangered species.",
        ],
      },
      {
        skills: ["L", "S"],
        tasks: ["Look and discuss", "Listen & Role-play", "Teach structures (5 steps)", "Do exercise", "Discuss using vocabulary & structures"],
        vocabulary: "Irregular past simple: began, bought, came, cut, fell, forgot, heard, left, let, lost, ran, sent, sold, spent. Others: by myself, creature, explore, pleased, put up (a tent), repair, (two days) ago.",
        language: "It took (five and a half hours).",
        outcomes: ["Remember 80% of new words.", "Encounter and use the past simple with ago."],
      },
      {
        skills: ["L"],
        tasks: ["Listen, sing the song and tick", "Teach vocabulary through song", "Teach structures", "Do exercise", "Discuss"],
        vocabulary: "Animals: beetle, butterfly, camel, creature, dinosaur, eagle, extinct, octopus, swan, tortoise, footprint, insect.",
        language: "too and enough: too much plastic, too many cars, aren't enough trees, air isn't clean enough.",
        outcomes: ["Remember 80% of new words.", "Practise language through song.", "Use too and enough."],
      },
      grammarPractice(2),
      {
        skills: ["R", "W"],
        tasks: ["Teach vocabulary", "Introduce valuable lessons", "Practice reading aloud a conversation/story", "Do exercise"],
        vocabulary: "Endangered animals: alive, belong, cause (v), climate change, dodo, Earth, endangered, extinction, fur, gorilla, habitat, human, hunt(er), kill, member, meteorite, natural disaster, planet, pollution, protect, rhino, species. More: attack (v), carnivorous, hop.",
        language: "Review: past simple, superlatives, too.",
        outcomes: [
          "Learn about endangered animals and wildlife of Australia.",
          "Discuss feelings and emotions of characters in a poem.",
        ],
      },
      {
        tasks: ["Guide students to complete tasks in Flyers Exam", "Be a teacher"],
        vocabulary: "Reading Practice: Authentic Flyers 2 Test 1.",
        outcomes: [
          "Apply words in test sentences.",
          "Understand the Flyers Test format.",
          "Role-play being a teacher.",
        ],
      },
      unitTest(2),
    ]),
  },
  {
    type: "UNIT",
    title: "LET'S CELEBRATE!",
    unitNumber: 3,
    objectives: [
      "Talk about competitions, music and festivals.",
      "Understand and use the present perfect (just, already, yet).",
      "Read about musical instrument history and Brazilian carnival music.",
      "Read a story set in Brazil about resilience and perseverance.",
    ],
    days: unitDays(3, ["30-31", "32-33", "34-35", undefined, "36-39", "40-41"], [
      {
        skills: ["L", "S"],
        tasks: ["Teach vocabulary (5 steps)", "Do exercise", "Discuss using target vocabulary"],
        vocabulary: "Competitions: chess, match, prize, puzzle, quiz, race, score, stadium, team, volleyball, winner, chess set, the Netherlands.",
        outcomes: ["Remember 80% of words.", "Talk about festivals, music and competitions."],
      },
      {
        skills: ["L", "S"],
        tasks: ["Look and discuss", "Listen & Role-play", "Teach structures (5 steps)", "Do exercise", "Discuss"],
        vocabulary: "carnival, ice cream cart, queen, pull, push, street.",
        language: "Present perfect for experience: Have you ever eaten black beans? Irregular past participles: bought, done, gone, got, heard, lost, made, put, seen, taken.",
        outcomes: ["Remember 80% of words.", "Use present perfect for experiences."],
      },
      {
        skills: ["L"],
        tasks: ["Listen/sing song", "Teach vocabulary via song", "Teach structures", "Do exercise", "Discuss"],
        vocabulary: "Musical and festivals: concert, drum, flag, instrument, musician, pop, rock, stage, tune, violin, whistle, hip-hop, join in, swing, amazing, experience, shot.",
        language: "Present perfect with just, already, yet: I've already taken more than 100 photos.",
        outcomes: ["Practise language through song.", "Use present perfect with time markers."],
      },
      grammarPractice(3),
      {
        skills: ["R", "W"],
        tasks: ["Teach vocabulary", "Introduce lessons", "Practice reading aloud", "Do exercises"],
        vocabulary: "Instruments: accompany, electric guitar, lute, pipe, single, string. Music styles: classical, folk, headphones, jazz. Football: coach, confident, player, hero, idol, passion, pick.",
        language: "Review: past simple, superlatives, present perfect.",
        outcomes: [
          "Read about instrument history and Brazilian carnival.",
          "Talk about character resilience.",
        ],
      },
      {
        tasks: ["Guide students through Flyers Exam tasks", "Be a teacher"],
        vocabulary: "Speaking Practice: Authentic Flyers 2 Test 1.",
        outcomes: ["Apply words to the test format.", "Define unit words.", "Role-play teaching."],
      },
      unitTest(3),
    ]),
  },
  {
    type: "MIDTERM_TEST",
    title: "Review 1 + Mid-test",
    days: [
      {
        title: "Review 1 — Reading + Listening",
        type: "REVIEW",
        tasks: ["Review 1: Reading + Listening", "Authentic Flyers 2 Test 2 (Full)."],
        outcomes: ["Review Units 1–3 through reading and listening."],
      },
      {
        title: "Review 1 — Speaking",
        type: "SPEAKING_PRACTICE",
        skills: ["L", "S"],
        tasks: ["Speaking Topic Units 1–3", "Authentic Flyers 2 Test 2 (Full)."],
        outcomes: ["Review Units 1–3 through speaking."],
      },
      {
        title: "Mid-term Test (Listening, Reading, Writing)",
        type: "MIDTERM_TEST",
        skills: ["L", "R", "W"],
        tasks: ["MID-TERM TEST (Listening, Reading and Writing)."],
        outcomes: ["Complete the mid-term test for Units 1–3."],
      },
    ],
  },
  {
    type: "UNIT",
    title: "FUN IN THE JUNGLE",
    unitNumber: 4,
    objectives: [
      "Use verbs to make offers, promises and requests.",
      "Use the past continuous.",
      "Tell the time (past/to).",
      "Use the present perfect with since/for.",
      "Read and understand about time zones and New Year celebrations around the world.",
      "Read a legend from Colombia and think about how actions can affect the environment.",
    ],
    days: unitDays(4, ["44-45", "46-47", "48-49", undefined, "50-53", "54-55"], [
      {
        skills: ["L", "S"],
        tasks: ["Teach vocabulary (5 steps)", "Do exercises", "Discuss using target vocabulary"],
        vocabulary: "Verbs for offers, promises and requests: fetch, look after, make sure, meet, prepare, repair, send, tidy.",
        language: "Review: present perfect with already, yet, just.",
        outcomes: ["Remember 80% of new words.", "Talk about time.", "Use verbs for offers, promises and requests."],
      },
      {
        skills: ["L", "S"],
        tasks: ["Look and discuss", "Listen & Role-play", "Teach structures (5 steps)", "Do exercises"],
        vocabulary: "burst, explain, join (someone), come out (of a house), cycle, get on (a bike), hole, path, tyre, cartoon, early, late.",
        language: "Past continuous: While I was cleaning my bike, my sister was watching TV. I was getting hot when Mum came out.",
        outcomes: ["Remember 80% of new words.", "Encounter and use the past continuous in context."],
      },
      {
        skills: ["L"],
        tasks: ["Listen/sing song/tick", "Teach vocabulary through song", "Teach structures", "Do exercises"],
        vocabulary: "Telling time: five/ten/quarter/twenty/twenty-five past/to (three), a.m., p.m.",
        language: "Present perfect with since and for. How long does it take you to (get to school)? It takes (me)...",
        outcomes: ["Remember 80% of new words.", "Practise language through song.", "Use present perfect with since/for."],
      },
      grammarPractice(4),
      {
        skills: ["R", "W"],
        tasks: ["Teach vocabulary", "Introduce valuable lessons", "Practice reading aloud (conversation/story)", "Do exercises"],
        vocabulary: "Time zones: divide, (line of) latitude/longitude, other side, shine, space, time zone, turn. Celebrations: celebration, coin, fireworks, future, good luck, hope (v), New Year, trumpet.",
        outcomes: [
          "Learn about time zones and New Year celebrations globally.",
          "Read a Colombian legend and discuss environmental impact.",
        ],
      },
      {
        tasks: ["Guide students through Flyers Exam tasks", "Be a teacher"],
        vocabulary: "Listening Practice: Authentic Flyers 2 Test 3.",
        outcomes: [
          "Apply words to test sentences.",
          "Understand the Flyers Test format.",
          "Define unit words and role-play as a teacher.",
        ],
      },
      unitTest(4),
    ]),
  },
  {
    type: "UNIT",
    title: "LET IT SNOW",
    unitNumber: 5,
    objectives: [
      "Talk about seasons, weather and winter activities.",
      "Understand and use will and won't.",
      "Understand and use conjunctions so and because.",
      "Read and understand text about why we have seasons and the climate of Argentina.",
      "Read a story set in Argentina and think about showing remorse.",
    ],
    days: unitDays(5, ["56-57", "58-59", "60-61", undefined, "62-65", "66-67"], [
      {
        skills: ["L", "S"],
        tasks: ["Teach vocabulary (5 steps)", "Do exercise", "Discuss using target vocabulary"],
        vocabulary: "Seasons. Weather: fog, foggy, ice, storm, warm.",
        language: "Review: What's the weather like?",
        outcomes: ["Remember 80% of new words and pronounce correctly.", "Describe seasons and weather."],
      },
      {
        skills: ["L", "S"],
        tasks: ["Look and discuss", "Listen & Role-play", "Teach structures (5 steps)", "Do exercise", "Discuss using vocabulary & Structures 1"],
        vocabulary: "appear, collect, find out (about), remember, search (v), feed, water (v), at the same time, seafood.",
        language: "will / won't: I'll water their garden; We won't talk about football; What time will you go?",
        outcomes: ["Remember 80% of new words.", "Encounter and use will/won't in context."],
      },
      {
        skills: ["L"],
        tasks: ["Listen, sing song and tick", "Teach vocabulary through song", "Teach structures (5 steps)", "Do exercise", "Discuss using vocabulary & Structures 2"],
        vocabulary: "Winter items: glove, pocket, pond, skiing, sledge (n), snowball, snowboard, snowboarding, snowman, drop (-> go down) heavily.",
        language: "Conjunctions so and because: The weather's really cold, so we have to wear warm clothes. Today we couldn't go skiing because it was foggy.",
        outcomes: ["Remember 80% of new words.", "Practise language through song.", "Use so and because."],
      },
      grammarPractice(5),
      {
        skills: ["R", "W"],
        tasks: ["Teach vocabulary", "Introduce valuable lessons", "Practice reading aloud (conversation/story)", "Do exercise"],
        vocabulary: "Science/geography: amount, away from, axis, closer, diagram, imaginary, northern/southern hemisphere, sunlight, tilt, towards, vertical. Argentina: border, coast, mountain range.",
        language: "Review: comparatives.",
        outcomes: [
          "Read about seasons and Argentina's climate.",
          "Read a story about remorse and talk about story meanings.",
        ],
      },
      {
        tasks: ["Guide students through Flyers Exam tasks", "Be a teacher"],
        vocabulary: "Reading Practice: Authentic Flyers 2 Test 3.",
        outcomes: [
          "Apply words in test sentences.",
          "Understand the Flyers Test format.",
          "Define unit words and role-play teaching.",
        ],
      },
      unitTest(5),
    ]),
  },
  {
    type: "UNIT",
    title: "WORKING TOGETHER",
    unitNumber: 6,
    objectives: [
      "Talk about jobs and the world of work.",
      "Understand and use tag questions.",
      "Understand and use short questions (Have you? Didn't you?).",
      "Read and understand about inventions and robotics.",
      "Read a science-fiction script and think about friendship.",
    ],
    days: unitDays(6, ["68-69", "70-71", "72-73", undefined, "74-75", "76-79"], [
      {
        skills: ["L", "S"],
        tasks: ["Teach vocabulary (5 steps)", "Do exercise", "Discuss using target vocabulary"],
        vocabulary: "Jobs: businessman, businesswoman, engineer, firefighter, manager, mechanic, pilot, police officer, uniform.",
        language: "Review: present continuous, relative pronouns.",
        outcomes: ["Remember 80% of new words and pronounce correctly.", "Talk about jobs."],
      },
      {
        skills: ["L", "S"],
        tasks: ["Look & discuss", "Listen & Role-play", "Teach structures (5 steps)", "Do exercise", "Discuss using vocab/structures"],
        vocabulary: "ready, a few, by yourself.",
        language: "Tag questions.",
        outcomes: ["Remember 80% of new words.", "Encounter tag questions in context.", "Use tag questions."],
      },
      {
        skills: ["L"],
        tasks: ["Listen & sing", "Teach vocabulary through song", "Teach structures (5 steps)", "Do exercise", "Discuss using vocab/structures"],
        vocabulary: "World of work: factory, fire engine, fire station, meeting, news, newspaper, office, police station. More: invention, sketch (n), twin.",
        language: "Short questions.",
        outcomes: ["Remember 80% of new words.", "Practise language through song.", "Use short questions."],
      },
      grammarPractice(6),
      {
        skills: ["R", "W"],
        tasks: ["Teach vocabulary", "Introduce valuable lessons", "Practice reading aloud", "Do exercise"],
        vocabulary: "Inventions & robotics: behave, chocolate bar, control, energy, operate, possible, put together, repeat, sci-fi, scientist, test (v). General: Asia, cassette, developed, digital, electronics, industry, internet café, MP3, press (button), probably, record (n), smart card, technology, touch screen, uncomfortable.",
        outcomes: [
          "Learn about inventions and robotics.",
          "Read a South Korean sci-fi play script and talk about friendship.",
        ],
      },
      {
        tasks: ["Guide students through Flyers Exam tasks", "Be a teacher"],
        vocabulary: "Speaking Practice: Authentic Flyers 2 Test 3.",
        outcomes: [
          "Apply words to sentences in tests.",
          "Understand the Flyers Test format.",
          "Define unit words and role-play being a teacher.",
        ],
      },
      unitTest(6),
    ]),
  },
  {
    type: "MIDTERM_TEST",
    title: "Review 2 + Mid-test",
    days: [
      {
        title: "Review 2 — Reading + Listening",
        type: "REVIEW",
        tasks: ["Review 2: Reading + Listening", "Authentic Flyers 3 Test 1 (Full)."],
        outcomes: ["Review Units 4–6 through reading and listening."],
      },
      {
        title: "Review 2 — Speaking",
        type: "SPEAKING_PRACTICE",
        skills: ["L", "S"],
        tasks: ["Speaking Topic Units 1–3", "Authentic Flyers 3 Test 1 (Full)."],
        outcomes: ["Review speaking topics and complete Flyers 3 Test 1."],
      },
      {
        title: "Mid-term Test (Listening, Reading, Writing)",
        type: "MIDTERM_TEST",
        skills: ["L", "R", "W"],
        tasks: ["MID-TERM TEST (Listening + Reading + Writing)."],
        outcomes: ["Complete the mid-term test after Unit 6."],
      },
    ],
  },
  {
    type: "UNIT",
    title: "THEN AND NOW",
    unitNumber: 7,
    objectives: [
      "Talk about things in the home and describe objects.",
      "Understand and use past participles.",
      "Use be used for / be used to to talk about the function of objects.",
      "Read and understand about the evolution of objects and the pyramids of Ancient Egypt.",
      "Read a historical fiction story about King Tutankhamun and think about taking a different perspective.",
    ],
    days: unitDays(7, ["82-83", "84-85", "86-87", undefined, "88-91", "92-93"], [
      {
        skills: ["L", "S"],
        tasks: ["Teach vocabulary (follow 5 steps)", "Do exercise", "Discuss using target vocabulary"],
        vocabulary: "Things in the home: brush, comb, fridge, gate, key, oven, shampoo, shelf, soap, telephone, toilet, thousands.",
        language: "Review: might, prepositions of place, present perfect.",
        outcomes: ["Remember 80% of new words and pronounce correctly.", "Talk about things in the home."],
      },
      {
        skills: ["L", "S"],
        tasks: ["Look and discuss", "Listen & Role-play", "Teach structures", "Do exercise", "Discuss using vocab & structures"],
        vocabulary: "borrow, fall off, I don't mind, pay (for), envelope.",
        language: "Irregular past participles: broken, come, cut, driven, fallen, forgotten, found, hurt, left, ridden, stood, tried, written. I've taken some great photos. My sister has just broken my phone!",
        outcomes: ["Remember 80% of new words.", "Encounter past participles in context.", "Form irregular past participles."],
      },
      {
        skills: ["L"],
        tasks: ["Listen/sing song", "Teach vocab/structures", "Do exercise", "Discuss"],
        vocabulary: "Adjectives: broken, cheap, empty, expensive, full, heavy, light, tidy, unusual. Others: mine, rug, It'll be alright.",
        language: "used for / to: It was used for cooking / to cook food. Ovens like this are used for making / to make bread.",
        outcomes: ["Remember 80% of new words.", "Practise language through song.", "Use used for/to to talk about functions."],
      },
      grammarPractice(7),
      {
        skills: ["R", "W"],
        tasks: ["Teach vocabulary", "Introduce lessons", "Practice reading aloud", "Do exercise"],
        vocabulary: "Adjectives: accurate, complex, enormous, simple, European, impressive. Nouns: analogue, bell, candle, century, civilisation, hourglass, moving part, screw, shadow, sundial, tower, version, hand (clock), expert, hieroglyphics, lever, papyrus, pharaoh, raft, rope.",
        language: "Review: past simple.",
        outcomes: [
          "Learn about the evolution of objects and the pyramids.",
          "Read historical fiction about King Tutankhamun.",
        ],
      },
      {
        tasks: ["Guide students to complete tasks in Flyers Exam"],
        vocabulary: "Listening Practice: Authentic Flyers 3 Test 2.",
        outcomes: ["Apply words to sentences in tests.", "Understand the Flyers Test format.", "Define unit words."],
      },
      unitTest(7),
    ]),
  },
  {
    type: "UNIT",
    title: "SPACE TRAVEL",
    unitNumber: 8,
    objectives: [
      "Talk about space travel and adventure.",
      "Understand and use will to make predictions and going to to talk about future plans.",
      "Use the appropriate past tense (past continuous or past simple).",
      "Read and understand about space exploration, planets and an astronaut.",
      "Read a science-fiction story and think about managing emotions.",
    ],
    days: unitDays(8, ["94-95", "96-97", "98-99", undefined, "100-103", "104-105"], [
      {
        skills: ["L", "S"],
        tasks: ["Teach vocabulary (5 steps)", "Do exercise", "Discuss using target vocabulary"],
        vocabulary: "astronaut, deep, engine, enormous, frightening, planet, rocket, space, spaceship, telescope.",
        language: "Review: comparatives, past simple, present perfect (with since).",
        outcomes: ["Remember 80% of new words and pronounce correctly.", "Talk about space travel."],
      },
      {
        skills: ["L", "S"],
        tasks: ["Look and discuss", "Listen & Role-play", "Teach structures (5 steps)", "Do exercise", "Discuss using vocabulary & structures"],
        vocabulary: "in the future, nearly, the next few (weeks), space traveller.",
        language: "will: Spaceships will improve. be going to: Are you going to watch a space film?",
        outcomes: [
          "Remember 80% of new words.",
          "Encounter will and going to in context.",
          "Use going to for plans and will for predictions.",
        ],
      },
      {
        skills: ["L"],
        tasks: ["Listen, sing song and tick", "Teach vocabulary through song", "Teach structures (5 steps)", "Do exercise", "Discuss using vocabulary & structures"],
        vocabulary: "Adventure: enter, entrance, exit, follow, land (v), save, stay, touch, turn off, turn on, appear, disappear, Milky Way, alien. Extra: button.",
        language: "Past tenses: Ivan landed his rocket...; Something was moving...; He was turning off his engine when he heard...",
        outcomes: ["Remember 80% of new words.", "Practise language through song.", "Review past tenses."],
      },
      grammarPractice(8),
      {
        skills: ["R", "W"],
        tasks: ["Teach vocabulary", "Introduce valuable lessons", "Practice reading aloud a conversation/story", "Do exercise"],
        vocabulary: "Nouns: atmosphere, diameter, dome, experiment, iron, liquid, living thing, Mars, surface, date of birth, gravity, laboratory, nationality, profession, space station. Verbs: survive, float, keep fit, return. Adjectives: rusty, serious, strict, Russian. Others: against, be able to.",
        language: "Review: comparatives, could, going to, must.",
        outcomes: [
          "Learn about space exploration and Mars.",
          "Learn about an Italian astronaut at the ISS.",
          "Read a sci-fi blog about a space mission and participate in role play.",
        ],
      },
      {
        tasks: ["Guide students to complete tasks in Flyers Exam", "Be a teacher"],
        vocabulary: "Reading Practice: Authentic Flyers 3 Test 2.",
        outcomes: [
          "Apply words in sentences for tests.",
          "Understand the Flyers Test format.",
          "Define unit words and role-play being a teacher.",
        ],
      },
      unitTest(8),
    ]),
  },
  {
    type: "UNIT",
    title: "GREAT BAKERS",
    unitNumber: 9,
    objectives: [
      "Talk about mealtimes, snacks and cooking.",
      "Understand and use it smells/tastes/looks/feels/sounds like...",
      "Use make somebody + adjective.",
      "Read and understand about chocolate production and traditional food in the UK.",
      "Read an adaptation of a fairy tale and think about being passionate about what you do.",
    ],
    days: unitDays(9, ["106-107", "108-109", "110-111", undefined, "112-115", "116-117"], [
      {
        skills: ["L", "S"],
        tasks: ["Teach vocabulary (5 steps)", "Do exercise", "Discuss using target vocabulary"],
        vocabulary: "Mealtimes and snacks: delicious, fork, knife, olives, pepper, piece, pizza, salt, snacks, spoon, mix.",
        language: "Shall I...? for offers.",
        outcomes: [
          "Remember 80% of new words and pronounce correctly.",
          "Talk about mealtimes and snacks.",
          "Use shall to offer food/drink.",
        ],
      },
      {
        skills: ["L", "S"],
        tasks: ["Look and discuss", "Listen & Role-play", "Teach structures (5 steps)", "Do exercise", "Discuss using vocabulary & structures 1"],
        vocabulary: "chopsticks, soft, wonderful, microphone, nest, What a lovely day!",
        language: "It smells/tastes/looks/feels/sounds like...: It felt like dry grass; It smelt like carrot cake; What does it (smell) like?",
        outcomes: ["Pronounce new words.", "Encounter structures in context.", "Use it smells/... like + noun."],
      },
      {
        skills: ["L"],
        tasks: ["Listen/sing/tick", "Teach vocabulary through song", "Teach structures (5 steps)", "Do exercise"],
        vocabulary: "Cooking: bake, biscuit, butter, cooker, egg, flour, honey, jam, sugar, wash up, recipe, surprise party, smell (n).",
        language: "make somebody + adjective: The smell is making me hungry; It made me really happy; such a (funny) film.",
        outcomes: ["Practise language through song.", "Use make somebody + adjective."],
      },
      grammarPractice(9),
      {
        skills: ["R", "W"],
        tasks: ["Teach vocabulary", "Introduce valuable lessons", "Practice reading aloud", "Do exercise"],
        vocabulary: "Making chocolate: bitter, cacao, change, colour, cocoa, crush, heat (v), mixture, pod, sack, take out, worker, is made. UK popular meal: accompany, British, curry, hot (=spicy), locally, mild, recognise, regularly, spicy, traditional.",
        language: "Review: It makes me (hungry); It's got (jam) in it; It's made with (fruit).",
        outcomes: [
          "Learn about chocolate production and UK food.",
          "Read a fairy tale adaptation and talk about story meaning.",
          "Reflect on passion.",
        ],
      },
      {
        tasks: ["Guide students through Flyers Exam tasks", "Be a teacher"],
        vocabulary: "Speaking Practice: Authentic Flyers 3 Test 2.",
        outcomes: [
          "Apply words in test context.",
          "Understand the Flyers Test format.",
          "Define unit words and role-play teaching.",
        ],
      },
      unitTest(9),
    ]),
  },
  {
    type: "FINAL_TEST",
    title: "Review 3/4 + Final",
    days: [
      {
        title: "Review 4 — Vocab + Grammar; Reading + Listening",
        type: "REVIEW",
        tasks: ["Review 4: Vocabulary + Grammar", "Reading + Listening", "Authentic Flyers 3 Test 3."],
        outcomes: ["Review vocabulary, grammar, reading and listening."],
      },
      {
        title: "Review 4 — Speaking",
        type: "SPEAKING_PRACTICE",
        skills: ["L", "S"],
        tasks: ["Speaking Topic Units 1–3", "Authentic Flyers 3 Test 3 (Full)."],
        outcomes: ["Complete speaking review and Flyers 3 Test 3."],
      },
      {
        title: "Final Test — Listening + Reading + Writing",
        type: "FINAL_TEST",
        skills: ["L", "R", "W"],
        tasks: ["Final Test (Listening + Reading + Writing)."],
        outcomes: ["Complete the final written papers."],
      },
      {
        title: "Final Test — Speaking",
        type: "SPEAKING_PRACTICE",
        skills: ["L", "S"],
        tasks: ["Final Test (Speaking)."],
        outcomes: ["Complete the final speaking test."],
      },
    ],
  },
];

export const SYLLABUS_6_TOTAL_DAYS = syllabus6Curriculum.reduce(
  (sum, section) => sum + section.days.length,
  0,
);
