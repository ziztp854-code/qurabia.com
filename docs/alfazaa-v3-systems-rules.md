# Alfazaa systems rules, version 1

This is an independent implementation authorized by the user. Extracted client tables supply content, identifiers and costs; the unavailable original server does not supply eligibility, combat results, clock rules or random outcomes. No original-server behavioral equivalence is claimed. The gameplay modules do not contact original game services; authenticated persistence is provided by the Alfazaa server repositories. The release is an independent implementation, not a recovered original server.

## Source coverage and reproducibility

The importer is the conversation workspace `work/import_alfazaa_systems.py`; run it from `work/alfazaa-parity` with `python ../import_alfazaa_systems.py`. Its five runtime catalogs contain 2,202 research rows (1,649 College and 553 ScienceCollege), 3,590 items, 3,327 drop tables, source choicebox options, 2,588 recipes, 1,279 shop rows, 1,288 arm definitions including combat-only NPCs, 80 player levels, seven companions, 200 destroyer levels and 16 relics. State bootstrap contains compact identifier/cap lists rather than full catalogs.

Research branch identity is `college:<Type>` for College and `science:<first NextId-chain source ID>` for ScienceCollege. Science has 99 independent chains but only 42 buff Types: Types must never be used as branch identity. Level-zero prerequisites are implicit baselines. A completed source ID also satisfies lower levels in the same chain. Prerequisites, player/castle/building gates, sequential NextId progression, requested-row cost, additional LvGold, duration and completion XP are enforced. One timed research per college is allowed. Attribute Types aggregate only the explicitly mapped effects; troop-specific attack/resistance is averaged into the shared independent battle modifier. Original special marching, military decorations, super troops and hero-party-cap effects are not implemented merely because their research rows are visible.

All source quantities up to 1e9 remain unchanged. Larger costs, rewards and XP use `floor(1e9 * (1 + log10(raw / 1e9)))`. IDs, Types, levels and probability weights are not transformed. Runtime resource balances are safe integers in [0, 1e12]. Jobs are capped at seven days; zero-second research remains immediate. Catalog metadata records this numeric adaptation and SHA-256 of each unmodified source CSV.

## Queues and progression

Only source arms with SType=1 and Type in {0,1,2} are playable infantry/cavalry/ranged units. NPC definitions remain available only to combat lookup. Training, inventory-to-reserve, healing and deployment reject NPCs. A matching barracks of at least the unit level, army cap, resources and one of three training slots are required. Source per-unit training/healing costs, time and training XP apply. No-cost special rows do not become free troops. The independent army cap is `min(100, castleLevel + 2 + max(0, College.Value - 1))`; actual recruitable units remain bounded by playable source content.

Completed units enter a reserve capped at 100,000 per ID. A full reserve retains the due job and grants no partial units/XP; other actions remain usable, and deployment can free capacity. Deployment requires a free city cell and is applied atomically by the city reducer. Healing debits the wounded ledger when queued, uses a real hospital, and returns units to reserve. Independent hospital capacity is hospitalLevel*10 plus College16/Science28 source values; College17/Science5/108 modify healing duration. College16 is capacity, never a health bonus. Job completion and its XP occur once. Speedups consume actual inventory and reduce an existing finish time; a tick/refresh completes any now-due jobs.

Player XP lives only in balance 1200001. Source Identity.Exp costs are accumulated to derive levels; event counters never award XP again. Companions require castle2, source hatch/feed materials and source hatch time, with one hatch job. Each feed independently adds one level, max100. The original HatchLimit service is replaced by the stated castle gate. Each companion level adds 1% shared attack. Destroyer upgrades require castle5, source row Cost plus ceil(NeedExp/100) blueprints, with 0.5% attack per level; original training/critical-hit/skill/module rules are absent. These are explicit adaptations.

Relics consume a source inventory item on acquisition, preserve replaced items in the owned ledger, enforce one item per each of four source slots, and charge source group/level upgrade costs. Stored relic value is actual level+1 to distinguish level0 ownership. Each equipped stored level contributes 0.5% health. Unequipped relics may be dismantled once for base source Decompose rewards; spent upgrades are not refunded. Original relic stars/random affixes and companion equipment are not implemented.

