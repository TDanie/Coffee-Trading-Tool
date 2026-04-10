/* ═══════════════════════════════════════════════════════════
   Coffee Trading Desk — app.js
   Pilot v1
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════════════════
   SECTION 1 — CONSTANTS & CONFIGURATION
   ═══════════════════════════════════════════════════════════ */

const ICE_CONV  = 22.046;    // cts/lb → USD/MT
const FOT_FOB   = 109.635;   // Kampala → Mombasa logistics USD/MT
const MT_TEU    = 19.2;      // green bean MT per TEU
const WAGES_UGX = 240912000; // annual wagebill UGX
const RENTS_USD = 1066.67;   // monthly rents USD
const AMORT_MT  = 20;        // amortisation USD/MT fixed
const DHL_USD   = 1000;      // annual DHL cost USD

// Variable cost per MT (all items that don't change with volume)
const VAR_COST_MT =
  7.232    // handling
  + 21.667 // jute bags
  + 26.504 // drying/grading
  + 1.325  // utilities
  + 0.828  // PSI + fumigation
  + 1.380  // phyto + cert
  + 79.872 // UCDA cess (2% of FOB — approximated here)
  + 49.014 // interest (UGEXIM 6%, 90d)
  + 6.626  // broker commission
  + 22.0   // BXL hedging
  + 0.603  // misc
  + FOT_FOB;

// Robusta grades: name, spread vs Scr15 benchmark (USD/MT), default mix %
const ROB_GRADES = [
  { name: 'Screen 18',  label: 'Screen 18',  spread: 127,   mix: 12.3 },
  { name: 'Screen 17',  label: 'Screen 17',  spread: 62,    mix: 18.4 },
  { name: 'Screen 15',  label: 'Screen 15 ★', spread: 0,   mix: 32.7 }, // benchmark
  { name: 'Screen 12',  label: 'Screen 12',  spread: -60,   mix: 23.5 },
  { name: 'Black Beans',label: 'Black Beans', spread: -1050, mix: 0   },
  { name: 'BHP',        label: 'BHP',        spread: -1050, mix: 9.7  },
  { name: 'Pods',       label: 'Pods',       spread: -2750, mix: 0    },
];

// Arabica grades: name, spread vs BugAA benchmark (cts/lb), default mix %
const ARA_GRADES = [
  { name: 'Wugar',      label: 'Wugar',      spread: 0,    mix: 75.0 },
  { name: 'Bugisu AA',  label: 'Bugisu AA ★', spread: 0,  mix: 8.0  }, // benchmark
  { name: 'Bugisu A',   label: 'Bugisu A',   spread: 0,    mix: 5.0  },
  { name: 'Bugisu AB',  label: 'Bugisu AB',  spread: -10,  mix: 2.0  },
  { name: 'Bugisu CPB', label: 'Bugisu CPB', spread: -20,  mix: 1.5  },
  { name: 'Drugar',     label: 'Drugar',     spread: -45,  mix: 3.5  },
  { name: 'Triage',     label: 'Triage',     spread: -165, mix: 1.5  },
];

// Collection points and their transport deductions from Namanve (UGX/kg)
const LOCATIONS = [
  { name: 'Namanve (Factory)', deduction: 0   },
  { name: 'Zigoti',            deduction: 100 },
  { name: 'Masaka',            deduction: 200 },
  { name: 'Mubende',           deduction: 300 },
  { name: 'Rukungiri',         deduction: 350 },
];

// Default competitor prices (UGX/kg at Namanve)
const DEFAULT_COMPS = [
  { name: 'KCL',     price: 12700 },
  { name: 'LD',      price: 12700 },
  { name: 'Ugacof',  price: 12700 },
  { name: 'Kawacom', price: 12700 },
  { name: 'Olam',    price: 12700 },
  { name: 'IBERO',   price: 12700 },
];

const DEFAULT_COMPS_ARA = [
  { name: 'KCL',     price: 17500 },
  { name: 'Kawacom', price: 17500 },
  { name: 'Olam',    price: 17500 },
];

// localStorage keys
const LS = {
  DEAL_LOG:      'ctd_deal_log',
  COMP_ROB:      'ctd_comp_rob',
  COMP_ARA:      'ctd_comp_ara',
  ROB_MIX:       'ctd_rob_mix',
  ARA_MIX:       'ctd_ara_mix',
  LOC_DEDS:      'ctd_loc_deds',
  SETTINGS:      'ctd_settings',
};

/* ═══════════════════════════════════════════════════════════
   SECTION 2 — STATE
   ═══════════════════════════════════════════════════════════ */

// Mutable runtime state
let robMix = ROB_GRADES.map(g => g.mix);
let araMix = ARA_GRADES.map(g => g.mix);
let locDeds = LOCATIONS.map(l => ({ ...l }));
let compsRob = DEFAULT_COMPS.map(c => ({ ...c }));
let compsAra = DEFAULT_COMPS_ARA.map(c => ({ ...c }));

// UI mode state
let fbType     = 'rob';  // 'rob' | 'ara'
let fbMode     = 'faq';  // 'faq' | 'proc'
let fbProcType = 'rob';
let tvType     = 'rob';
let tvMode     = 'faq';
let tvProcType = 'rob';

// Price fetch state
let lastFetchTime = null;

/* ═══════════════════════════════════════════════════════════
   SECTION 3 — DATA PERSISTENCE (localStorage abstraction)
   These functions are the only place localStorage is touched.
   Replace their internals with Supabase calls later.
   ═══════════════════════════════════════════════════════════ */

function loadAppState() {
  try {
    const settings = JSON.parse(localStorage.getItem(LS.SETTINGS) || 'null');
    if (settings) {
      if (settings.scr15Diff) setInputVal('scr15-diff', settings.scr15Diff);
      if (settings.bugaaDiff) setInputVal('bugaa-diff', settings.bugaaDiff);
      if (settings.target)    setInputVal('target',     settings.target);
      if (settings.ice)       setInputVal('ice',        settings.ice);
      if (settings.liffe)     setInputVal('liffe',      settings.liffe);
      if (settings.fx)        setInputVal('fx',         settings.fx);
    }
    const savedRobMix = JSON.parse(localStorage.getItem(LS.ROB_MIX) || 'null');
    if (savedRobMix && savedRobMix.length === ROB_GRADES.length) robMix = savedRobMix;

    const savedAraMix = JSON.parse(localStorage.getItem(LS.ARA_MIX) || 'null');
    if (savedAraMix && savedAraMix.length === ARA_GRADES.length) araMix = savedAraMix;

    const savedLocs = JSON.parse(localStorage.getItem(LS.LOC_DEDS) || 'null');
    if (savedLocs && savedLocs.length === LOCATIONS.length) locDeds = savedLocs;

    compsRob = getCompetitorPrices('rob');
    compsAra = getCompetitorPrices('ara');
  } catch (e) {
    console.warn('Could not load app state from localStorage:', e.message);
  }
}

function saveAppState() {
  try {
    const settings = {
      scr15Diff: V('scr15-diff'),
      bugaaDiff: V('bugaa-diff'),
      target:    V('target'),
      ice:       V('ice'),
      liffe:     V('liffe'),
      fx:        V('fx'),
    };
    localStorage.setItem(LS.SETTINGS,  JSON.stringify(settings));
    localStorage.setItem(LS.ROB_MIX,   JSON.stringify(robMix));
    localStorage.setItem(LS.ARA_MIX,   JSON.stringify(araMix));
    localStorage.setItem(LS.LOC_DEDS,  JSON.stringify(locDeds));
  } catch (e) {
    console.warn('Could not save app state:', e.message);
  }
}

// ── Deal Log ─────────────────────────────────────────────

function getDealLog() {
  try {
    return JSON.parse(localStorage.getItem(LS.DEAL_LOG) || '[]');
  } catch (e) {
    return [];
  }
}

function saveDealLog(log) {
  try {
    localStorage.setItem(LS.DEAL_LOG, JSON.stringify(log));
  } catch (e) {
    console.warn('Could not save deal log:', e.message);
  }
}

function clearDealLog() {
  const log = getDealLog();
  if (log.length === 0) return;
  if (!confirm(`Clear all ${log.length} logged deals? This cannot be undone.`)) return;
  saveDealLog([]);
  renderDealLog();
}

// ── Competitor Prices ─────────────────────────────────────

function getCompetitorPrices(type) {
  const key      = type === 'rob' ? LS.COMP_ROB : LS.COMP_ARA;
  const defaults = type === 'rob' ? DEFAULT_COMPS : DEFAULT_COMPS_ARA;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && saved.length === defaults.length) return saved;
  } catch (e) { /* fall through */ }
  return defaults.map(c => ({ ...c }));
}

function saveCompetitorPrices(type, data) {
  const key = type === 'rob' ? LS.COMP_ROB : LS.COMP_ARA;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('Could not save competitor prices:', e.message);
  }
}

/* ═══════════════════════════════════════════════════════════
   SECTION 4 — UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════ */

/** Read a numeric input value safely */
const V = (id) => parseFloat(document.getElementById(id)?.value) || 0;

/** Set an input's value without triggering events */
const setInputVal = (id, val) => {
  const el = document.getElementById(id);
  if (el) el.value = val;
};

