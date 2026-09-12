# Storm Events

Assignment tool for the alliance's weekly storm events (Canyon Storm / Desert
Storm) in Last War: Survival. Sister app to the VIP Train scheduler.

## What it does
- **Roster** — 100 members with THP. Core = top N by power (setting, default 34),
  derived automatically so it never goes stale. Inline THP edit + bulk paste.
- **Plan** — R4 ticks who voted available in-game (CSB / DSB checkboxes), hits
  Generate. The engine fills CSB (Thu) first, then DSB (Fri).
- **Board** — the four teams (CSB A/B, DSB A/B), 20 starters + 10 subs each,
  balanced by power, core marked. Every placement is override-able. Confirm to
  save and update history.
- **History** — participation over the trailing fairness window (what the engine
  uses) and all-time, least-recently-played first.
- **Admin** — alliance name, core size, fairness window.

## The assignment rules (see src/lib/engine.js)
1. CSB filled first, then DSB.
2. Core plays **both** events whenever available (they're the win condition).
3. Pool fills remaining slots by fairness: fewest recent plays, then longest
   benched, then higher THP.
4. Anti-back-to-back: no available pool player is left out of both events, and
   nobody gets a second event before everyone available has had one.
5. Each event's group is snaked by THP into Team A/B for balance.
6. Each team: top 20 by THP start, next 10 are subs.

The engine is a pure function with unit tests: `npm test`.

## Run locally
```
npm install
npm run dev        # runs against an in-memory mock; PINs are admin / officer
npm test           # runs the engine unit tests
```

## Wire up Supabase (new project, separate from VIP Train)
1. Create a new Supabase project.
2. Open `supabase/schema.sql`, change the two PINs at the top, run it in the SQL editor.
3. Copy `.env.example` to `.env`, fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. `npm run dev` — it now reads/writes the real database.

## Deploy (GitHub Pages)
Push to `main`. Add repo secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
The Actions workflow builds with the right base path automatically.

## Import the roster from VIP Train
VIP Train stored names only (no THP). Export the names from that project's SQL editor:
```sql
select name from members where active order by position;
```
Then paste them into the Roster **Bulk paste THP** box here, adding each THP:
```
Ace, 14.2M
Blaze, 13.8M
```
Existing names update; new ones are added. You can re-paste anytime THP shifts.
