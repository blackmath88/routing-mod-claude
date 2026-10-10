// routing-mod: route subagents by tier. Main session is never switched (keeps its cache).
//
// Routing contract: a run of [kind:value] tokens at the very START of the Agent prompt
// (the engine offers no structured metadata on agent.spawn or the Agent tool, see docs/QUALIFICATION.md):
//   [tier:light|standard|deep]          requested tier
//   [min-tier:light|standard|deep]      floor: the effective tier is never below it
//   [on-limit:step-down|keep|stop]      what happens at >= LIMIT_PERCENT usage
// Only that leading block is trusted. Tag-like text later in the prompt (quoted code, logs, retrieved
// text) never affects routing and is left untouched. A malformed or conflicting leading block refuses
// the spawn (fail closed). Keyword detection of security/architecture/review work is a routing
// heuristic that can only RAISE quality (implicit floor, keep at the limit), never a security boundary.
// Protected work defaults to on-limit:keep (never stepped down
// silently). Every decision logs requested tier, effective tier, the model the engine
// actually started (observed) and the usage state. Missing usage stays "unknown".

export const TIERS = { light: 'haiku', standard: 'sonnet', deep: 'opus' }
const ORDER = ['light', 'standard', 'deep']
const rank = tier => ORDER.indexOf(tier)
const STEP_DOWN = { deep: 'standard', standard: 'light', light: 'light' }
export const LIMIT_PERCENT = 85 // step down one tier at or above this rate-limit usage
const PROTECTED = /\b(secur(?:e|ity|ing)|vulnerabilit(?:y|ies)|threat(?:-model)?s?|exploits?|pen-?test(?:ing)?|secrets?|credentials?|(?:auth|access|api|session|bearer|refresh)[- ]tokens?|permissions?|privacy|sandbox(?:ing|[- ]escape)|(?:sql|command|prompt|code|shell)[- ]injection|xss|csrf|ssrf|oauth|auth(?:n|z|entication|orization)?|crypto(?:graphy)?|architecture|architectural|review(?:s|er|ers|ing)?|audit(?:s|ing)?)\b/i
const PROTECTED_FLOOR = 'standard' // protected work without [min-tier] or [tier] tags is never routed below this
const ANY_TAG = /\[\s*(tier|min-tier|on-limit)\s*:\s*([^\]]*)\]/gi // only used to COUNT ignored tag-like text
const LEAD_TOKEN = /^\s*\[([^\]:\n]+):([^\]\n]*)\]/ // one [kind:value] token at the current start
const VALUES = { tier: ORDER, 'min-tier': ORDER, 'on-limit': ['step-down', 'keep', 'stop'] }
const RETURN_RULE =
  '\n\nWhen done, reply with a summary under 150 words: what you changed (files), ' +
  'what you verified, open issues. No full file contents, no long logs.'


/** Tier of a model alias or id (haiku/sonnet/opus anywhere in it); undefined when unknown. */
export function tierOfModel(model) {
  const m = String(model ?? '').toLowerCase()
  return m.includes('haiku') ? 'light' : m.includes('sonnet') ? 'standard' : m.includes('opus') ? 'deep' : undefined
}

/**
 * The leading routing contract and the task text after it. Every leading [kind:value] token belongs to
 * the contract: an unknown kind or value is `malformed`, two different values of one kind a `conflict`
 * (both refuse the spawn). Nothing after the block is parsed; `ignored` counts tag-like strings there.
 */
export function parseTags(prompt) {
  let rest = String(prompt ?? '')
  const found = {}; const malformed = []; const conflicts = []
  for (let m; (m = rest.match(LEAD_TOKEN)); rest = rest.slice(m[0].length)) {
    const kind = m[1].trim().toLowerCase(); const v = m[2].trim().toLowerCase()
    if (!Object.hasOwn(VALUES, kind) || !VALUES[kind].includes(v)) { malformed.push(m[0].trim()); continue }
    if (found[kind] && found[kind] !== v) conflicts.push(`${kind}: ${found[kind]}/${v}`)
    found[kind] ??= v
  }
  const clean = rest.trim()
  return { tier: found.tier, floor: found['min-tier'], onLimit: found['on-limit'], malformed, conflicts,
    ignored: [...clean.matchAll(ANY_TAG)].length, clean }
}
/**
 * `$.session.usage().rateLimits` -> { state: 'known', percent, kind } for the fullest window,
 * or { state: 'unknown', why }. An empty list (off a subscription, no reading yet) is unknown,
 * never 0 %.
 */
