import { describe, expect, it, vi } from 'vitest'
import type { MihomoWebSocket } from 'tauri-plugin-mihomo-api'

import { initializeMihomoWebSocket } from './use-mihomo-ws-subscription'

const socketWithClose = (close: () => Promise<void>) =>
  ({ close }) as unknown as MihomoWebSocket

describe('WebSocket initialization', () => {
  it('closes a connected socket when initialization fails', async () => {
    const close = vi.fn(async () => {})
    const initializationError = new Error('initialization failed')

    await expect(
      initializeMihomoWebSocket(socketWithClose(close), () => {
        throw initializationError
      }),
    ).rejects.toBe(initializationError)

    expect(close).toHaveBeenCalledOnce()
  })

  it('preserves the initialization error when closing also fails', async () => {
    const initializationError = new Error('initialization failed')
    const close = vi.fn(async () => {
      throw new Error('close failed')
    })

    await expect(
      initializeMihomoWebSocket(socketWithClose(close), () => {
        throw initializationError
      }),
    ).rejects.toBe(initializationError)

    expect(close).toHaveBeenCalledOnce()
  })
})