/** Format a number with locale-aware thousands separators */
const fmt = (n, decimals = 0) =>
  n.toLocaleString('en-UG', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Get a DOM element by ID, return null if missing (no throws) */
const el = (id) => document.getElementById(id);

/* ═══════════════════════════════════════════════════════════
   SECTION 5 — CALCULATIONS
   All pure functions — no DOM access inside here.
   ═══════════════════════════════════════════════════════════ */

/** MC factor table — fixed absolute ranges */
function mcFactor(mc) {
  if (mc <= 14.0) return 1.0;
  if (mc <= 15.0) return 1.25;
  if (mc <= 16.0) return 1.5;
  if (mc <= 17.0) return 1.75;
  return 2.0;
}

/** MC penalty fraction above tolerance */
function mcPenalty(mc, tolerance) {
  if (mc <= tolerance) return 0;
  return (mc - tolerance) * 0.01 * mcFactor(mc);
}

/** Combined QC factor from all defect inputs */
function calcQCFactor(mc, tolerance, pods, exm, husks) {
  const mcPenPct  = mcPenalty(mc, tolerance) * 100;
  const totalPen  = mcPenPct + (pods || 0) + (exm || 0) + (husks || 0);
  const factor    = 100 / Math.max(100 - totalPen, 1);
  return { factor, totalPen, mcPen: mcPenPct };
}

/** Get the current QC inputs from Field Buyer form */
function getQCInputs() {
  return {
    mc:        V('fb-mc'),
    tolerance: parseFloat(document.getElementById('mc-tol')?.value) || 13.0,
    pods:      V('fb-pods'),
    exm:       V('fb-exm'),
    husks:     V('fb-husks'),
  };
}

/** FOB price for a given diff value */
function getFob(type, diffVal) {
  if (type === 'rob') return V('liffe') + diffVal;
  return (V('ice') + diffVal) * ICE_CONV;
}

/** Diff value for a grade */
function getGradeDiff(type, gradeIdx) {
  const grades = type === 'rob' ? ROB_GRADES : ARA_GRADES;
  const bench  = type === 'rob' ? (V('scr15-diff') || 650) : (V('bugaa-diff') || 35);
  return bench + grades[gradeIdx].spread;
}

/** Blended FOB across the current grade mix */
function getBlendedFob(type) {
  const grades = type === 'rob' ? ROB_GRADES : ARA_GRADES;
  const mix    = type === 'rob' ? robMix     : araMix;
  const bench  = type === 'rob' ? (V('scr15-diff') || 650) : (V('bugaa-diff') || 35);
  return grades.reduce((sum, g, i) => {
    const fob = getFob(type, bench + g.spread);
    return sum + (mix[i] / 100) * fob;
  }, 0);
}

/** FAQ cost structure at a given TEU volume */
function calcFAQCosts(teu) {
  const fx     = V('fx') || 3773;
  const mtYear = teu * MT_TEU * 12;
  const wages  = WAGES_UGX / fx / mtYear;
  const rents  = RENTS_USD / mtYear;
  const dhl    = DHL_USD   / mtYear;
  const fixed  = wages + rents + AMORT_MT + dhl;
  return { wages, rents, dhl, fixedTotal: fixed, varTotal: VAR_COST_MT, total: VAR_COST_MT + fixed };
}

/** Processed-mode cost (no processing — logistics only) */
function calcProcCosts(fob, handling) {
  return FOT_FOB + 0.02 * fob + 49.014 + 0.828 + 1.380 + (handling || 20);
}

/** Current TEU slider value */
const getCurrentTeu = () => parseFloat(document.getElementById('c-slider')?.value) || 7.2;

/** Average robusta competitor price */
function getAvgComp() {
  const active = compsRob.filter(c => c.price > 0);
  return active.length ? active.reduce((a, b) => a + b.price, 0) / active.length : 12700;
}

/** Average arabica competitor price */
function getAvgCompAra() {
  const active = compsAra.filter(c => c.price > 0);
  return active.length ? active.reduce((a, b) => a + b.price, 0) / active.length : 17500;
}

/**
 * Calculate the additional kg cut needed to reach the target margin.
 * Returns { possible, extraCutKg, neededCutKg, currentCutKg, neededPayKg, neededEffPrice }
 */
function calcRequiredExtraCut(blendedFob, refPrice, fx, costs, target, wt, currentFactor) {
  const neededBuyPerMT = blendedFob - costs - target;
  if (neededBuyPerMT <= 0) {
    return { possible: false, reason: 'No price makes this work at current diff. Raise your diff first.' };
  }
  const neededEffPrice = neededBuyPerMT * fx / 1000;
  if (neededEffPrice >= refPrice) {
    return { possible: false, reason: 'Blended FOB too low to cover costs + target even with zero pay. Raise your diff.' };
  }
  const neededFactor   = refPrice / neededEffPrice;
  const currentCutKg   = wt - wt / currentFactor;
  const neededCutKg    = wt - wt / neededFactor;
  const extraCutKg     = Math.max(0, neededCutKg - currentCutKg);
  const neededPayKg    = wt / neededFactor;
  return { possible: true, neededFactor, neededCutKg, currentCutKg, extraCutKg, neededPayKg, neededEffPrice };
}

/* ═══════════════════════════════════════════════════════════
   SECTION 6 — RENDERING: FIELD BUYER
   ═══════════════════════════════════════════════════════════ */

function updateFB() {
  const faqCosts = calcFAQCosts(getCurrentTeu());
  const target   = V('target');
  const fx       = V('fx');

  if (fbMode === 'faq') {
    _updateFB_faq(faqCosts, target, fx);
  } else {
    _updateFB_proc(faqCosts, target, fx);
  }
}

function _updateFB_faq(faqCosts, target, fx) {
  const blendedFob = getBlendedFob(fbType);
  const locI       = parseInt(el('fb-loc')?.value) || 0;
  const locDeduct  = locDeds[locI].deduction;
  const price      = V('fb-price');
  const wt         = V('fb-wt');
  const otAdd      = V('fb-ot-add') || 0;

  const { mc, tolerance, pods, exm, husks } = getQCInputs();
  const { factor, totalPen, mcPen }         = calcQCFactor(mc, tolerance, pods, exm, husks);
  const refPrice   = price + otAdd;
  const finalPrice = refPrice / factor;
  const adjWt      = wt / factor;
  const cutKg      = wt - adjWt;
  const buyPerMT   = finalPrice * 1000 / fx;
  const margin     = blendedFob - buyPerMT - faqCosts.total;
  const profit     = margin * wt / 1000;
  const maxPrice   = (blendedFob - faqCosts.total - target) * factor * fx / 1000 - locDeduct - otAdd;
  const breakeven  = (blendedFob - faqCosts.total) * factor * fx / 1000 - locDeduct - otAdd;

  // Update QC indicator
  const factorEl = el('fb-factor');
  const adjEl    = el('fb-adj-price');
  if (factorEl) factorEl.textContent = factor.toFixed(4);
  if (adjEl)    adjEl.textContent    = cutKg > 0.05 ? `${fmt(cutKg, 1)} kg` : '0 kg';

  // Sync factor display to Trader View
  const tvFactor = el('tv-factor-display');
  if (tvFactor) tvFactor.textContent = `${factor.toFixed(4)} (cut ${fmt(cutKg, 1)} kg)`;

  renderQCBox(mc, wt, factor, totalPen, mcPen, finalPrice, otAdd, tolerance);
  renderVerdict(margin, target, profit);
  renderCutNeededBox(margin, target, blendedFob, refPrice, fx, faqCosts, wt, factor);
  renderLocCheck(blendedFob, faqCosts, target, fx, locI);
  renderGradeFobTable(fbType);
  renderMarginBar(margin, target, breakeven, maxPrice, 'ugx');
  renderSensitivity(margin, price, faqCosts, blendedFob, factor, fx, 'ugx');
  renderChips(margin, target, profit, finalPrice, maxPrice, breakeven, 'ugx', wt, factor);
  saveAppState();
}

function _updateFB_proc(faqCosts, target, fx) {
  const gi       = parseInt(el('fb-proc-grade')?.value) || 0;
  const diff     = getGradeDiff(fbProcType, gi);
  const fob      = getFob(fbProcType, diff);
  const fotPrice = V('fb-fot');
  const vol      = V('fb-pvol');
  const procCost = calcProcCosts(fob, 25);
  const margin   = fob - fotPrice - procCost;
  const profit   = margin * vol;
  const maxFOT   = fob - procCost - target;
  const breakFOT = fob - procCost;

  // Hide FAQ-only elements
  el('fb-qcbox')?.classList.remove('show');
  const locCheck  = el('fb-loc-check');
  const gradeFob  = el('fb-grade-fob-wrap');
  if (locCheck)  locCheck.style.display  = 'none';
  if (gradeFob)  gradeFob.style.display  = 'none';

  renderVerdict(margin, target, profit);

  // Processed cut box — no cuts available, only walk away
  const cutBox = el('fb-cut-box');
  if (cutBox) {
    if (margin < target && margin >= 0) {
      cutBox.className = 'cut-box show impossible';
      setTextContent('fb-cut-hd',     'No QC cuts available in processed mode');
      setTextContent('fb-cut-big',    'Walk away');
      setHTML('fb-cut-detail', `Coffee is already processed. No moisture or pod cuts apply. FOT price of <b>$${fmt(fotPrice, 0)}/MT</b> is $${fmt(target - margin, 0)}/MT short. Walk away.`);
      setHTML('fb-cut-steps', '');
    } else if (margin < 0) {
      cutBox.className = 'cut-box show impossible';
      setTextContent('fb-cut-hd',  'Loss — walk away');
      setTextContent('fb-cut-big', 'Walk away');
      setHTML('fb-cut-detail', `Loss of <b>$${fmt(Math.abs(margin), 0)}/MT</b>. No cuts possible on processed coffee. This offer doesn't work.`);
      setHTML('fb-cut-steps', '');
    } else {
      cutBox.className = 'cut-box';
    }
  }

  renderMarginBar(margin, target, breakFOT, maxFOT, 'usd');
  // Pass procCost as the cost object so sensitivity pills subtract the right cost
  renderSensitivity(margin, fotPrice, { total: procCost }, fob, 1, 1, 'usd');
  renderChips(margin, target, profit, fotPrice, maxFOT, breakFOT, 'usd', vol * 1000, 1);
}

function renderQCBox(mc, wt, factor, totalPen, mcPen, finalPrice, otAdd, tolerance) {
  const box = el('fb-qcbox');
  if (!box) return;
  if (totalPen > 0 || otAdd > 0) {
    box.classList.add('show');
    const adjWt    = wt / factor;
    const cutKg    = wt - adjWt;
    const refPrice = finalPrice * factor;
    const amount   = refPrice * adjWt;
    const mcFact   = mcFactor(mc);
    setTextContent('fb-qcval', `${fmt(cutKg, 1)} kg to cut`);
    setTextContent('fb-qcsub', `From ${fmt(wt, 0)} kg batch — pay on ${fmt(adjWt, 1)} kg at agreed price`);
    setTextContent('qcs1', `MC penalty: (${mc}% − tol ${tolerance}%) × factor ${mcFact}× = ${fmt(mcPen, 2)}% → ${fmt(mc > tolerance ? wt * mcPen / 100 : 0, 1)} kg`);
    setTextContent('qcs2', `All penalties: ${fmt(totalPen, 2)}% → factor ${factor.toFixed(4)} → cut ${fmt(cutKg, 1)} kg`);
    setTextContent('qcs3', `Pay UGX ${fmt(Math.round(amount))} (${fmt(Math.round(refPrice))}/kg × ${fmt(adjWt, 1)} kg)`);
  } else {
    box.classList.remove('show');
  }
}

function renderVerdict(margin, target, profit) {
  const verdictEl = el('fb-verdict');
  const emEl      = el('fb-em');
  const wdEl      = el('fb-wd');
  const rsEl      = el('fb-rs');
  if (!verdictEl) return;

  if (margin >= target) {
    verdictEl.className = 'verdict verdict--go';
    if (emEl) emEl.innerHTML = '&#9989;';
    if (wdEl) wdEl.textContent = 'BUY';
    if (rsEl) rsEl.textContent = `Margin $${fmt(margin, 0)}/MT — $${fmt(margin - target, 0)} above $${fmt(target, 0)} target. Deal profit: $${fmt(profit, 0)}. Lock it in.`;
  } else if (margin >= 0) {
    verdictEl.className = 'verdict verdict--caution';
    if (emEl) emEl.innerHTML = '&#9888;&#65039;';
    if (wdEl) wdEl.textContent = 'BELOW TARGET';
    if (rsEl) rsEl.textContent = `Price is market-set — $${fmt(target - margin, 0)}/MT short of your $${fmt(target, 0)} floor. Apply all available QC cuts (MC, pods, husks). If margin still doesn't reach target, walk away.`;
  } else {
    verdictEl.className = 'verdict verdict--stop';
    if (emEl) emEl.innerHTML = '&#128721;';
    if (wdEl) wdEl.textContent = 'WALK AWAY';
    if (rsEl) rsEl.textContent = `Loss of $${fmt(Math.abs(margin), 0)}/MT even with current cuts. Total exposure: $${fmt(Math.abs(profit), 0)}. The price is too high for your diff. Walk away.`;
  }
}

function renderCutNeededBox(margin, target, blendedFob, refPrice, fx, faqCosts, wt, currentFactor) {
  const box  = el('fb-cut-box');
  const wrap = el('fb-sens-wrap');
  if (!box) return;

  if (margin >= target) {
    box.className = 'cut-box';
    if (wrap) wrap.className = 'sens-wrap';
    return;
  }

  box.className = 'cut-box show';
  if (wrap) wrap.className = 'sens-wrap urgent';

  const res = calcRequiredExtraCut(blendedFob, refPrice, fx, faqCosts.total, target, wt, currentFactor);

  if (!res.possible) {
    box.className = 'cut-box show impossible';
    setTextContent('fb-cut-hd', margin < 0 ? '🛑 Cannot reach target at current diff' : `Cannot reach $${target}/MT target via cuts alone`);
    setTextContent('fb-cut-big', margin < 0 ? 'Walk away' : 'Raise your diff');
    setHTML('fb-cut-detail', res.reason);
    setHTML('fb-cut-steps', '');
    return;
  }

  if (margin < 0) {
    box.className = 'cut-box show impossible';
    setTextContent('fb-cut-hd', '🛑 Cut needed to reach target (currently at a loss)');
    setHTML('fb-cut-big', `${fmt(res.extraCutKg, 1)} kg more cut`);
    setHTML('fb-cut-detail', `Currently losing <b>$${fmt(Math.abs(margin), 0)}/MT</b>. To hit $${target}/MT target, total cut = <b>${fmt(res.neededCutKg, 1)} kg</b>, pay on <b>${fmt(res.neededPayKg, 1)} kg</b> at <b>UGX ${fmt(Math.round(res.neededEffPrice))}/kg effective</b>.`);
    setHTML('fb-cut-steps', `<div class="cut-step"><b>${fmt(res.currentCutKg, 1)} kg</b> cut now</div><div class="cut-step">+ <b>${fmt(res.extraCutKg, 1)} kg</b> more</div><div class="cut-step">= <b>${fmt(res.neededCutKg, 1)} kg</b> total cut</div><div class="cut-step">Pay on <b>${fmt(res.neededPayKg, 1)} kg</b></div>`);
  } else {
    box.className = 'cut-box show need';
    setTextContent('fb-cut-hd', `✂ To reach $${fmt(target)}/MT target, cut:`);
    setHTML('fb-cut-big', `${fmt(res.extraCutKg, 1)} kg more`);
    setHTML('fb-cut-detail', `Currently <b>$${fmt(Math.abs(margin), 0)}/MT short</b> of target. Cut <b>${fmt(res.extraCutKg, 1)} kg more</b> on top of existing deductions. Total cut <b>${fmt(res.neededCutKg, 1)} kg</b> → pay on <b>${fmt(res.neededPayKg, 1)} kg</b> at UGX <b>${fmt(Math.round(res.neededEffPrice))}/kg effective</b>.`);
    setHTML('fb-cut-steps', `<div class="cut-step">Currently paying on <b>${fmt(wt / currentFactor, 1)} kg</b></div><div class="cut-step">Need to pay on <b>${fmt(res.neededPayKg, 1)} kg</b></div><div class="cut-step">Extra cut: <b>${fmt(res.extraCutKg, 1)} kg</b></div>`);
  }
}

function renderLocCheck(blendedFob, faqCosts, target, fx, locI) {
  const locEl = el('fb-loc-check');
  if (!locEl) return;
  locEl.style.display = '';

  const locDeduct     = locDeds[locI].deduction;
  const avgNamanve    = getAvgComp();
  const marketAtLoc   = avgNamanve - locDeduct;
  const thresholdClean = (blendedFob - faqCosts.total - target) * fx / 1000 - locDeduct;
  const locName       = locDeds[locI].name.replace(' (Factory)', '');

  if (thresholdClean <= 0) {
    locEl.className = 'loc-check loc-check--bad';
    locEl.innerHTML = `<div class="loc-check-txt">Diff is too low — raise your buyer contract diff before going anywhere.</div><div class="loc-check-status">&#128721; FIX DIFF FIRST</div>`;
    return;
  }

  const neededFactor = marketAtLoc / thresholdClean;
  const neededCutPct = Math.max(0, (1 - 1 / neededFactor) * 100);
  const gap          = thresholdClean - marketAtLoc;

  if (gap >= 0) {
    locEl.className = 'loc-check loc-check--ok';
    locEl.innerHTML = `<div class="loc-check-txt">Market at <b>${locName}</b>: <b>UGX ${fmt(Math.round(marketAtLoc))}/kg</b> &mdash; <b>UGX ${fmt(Math.round(gap))}</b> below clean-coffee threshold. Even dry, perfect coffee works here today.</div><div class="loc-check-status">&#9989; CLEAN COFFEE OK</div>`;
  } else if (neededCutPct > 20) {
    locEl.className = 'loc-check loc-check--bad';
    locEl.innerHTML = `<div class="loc-check-txt">Market at <b>${locName}</b>: <b>UGX ${fmt(Math.round(marketAtLoc))}/kg</b>. Clean coffee loses here. Would need <b>${fmt(neededCutPct, 1)}% cut</b> to reach target — not realistic. Skip this location today or raise your diff.</div><div class="loc-check-status">&#128721; NOT VIABLE</div>`;
  } else {
    locEl.className = 'loc-check loc-check--warn';
    locEl.innerHTML = `<div class="loc-check-txt">Market at <b>${locName}</b>: <b>UGX ${fmt(Math.round(marketAtLoc))}/kg</b> &mdash; UGX ${fmt(Math.round(Math.abs(gap)))} above clean-coffee threshold. <b>Clean &amp; dry coffee will not reach target.</b> Only buy batches with MC or defects that justify a <b>≥${fmt(neededCutPct, 1)}% cut</b>. Walk away from clean coffee.</div><div class="loc-check-status">&#9888; WET ONLY</div>`;
  }
}

function renderGradeFobTable(type) {
  const rowsEl = el('fb-grade-fob-rows');
  const totEl  = el('fb-grade-fob-tot');
  if (!rowsEl || !totEl) return;

  const grades = type === 'rob' ? ROB_GRADES : ARA_GRADES;
  const mix    = type === 'rob' ? robMix     : araMix;
  const bench  = type === 'rob' ? (V('scr15-diff') || 650) : (V('bugaa-diff') || 35);
  let blended  = 0;

  rowsEl.innerHTML = grades.map((g, i) => {
    const fob    = getFob(type, bench + g.spread);
    const contrib = (mix[i] / 100) * fob;
    blended += contrib;
    const isZero = mix[i] < 0.01;
    return `<div class="grade-fob-row${isZero ? ' grade-fob-row--zero' : ''}">
      <span>${g.name}</span>
      <span class="text-right">${fmt(mix[i], 1)}%</span>
      <span class="text-right">$${fmt(fob, 0)}</span>
      <span class="gfob-contrib${isZero ? '' : ' pos'}">$${fmt(contrib, 0)}</span>
    </div>`;
  }).join('');

  const totContrib = totEl.querySelector('.gfob-contrib');
  if (totContrib) totContrib.textContent = `$${fmt(blended, 0)}/MT`;
}

function renderMarginBar(margin, target, breakevenPrice, maxPrice, unit) {
  const fillEl   = el('margin-bar-fill');
  const tlineEl  = el('margin-bar-target');
  const beEl     = el('mb-breakeven');
  const marEl    = el('mb-margin');
  const lblEl    = el('mb-target-lbl');
  if (!fillEl) return;

  const minM = -500;
  const maxM = 800;
  const pct       = Math.max(0, Math.min(100, (margin  - minM) / (maxM - minM) * 100));
  const targetPct = Math.max(0, Math.min(100, (target  - minM) / (maxM - minM) * 100));

  fillEl.style.width      = `${pct}%`;
  fillEl.style.background = margin >= target ? 'var(--grn)' : margin >= 0 ? 'var(--amb)' : 'var(--red)';
  tlineEl.style.left      = `${targetPct}%`;

  if (lblEl) lblEl.textContent = `Target $${fmt(target)}/MT`;
  if (beEl)  beEl.textContent  = breakevenPrice != null
    ? (unit === 'ugx' ? `UGX ${fmt(Math.round(breakevenPrice))}/kg` : `$${fmt(breakevenPrice, 0)}/MT`)
    : '—';
  if (marEl) {
    marEl.textContent  = (margin >= 0 ? '$' : '-$') + fmt(Math.abs(margin), 0) + '/MT';
    marEl.style.color  = margin >= target ? 'var(--grn)' : margin >= 0 ? 'var(--amb)' : 'var(--red)';
  }
}

function renderSensitivity(baseMargin, basePrice, faqCosts, blendedFob, factor, fx, unit) {
  const sensEl = el('fb-sens');
  if (!sensEl) return;
  const target = V('target');

  if (unit === 'ugx') {
    const mc        = V('fb-mc') || 14;
    const otAdd     = V('fb-ot-add') || 0;
    const refPrice  = basePrice + otAdd;
    const tolerance = parseFloat(document.getElementById('mc-tol')?.value) || 13.0;

    const scenarios = [
      { label: 'No cuts applied', extraCutPct: 0 },
      { label: 'Cut 1% more',     extraCutPct: 1 },
      { label: 'Cut 2% more',     extraCutPct: 2 },
      { label: 'Cut 3% more',     extraCutPct: 3 },
      { label: 'Cut 5% more',     extraCutPct: 5 },
    ];

    if (mc > 13) scenarios.push({ label: `If MC ${fmt(Math.max(mc - 1, 13), 1)}%`, mcOverride: Math.max(mc - 1, 13) });
    if (mc > 14) scenarios.push({ label: 'If MC 13%', mcOverride: 13 });

    sensEl.innerHTML = scenarios.map(s => {
      let m;
      if (s.mcOverride != null) {
        const { factor: newF } = calcQCFactor(s.mcOverride, tolerance, V('fb-pods'), V('fb-exm'), V('fb-husks'));
        m = blendedFob - (refPrice / newF * 1000 / fx) - faqCosts.total;
      } else {
        const totalPenPct = ((1 - 1 / factor) * 100) + s.extraCutPct;
        const newF = 100 / Math.max(100 - totalPenPct, 1);
        m = blendedFob - (refPrice / newF * 1000 / fx) - faqCosts.total;
      }
      const cls = m >= target ? 'ok' : m >= 0 ? 'warn' : 'bad';
      return `<span class="sens-pill ${cls}">${s.label}: ${m >= 0 ? '$' : '-$'}${fmt(Math.abs(m), 0)}/MT</span>`;
    }).join('');
  } else {
    // Processed mode — show FOT ± scenarios
    const steps = [-50, -25, -10, 10, 25, 50];
    sensEl.innerHTML = steps.map(d => {
      const m   = blendedFob - (basePrice + d) - faqCosts.total;
      const cls = m >= target ? 'ok' : m >= 0 ? 'warn' : 'bad';
      return `<span class="sens-pill ${cls}">FOT ${d > 0 ? '+' : ''}$${Math.abs(d)}: ${m >= 0 ? '$' : '-$'}${fmt(Math.abs(m), 0)}/MT</span>`;
    }).join('');
  }
}

function renderChips(margin, target, profit, effPrice, maxPrice, breakeven, unit, wt, factor) {
  const marginEl   = el('fb-cm');
  const profitEl   = el('fb-cp');
  const cutWtEl    = el('fb-cw');
  const maxPriceEl = el('fb-cx');
  const beEl       = el('fb-be');

  if (marginEl) {
    marginEl.textContent  = (margin >= 0 ? '$' : '-$') + fmt(Math.abs(margin), 0) + '/MT FAQ';
    marginEl.className    = 'chip-v ' + (margin >= target ? 'g' : margin >= 0 ? 'a' : 'r');
  }
  if (profitEl) {
    profitEl.textContent  = (profit >= 0 ? '$' : '-$') + fmt(Math.abs(profit), 0);
    profitEl.className    = 'chip-v ' + (profit >= 0 ? 'g' : 'r');
  }
  if (cutWtEl) {
    if (unit === 'ugx') {
      const mc2 = parseFloat(document.getElementById('fb-mc')?.value) || 13;
      const tol = parseFloat(document.getElementById('mc-tol')?.value) || 13.0;
      const { factor: f } = calcQCFactor(mc2, tol, V('fb-pods'), V('fb-exm'), V('fb-husks'));
      const adjWt  = wt / f;
      const cutKg  = wt - adjWt;
      cutWtEl.textContent = cutKg > 0.05
        ? `${fmt(cutKg, 1)} kg cut → pay ${fmt(adjWt, 1)} kg`
        : `No cut → full ${fmt(wt, 0)} kg`;
      cutWtEl.className = 'chip-v ' + (cutKg > 0.05 ? 'a' : 'g');
    } else {
      cutWtEl.textContent = '$' + fmt(effPrice, 0) + '/MT FOT';
      cutWtEl.className = 'chip-v';
    }
  }
  if (maxPriceEl) {
    maxPriceEl.textContent = maxPrice > 0
      ? (unit === 'ugx' ? `UGX ${fmt(Math.round(maxPrice))}/kg` : `$${fmt(maxPrice, 0)}/MT FOT`)
      : 'NOT VIABLE';
    maxPriceEl.className = 'chip-v ' + (maxPrice > 0 ? 'g' : 'r');
  }
  if (beEl) {
    beEl.textContent = breakeven > 0
      ? (unit === 'ugx' ? `UGX ${fmt(Math.round(breakeven))}/kg` : `$${fmt(breakeven, 0)}/MT`)
      : '—';
    beEl.className = 'chip-v a';
  }
}

/* ═══════════════════════════════════════════════════════════
   SECTION 7 — RENDERING: GRADE MIX GRID
   ═══════════════════════════════════════════════════════════ */

function renderMixGrid(containerId, type) {
  const container = el(containerId);
  if (!container) return;

  const grades = type === 'rob' ? ROB_GRADES : ARA_GRADES;
  const mix    = type === 'rob' ? robMix     : araMix;

  container.innerHTML = grades.map((g, i) => `
    <div class="mix-cell">
      <div class="mix-cell-label">${g.name}</div>
      <div class="mix-cell-input-row">
        <input class="mix-input" type="number" value="${mix[i]}" step="0.1" min="0" max="100"
          oninput="onMixChange(this, '${type}', ${i})">
        <span class="mix-pct">%</span>
      </div>
    </div>`).join('');

  updateMixTotal(type);
}

function onMixChange(inputEl, type, idx) {
  const val = parseFloat(inputEl.value) || 0;
  if (type === 'rob') robMix[idx] = val;
  else                araMix[idx] = val;
  updateMixTotal(type);
  update();
}

function updateMixTotal(type) {
  const mix   = type === 'rob' ? robMix : araMix;
  const total = mix.reduce((a, b) => a + b, 0);
  const fm    = (100 - total).toFixed(1);
  const totEl = el('fb-mix-total');
  if (!totEl) return;
  totEl.textContent = `Sellable: ${fmt(total, 1)}% | FM: ${fm}%`;
  totEl.style.color = total > 100 ? 'var(--red)' : total > 98 ? 'var(--amb)' : 'var(--grn)';
}

function populateGradeSelect(selectId, type) {
  const selectEl = el(selectId);
  if (!selectEl) return;
  const grades = type === 'rob' ? ROB_GRADES : ARA_GRADES;
  selectEl.innerHTML = grades.map((g, i) => `<option value="${i}">${g.label || g.name}</option>`).join('');
  if (type === 'rob') selectEl.value = '2'; // default to Scr15
}

/* ═══════════════════════════════════════════════════════════
   SECTION 8 — RENDERING: TRADER VIEW
   ═══════════════════════════════════════════════════════════ */

function updateTV() {
  const faqCosts = calcFAQCosts(getCurrentTeu());
  const target   = V('target');
  const fx       = V('fx');
  let cards = [];

  if (tvMode === 'faq') {
    const blendedFob    = getBlendedFob(tvType);
    const price         = V('tv-price');
    const ot            = V('tv-ot') / 100;
    const vol           = V('tv-vol');
    const mc            = V('tv-mc');
    const locI          = parseInt(el('tv-loc')?.value) || 0;
    const locDeduct     = locDeds[locI].deduction;
    const tol           = parseFloat(document.getElementById('mc-tol')?.value) || 13.0;
    const { factor }    = calcQCFactor(mc, tol, 0, 0, 0);
    const finalPrice    = price / factor;
    const buyPerMT      = finalPrice * 1000 / fx;
    const margin        = blendedFob - buyPerMT - faqCosts.total;
    const profit        = margin * vol;
    const maxPrice      = (blendedFob - faqCosts.total - target) * factor * fx / 1000 - locDeduct;
    const breakeven     = (blendedFob - faqCosts.total) * factor * fx / 1000 - locDeduct;
    const greenVol      = vol * ot;

    cards = [
      { l: 'Blended FOB (all grades)',     v: `$${fmt(blendedFob, 0)}/MT`,   c: 'hi', s: 'Weighted avg across your grade mix' },
      { l: 'FAQ Effective Buying Cost',    v: `$${fmt(buyPerMT, 0)}/MT`,     c: '',   s: `${fmt(price, 0)} UGX/kg / factor ${factor.toFixed(4)} = UGX ${fmt(Math.round(finalPrice))}/kg eff.` },
      { l: `Total FAQ Costs (${getCurrentTeu()} TEUs)`, v: `$${fmt(faqCosts.total, 2)}/MT`, c: '', s: 'Processing + logistics + cess + fixed' },
      { l: 'Margin / MT FAQ',             v: (margin >= 0 ? '$' : '-$') + fmt(Math.abs(margin), 0) + '/MT', c: margin >= target ? 'cg' : margin >= 0 ? 'ca' : 'cr', s: margin >= target ? `Above $${target} target` : margin >= 0 ? 'Below target — apply stricter QC cuts or walk away' : 'LOSS — walk away' },
      { l: 'Total Deal P&L',              v: (profit >= 0 ? '$' : '-$') + fmt(Math.abs(profit), 0),         c: profit >= 0 ? 'cg' : 'cr', s: `${fmt(vol, 1)} MT FAQ × $${fmt(margin, 0)}/MT` },
      { l: 'Green Bean Output',           v: `${fmt(greenVol, 2)} MT`,       c: '',   s: `${fmt(vol, 1)} MT FAQ × ${fmt(ot * 100, 0)}% OT` },
      { l: `Max FAQ Price (${locDeds[locI].name})`, v: maxPrice > 0 ? `UGX ${fmt(Math.round(maxPrice))}/kg` : 'NOT VIABLE', c: maxPrice > 0 ? 'cg' : 'cr', s: `Protecting $${target}/MT` },
      { l: 'Breakeven Price',             v: breakeven > 0 ? `UGX ${fmt(Math.round(breakeven))}/kg` : '—', c: 'ca', s: 'Minimum price to avoid loss' },
    ];
  } else {
    const gi      = parseInt(el('tv-proc-grade')?.value) || 0;
    const diff    = getGradeDiff(tvProcType, gi);
    const fob     = getFob(tvProcType, diff);
    const fotP    = V('tv-fot');
    const vol     = V('tv-pvol');
    const handle  = V('tv-handle') || 25;
    const procC   = calcProcCosts(fob, handle);
    const margin  = fob - fotP - procC;
    const profit  = margin * vol;
    const maxFOT  = fob - procC - target;

    cards = [
      { l: 'Your FOB Sale Price',        v: `$${fmt(fob, 0)}/MT`,   c: 'hi',                              s: 'What you sell at port' },
      { l: 'Their FOT Price',            v: `$${fmt(fotP, 0)}/MT`,  c: '',                                s: 'What you pay them' },
      { l: 'Your Costs (logistics only)', v: `$${fmt(procC, 2)}/MT`, c: 'cb',                             s: 'FOT-FOB + cess + interest + loading' },
      { l: 'Margin / Tonne',             v: (margin >= 0 ? '$' : '-$') + fmt(Math.abs(margin), 0) + '/MT', c: margin >= target ? 'cg' : margin >= 0 ? 'ca' : 'cr', s: margin >= target ? `Above $${target} target` : margin >= 0 ? 'Below target — walk away from this offer' : "LOSS — reject, this offer doesn't work" },
      { l: 'Total Deal P&L',             v: (profit >= 0 ? '$' : '-$') + fmt(Math.abs(profit), 0),        c: profit >= 0 ? 'cg' : 'cr', s: `${fmt(vol, 1)} MT × $${fmt(margin, 0)}/MT` },
      { l: 'Walk Away If FOT Above',     v: maxFOT > 0 ? `$${fmt(maxFOT, 0)}/MT` : 'NOT VIABLE',          c: maxFOT > 0 ? 'cg' : 'cr', s: maxFOT > 0 ? 'Any quote above this destroys your margin' : 'No FOT price makes this viable at current diff' },
    ];
  }

  const tvCardsEl = el('tv-cards');
  if (tvCardsEl) {
    tvCardsEl.innerHTML = cards.map(c =>
      `<div class="card ${c.c}"><div class="card-l">${c.l}</div><div class="card-v ${c.c.replace('c', '')}">${c.v}</div><div class="card-s">${c.s}</div></div>`
    ).join('');
  }
}

/* ═══════════════════════════════════════════════════════════
   SECTION 9 — RENDERING: MARKET INTEL
   ═══════════════════════════════════════════════════════════ */

function updateIntel() {
  const faqCosts = calcFAQCosts(getCurrentTeu());
  const target   = V('target');
  const fx       = V('fx');
  const liffe    = V('liffe');
  const ice      = V('ice');
  const scr15    = V('scr15-diff') || 650;
  const bugaa    = V('bugaa-diff') || 35;
  const avg      = getAvgComp();
  const avgAra   = getAvgCompAra();

  // ── Robusta competitor cards ──
  const activeComps = compsRob.filter(c => c.price > 0);
  const maxPrice    = activeComps.length ? Math.max(...activeComps.map(c => c.price)) : 0;
  const minPrice    = activeComps.length ? Math.min(...activeComps.map(c => c.price)) : 0;

  const robPredictEl = el('comp-predict-rob');
  if (robPredictEl) {
    robPredictEl.innerHTML = activeComps.map(comp => {
      const cBuyMT  = comp.price * 1000 / (0.85 * fx);
      const cDiff   = Math.round(cBuyMT + faqCosts.total + target - liffe);
      const cMargin = (liffe + cDiff) - cBuyMT - faqCosts.total;
      const vsAvg   = comp.price - avg;
      const isHigh  = comp.price === maxPrice;
      const isLow   = comp.price === minPrice;
      const badge   = isHigh ? '🔺 Most aggressive — needs coffee' : isLow ? '🔻 Most conservative' : '⚑ Near average';
      const dVsYou  = cDiff - scr15;
      const cls     = vsAvg > 200 ? 'red' : vsAvg > 0 ? 'amb' : 'grn';
      return `<div class="ibox">
        <div class="ibox-loc">&#127981; ${comp.name}</div>
        <div class="ibox-price" style="color:var(--${cls})">${comp.price > 0 ? 'UGX ' + fmt(comp.price) + '/kg' : '&#8212;'}</div>
        <div class="ibox-sub">${badge}<br>${vsAvg >= 0 ? '+' : ''}${fmt(Math.round(vsAvg))} UGX/kg vs avg</div>
        <div class="ibox-row"><span>Inferred buyer diff:</span><b style="color:var(--gold)">${cDiff >= 0 ? '+' : ''}${fmt(cDiff)} USD/MT</b></div>
        <div class="ibox-row"><span>Est. margin:</span><b style="color:var(--${cMargin >= target ? 'grn' : cMargin >= 0 ? 'amb' : 'red'})">${cMargin >= 0 ? '$' : '-$'}${fmt(Math.abs(cMargin), 0)}/MT</b></div>
        <div class="ibox-row"><span>Their diff vs yours:</span><b style="color:var(--${dVsYou > 0 ? 'red' : dVsYou < 0 ? 'grn' : 'sub'})">${dVsYou >= 0 ? '+' : ''}${fmt(dVsYou)} USD/MT</b></div>
      </div>`;
    }).join('');
  }

  // ── Arabica competitor cards ──
  const araFob         = (ice + bugaa) * ICE_CONV;
  const activeAraComps = compsAra.filter(c => c.price > 0);
  const araPredictEl   = el('comp-predict-ara');
  if (araPredictEl) {
    araPredictEl.innerHTML = activeAraComps.map(comp => {
      const cBuyMT = comp.price * 1000 / (0.80 * fx);
      const araM   = araFob - cBuyMT - faqCosts.total;
      const vsAvg  = comp.price - avgAra;
      const cls    = vsAvg > 200 ? 'red' : vsAvg > 0 ? 'amb' : 'grn';
      return `<div class="ibox">
        <div class="ibox-loc">&#9749; ${comp.name} (Parchment)</div>
        <div class="ibox-price" style="color:var(--${cls})">${comp.price > 0 ? 'UGX ' + fmt(comp.price) + '/kg' : '&#8212;'}</div>
        <div class="ibox-sub">${vsAvg >= 0 ? '+' : ''}${fmt(Math.round(vsAvg))} UGX/kg vs avg</div>
        <div class="ibox-row"><span>Est. margin at this price:</span><b style="color:var(--${araM >= target ? 'grn' : araM >= 0 ? 'amb' : 'red'})">${araM >= 0 ? '$' : '-$'}${fmt(Math.abs(araM), 0)}/MT</b></div>
        <div class="ibox-row"><span>Arabica FOB (BugAA):</span><b>$${fmt(araFob, 0)}/MT</b></div>
      </div>`;
    }).join('');
  }

  // ── Summary inference cards ──
  const inferredDiff = Math.round(avg * 1000 / (0.85 * fx) + faqCosts.total + target - liffe);
  const compFOB      = liffe + inferredDiff;
  const compMargin   = compFOB - (avg * 1000 / (0.85 * fx)) - faqCosts.total;
  const inferEl      = el('comp-inference');
  if (inferEl) {
    inferEl.innerHTML = [
      { l: 'Competitor Namanve Price (actual)',  v: 'UGX ' + fmt(Math.round(avg)) + '/kg', c: 'hi', s: `Average of ${activeComps.length} competitors from sidebar` },
      { l: 'Inferred Avg Buyer Contract Diff',  v: (inferredDiff >= 0 ? '+' : '') + fmt(inferredDiff) + ' USD/MT', c: inferredDiff > scr15 ? 'ca' : 'cg', s: inferredDiff > scr15 ? `They appear to have a HIGHER diff than you (+${fmt(inferredDiff)} vs your +${fmt(scr15)}). Match or raise yours.` : 'Your diff equals or beats competitors.' },
      { l: 'Competitor Est. Margin at Avg',     v: (compMargin >= 0 ? '$' : '-$') + fmt(Math.abs(compMargin), 0) + '/MT', c: compMargin >= target ? 'cg' : compMargin >= 0 ? 'ca' : 'cr', s: compMargin >= target ? `They earn ~$${fmt(compMargin, 0)}/MT at market prices.` : compMargin >= 0 ? `They earn only ~$${fmt(compMargin, 0)}/MT — below target. Diff adjustment needed.` : 'At these prices even competitors lose. Critical to adjust diff.' },
    ].map(c => `<div class="card ${c.c}"><div class="card-l">${c.l}</div><div class="card-v ${c.c.replace('c', '')}">${c.v}</div><div class="card-s">${c.s}</div></div>`).join('');
  }

  // ── Per-location action ──
  function buildLocationAction(locName, locDeduct, compPrice, type, benchDiff, ot) {
    const fob       = type === 'rob' ? liffe + benchDiff : (ice + benchDiff) * ICE_CONV;
    const bMT       = compPrice * 1000 / (ot * fx);
    const margHere  = fob - bMT - faqCosts.total;
    const reqDiff   = type === 'rob'
      ? Math.ceil(bMT + faqCosts.total + target - liffe)
      : Math.ceil((bMT + faqCosts.total + target) / ICE_CONV - ice);
    const gap       = reqDiff - benchDiff;
    const ok        = margHere >= target;
    const cls       = ok ? 'ok' : margHere >= 0 ? 'warn' : 'crit';
    const dLabel    = type === 'rob' ? 'USD/MT' : 'cts/lb';
    return `<div class="ibox" style="margin-bottom:10px">
      <div class="ibox-loc">&#128205; ${locName}</div>
      <div style="display:flex;gap:16px;align-items:baseline;margin-bottom:8px">
        <div>
          <div class="mono-xs text-sub" style="letter-spacing:.1em;text-transform:uppercase">Competitive price</div>
          <div class="mono" style="font-size:18px;font-weight:600;color:var(--wht)">UGX ${fmt(Math.round(compPrice))}/kg</div>
        </div>
        <div>
          <div class="mono-xs text-sub" style="letter-spacing:.1em;text-transform:uppercase">Your margin at this price</div>
          <div class="mono" style="font-size:18px;font-weight:600;color:var(--${ok ? 'grn' : margHere >= 0 ? 'amb' : 'red'})">${margHere >= 0 ? '$' : '-$'}${fmt(Math.abs(margHere), 0)}/MT</div>
        </div>
      </div>
      <div class="action-box ${cls}">
        <div class="action-title">${ok ? 'CURRENT DIFF WORKS' : margHere >= 0 ? 'DIFF ADJUSTMENT NEEDED' : 'DIFF ADJUSTMENT CRITICAL'}</div>
        <div class="action-line">${ok
          ? `Current diff +${benchDiff} ${dLabel} works. Match competitors at UGX ${fmt(Math.round(compPrice))}/kg and earn $${fmt(margHere, 0)}/MT.`
          : `To match market at UGX ${fmt(Math.round(compPrice))}/kg and earn $${target}/MT: <b>raise diff to +${fmt(reqDiff)} ${dLabel}</b> (currently +${benchDiff}, need +${fmt(gap)} more). Negotiate with buyer. <b>Do NOT cut farmer price.</b>`
        }</div>
      </div>
    </div>`;
  }

  const actionRobEl = el('your-action-rob');
  if (actionRobEl) {
    actionRobEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">
      ${locDeds.map(l => buildLocationAction(l.name, l.deduction, avg - l.deduction, 'rob', scr15, 0.85)).join('')}
    </div>`;
  }

  const actionAraEl = el('your-action-ara');
  if (actionAraEl) {
    actionAraEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">
      ${buildLocationAction('Factory (Parchment)', 0, avgAra, 'ara', bugaa, 0.80)}
    </div>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   SECTION 10 — RENDERING: DIFF TABLE
   ═══════════════════════════════════════════════════════════ */

function updateDiff() {
  const faqCosts = calcFAQCosts(getCurrentTeu());
  const target   = V('target');
  const fx       = V('fx');
  const avg      = getAvgComp();
  const avgAra   = getAvgCompAra();
  const scr15    = V('scr15-diff') || 650;
  const bugaa    = V('bugaa-diff') || 35;

  setTextContent('scr15-fob', fmt(V('liffe') + scr15, 0));
  setTextContent('bugaa-fob', fmt((V('ice') + bugaa) * ICE_CONV, 0));

  // Min diff indicators
  const robBuy = avg * 1000 / (0.85 * fx);
  const minR   = Math.ceil(robBuy + faqCosts.total + target - V('liffe'));
  const elR    = el('rob-min-diff');
  if (elR) { elR.textContent = `+${fmt(minR)} USD/MT`; elR.className = minR <= scr15 ? 'mono-sm diff-min-val g' : 'mono-sm diff-min-val r'; }

  const araBuy = avgAra * 1000 / (0.80 * fx);
  const minA   = Math.ceil((araBuy + faqCosts.total + target) / ICE_CONV - V('ice'));
  const elA    = el('ara-min-diff');
  if (elA) { elA.textContent = `+${fmt(minA, 1)} cts/lb`; elA.className = minA <= bugaa ? 'mono-sm diff-min-val g' : 'mono-sm diff-min-val r'; }

  // Robusta table
  const robTbody = el('rob-tbody');
  if (robTbody) {
    robTbody.innerHTML = ROB_GRADES.map((g, i) => {
      const diff  = scr15 + g.spread;
      const fob   = V('liffe') + diff;
      const maxFAQ = (fob - faqCosts.total - target) * 0.85 * fx / 1000;
      const procC = calcProcCosts(fob, 25);
      const maxFOT = fob - procC - target;
      const spread = g.spread === 0 ? '<span style="color:var(--gold)">BENCHMARK</span>' : (g.spread >= 0 ? '+' : '') + g.spread;
      const pill  = maxFAQ > avg ? '<span class="pill g">&#9679; Target</span>' : maxFAQ > 0 ? '<span class="pill a">&#9679; Viable</span>' : '<span class="pill r">&#9679; Avoid</span>';
      return `<tr ${i === 2 ? 'class="brow"' : ''}><td class="gname">${g.label || g.name}</td><td class="${diff >= 0 ? 'pos' : 'neg'}">${diff >= 0 ? '+' : ''}${diff}</td><td>${spread}</td><td>$${fmt(fob, 0)}/MT</td><td>${maxFAQ > 0 ? 'UGX ' + fmt(Math.round(maxFAQ)) + '/kg' : '<span class="neg">&#8212;</span>'}</td><td>${maxFOT > 0 ? '$' + fmt(maxFOT, 0) + '/MT' : '<span class="neg">&#8212;</span>'}</td><td>${pill}</td></tr>`;
    }).join('');
  }

  // Arabica table
  const araTbody = el('ara-tbody');
  if (araTbody) {
    araTbody.innerHTML = ARA_GRADES.map((g, i) => {
      const dCts = bugaa + g.spread;
      const fob  = (V('ice') + dCts) * ICE_CONV;
      const maxP = (fob - faqCosts.total - target) * 0.80 * fx / 1000;
      const procC = calcProcCosts(fob, 25);
      const maxFOT = fob - procC - target;
      const spread = g.spread === 0 ? '<span style="color:var(--gold)">BENCHMARK</span>' : (g.spread >= 0 ? '+' : '') + g.spread + ' cts';
      const pill  = maxP > 12000 ? '<span class="pill g">&#9679; Target</span>' : maxP > 0 ? '<span class="pill a">&#9679; Viable</span>' : '<span class="pill r">&#9679; Avoid</span>';
      return `<tr ${i === 1 ? 'class="brow"' : ''}><td class="gname">${g.label || g.name}</td><td class="${dCts >= 0 ? 'pos' : 'neg'}">${dCts >= 0 ? '+' : ''}${fmt(dCts, 1)}</td><td>${spread}</td><td>$${fmt(fob, 0)}/MT</td><td>${maxP > 0 ? 'UGX ' + fmt(Math.round(maxP)) + '/kg' : '<span class="neg">&#8212;</span>'}</td><td>${maxFOT > 0 ? '$' + fmt(maxFOT, 0) + '/MT' : '<span class="neg">&#8212;</span>'}</td><td>${pill}</td></tr>`;
    }).join('');
  }
}

/* ═══════════════════════════════════════════════════════════
   SECTION 11 — RENDERING: COST ENGINE
   ═══════════════════════════════════════════════════════════ */

function updateCosts() {
  const teu      = parseFloat(document.getElementById('c-slider')?.value) || 7.2;
  const costs    = calcFAQCosts(teu);
  const baseline = calcFAQCosts(7.2);
  const saving   = baseline.total - costs.total;

  setTextContent('c-teu', teu);
  setTextContent('c-sv',  `${teu} TEUs`);
  setTextContent('c-mt',  fmt(teu * MT_TEU, 1));
  setTextContent('c-yr',  fmt(teu * MT_TEU * 12, 1));
  setTextContent('c-total',  `$${fmt(costs.total, 2)}`);
  setTextContent('c-fixed',  `$${fmt(costs.fixedTotal, 2)}`);
  setTextContent('c-wages',  `$${fmt(costs.wages, 2)}`);
  setTextContent('c-rents',  `$${fmt(costs.rents, 2)}`);
  setTextContent('c-dhl',    `$${fmt(costs.dhl, 2)}`);
  setTextContent('c-tot',    `$${fmt(costs.total, 2)}`);

  const saveEl = el('c-save');
  if (saveEl) {
    saveEl.textContent  = (saving >= 0 ? '$' : '-$') + fmt(Math.abs(saving), 2);
    saveEl.className    = 'card-v ' + (saving >= 0 ? 'g' : 'r');
  }

  // Processed costs (based on current Scr15 FOB)
  const scr15Fob = V('liffe') + (V('scr15-diff') || 650);
  const procC    = calcProcCosts(scr15Fob, 20);
  setTextContent('c-proc',    `$${fmt(procC, 2)}`);
  setTextContent('cp-cess',   `$${fmt(0.02 * scr15Fob, 2)}`);
  setTextContent('cp-tot',    `$${fmt(procC, 2)}`);

  update();
}

/* ═══════════════════════════════════════════════════════════
   SECTION 12 — RENDERING: DEAL LOG
   ═══════════════════════════════════════════════════════════ */

function logDeal() {
  const faqCosts = calcFAQCosts(getCurrentTeu());
  const target   = V('target');
  const fx       = V('fx');
  let deal = {};

  if (fbMode === 'faq') {
    const blendedFob = getBlendedFob(fbType);
    const price      = V('fb-price');
    const wt         = V('fb-wt');
    const mc         = V('fb-mc');
    const otAdd      = V('fb-ot-add') || 0;
    const tol        = parseFloat(document.getElementById('mc-tol')?.value) || 13.0;
    const { factor } = calcQCFactor(mc, tol, V('fb-pods'), V('fb-exm'), V('fb-husks'));
    const finalPrice = (price + otAdd) / factor;
    const buyPerMT   = finalPrice * 1000 / fx;
    const margin     = blendedFob - buyPerMT - faqCosts.total;
    const profit     = margin * wt / 1000;
    const locI       = parseInt(el('fb-loc')?.value) || 0;
    deal = {
      time:    new Date().toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' }),
      date:    new Date().toLocaleDateString('en-UG', { day: '2-digit', month: 'short' }),
      type:    fbType.toUpperCase(),
      mode:    'FAQ',
      loc:     LOCATIONS[locI].name,
      price,
      wt,
      mc,
      factor:  factor.toFixed(4),
      margin,
      profit,
      verdict: margin >= target ? 'BUY' : margin >= 0 ? 'BELOW TARGET' : 'WALK AWAY',
      ice:     V('ice'),
      liffe:   V('liffe'),
      fx,
    };
  } else {
    const gi       = parseInt(el('fb-proc-grade')?.value) || 0;
    const diff     = getGradeDiff(fbProcType, gi);
    const fob      = getFob(fbProcType, diff);
    const fotPrice = V('fb-fot');
    const vol      = V('fb-pvol');
    const procC    = calcProcCosts(fob, 25);
    const margin   = fob - fotPrice - procC;
    const profit   = margin * vol;
    deal = {
      time:    new Date().toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' }),
      date:    new Date().toLocaleDateString('en-UG', { day: '2-digit', month: 'short' }),
      type:    fbProcType.toUpperCase(),
      mode:    'Processed',
      loc:     'FOT',
      price:   fotPrice,
      wt:      vol * 1000,
      mc:      '—',
      factor:  '—',
      margin,
      profit,
      verdict: margin >= V('target') ? 'BUY' : margin >= 0 ? 'BELOW TARGET' : 'WALK AWAY',
      ice:     V('ice'),
      liffe:   V('liffe'),
      fx:      V('fx'),
    };
  }

  const log = getDealLog();
  log.unshift(deal);
  saveDealLog(log);
  renderDealLog();

  const btn = el('log-deal-btn');
  if (btn) {
    btn.classList.add('flash');
    btn.textContent = '✓ Logged!';
    setTimeout(() => {
      btn.classList.remove('flash');
      btn.innerHTML = '&#128203; Log This Deal';
    }, 1800);
  }
}

function renderDealLog() {
  const log    = getDealLog();
  const target = V('target');

  // Badge
  const badge = el('dl-badge');
  if (badge) {
    badge.textContent    = log.length;
    badge.style.display  = log.length > 0 ? 'inline' : 'none';
  }

  // Stats
  const totalProfit = log.reduce((a, d) => a + d.profit, 0);
  const buys        = log.filter(d => d.verdict === 'BUY').length;
  const avgM        = log.length ? log.reduce((a, d) => a + d.margin, 0) / log.length : null;

  const plEl = el('dl-total-pl');
  if (plEl) {
    plEl.textContent = (totalProfit >= 0 ? '$' : '-$') + fmt(Math.abs(totalProfit), 0);
    plEl.className   = 'dl-stat-v ' + (totalProfit >= 0 ? 'g' : 'r');
  }
  setTextContent('dl-count', log.length);
  setTextContent('dl-buys',  `${buys} / ${log.length} BUY`);

  const avgMEl = el('dl-avg-margin');
  if (avgMEl) {
    avgMEl.textContent = avgM != null ? (avgM >= 0 ? '$' : '-$') + fmt(Math.abs(avgM), 0) + '/MT' : '—';
    if (avgM != null) avgMEl.className = 'dl-stat-v ' + (avgM >= target ? 'g' : avgM >= 0 ? 'a' : 'r');
  }

  // Table
  const tableEl = el('deal-log-table');
  if (!tableEl) return;

  if (log.length === 0) {
    tableEl.innerHTML = `<div class="dl-empty">
      <div class="dl-empty-icon">&#128203;</div>
      <div class="dl-empty-t">No deals logged yet</div>
      <div class="dl-empty-s">Go to Field Buyer, assess a deal,<br>then press <strong style="color:var(--gold)">Log This Deal</strong>.</div>
    </div>`;
    return;
  }

  tableEl.innerHTML = `<div style="overflow-x:auto"><table class="dtbl" style="min-width:620px">
    <thead><tr>
      <th>Date</th><th>Time</th><th>Type</th><th>Location</th>
      <th>Price Paid</th><th>Weight</th><th>MC/Factor</th>
      <th>Margin/MT</th><th>P&amp;L</th><th>Verdict</th><th></th>
    </tr></thead>
    <tbody>
      ${log.map((d, i) => `<tr>
        <td>${d.date || '—'}</td>
        <td>${d.time}</td>
        <td><span class="pill ${d.type === 'ROB' ? 'a' : 'g'}">${d.type} ${d.mode}</span></td>
        <td>${d.loc}</td>
        <td>${d.mode === 'FAQ' ? 'UGX ' + fmt(d.price) + '/kg' : '$' + fmt(d.price, 0) + '/MT'}</td>
        <td>${fmt(d.wt, 0)} kg</td>
        <td>${d.mode === 'FAQ' ? d.mc + '% / ' + d.factor : '—'}</td>
        <td class="${d.margin >= target ? 'pos' : d.margin >= 0 ? 'a' : 'neg'}">${d.margin >= 0 ? '$' : '-$'}${fmt(Math.abs(d.margin), 0)}/MT</td>
        <td class="${d.profit >= 0 ? 'pos' : 'neg'}">${d.profit >= 0 ? '$' : '-$'}${fmt(Math.abs(d.profit), 0)}</td>
        <td><span class="pill ${d.verdict === 'BUY' ? 'g' : d.verdict === 'BELOW TARGET' ? 'a' : 'r'}">${d.verdict}</span></td>
        <td><button class="dl-del" onclick="deleteDealEntry(${i})" aria-label="Delete deal">&#10005;</button></td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function deleteDealEntry(index) {
  const log = getDealLog();
  log.splice(index, 1);
  saveDealLog(log);
  renderDealLog();
}

/* ═══════════════════════════════════════════════════════════
   SECTION 13 — COPY DEAL SUMMARY
   ═══════════════════════════════════════════════════════════ */

function copyDealSummary() {
  const faqCosts = calcFAQCosts(getCurrentTeu());
  const target   = V('target');
  const fx       = V('fx');
  const now      = new Date().toLocaleString('en-UG');

  const lines = [
    '☕ COFFEE TRADING DESK — DEAL SUMMARY',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `Time: ${now}`,
    `ICE: ${V('ice')} cts/lb  |  Liffe: $${V('liffe')}/MT  |  FX: ${fmt(fx)} UGX/USD`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ];

  if (fbMode === 'faq') {
    const blendedFob = getBlendedFob(fbType);
    const price      = V('fb-price');
    const wt         = V('fb-wt');
    const mc         = V('fb-mc');
    const otAdd      = V('fb-ot-add') || 0;
    const tol        = parseFloat(document.getElementById('mc-tol')?.value) || 13.0;
    const { factor } = calcQCFactor(mc, tol, V('fb-pods'), V('fb-exm'), V('fb-husks'));
    const finalPrice = (price + otAdd) / factor;
    const buyPerMT   = finalPrice * 1000 / fx;
    const margin     = blendedFob - buyPerMT - faqCosts.total;
    const profit     = margin * wt / 1000;
    const maxPrice   = (blendedFob - faqCosts.total - target) * factor * fx / 1000;
    const locI       = parseInt(el('fb-loc')?.value) || 0;
    lines.push(
      `Type: ${fbType.toUpperCase()} FAQ/Parchment`,
      `Location: ${LOCATIONS[locI].name}`,
      `Price offered: UGX ${fmt(price)}/kg${otAdd ? ` (+${fmt(otAdd)} OT add)` : ''}`,
      `Weight: ${fmt(wt, 0)} kg  |  MC: ${mc}%  |  QC Factor: ${factor.toFixed(4)}`,
      `Effective price: UGX ${fmt(Math.round(finalPrice))}/kg`,
      `Blended FOB: $${fmt(blendedFob, 0)}/MT`,
      `Total costs: $${fmt(faqCosts.total, 2)}/MT`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `MARGIN: ${margin >= 0 ? '$' : '-$'}${fmt(Math.abs(margin), 0)}/MT  (Target: $${target}/MT)`,
      `DEAL P&L: ${profit >= 0 ? '$' : '-$'}${fmt(Math.abs(profit), 0)}`,
      `MAX PAYABLE: UGX ${fmt(Math.round(maxPrice))}/kg`,
      `VERDICT: ${margin >= target ? '✅ BUY' : margin >= 0 ? '⚠️ BELOW TARGET — apply QC cuts or walk away' : '🛑 WALK AWAY'}`,
    );
  } else {
    const gi       = parseInt(el('fb-proc-grade')?.value) || 0;
    const diff     = getGradeDiff(fbProcType, gi);
    const fob      = getFob(fbProcType, diff);
    const fotPrice = V('fb-fot');
    const vol      = V('fb-pvol');
    const procC    = calcProcCosts(fob, 25);
    const margin   = fob - fotPrice - procC;
    const profit   = margin * vol;
    lines.push(
      `Type: ${fbProcType.toUpperCase()} Processed`,
      `Their FOT: $${fmt(fotPrice, 0)}/MT  |  Volume: ${vol} MT`,
      `Your FOB: $${fmt(fob, 0)}/MT  |  Costs: $${fmt(procC, 2)}/MT`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `MARGIN: ${margin >= 0 ? '$' : '-$'}${fmt(Math.abs(margin), 0)}/MT  (Target: $${target}/MT)`,
      `DEAL P&L: ${profit >= 0 ? '$' : '-$'}${fmt(Math.abs(profit), 0)}`,
      `VERDICT: ${margin >= target ? '✅ BUY' : margin >= 0 ? '⚠️ BELOW TARGET — walk away' : '🛑 WALK AWAY'}`,
    );
  }

  const text = lines.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.deal-btn--copy');
    if (btn) {
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = '📋 Copy Summary'; }, 2000);
    }
  }).catch(() => {
    prompt('Copy this deal summary:', text);
  });
}

/* ═══════════════════════════════════════════════════════════
   SECTION 14 — RENDERING: SIDEBAR
   ═══════════════════════════════════════════════════════════ */

// ── Sidebar mutation helpers ───────────────────────────────
// Named functions so dynamic oninput strings never reference
// let-variables directly from global scope (fragile across engines).

function updateCompRob(i, val) {
  compsRob[i].price = parseFloat(val) || 0;
  saveCompetitorPrices('rob', compsRob);
  update();
}

function updateCompAra(i, val) {
  compsAra[i].price = parseFloat(val) || 0;
  saveCompetitorPrices('ara', compsAra);
  update();
}

function updateLocDed(i, val) {
  locDeds[i].deduction = parseFloat(val) || 0;
  update();
}

function renderCompetitors() {
  const listEl = el('comp-list');
  if (!listEl) return;
  listEl.innerHTML = compsRob.map((c, i) => `
    <div class="cc">
      <span class="cn">${c.name}</span>
      <input class="cp" type="number" value="${c.price}" step="100"
        oninput="updateCompRob(${i}, this.value)">
    </div>`).join('');
}

function renderCompetitorsAra() {
  const listEl = el('comp-list-ara');
  if (!listEl) return;
  listEl.innerHTML = compsAra.map((c, i) => `
    <div class="cc">
      <span class="cn">${c.name}</span>
      <input class="cp" type="number" value="${c.price}" step="100"
        oninput="updateCompAra(${i}, this.value)">
    </div>`).join('');
}

function renderLocationBlock() {
  const locEl = el('loc-block');
  if (!locEl) return;
  locEl.innerHTML = locDeds.map((l, i) => `
    <div class="loc-row">
      <span class="loc-n">${l.name}</span>
      <div style="display:flex;align-items:center;gap:3px">
        ${i === 0
          ? '<span style="font-size:9px;color:var(--sub);font-family:\'DM Mono\',monospace">= avg</span>'
          : `<span style="font-size:9px;color:var(--sub)">&#8722;</span>
             <input class="ldi" type="number" value="${l.deduction}" step="50"
               oninput="updateLocDed(${i}, this.value)">`}
      </div>
      <span class="loc-v" id="lv${i}">&#8212;</span>
    </div>`).join('');
}

function updateSidebar() {
  const avg    = getAvgComp();
  const avgAra = getAvgCompAra();
  setTextContent('sb-avg',     `UGX ${fmt(Math.round(avg))}/kg`);
  setTextContent('sb-avg-ara', `UGX ${fmt(Math.round(avgAra))}/kg`);
  locDeds.forEach((l, i) => {
    const price = avg - l.deduction;
    const locEl = el(`lv${i}`);
    if (!locEl) return;
    locEl.textContent  = `UGX ${fmt(Math.round(Math.max(price, 0)))}`;
    locEl.style.color  = price >= avg * 0.97 ? 'var(--grn)' : price > 0 ? 'var(--amb)' : 'var(--red)';
  });
}

function toggleSidebar() {
  el('sidebar')?.classList.toggle('sb-open');
}

/* ═══════════════════════════════════════════════════════════
   SECTION 15 — LIVE PRICE FETCH
   ═══════════════════════════════════════════════════════════ */

async function fetchPrices() {
  const btn = el('fetch-btn');
  const ico = el('ficon');
  const st  = el('fstat');
  if (!btn || !ico || !st) return;

  btn.disabled    = true;
  ico.classList.add('spin');
  st.textContent  = 'Fetching prices...';
  st.className    = 'fstat';

  let iceOk   = false;
  let liffeOk = false;
  let fxOk    = false;

  const PROXY   = 'https://api.allorigins.win/get?url=';
  const TIMEOUT = 6000;

  // ── Attempt 1: Barchart via allorigins ──
  try {
    const [iceRes, liffeRes] = await Promise.allSettled([
      fetch(PROXY + encodeURIComponent('https://www.barchart.com/proxies/core-api/v1/quotes/get?symbols=KCZ25&fields=lastPrice&raw=1'), { signal: AbortSignal.timeout(TIMEOUT) }),
      fetch(PROXY + encodeURIComponent('https://www.barchart.com/proxies/core-api/v1/quotes/get?symbols=RCJ25&fields=lastPrice&raw=1'),  { signal: AbortSignal.timeout(TIMEOUT) }),
    ]);
    if (iceRes.status === 'fulfilled' && iceRes.value.ok) {
      const d = JSON.parse((await iceRes.value.json()).contents || '{}');
      const p = d?.data?.[0]?.raw?.lastPrice;
      if (p && p > 100) { flashUpdate('ice', parseFloat(p).toFixed(2)); iceOk = true; }
    }
    if (liffeRes.status === 'fulfilled' && liffeRes.value.ok) {
      const d = JSON.parse((await liffeRes.value.json()).contents || '{}');
      const p = d?.data?.[0]?.raw?.lastPrice;
      if (p && p > 500) { flashUpdate('liffe', Math.round(parseFloat(p))); liffeOk = true; }
    }
  } catch (_) { /* intentional fallthrough */ }

  // ── Attempt 2: Yahoo Finance fallback ──
  if (!iceOk || !liffeOk) {
    st.textContent = 'Trying Yahoo Finance...';
    try {
      const [iceRes, liffeRes] = await Promise.allSettled([
        fetch('https://query1.finance.yahoo.com/v8/finance/chart/KCZ25.NYB?interval=1d&range=1d', { signal: AbortSignal.timeout(5000) }),
        fetch('https://query1.finance.yahoo.com/v8/finance/chart/RCJ25.LFT?interval=1d&range=1d',  { signal: AbortSignal.timeout(5000) }),
      ]);
      if (!iceOk && iceRes.status === 'fulfilled' && iceRes.value.ok) {
        const d = await iceRes.value.json();
        const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (p) { flashUpdate('ice', parseFloat(p).toFixed(2)); iceOk = true; }
      }
      if (!liffeOk && liffeRes.status === 'fulfilled' && liffeRes.value.ok) {
        const d = await liffeRes.value.json();
        const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (p) { flashUpdate('liffe', Math.round(parseFloat(p))); liffeOk = true; }
      }
    } catch (_) { /* intentional fallthrough */ }
  }

  // ── Attempt 3: FX rate ──
  st.textContent = 'Fetching FX rate...';
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const d   = await res.json();
      const ugx = d?.rates?.UGX;
      if (ugx && ugx > 2000 && ugx < 8000) { flashUpdate('fx', Math.round(ugx)); fxOk = true; }
    }
  } catch (_) { /* intentional fallthrough */ }

  if (!fxOk) {
    try {
      const res = await fetch(PROXY + encodeURIComponent('https://api.exchangerate-api.com/v4/latest/USD'), { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const d   = JSON.parse((await res.json()).contents || '{}');
        const ugx = d?.rates?.UGX;
        if (ugx && ugx > 2000 && ugx < 8000) { flashUpdate('fx', Math.round(ugx)); fxOk = true; }
      }
    } catch (_) { /* intentional fallthrough */ }
  }

  const now    = new Date();
  const anyOk  = iceOk || liffeOk || fxOk;
  const hhmm   = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (anyOk) {
    lastFetchTime = now;
    const parts = [];
    if (iceOk)   parts.push('ICE');
    if (liffeOk) parts.push('Liffe');
    if (fxOk)    parts.push('FX');
    st.textContent = `Updated ${parts.join('+')} at ${hhmm}`;
    st.className   = 'fstat fresh';
    update();
    saveAppState();
    // Mark stale after 4 hours
    setTimeout(() => {
      if (st.className === 'fstat fresh') {
        st.textContent = `Prices from ${hhmm} — refresh?`;
        st.className   = 'fstat stale';
      }
    }, 4 * 60 * 60 * 1000);
  } else {
    st.textContent = 'Auto-fetch unavailable — update ICE & Liffe manually (barchart.com)';
    st.className   = 'fstat stale';
  }

  btn.disabled = false;
  ico.classList.remove('spin');
}

function flashUpdate(id, val) {
  const inputEl = el(id);
  if (!inputEl) return;
  inputEl.value = val;
  inputEl.classList.add('just-updated');
  setTimeout(() => inputEl.classList.remove('just-updated'), 800);
}

/* ═══════════════════════════════════════════════════════════
   SECTION 16 — NAVIGATION & MODE SWITCHING
   ═══════════════════════════════════════════════════════════ */

function switchView(viewName, btnEl) {
  // Hide all views
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active-view');
    v.classList.add('hidden');
  });
  // Show target view
  const target = el(`view-${viewName}`);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active-view');
  }
  // Update nav buttons
  document.querySelectorAll('.vbtn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  // Trigger view-specific refreshes
  if (viewName === 'costs')   updateCosts();
  if (viewName === 'deallog') renderDealLog();
}

function setFBMode(mode) {
  fbMode = mode;
  el('fbm-faq')?.classList.toggle('active',  mode === 'faq');
  el('fbm-proc')?.classList.toggle('active', mode === 'proc');
  el('fb-faq-fields').style.display  = mode === 'faq'  ? 'block' : 'none';
  el('fb-proc-fields').style.display = mode === 'proc' ? 'block' : 'none';

  // Show/hide FAQ-only elements
  const locCheck = el('fb-loc-check');
  const gradeFob = el('fb-grade-fob-wrap');
  if (locCheck) locCheck.style.display = mode === 'faq' ? '' : 'none';
  if (gradeFob) gradeFob.style.display = mode === 'faq' ? 'block' : 'none';
  update();
}

function setFBType(type) {
  fbType = type;
  el('fb-rob')?.classList.toggle('active', type === 'rob');
  el('fb-ara')?.classList.toggle('active', type === 'ara');
  setInputVal('fb-ot',    type === 'rob' ? 85 : 80);
  setInputVal('fb-price', type === 'rob' ? 11000 : 17500);
  const label = el('fb-plbl');
  if (label) label.textContent = type === 'rob' ? 'FAQ Price (UGX/kg)' : 'Parchment Price (UGX/kg)';
  renderMixGrid('fb-mix-grid', type);
  update();
}

function setFBProcType(type) {
  fbProcType = type;
  el('fb-pr-rob')?.classList.toggle('active', type === 'rob');
  el('fb-pr-ara')?.classList.toggle('active', type === 'ara');
  populateGradeSelect('fb-proc-grade', type);
  update();
}

function setTVMode(mode) {
  tvMode = mode;
  el('tvm-faq')?.classList.toggle('active',  mode === 'faq');
  el('tvm-proc')?.classList.toggle('active', mode === 'proc');
  el('tv-faq-fields').style.display  = mode === 'faq'  ? 'block' : 'none';
  el('tv-proc-fields').style.display = mode === 'proc' ? 'block' : 'none';
  update();
}

function setTVType(type) {
  tvType = type;
  el('tv-rob')?.classList.toggle('active', type === 'rob');
  el('tv-ara')?.classList.toggle('active', type === 'ara');
  setInputVal('tv-ot',    type === 'rob' ? 85 : 80);
  setInputVal('tv-price', type === 'rob' ? 11000 : 17500);
  const label = el('tv-plbl');
  if (label) label.textContent = type === 'rob' ? 'FAQ Price (UGX/kg)' : 'Parchment Price (UGX/kg)';
  update();
}

function setTVProcType(type) {
  tvProcType = type;
  el('tv-pr-rob')?.classList.toggle('active', type === 'rob');
  el('tv-pr-ara')?.classList.toggle('active', type === 'ara');
  populateGradeSelect('tv-proc-grade', type);
  update();
}

/* ═══════════════════════════════════════════════════════════
   SECTION 17 — MASTER UPDATE
   ═══════════════════════════════════════════════════════════ */

function update() {
  updateFB();
  updateTV();
  updateIntel();
  updateDiff();
  updateSidebar();
}

/* ═══════════════════════════════════════════════════════════
   SECTION 18 — DOM HELPERS
   ═══════════════════════════════════════════════════════════ */

function setTextContent(id, text) {
  const node = el(id);
  if (node) node.textContent = text;
}

function setHTML(id, html) {
  const node = el(id);
  if (node) node.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════
   SECTION 19 — INITIALIZATION
   ═══════════════════════════════════════════════════════════ */

window.addEventListener('DOMContentLoaded', () => {
  // Date display
  el('topdate').textContent = new Date().toLocaleDateString('en-UG', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });

  // Load persisted state
  loadAppState();

  // Render sidebar
  renderCompetitors();
  renderCompetitorsAra();
  renderLocationBlock();

  // Render Field Buyer
  renderMixGrid('fb-mix-grid', 'rob');
  populateGradeSelect('fb-proc-grade', 'rob');
  populateGradeSelect('tv-proc-grade', 'rob');
  renderGradeFobTable('rob');
  renderDealLog();

  // Cost slider
  const costSlider = el('c-slider');
  if (costSlider) {
    costSlider.addEventListener('input', updateCosts);
  }

  // Initial full render
  update();
});