## Bag, drops, crafting and shop

Fixed drops grant every reward. Weighted drops use the source weights with a bounded, deterministic independent LCG seeded only from trusted context; this is not original-server RNG. Nested DropList integer IDs resolve recursively with depth/call/output caps. Actual selectable boxes are identified by Type3/ItemType4 and a valid source choicebox.UseGain table, not by words in another chest's description. A selected option is validated, multiplied by count, and consumes the actual box once. Parent chests containing choice boxes still grant all their fixed rewards.

Resource packs keep the source target currency but use Identity.ShopGold as an independent pack quantity because original quantities are server-owned. Hero XP books require the hero-targeted command, and speedups require a job. Crafting aggregates all source costs/rewards and rejects insufficient funds or overflow before mutation. Hero books, all57 hero fragments, formation/skill/gear materials and relics are obtainable through the independent quartermaster for virtual gold, max100 batches per item/Riyadh day. Currency and generic loot/resource packs are excluded from that exchange. Material800081 is explicitly available for crafting, priced at least its role-level gold-pack return, avoiding a buy/open gold arbitrage.

Virtual source shops require nonempty item-backed costs/rewards and VIP=0, enforce source role/alliance gates and stock. LimitType2 is an independent lifetime stock rule; other rows reset daily. Original real-money payments, VIP purchases, server shop rotations, paid refreshes and purchase receipts are not implemented.

## Quest namespaces, counters and adaptations

| Family | Imported rows | Predicate bindings | Unavailable binding Types |
| --- | ---: | ---: | --- |
| main | 968 | 968 | none |
| road | 35 | 35 | none |
| plot | 63 | 63 | none |
| daily | 591 | 591 | none |
| milestone | 16 | 16 | none |

A bound predicate is not proof of original-server parity or a browser journey for all1,673 rows. Main groups progress sequentially. Road/plot chapters require earlier chapter reward claims; chapter rewards require all chapter objectives. Permanent claims use `<family>:<id>` to avoid ID collisions. Daily choices and claims have separate ledgers. Current ownership predicates inspect actual cells/reserve, research chain levels, hero levels/visible stars, learned extra skills, actual skill levels, equipment levels, rarity and companion/relic ownership. Hero skill IDs must never be mistaken for skill levels, and born skills do not satisfy an additional learned skill. Lifetime/daily/weekly counters accumulate successful events, not spendable wallet balances. Claims and resource transfers are immutable and atomic at the handler boundary; account transaction/idempotency guarantees belong to the parent repository.

Every adapted objective exposes a changed player-facing objective, an adaptation explanation, original sourceDescription and sourceGoal. Important replacements:

- Legacy hero17 means any owned current-catalog hero; legacy skill1000001 means one actually learned additional skill. The displayed goal is1, not the old skill ID.
- Road303 follows its source description: nine infantry at level20 or above; raw source fields encode target10009/Condition20 and are retained as metadata.
- Old mold/talent crafting objectives use successful inventory crafting. Captured city regions use independent tower victories. All relic slots means the four slots in the extracted current table.
- Source winged-boss objectives use the real shared-world guild boss and its contributor reward. Daily boss goal is1 because Alfazaa has one such defeated-boss claim per account/day.
- Daily voice-gift/room-minute/microphone-minute Types36/37/38 are replaced by guild help, three expedition wins and three trial wins respectively. They do not claim microphone publication, room duration, voice purchases or voice telemetry.
- Plot70/71 use actual guild donation/help instead of unavailable guild-challenge services. Plot73/daily50 use actual guild boss gift claims. Legendary-hero goals use current rarity>=5 and visible stars. Anti-troop research uses College126/129/130.
- Milestone battle power uses the documented independent score: city troop levels*1000 + hero levels*1000 + visible hero stars*5000, rather than the unavailable original formula.

Dailies unlock at player level10, choose10 distinct eligible task types deterministically and retain that list once persisted. Daily base Award is combined with role Identity daily drop and TaskDayGold/TaskDayExp*Bei. Reward thresholds are the actual Global.TaskDay UI1/3/6/10, not the inconsistent taskbox table2/5/8/10. Source Nobility1 boxes resolve drops300001..300004. All daily stock/counters/claims reset at Riyadh midnight; this replaces the original server-selected TimeZone. Permanent rewards never reset. Paid task refreshes/free rerolls are absent.

