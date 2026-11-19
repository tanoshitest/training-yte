import assert from "node:assert/strict";
import test from "node:test";

import { activityRegistry, defaultActivity, demoActivity, parseActivityItems, serializeActivityItems, validateActivity } from "../cloudflare/activity-registry";
import { activityEngineTypes } from "../cloudflare/activity-types";

test("registry exposes exactly 12 unique activity engines", () => {
  assert.equal(activityRegistry.length, 12);
  assert.deepEqual(new Set(activityRegistry.map((engine) => engine.id)), new Set(activityEngineTypes));
});

test("each engine creates a valid editable draft and published demo", () => {
  activityEngineTypes.forEach((engineType, index) => {
    const draft = defaultActivity("lesson-1", engineType, index + 1);
    const demo = demoActivity("lesson-1", engineType, index + 1);
    assert.deepEqual(validateActivity(draft), []);
    assert.deepEqual(validateActivity(demo), []);
    assert.equal(demo.status, "PUBLISHED");
    assert.equal(demo.engineType, engineType);
  });
});

test("line editor format round-trips prompt, answer and distractors", () => {
  const items = parseActivityItems("Question | Correct | Wrong A | Wrong B\nWord | Meaning");
  assert.equal(items.length, 2);
  assert.equal(items[0]?.answer, "Correct");
  assert.deepEqual(items[0]?.options, ["Wrong A", "Wrong B"]);
  assert.match(serializeActivityItems({ prompt: "", content: "", mediaUrl: "", items }), /Question \| Correct/);
});

test("validation rejects incomplete activity content", () => {
  const activity = defaultActivity("lesson-1", "quiz");
  activity.title = "";
  activity.config.items[0]!.answer = "";
  assert.equal(validateActivity(activity).length, 2);
});
