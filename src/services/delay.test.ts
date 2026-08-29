import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  delayProxyByName,
  healthcheckNodeInProvider,
} from 'tauri-plugin-mihomo-api'

vi.mock('tauri-plugin-mihomo-api', () => ({
  delayProxyByName: vi.fn(async () => ({ delay: 120 })),
  healthcheckNodeInProvider: vi.fn(async () => ({ delay: 120 })),
}))

import type { ResolvedProxyMember } from '@/types/proxy-view'

import delayManager, { DelayManager } from './delay'

const node = (name: string) =>
  ({
    kind: 'node',
    ref: { kind: 'node', name, recordId: `r:${name}` },
    node: {
      recordId: `r:${name}`,
      name,
      history: [],
      source: { kind: 'core', proxyName: name },
    },
  }) as unknown as ResolvedProxyMember

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

let settles = 0
let unsubscribe: () => void

beforeEach(() => {
  vi.mocked(delayProxyByName).mockReset().mockResolvedValue({ delay: 120 })
  vi.mocked(healthcheckNodeInProvider)
    .mockReset()
    .mockResolvedValue({ delay: 120 })
  settles = 0
  unsubscribe = delayManager.addGroupListener('g', () => {
    settles += 1
  })
})

afterEach(() => unsubscribe())

describe('group delay completion', () => {
  test('notifies once after a batch settles', async () => {
    const proxies = Array.from({ length: 6 }, (_, index) => node(`n${index}`))

    await delayManager.checkListDelay(proxies as never, 'g', 5000, 2)
    await flush()

    expect(settles).toBe(1)
  })

  test('notifies only listeners for the completed group', async () => {
    let other = 0
    const stop = delayManager.addGroupListener('other', () => {
      other += 1
    })

    await delayManager.checkDelay(node('a') as never, 'g', 5000)
    await flush()

    expect(settles).toBe(1)
    expect(other).toBe(0)
    stop()
  })
})

describe('delay cache retention', () => {
  test('removes deleted nodes and rejects their late updates', () => {
    const manager = new DelayManager()
    manager.setDelay('keep', 'g', 10)
    manager.setDelay('removed', 'g', 20)

    manager.retainProxyGroups([
      { name: 'g', members: [{ name: 'keep' }] },
    ])

    expect(manager.getDelay('keep', 'g')).toBe(10)
    expect(manager.getDelay('removed', 'g')).toBe(-1)
    manager.setDelay('removed', 'g', 30)
    expect(manager.getDelay('removed', 'g')).toBe(-1)
  })
})

describe('delay timeout handling', () => {
  test('stores the timeout threshold instead of zero', async () => {
    vi.mocked(delayProxyByName).mockResolvedValueOnce({ delay: 0 })
    const manager = new DelayManager()

    const update = await manager.checkDelay(node('timeout') as never, 'g', 200)

    expect(update.delay).toBe(200)
    expect(manager.getDelay('timeout', 'g')).toBe(200)
  })

  test('waits for the bounded plugin request instead of abandoning it', async () => {
    let resolveRequest!: (value: { delay: number }) => void
    vi.mocked(delayProxyByName).mockImplementationOnce(
      () =>
        new Promise<{ delay: number }>((resolve) => {
          resolveRequest = resolve
        }),
    )
    const manager = new DelayManager()
    let settled = false

    const pending = manager
      .checkDelay(node('slow') as never, 'g', 10)
      .finally(() => {
        settled = true
      })
    await new Promise((resolve) => setTimeout(resolve, 550))

    expect(settled).toBe(false)
    resolveRequest({ delay: 120 })
    await expect(pending).resolves.toMatchObject({ delay: 120 })
  })
})