Two additional independent scheduled challenges use actual game counters: daily battle wins at1/3/5 and weekly recruitment+merges+quest claims at10/25/50/100/250. Weeks begin Monday/Riyadh time. Each tier can be claimed once per cycle; reward rows and dates are exposed in the UI.

## Interface and verification boundaries

The lazy SystemsPanel has five quest families plus research, training/healing/reserve, bag/choice boxes, crafting, virtual supply/shop, companions/destroyer/relics and scheduled challenges. Search and12-row pagination bound catalog rendering. Resource icons and companion images are extracted assets. Inherited Arabic typography and scoped navy/gold tokens keep the existing game visual language. Source rich text is stripped to plain text; no HTML injection is used. Costs, actual gates, reward claims, busy states, safe error messages and independent objectives are visible.

Public tests exercise source research charges/branches/prerequisites, timed output/XP exactly once, full reserve recovery, wounded healing, deployment capacity, crafting conservation, fixed/weighted/nested/selected loot, actual57-hero supply reachability, quest namespaces/chapter gates,10 daily claims and four boxes, reset/claim replay prevention, progression costs/slots, real skill-level semantics, schema/state bounds and UI commands/gates. UI tests do not substitute for the parent's desktop/mobile browser or real-account API/database concurrency checks. Original server equivalence remains unverified by design.

Latest local coverage will be recorded after the final verification run below.

## Unmodified source SHA-256

| CSV | SHA-256 |
| --- | --- |
| College.csv | `4eae5fda8aeec85dc41ac105d283d4b607df62887160bcb6e60d841cbcbf62bd` |
| DropItem.csv | `2e9e8282c85109dfd815c3cd843636d041240dbd9e57542586da7d179e51f954` |
| Identity.csv | `7d670e7003f281d0f98bec6cb23fc4c85447bc513a995ae26e99dad523445ff0` |
| Item.csv | `1b9b27ac4f0b1ee87fa83f61fc8aa18760d1db2f1c26365ab0b765fd0cd6a365` |
| MergeItem.csv | `edead765083665850a711ac5bc36ac1a3e999243cbff4b73d0109f1c10428e78` |
| NewShop.csv | `56ead79c040fee9517dfb3348fcda6dd83e02de2029b2fc5ac0ef528788cd93d` |
| ScienceCollege.csv | `57dd5ba0a5cf961a18e830c42e4984ab33eb84d8c5a1e03f014942ab80834f8c` |
| arms.csv | `d1e51849e013dfe1b63bafaf215dbe2255252307105f358291c0129b56d7db10` |
| choicebox.csv | `6004a6bdbea039b6e128c41f96fb080d8d3ce2dbcc76019a625769a6253eb928` |
| destroyer.csv | `600914b4808e02a22aec9f863f35862ffc97ed8dda7a6112f21ee240eae7b1b9` |
| godbeast.csv | `0e2ddbe94fb38b0b27892231c928edc3c7564dd1a3327955ec01d9a4d9411c5f` |
| relic.csv | `f3f2d17f59f7a680dbe3276a619b6a5c6ab0843a0430efa6b3af13d4607c10b2` |
| reliclevel.csv | `fde48bef09bffe28ae115f73a3e0e4e909b05a8ed10da89bfd89dbe3fa01eda2` |
| task.csv | `f639f109080ec7c5204c87bd0a31878e6df5de154770323f6280a1d100810c51` |
| taskday.csv | `ea4bc82d6aa30bf49029affae698aa822ff12ea80037e4788f5a6cbb50adc26b` |
| taskmilestone.csv | `97705db17eb5e714a93b67ad202f6020c76831af812e781d87162b1bb4f1c401` |
| taskplot.csv | `d591d2df3a8e8cff090f79da23cd3b9f6260117af23d292223f65090621ad2d6` |
| taskroad.csv | `935009802f476b614ef1d3edc39e17316dccc87c424fc01ea212770f0d4baed2` |
