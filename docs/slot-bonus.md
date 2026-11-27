# Bonus screens and NABU★RUSH

BIG: 1 BET, guaranteed bell, 15 medals per game. Ends at >=252 gross payout (17 games / 255 medals when starting at zero). Normal payouts remain bell6 / watermelon10 / cherry2. Bonus payouts: bell15 / watermelon15 / cherry8 / chance0. Rare misses pay zero but still extend RUSH.

NABU★RUSH: starts with8 games. Every game uses the same table: cherry3%, watermelon4.5%, chance1.5%, bell91%. No opening advantage, hidden continuation bonus, cap or pity adjustment. After each settled game subtract1, then add8 for any internally drawn rare role, including the last game and missed symbols. Each rare adds independently; multiple rare games stack. No regular bonus lottery runs while a bonus is active.

Theoretical P(extension in initial8)=1-.91^8=52.97%; mean games=8/(1-8*.09)=28.57. Distribution has a long tail: no fixed maximum. Seed57 simulation of200,000 sessions averaged28.51 games,52.95% extended, longest1072 games. This is an initial recreational game balance, not manufacturer data.

Confirmation: fresh five-character group illustration and HTML text. Pending announced bonuses and newly aligned bonus symbols show confirmation until the first bonus lever. Active bonuses use a separate fishing stage with grounded actor placement on foreground wooden pier. Lever casts, any STOP enters fight, and only settlement after all three reel animations displays GET. Final game keeps GET/FINISH until the next lever. Reduced-motion supported.

Save version8 preserves wallet, pending flags, hidden lead-ups and completed history. Old unfinished spins are cancelled and charged BET refunded once. Existing REG receives a fresh8 games while preserving earned payout; existing BIG keeps payout toward252 and uses15-medal bells going forward.

Artwork: image_gen edit/reference mode for group, using official Ver6 image11; generation mode for background. Group prompt: exactly five official3.5-head characters celebrating catch on dry harbor boardwalk, preserve hairstyles/outfits/skin, pink gold rainbow confetti, no text; lower title space. Background prompt: no characters/text, anime sunny harbor, dry wooden pier across bottom28%, sparkling ocean and distant fishing village. Originals: generated_images/exec-75021ff8-7cb4-48f9-94d6-a48b5a34a38e.png and exec-9ca7f19e-6aef-4584-92fb-f8f7deedd917.png. Runtime WebPs960x576 quality82. Existing standalone actor poses reused; no cropped multi-character sheets.

Validation: test-slot-bonus.mjs (engine and200k simulation), test-slot-bonus-view.cjs (rendered state transitions), existing20k engine simulation, common-role exhaustive111132 games, roles, controls, layout, chance and artwork tests; TypeScript and Vite build. Live browser gameplay not verified because the available app session is locked.
