export type ConversationMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  createdAt?: number;
  source?: "companion";
  previousExchangeAt?: number | null;
};

export function validMessageTime(value: unknown, now: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= now
    ? value
    : undefined;
}

export function isCompanionMessage(message: ConversationMessage): boolean {
  // Older clients do not send source yet.
  return message.source === "companion" ||
    (typeof message.content === "string" &&
      message.content.startsWith("【直前の別キャラクターの発言記録】"));
}

function formatTime(time: number): string {
  return new Date(time).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false });
}

export function buildConversationContext(
  messages: ConversationMessage[],
  now = Date.now(),
): { latestUser: string; hint: string } {
  let currentIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && !isCompanionMessage(messages[i])) {
      currentIndex = i;
      break;
    }
  }
  const current = messages[currentIndex];
  const previous = currentIndex > 0 ? messages[currentIndex - 1] : undefined;
  const previousTime = current?.previousExchangeAt === null
    ? undefined
    : validMessageTime(current?.previousExchangeAt, now) ?? validMessageTime(previous?.createdAt, now);
  const currentTime = validMessageTime(current?.createdAt, now) ?? now;
  const elapsed = previousTime !== undefined && previousTime <= currentTime
    ? `${Math.floor((currentTime - previousTime) / 60000)}分`
    : "不明（旧履歴など。直前の会話と決めつけない）";
  const latestUser = current?.content ?? "";

  return {
    latestUser,
    hint: `【今回のユーザー発言と会話の時間】
現在日時（日本時間）：${formatTime(now)}
今回のユーザー発言日時：${formatTime(currentTime)}
前のやり取りの日時：${previousTime === undefined ? "不明" : formatTime(previousTime)}
前のやり取りから今回までの経過時間：${elapsed}
今回のユーザー発言（JSON文字列）：${JSON.stringify(latestUser)}

【話題のつながりの判断：本文には出さない】
- 返答前に、今回のユーザー発言の意味と過去の会話との関係を読み、続き・新しい話題・挨拶や呼びかけ・曖昧な返答のどれに近いか判断する。
- キーワード一致や特定の合言葉を条件にしない。省略、代名詞、質問への回答、意味のつながりから自然に続きを理解する。時間が空いたり日付が変わったりしても、つながる発言なら過去の話を参照する。
- 経過時間が長いほど、古い話題をこちらから再開する根拠を弱くする。時間だけで履歴をリセットしない。
- 挨拶や呼びかけだけなら、まずそれに自然に応じる。過去の解説、助言、宿題、釣行計画を勝手に再開せず、以前の予定を今日の予定として扱わない。
- 挨拶に続いて内容がある場合は発言全体を読む。新しい話題には新しい話題として応じ、過去の情報は今回の理解に役立つ分だけ使う。
- 短い相づちや返答を新しい話題と決めつけない。前の質問への返答なら続ける。曖昧でも自然に応じられる場合は確認不要。指示対象の違いで回答が大きく変わる場合だけ短く確認する。
- 全員集合でも、全員が上記の同じユーザー発言と時間を基準にする。仲間の先行発言はユーザーの新しい要求でも、話題継続の証拠でもない。仲間が過去の話題へ脱線しても追随しない。
- キャラ同士の掛け合いや会話機能の指示は、今回のユーザー発言に沿う範囲で使う。挨拶に実用情報や質問を無理に足さない。
- 日時や分類、内部の判断手順を返答に説明しない。`,
  };
}