export function summarizeUsage(rateLimits) {
  const valid = (Array.isArray(rateLimits) ? rateLimits : []).filter(r => r && Number.isFinite(r.percentUsed))
  if (!valid.length) return { state: 'unknown', why: 'no rate-limit reading' }
  const top = valid.reduce((a, b) => (b.percentUsed > a.percentUsed ? b : a))
  return { state: 'known', percent: top.percentUsed, kind: String(top.kind ?? 'window') }
}

/**
 * Pure routing decision. Input: { prompt, description, model, fork, parentModel, classified, usage }.
 * Returns { action: 'pass' | 'route' | 'deny', requested, effective, model, floor, onLimit, usage,
 * reasons, prompt?, deny? }. No savings or quota figures are ever invented.
 */
export function decide(input) {
  const t = parseTags(input.prompt)
  const usage = input.usage ?? { state: 'unknown', why: 'not read' }
  const reasons = []
  const isProtected = PROTECTED.test(`${input.description ?? ''}\n${t.clean}`)
  let floor = t.floor
  // An explicit [tier] tag is the plan author's choice and beats the keyword-based implicit floor.
  const implicitFloor = !floor && !t.tier && isProtected
  if (implicitFloor) { floor = PROTECTED_FLOOR; reasons.push(`protected work: implicit floor ${PROTECTED_FLOOR}`) }
  if (t.ignored) reasons.push(`${t.ignored} tag-like string(s) in the task text ignored (only the leading block routes)`)
  const base = { floor, onLimit: t.onLimit, usage, reasons }
  if (t.malformed.length || t.conflicts.length) {
    return { ...base, action: 'deny', requested: { tier: t.tier, source: 'tag' }, effective: undefined,
      deny: `routing-mod: invalid routing contract at the start of the prompt (${[...t.malformed.map(m => `unrecognised ${m}`), ...t.conflicts.map(c => `conflicting ${c}`)].join('; ')}). ` +
        'Fix the leading tags (tier/min-tier: light|standard|deep; on-limit: step-down|keep|stop); not started.' }
  }

  // Forks inherit the parent's model; the engine ignores a model rewrite. A floor can only be checked.
  if (input.fork) {
    const pt = tierOfModel(input.parentModel)
    const requested = { tier: pt, source: 'fork (inherits parent)' }
    if (t.tier) reasons.push(`fork: its [tier:${t.tier}] cannot apply (forks inherit)`)
    if (floor && (pt === undefined || rank(pt) < rank(floor))) {
      return { ...base, action: 'deny', requested, effective: pt,
        deny: `routing-mod: a fork inherits ${input.parentModel ?? 'an unknown model'} (tier ${pt ?? 'unknown'}), below [min-tier:${floor}]. Dispatch it as a non-fork agent.` }
    }
    return { ...base, action: 'pass', requested, effective: pt, model: input.parentModel }
  }

  // No tier tag but the caller named a model explicitly: respect it, unless a floor says otherwise.
  if (!t.tier && input.model) {
    const mt = tierOfModel(input.model)
    const requested = { tier: mt, source: `explicit model ${input.model}` }
    if (floor && (rank(mt) < rank(floor) && mt !== undefined || mt === undefined && !implicitFloor)) {
      reasons.push(`explicit model ${mt === undefined ? 'of unknown tier' : 'below the floor'}: raised to ${floor}`)
      return { ...base, action: 'route', requested, effective: floor, model: TIERS[floor], prompt: t.clean + RETURN_RULE }
    }
    if (mt === undefined && implicitFloor) reasons.push('explicit model of unknown tier kept (implicit floor not verifiable)')
    if (usage.state === 'known' && usage.percent >= LIMIT_PERCENT) reasons.push('explicit model: limit policy not applied')
    return { ...base, action: 'pass', requested, effective: mt, model: input.model }
  }

  let tier = t.tier
  let source = 'tag'
  if (!tier) {
    tier = ORDER.includes(input.classified) ? input.classified : 'standard'
    source = ORDER.includes(input.classified) ? 'classified' : 'default (classification unavailable)'
  }
  const requested = { tier, source }
  let effective = tier
  if (floor && rank(effective) < rank(floor)) { effective = floor; reasons.push(`raised to [min-tier:${floor}]`) }

  if (usage.state !== 'known') {
    reasons.push(`usage unknown (${usage.why ?? 'unavailable'}): no limit protection applied`)
  } else if (usage.percent >= LIMIT_PERCENT && effective !== STEP_DOWN[effective]) {
    const target = STEP_DOWN[effective]
    let policy = t.onLimit ?? (isProtected ? 'keep' : 'step-down')
    let why = t.onLimit ? `[on-limit:${t.onLimit}]` : isProtected ? 'protected work' : ''
    if (policy === 'step-down' && floor && rank(target) < rank(floor)) { policy = 'keep'; why = `floor ${floor}` }
    const at = `${usage.kind} ${usage.percent}% >= ${LIMIT_PERCENT}%`
    if (policy === 'stop') {
      return { ...base, action: 'deny', requested, effective,
        deny: `routing-mod: ${at}; this task requires tier ${effective} and is tagged [on-limit:stop]. Not started; retry after the window resets or decide explicitly.` }
    }
    if (policy === 'keep') reasons.push(`${at}: kept ${effective} (${why}), no downgrade`)
    else { reasons.push(`${at}: DOWNGRADED ${effective} -> ${target}`); effective = target }
  }
  return { ...base, action: 'route', requested, effective, model: TIERS[effective], prompt: t.clean + RETURN_RULE }
}

