// routing-mod: route subagents by tier. Main session is never switched (keeps its cache).

const TIERS = { light: 'haiku', standard: 'sonnet', deep: 'opus' }
const STEP_DOWN = { deep: 'standard', standard: 'light', light: 'light' }
const LIMIT_PERCENT = 85 // step down one tier above this rate-limit usage
const TAG = /\[tier:(light|standard|deep)\]/i
const RETURN_RULE =
  '\n\nAfter you finish the task above, reply with a summary under 150 words.'

export function register(on) {
  on('agent.spawn', async ($, e, next) => {
    // Forks, teammates and workflow agents pass through untouched
    if (e.fork || e.isTeammate || e.workflow) return next(e)

    let tier = e.prompt.match(TAG)?.[1]?.toLowerCase()
    let source = 'Plan'

    // No tag but the caller named a model explicitly: respect it
    if (!tier && e.model) return next(e)

    if (!tier) {
      try {
        tier = await $.model.classify(
          `${e.description}\n\n${e.prompt.slice(0, 2000)}`,
          ['light', 'standard', 'deep'],
          { model: 'haiku' }
        )
        source = 'klassifiziert'
      } catch {}
      if (!tier) { tier = 'standard'; source = 'Standard' }
    }

    try {
      const { rateLimits = [] } = await $.session.usage()
      if (rateLimits.some(r => r.percentUsed >= LIMIT_PERCENT) && tier !== STEP_DOWN[tier]) {
        tier = STEP_DOWN[tier]
        source += ', Limit-Schutz'
      }
    } catch {}

    const model = TIERS[tier]
    const prompt = e.prompt.replace(TAG, '').trim() + RETURN_RULE
    const result = await next({ ...e, model, prompt })
    if (!result.deny) $.ui.log(`${e.description} → ${tier} (${model}) · ${source}`)
    return result
  })
}
