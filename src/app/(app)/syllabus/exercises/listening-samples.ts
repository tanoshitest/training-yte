import { nextId, type ListeningExercise, type ListeningKind, type ListeningMcqOption } from "./types";

function option(text = "", correct = false): ListeningMcqOption {
  return { id: nextId("opt"), text, correct, imageUrl: "", imageName: "" };
}

function emptyMcqItem() {
  return {
    id: nextId("q"),
    text: "",
    options: [option(), option(), option()],
  };
}

export function createListening(kind: ListeningKind): ListeningExercise {
  const base = {
    id: nextId("ex"),
    skill: "LISTENING" as const,
    startNo: 1,
    audioName: "",
    audioUrl: "",
  };

  if (kind === "FILL") {
    return {
      ...base,
      kind: "FILL",
      title: "Restaurant recommendation",
      instruction: "Questions 1–6. Complete the table below using ONLY ONE WORD OR A NUMBER.",
      layout: "TABLE",
      notesTitle: "",
      body: "",
      tableTitle: "Restaurant recommendation",
      tableHeaders: ["Name of restaurant", "Location", "Reason for recommendation", "Other comments"],
      tableRows: [
        ["The Junction", "just in the [[1]]", "good for a [[2]] meal", "a bit [[3]]"],
        ["Paloma", "near the [[4]]", "known for its [[5]]", "book a [[6]]"],
      ],
    };
  }

  if (kind === "MCQ") {
    return {
      ...base,
      kind: "MCQ",
      title: "Listening — Trắc nghiệm",
      instruction: "Choose the appropriate option A, B or C.",
      optionMode: "TEXT",
      allowTwo: false,
      items: [emptyMcqItem()],
    };
  }

  if (kind === "TICK") {
    return {
      ...base,
      kind: "TICK",
      title: "Listening — Bảng tick",
      instruction: "Which option matches each activity? You may use any letter more than once.",
      promptImageUrl: "",
      promptImageName: "",
      columns: ["A", "B", "C", "D", "E", "F", "G"],
      optionLabels: [
        { key: "A", text: "Providing entertainment" },
        { key: "B", text: "Providing publicity about a council service" },
        { key: "C", text: "Contacting local businesses" },
        { key: "D", text: "Giving advice to visitors" },
        { key: "E", text: "Raising money" },
        { key: "F", text: "Organising transport" },
        { key: "G", text: "Training volunteers" },
      ],
      items: [{ id: nextId("t"), number: 1, text: "" }],
    };
  }

  return {
    ...base,
    kind: "DND",
    title: "School fashion show",
    instruction:
      "You will hear Julia talking to her mother about a school fashion show. What will each person help with? Drag the correct answer next to each person.",
    leftTitle: "People",
    rightTitle: "Help with",
    stems: [{ number: 1, text: "" }],
    options: [
      { id: nextId("o"), text: "clothes" },
      { id: nextId("o"), text: "food" },
      { id: nextId("o"), text: "lights" },
      { id: nextId("o"), text: "music" },
      { id: nextId("o"), text: "photographs" },
      { id: nextId("o"), text: "posters" },
      { id: nextId("o"), text: "tickets" },
    ],
  };
}

export function emptyListeningMcqItem() {
  return emptyMcqItem();
}

export function emptyListeningOption(): ListeningMcqOption {
  return option();
}
