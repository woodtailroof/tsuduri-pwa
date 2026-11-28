# BAR miss correction / two-game bigbait preview

BAR/BAR/BAR is not an assigned award in this game (REG remains7/7/BAR). Such lines previously fell through evaluateBoard as misses. legalBoard now excludes them on ALL five paylines and for every internal role, including secondary unawarded lines beside a small-role award. Role odds/payouts remain unchanged. Middle position15 changed from yellow7 to BAR, leaving only yellow7 at3, shared BAR at9/15. Real double7 survives. Save schema10 cancels/refunds unfinished old spins once and preserves hidden results, active bonus payout/RUSH counters and history.

Preview entry: Data/How to play > expanded details > ビッグベイト・2G映像プレビュー. Isolated native modal, explicitly does not affect credits, lottery or history. Tsuduri-only first prototype. Each cycle is exactly lever+three unique STOPs twice; any order accepted, duplicate clicks ignored. First game casts and retrieves; fish approaches by third stop. Second game pursues and decides only after third unique stop. Success/miss/retry-to-success routes are manually selectable. Retry adds another two-game cycle. Normal lottery/delayed presentation routing and other missions are NOT wired yet.

Art layers: opaque estuary/dry pier; independent transparent back-view Tsuduri; existing lure/fish sprites. RAF drives continuous slalom, line endpoint, following fish and water pan; DOM variables update without React rendering each frame. Hidden-tab elapsed time paused, reduced motion removes looping animations and sway. Generated using built-in imagegen: back-view character reference from officialVer6 image11, dark hime hair/ahoge, white sleeveless, denim shorts, red compact life vest; back-facing cast with rod, transparent. Background prompt: no people/rods/fish/text, clear estuary with dry dock lower-left and open water center/right. Sources exec-80a0a180-2db6-49a4-9ee9-585370745b02.png and exec-a5b7cce9-0626-451d-ae50-4cb4870cbd9d.png. Runtime missions/bigbait-back-tsuduri.webp and bigbait-dock.webp. Illustrative animation prototype; not a completed frame-by-frame character rig.

Checks:20 BAR-triple boards across all role/bonus contexts,9261 boards and20k games,111132 common-role all-phase/order cases, middle7 counts/double7, v9 migration idempotency, preview two-cycle FSM/input guards, role/chance/control/layout regression, TypeScript/Vite. Browser visual verification unavailable with current local Chromium missing. Existing build warnings: missing local ui-check background and large JS bundle.

## Continuous water scene prototype (2026-11-28)
The preview now uses SlotBaitCinema's Canvas renderer instead of reel-symbol
sprites. It draws an articulated joint bait, attached line, perspective ripples,
underwater particles/light shafts, and an animated pursuing fish. Game 2 switches
to an underwater viewpoint. Win/miss/retry still use the independent 2-game FSM.
This is an unfinished motion prototype: dedicated character casting animation,
finished illustrated fish/water art, sound and visual browser review remain
outstanding. Do not describe it as production-quality animation or deploy it as
an approved visual replacement without reviewing the actual moving scene.

## Illustrated keyframe revision
Replaced continuous procedural art with newly drawn character keyframes and
shared environment/lure/fish plates in missions/bigbait-v2. Actor images and
transparent gear overlays remain separate; each pose has a registered grip
anchor and feet alignment correction. STOP movements are discrete right/left/right,
not an idle oscillation. The included GIF is a paced success-route visual sample,
not a recording of real input timing. Only Tsuduri is currently drawn; other
character skins and full distinct miss/retry art still need production. Automated
FSM/type/build checks do not certify illustration anatomy or physical accuracy.

## Production integration: follow and reaction inset
Bigbait challenges in normal play now render the accepted above-water top-down
slalom/follow plates, keyed to reel stop count, with a separate reaction inset.
Tsuduri has three new expressions. Other actors use their own existing icon;
they must never display Tsuduri's new face. Cast plates are only used for Tsuduri.
Failure returns to the corresponding fish-free top plate. Confirmation uses the
existing internal outcome; no award/lottery/save-state changes are included.
The preview still offers independent win/miss/retry controls. The pre-existing
normal-play 6–10G chance duration remains unchanged; full 2G challenge scheduling
and bespoke reaction art for the other four actors are separate unfinished work.
