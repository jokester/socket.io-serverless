import { describe, it, expect } from 'vitest'
import { env, runInDurableObject, runDurableObjectAlarm } from 'cloudflare:test'
import { exports } from 'cloudflare:workers'
import type { SocketActor } from '../src/cf/main'

const IncomingRequest = Request<unknown, IncomingRequestCfProperties<unknown>>

function openClientWebSocket(res: Response): WebSocket {
  const ws = res.webSocket
  if (!ws) throw new Error('response has no webSocket')
  ws.accept()
  return ws
}

function nextMessage(ws: WebSocket, timeoutMs = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for ws message')), timeoutMs)
    ws.addEventListener('message', (e: MessageEvent) => {
      clearTimeout(timer)
      resolve(typeof e.data === 'string' ? e.data : String(e.data))
    }, { once: true })
  })
}

/** The Worker generates the engine.io `sid` via `generateBase64id()`,
 *  ignoring any client-supplied `eio_sid` query param, so it must be
 *  recovered from the engine.io "open" packet that follows the upgrade.
 */
async function openSocketIoConnection(): Promise<{ ws: WebSocket; eioSid: string }> {
  const req = new IncomingRequest('https://example.com/socket.io/', {
    headers: { upgrade: 'websocket' },
  })
  const res = await exports.default.fetch(req)
  if (res.status !== 101) throw new Error(`expected 101, got ${res.status}`)
  const ws = openClientWebSocket(res)
  const openPacket = await nextMessage(ws)
  if (openPacket[0] !== '0') throw new Error(`expected engine.io open packet, got ${openPacket}`)
  const eioSid = JSON.parse(openPacket.slice(1)).sid as string
  return { ws, eioSid }
}

describe('durable object state', () => {
  it('exposes both DO namespaces as bindings', () => {
    expect(env.engineActor).toBeDefined()
    expect(env.socketActor).toBeDefined()
    // both bindings can resolve the singleton name; IDs will differ across namespaces
    const engineId = env.engineActor.idFromName('singleton')
    const socketId = env.socketActor.idFromName('singleton')
    expect(typeof engineId.toString()).toBe('string')
    expect(typeof socketId.toString()).toBe('string')
  })

  it('EngineActor rejects non-upgrade requests with 426', async () => {
    const id = env.engineActor.idFromName('singleton')
    const stub = env.engineActor.get(id)
    const res = await stub.fetch('https://eioServer.internal/socket.io/?eio_sid=abcdefghij')
    expect(res.status).toBe(426)
  })

  it('persists a new client into SocketActor storage after a WS connection', async () => {
    const { ws, eioSid } = await openSocketIoConnection()
    try {
      // give the 100ms-delayed createEioSocket + onEioSocketConnection a moment
      // to land in SocketActor's Persister
      await new Promise((r) => setTimeout(r, 250))

      const id = env.socketActor.idFromName('singleton')
      const stub = env.socketActor.get(id)
      const storedClients = await runInDurableObject(stub, async (_instance: SocketActor, state) => {
        const entry = await state.storage.get<{ clientIds: string[] }>('_clients')
        return entry?.clientIds ?? []
      })
      expect(storedClients).toContain(eioSid)
    } finally {
      ws.close()
    }
  })

  it('runs the EngineActor alarm without throwing', async () => {
    const { ws } = await openSocketIoConnection()
    try {
      await new Promise((r) => setTimeout(r, 250))
      const id = env.engineActor.idFromName('singleton')
      const stub = env.engineActor.get(id)
      // runDurableObjectAlarm returns true if an alarm was scheduled and ran.
      // AlarmTimer schedules a 30s alarm on each new connection; this flushes it.
      const ran = await runDurableObjectAlarm(stub)
      expect(typeof ran).toBe('boolean')
    } finally {
      ws.close()
    }
  })
})