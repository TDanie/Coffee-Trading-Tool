# Coffee Trading Desk — Pilot v1

A production-ready, single-page trading tool for Uganda green bean coffee export.
Built for daily use by field buyers and traders — no backend required for Pilot v1.

---

## What it does

Six integrated modules, all live-calculating from the same market inputs:

| Module | Purpose |
|---|---|
| **Field Buyer** | Should I buy this batch? BUY / BELOW TARGET / WALK AWAY verdict with exact QC cut calculations |
| **Trader View** | Full margin model for any deal — FAQ or processed, any grade, any volume |
| **Market Intel** | Competitor analysis, inferred buyer diffs, per-location action recommendations |
| **Diff Table** | All grades × current benchmark diffs — shows max payable and viability signal |
| **Cost Engine** | Full cost structure at any TEU volume — see how fixed costs dilute as you scale |
| **Deal Log** | Persistent session log of every assessed deal with P&L summary |

Key trading logic implemented:
- QC factor calculation (MC penalty, pods, extraneous matter, husks)
- Blended FOB across the full grade mix
- Location viability check (clean coffee vs wet-only vs skip)
- Exact kg-cut calculation to reach target margin
- Competitor diff inference from farm-gate prices
- FAQ vs processed cost separation

---

## File structure

```
/
├── index.html    — Clean semantic HTML, no inline CSS or JS
├── styles.css    — All styles, organized by component
├── app.js        — All JavaScript, organized in 19 sections
└── README.md     — This file
```

`app.js` sections:
1. Constants & Configuration
2. State
3. Data Persistence (localStorage abstraction — swap for Supabase later)
4. Utility Functions
5. Calculations (pure functions, no DOM)
6. Field Buyer rendering
7. Grade mix grid rendering
8. Trader View rendering
9. Market Intel rendering
10. Diff Table rendering
11. Cost Engine rendering
12. Deal Log rendering
13. Copy Deal Summary
14. Sidebar rendering
15. Live Price Fetch
16. Navigation & mode switching
17. Master update
18. DOM helpers
19. Initialization

---

## Running locally

No build step required. Just open `index.html` in a browser.

```bash
# Option A — open directly
open index.html

# Option B — serve locally (avoids any CORS issues with fetch)
npx serve .
# or
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

---

## Deploying to Vercel or Netlify

### Vercel
```bash
npm install -g vercel
vercel
# Follow the prompts — deploy as a static site
```

Or connect your GitHub repo to Vercel and it deploys automatically on push.

### Netlify
```bash
npm install -g netlify-cli
netlify deploy --prod --dir .
```

Or drag the folder into app.netlify.com for instant deploy.

No build configuration needed — this is plain HTML/CSS/JS.

---

## Data persistence (current)

All state is stored in `localStorage` under these keys:

| Key | Contents |
|---|---|
| `ctd_deal_log` | Array of logged deals |
| `ctd_comp_rob` | Robusta competitor prices |
| `ctd_comp_ara` | Arabica competitor prices |
| `ctd_rob_mix` | Robusta grade mix percentages |
| `ctd_ara_mix` | Arabica grade mix percentages |
| `ctd_loc_deds` | Location transport deductions |
| `ctd_settings` | Benchmark diffs, target margin, last prices |

All persistence goes through wrapper functions in **Section 3** of `app.js`:

```js
loadAppState()
saveAppState()
getDealLog()
saveDealLog(log)
clearDealLog()
getCompetitorPrices(type)
saveCompetitorPrices(type, data)
```

---

## Backend integration (Supabase — later)

When you're ready to move to a real backend, only `Section 3` of `app.js` needs to change. The rest of the app is unaffected.

Replace each function with a Supabase call:

```js
// Current (localStorage)
function getDealLog() {
  return JSON.parse(localStorage.getItem('ctd_deal_log') || '[]');
}

// Future (Supabase)
async function getDealLog() {
  const { data } = await supabase
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false });
  return data || [];
}
```

Suggested Supabase tables:

```sql
deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  created_at timestamptz default now(),
  type text,          -- 'ROB' | 'ARA'
  mode text,          -- 'FAQ' | 'Processed'
  location text,
  price numeric,
  weight numeric,
  moisture numeric,
  qc_factor numeric,
  margin numeric,
  profit numeric,
  verdict text,
  ice_price numeric,
  liffe_price numeric,
  fx_rate numeric
)

competitor_prices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  updated_at timestamptz default now(),
  type text,          -- 'rob' | 'ara'
  prices jsonb        -- [{ name, price }]
)

settings (
  user_id uuid primary key references auth.users,
  scr15_diff numeric,
  bugaa_diff numeric,
  target_margin numeric,
  rob_mix jsonb,
  ara_mix jsonb,
  loc_deductions jsonb
)
```

---

## Daily workflow

1. **Morning** — update competitor prices in the sidebar, press Fetch Live Prices
2. **In the field** — open Field Buyer, enter price/weight/MC, read the verdict and location check
3. **After each batch** — press Log This Deal to record it
4. **End of day** — review Deal Log for P&L summary
5. **Weekly** — check Market Intel for diff position vs competitors

---

## Configuration

Core trading parameters live in `app.js` Section 1 (Constants):

- `ROB_GRADES` / `ARA_GRADES` — grade names, spreads vs benchmark, default mix %
- `LOCATIONS` — collection points and transport deductions
- `DEFAULT_COMPS` / `DEFAULT_COMPS_ARA` — starting competitor prices
- `VAR_COST_MT` — variable cost components
- `WAGES_UGX`, `RENTS_USD`, `AMORT_MT`, `DHL_USD` — fixed cost inputs

Update these when your cost structure or grade spreads change.
