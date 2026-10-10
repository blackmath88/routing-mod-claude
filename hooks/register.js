// routing-mod: route subagents by tier. Main session is never switched (keeps its cache).
//
// Task tags (copied verbatim from the plan into the Agent prompt):
//   [tier:light|standard|deep]          requested tier
//   [min-tier:light|standard|deep]      floor: the effective tier is never below it
//   [on-limit:step-down|keep|stop]      what happens at >= LIMIT_PERCENT usage
// Security / architecture / review work defaults to on-limit:keep (never stepped down
// silently). Every decision logs requested tier, effective tier, the model the engine
// actually started (observed) and the usage state. Missing usage stays "unknown".

export const TIERS = { light: 'haiku', standard: 'sonnet', deep: 'opus' }
const ORDER = ['light', 'standard', 'deep']
const rank = tier => ORDER.indexOf(tier)
const STEP_DOWN = { deep: 'standard', standard: 'light', light: 'light' }
export const LIMIT_PERCENT = 85 // step down one tier at or above this rate-limit usage
const TAG = /\[tier:(light|standard|deep)\]/i
const MIN_TAG = /\[min-tier:(light|standard|deep)\]/i
const LIMIT_TAG = /\[on-limit:(step-down|keep|stop)\]/i
const ALL_TAGS = /\[(?:tier|min-tier|on-limit):[a-z-]+\]/gi
const PROTECTED = /\b(secur(?:e|ity|ing)|vulnerabilit(?:y|ies)|threat(?:-model)?s?|exploits?|pen-?test(?:ing)?|secrets?|credentials?|(?:auth|access|api|session|bearer|refresh)[- ]tokens?|permissions?|privacy|sandbox(?:ing|[- ]escape)|(?:sql|command|prompt|code|shell)[- ]injection|xss|csrf|ssrf|oauth|auth(?:n|z|entication|orization)?|crypto(?:graphy)?|architecture|architectural|review(?:s|er|ers|ing)?|audit(?:s|ing)?)\b/i
const PROTECTED_FLOOR = 'standard' // protected work without [min-tier] or [tier] tags is never routed below this
const ANY_TAG = /\[\s*(tier|min-tier|on-limit)\s*:\s*([^\]]*)\]/gi
const RETURN_RULE =
  '\n\nWhen done, reply with a summary under 150 words: what you changed (files), ' +
  'what you verified, open issues. No full file contents, no long logs.'


/** Tier of a model alias or id (haiku/sonnet/opus anywhere in it); undefined when unknown. */
export function tierOfModel(model) {
  const m = String(model ?? '').toLowerCase()
  return m.includes('haiku') ? 'light' : m.includes('sonnet') ? 'standard' : m.includes('opus') ? 'deep' : undefined
}

/** Tags in a task prompt, and the prompt without them. */
export function parseTags(prompt) {
  const p = String(prompt ?? '')
  const found = { tier: new Set(), 'min-tier': new Set(), 'on-limit': new Set() }
  const malformed = []
  for (const m of p.matchAll(ANY_TAG)) {
    const kind = m[1].toLowerCase(); const v = m[2].trim().toLowerCase()
    const ok = kind === 'on-limit' ? ['step-down', 'keep', 'stop'].includes(v) : ORDER.includes(v)
    ok ? found[kind].add(v) : malformed.push(m[0])
  }
  const conflicts = Object.entries(found).filter(([, v]) => v.size > 1).map(([k, v]) => `${k}: ${[...v].join('/')}`)
  const pick = (k, strongest) => !found[k].size ? undefined : strongest ? [...found[k]].sort((a, b) => rank(b) - rank(a))[0] : [...found[k]][0]
  return {
    tier: pick('tier', true),
    floor: pick('min-tier', true), // conflicting floors: the strictest wins
    onLimit: found['on-limit'].has('stop') ? 'stop' : found['on-limit'].has('keep') ? 'keep' : pick('on-limit'),
    malformed, conflicts,
    clean: p.replace(ANY_TAG, '').trim(),
  }
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
  if (t.conflicts.length) reasons.push(`conflicting tags (${t.conflicts.join('; ')}): strictest used`)
  const base = { floor, onLimit: t.onLimit, usage, reasons }
  if (t.malformed.some(m => /min-tier|on-limit/i.test(m))) {
    return { ...base, action: 'deny', requested: { tier: t.tier, source: 'tag' }, effective: undefined,
      deny: `routing-mod: unrecognised routing tag ${t.malformed.join(' ')}; fix it (tiers: light|standard|deep; on-limit: step-down|keep|stop) rather than run without its floor/limit policy.` }
  }
  if (t.malformed.length) reasons.push(`unrecognised tag ${t.malformed.join(' ')} ignored`)

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
    const guarded = t.floor || t.onLimit === 'stop' || t.malformed.some(m => /min-tier|on-limit/i.test(m)) || (!t.tier && PROTECTED.test(`${e.description}\n${t.clean}`))
    try { $.ui.log(`${e.description} · routing-mod FAILED: ${next.called ? 'after spawn' : guarded ? 'spawn refused (floor/stop/protected)' : 'spawn left unrouted (engine default model)'}`) } catch {}
    if (next.called) return next(e)
    return guarded ? { deny: 'routing-mod: routing failed for a task with a quality floor, on-limit:stop or protected (security/architecture/review) work; not started unrouted.' } : next(e)
  })
}