/** One log line: requested vs effective vs observed, usage state and reasons. */
export function describe(d, description, observedModel) {
  const ot = tierOfModel(observedModel)
  const mismatch = !observedModel ? '' : !d.effective || !ot ? ' [tier unverifiable]' : ot !== d.effective ? ' [OBSERVED != EFFECTIVE]' : ''
  const usage = d.usage.state === 'known' ? `${d.usage.kind} ${d.usage.percent}%` : 'unknown'
  return `${description} · requested ${d.requested.tier ?? 'unknown'} (${d.requested.source}) → effective ${d.effective ?? 'unknown'} (${d.model ?? 'n/a'}) · observed ${observedModel ?? 'n/a'}${mismatch} · usage ${usage}` +
    (d.reasons.length ? ` · ${d.reasons.join('; ')}` : '') + (d.deny ? ` · DENIED` : '')
}

export function register(on) {
  on('agent.spawn', async ($, e, next) => {
    const tags = parseTags(e.prompt)
    let classified
    if (!e.fork && !tags.tier && !e.model) {
      try {
        classified = await $.model.classify(`${e.description}\n\n${tags.clean.slice(0, 2000)}`, ORDER, { model: 'haiku' })
      } catch {}
    }
    let usage = { state: 'unknown', why: 'not read' }
    if (!e.fork) {
      try { usage = summarizeUsage((await $.session.usage()).rateLimits) } catch { usage = { state: 'unknown', why: 'usage unavailable' } }
    }
    const d = decide({ prompt: e.prompt, description: e.description, model: e.model, fork: e.fork, parentModel: e.parentModel, classified, usage })
    if (d.action === 'deny') { $.ui.log(describe(d, e.description)); return { deny: d.deny } }
    const result = await next(d.action === 'pass' ? e : { ...e, model: d.model, prompt: d.prompt })
    try { $.ui.log(result?.deny ? `${describe(d, e.description)} · DENIED by engine: ${result.deny}` : describe(d, e.description, result?.model)) } catch {}
    return result
  }).catch(($, e, next) => {
    // A routing failure is reported, never silent. A task with a floor or [on-limit:stop] is refused rather than
    // run unrouted; anything else proceeds on the engine's own choice. A failure after next() returns its result.
    const t = parseTags(e.prompt)
    // next is replay-safe in .catch (engine contract): when called, next(e) resolves to the first result, it does not spawn again.
    const guarded = t.floor || t.onLimit === 'stop' || t.malformed.length || t.conflicts.length || (!t.tier && PROTECTED.test(`${e.description}\n${t.clean}`))
    try { $.ui.log(`${e.description} · routing-mod FAILED: ${next.called ? 'after spawn' : guarded ? 'spawn refused (floor/stop/protected)' : 'spawn left unrouted (engine default model)'}`) } catch {}
    if (next.called) return next(e)
    return guarded ? { deny: 'routing-mod: routing failed for a task with a quality floor, on-limit:stop or protected (security/architecture/review) work; not started unrouted.' } : next(e)
  })
}
