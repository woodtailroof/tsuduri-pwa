// Visual prototype: one center payline, outcome fixed at spin start (not skill stop).
export const SLOT_SYMBOLS = [
  { id: 'seven', glyph: '7', label: '釣嫁セブン', color: '#ff70b9' },
  { id: 'fish', glyph: '🐟', label: 'フィッシュ', color: '#65dfff' },
  { id: 'bell', glyph: '🔔', label: 'ベル', color: '#ffcf67' },
  { id: 'cherry', glyph: '🍒', label: 'チェリー', color: '#ff829e' },
  { id: 'shell', glyph: '🐚', label: 'シェル', color: '#c6b0ff' },
  { id: 'wild', glyph: 'TY', label: '釣嫁ロゴ', color: '#85ffe0' },
] as const;
export const REEL_STRIP = [1,2,4,0,3,1,5,2,4,1,3,2,0,4,1,2,3,5,4,2,1];
export type SlotWallet = { credit: number; spins: number; bonus: number; best: number; hits: number };
export const initialWallet = (): SlotWallet => ({ credit: 300, spins: 0, bonus: 0, best: 300, hits: 0 });
export type SlotRound = { symbols: number[]; payout: number; bonusAdded: number; title: string; line: string; big: boolean; next: SlotWallet };
export function drawSlot(wallet: SlotWallet, random: () => number = Math.random, forceBonus = false): SlotRound {
  const free = wallet.bonus > 0;
  if (!free && wallet.credit < 3) throw new Error('Not enough credits');
  const r = random();
  let symbols: number[], payout = 0, bonusAdded = 0, title = '次の一投へ', line = 'まだまだ、ここからだよ！';
  if (forceBonus || r < (free ? .045 : .035)) {
    symbols = [0,0,0]; payout = 30; bonusAdded = 8; title = 'BONUS 確定！'; line = 'やったね、ひろっち！ 大漁目指していこう！';
  } else if (r < (free ? .52 : .23)) {
    symbols = [2,2,2]; payout = 12; title = 'NICE CATCH'; line = 'いい感じ！ この調子でいこっ♪';
  } else if (r < (free ? .78 : .35)) {
    symbols = [1,1,1]; payout = 8; title = 'FISH ON!'; line = 'ヒット！ ちゃんと合わせてねっ！';
  } else if (r < (free ? .88 : .44)) {
    symbols = [3,4,3]; payout = 2; title = '小さなチャンス'; line = '小さなアタリも、見逃さないよ♪';
  } else {
    // Deliberately nonmatching; never show a paying triple on a miss.
    const a = Math.floor(random()*6)%6;
    symbols = [a,(a+1+Math.floor(random()*4))%6,a];
  }
  const credit = wallet.credit - (free ? 0 : 3) + payout;
  const next = { credit, spins: wallet.spins+1, bonus: Math.max(0,wallet.bonus-1)+bonusAdded, best: Math.max(wallet.best,credit), hits: wallet.hits+(payout>0?1:0) };
  return { symbols, payout, bonusAdded, title, line, big: bonusAdded>0, next };
}
export function readSlotWallet(value: string | null): SlotWallet {
  try { const v = JSON.parse(value || 'null');
    if (v && ['credit','spins','bonus','best','hits'].every(k=>Number.isSafeInteger(v[k])&&v[k]>=0&&v[k]<=1000000000)) return v;
  } catch { /* Invalid saved prototype data resets safely. */ }
  return initialWallet();
}
