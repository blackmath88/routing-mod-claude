// Engine-level tests: `claude plugin test .` runs these against the installed Claude Code engine,
// with this repo loaded as the plugin under test. The hooks registered here sit beneath it and
// stand in for the engine (classifier, usage, spawn), so nothing real is spawned or billed.
import { test, expect } from 'claude-code/testing'

const usageWith = (percentUsed?: number) => ({
  startedAt: 0,
  context: { usedTokens: 0, windowTokens: 200000, percentUsed: 0 },
  rateLimits: percentUsed === undefined ? [] : [{ kind: 'five_hour', percentUsed }],
}) as any

function harness(on: any, opts: { classify?: string; percent?: number }) {
  const spawned: any[] = []; const logs: string[] = []
  on('model.classify', () => ({ value: opts.classify }))
  on('session.usage', () => ({ value: usageWith(opts.percent) }))
  on('ui.log', ($: any, e: any) => { logs.push(e.text); return { value: undefined } })
  on('agent.spawn', ($: any, e: any) => { spawned.push(e); return { model: e.model ?? e.parentModel, agentId: 'a1' } })
  return { spawned, logs }
}

test('tagged deep routes to opus and logs requested/effective/observed', async ($, on) => {
  const h = harness(on, { percent: 10 })
  await $.agent.spawn({ prompt: '[tier:deep] refactor parser', description: 'refactor' })
  expect(h.spawned[0].model).toBe('opus')
  expect(h.spawned[0].prompt.includes('[tier:')).toBe(false)
  expect(h.logs.join('\n')).toContain('requested deep (tag)')
})

test('security review is not stepped down at 92% usage', async ($, on) => {
  const h = harness(on, { percent: 92 })
  await $.agent.spawn({ prompt: '[tier:deep] security review of auth', description: 'review' })
  expect(h.spawned[0].model).toBe('opus')
})

test('ordinary deep work at 92% steps down, visibly', async ($, on) => {
  const h = harness(on, { percent: 92 })
  await $.agent.spawn({ prompt: '[tier:deep] refactor parser', description: 'refactor' })
  expect(h.spawned[0].model).toBe('sonnet')
  expect(h.logs.join('\n')).toContain('DOWNGRADED deep -> standard')
})

test('[on-limit:stop] at 92% refuses the spawn', async ($, on) => {
  const h = harness(on, { percent: 92 })
  const r: any = await $.agent.spawn({ prompt: '[tier:deep][on-limit:stop] threat model', description: 'tm' })
  expect(typeof r.deny).toBe('string')
  expect(h.spawned.length).toBe(0)
})

test('empty rateLimits is unknown usage: no downgrade', async ($, on) => {
  const h = harness(on, {})
  await $.agent.spawn({ prompt: '[tier:deep] refactor', description: 'r' })
  expect(h.spawned[0].model).toBe('opus')
  expect(h.logs.join('\n')).toContain('usage unknown')
})

test('untagged uses the classifier; explicit model untagged is respected', async ($, on) => {
  const h = harness(on, { classify: 'light', percent: 10 })
  await $.agent.spawn({ prompt: 'list the files', description: 'ls' })
  await $.agent.spawn({ prompt: 'list the files', description: 'ls', model: 'opus' })
  expect(h.spawned[0].model).toBe('haiku')
  expect(h.spawned[1].model).toBe('opus')
})

test('observed model differing from the routed one is flagged in the log', async ($, on) => {
  const logs: string[] = []
  on('session.usage', () => ({ value: usageWith(10) }))
  on('ui.log', ($: any, e: any) => { logs.push(e.text); return { value: undefined } })
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  await $.agent.spawn({ prompt: '[tier:deep] design review', description: 'dr' })
  expect(logs.join('\n')).toContain('[OBSERVED != EFFECTIVE]')
})

test('fork probe: the test kit cannot raise a real fork (fork is undefined); fork routing is covered by tests/route.test.mjs', async ($, on) => {
  const spawned: any[] = []
  on('session.usage', () => ({ value: usageWith(10) }))
  on('ui.log', () => ({ value: undefined }))
  on('agent.spawn', ($: any, e: any) => { spawned.push(e); return { model: e.model ?? e.parentModel ?? 'claude-sonnet-5-5', agentId: 'a1' } })
  const r: any = await $.agent.spawn({ prompt: '[tier:light] x', description: 'f', subagentType: 'fork' })
  console.log('FORK-PROBE', JSON.stringify({ fork: spawned[0]?.fork, model: spawned[0]?.model, deny: r?.deny ?? null }))
  if (spawned[0]?.fork === true) expect(spawned[0].prompt).toBe('[tier:light] x')
})
