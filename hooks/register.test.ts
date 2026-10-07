import { test, expect } from 'claude-code/testing'

const SUFFIX = '\n\nAfter you finish the task above, reply with a summary under 150 words.'

// One fake agent.spawn through the plugin; returns the event that reaches next() at the bottom.
async function spawn($: any, on: any, e: any) {
  let reached: any
  on('model.classify', async () => ({ value: 'standard' }))
  on('session.usage', async () => ({ value: { rateLimits: [] } }))
  on('agent.spawn', async (_: any, ev: any) => { reached = ev; return { model: ev.model ?? 'inherit' } })
  await $.agent.spawn({ tool_use_id: 't', description: 'd', subagentType: 'general-purpose', ...e })
  return reached
}

for (const [tier, model] of [['light', 'haiku'], ['standard', 'sonnet'], ['deep', 'opus']]) {
  test(`[tier:${tier}] -> ${model}`, async ($, on) => {
    const r = await spawn($, on, { prompt: `[tier:${tier}] do it` })
    expect(r.model).toBe(model)
    expect(r.prompt).toBe('do it' + SUFFIX)
  })
}

test('fork passes through', async ($, on) => {
  const r = await spawn($, on, { prompt: '[tier:light] x', fork: true, model: 'sonnet' })
  expect(r.model).toBe('sonnet')
  expect(r.prompt).toBe('[tier:light] x')
})

test('untagged explicit model stays', async ($, on) => {
  const r = await spawn($, on, { prompt: 'x', model: 'opus' })
  expect(r.model).toBe('opus')
})

test('teammate passes through untouched', async ($, on) => {
  const r = await spawn($, on, { prompt: '[tier:light] x', isTeammate: true })
  expect(r.model).toBeUndefined()
  expect(r.prompt).toBe('[tier:light] x')
})
