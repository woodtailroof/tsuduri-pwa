import assert from "node:assert/strict";
import { buildConversationContext, isCompanionMessage, validMessageTime } from "../functions/lib/conversationContext.ts";

const now = Date.parse("2026-10-06T15:00:00+09:00");
const old = now - 3 * 86400000;
const history = [
  { role: "user", content: "周期って何秒から長い？", createdAt: old - 60000 },
  { role: "assistant", content: "10秒から警戒しよう", createdAt: old },
  { role: "user", content: "おつ〜！", createdAt: now, previousExchangeAt: old },
];
const greeting = buildConversationContext(history, now);
assert.equal(greeting.latestUser, "おつ〜！");
assert.match(greeting.hint, /4320分/);

// Later speakers must still respond to the real user, using the same gap.
const group = buildConversationContext([
  ...history,
  { role: "user", source: "companion", content: "周期は10秒以上！", createdAt: now },
], now);
assert.deepEqual(group, greeting);
assert.equal(buildConversationContext([
  ...history,
  { role: "user", content: "【直前の別キャラクターの発言記録】\n周期は10秒以上！" },
], now).latestUser, "おつ〜！");

// No keyword gate: an implicit continuation stays intact even after days.
assert.equal(buildConversationContext([
  ...history.slice(0, 2),
  { role: "user", content: "じゃあ8秒ならどう？", createdAt: now },
], now).latestUser, "じゃあ8秒ならどう？");

// Crossing midnight does not reset a conversation.
const midnight = Date.parse("2026-10-06T00:01:00+09:00");
assert.match(buildConversationContext([
  { role: "assistant", content: "どのリールにする？", createdAt: midnight - 120000 },
  { role: "user", content: "左のHGかな", createdAt: midnight },
], midnight).hint, /2分/);

// Legacy timestamps remain unknown, including when a speaker's own older
// reply has a date but the actual previous exchange did not.
assert.match(buildConversationContext([
  { role: "assistant", content: "前の話" },
  { role: "user", content: "おつ〜！", createdAt: now },
], now).hint, /経過時間：不明/);
assert.match(buildConversationContext([
  { role: "assistant", content: "自分の古い返答", createdAt: old },
  { role: "user", content: "おつ〜！", createdAt: now, previousExchangeAt: null },
], now).hint, /経過時間：不明/);
for (const value of [NaN, Infinity, -1, 0, "123", now + 1]) {
  assert.equal(validMessageTime(value, now), undefined);
}
assert.equal(isCompanionMessage({ role: "user", content: null }), false);
console.log("Conversation context regression checks passed.");
