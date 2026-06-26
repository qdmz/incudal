import type { WebSocket as WsWebSocket } from 'ws'
import WebSocket from 'ws'
import type { Host } from '../../types/database.js'
import { getPveClient } from './index.js'

interface VncProxySession {
  id: string
  instanceId: number
  userId: number
  host: Host
  pveWebSocket: WebSocket | null
  clientWebSocket: WsWebSocket
  createdAt: number
  lastActivity: number
}

const activeVncSessions = new Map<string, VncProxySession>()

function generateSessionId(): string {
  return `vnc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

export function getActiveVncSessionStats(): {
  total: number
  byInstance: Map<number, number>
  byUser: Map<number, number>
} {
  const byInstance = new Map<number, number>()
  const byUser = new Map<number, number>()

  for (const session of activeVncSessions.values()) {
    byInstance.set(session.instanceId, (byInstance.get(session.instanceId) || 0) + 1)
    byUser.set(session.userId, (byUser.get(session.userId) || 0) + 1)
  }

  return { total: activeVncSessions.size, byInstance, byUser }
}

export async function createVncProxySession(
  clientSocket: WsWebSocket,
  host: Host,
  instanceId: number,
  vmid: number,
  userId: number,
  instanceType: 'vm' | 'container'
): Promise<VncProxySession> {
  const sessionId = generateSessionId()
  const pveClient = getPveClient(host)

  const isQemu = instanceType === 'vm'
  const vncResult = isQemu
    ? await pveClient.vncProxyQemu(vmid)
    : await pveClient.vncProxyLxc(vmid)

  if (!vncResult?.port || !vncResult?.ticket) {
    throw new Error('PVE VNC proxy failed: no port or ticket returned')
  }

  const pveHost = host.url.replace(/^https?:\/\//, '').split(':')[0]
  const pvePort = parseInt(host.url.replace(/^https?:\/\/[^:]+:?/, '').split('/')[0]) || (host.url.startsWith('https') ? 8006 : 80)
  const node = pveClient.nodeName

  const vncWsPath = isQemu
    ? `/api2/json/nodes/${node}/qemu/${vmid}/vncwebsocket?port=${vncResult.port}&vncticket=${encodeURIComponent(vncResult.ticket)}`
    : `/api2/json/nodes/${node}/lxc/${vmid}/vncwebsocket?port=${vncResult.port}&vncticket=${encodeURIComponent(vncResult.ticket)}`

  const wsProtocol = host.url.startsWith('https') ? 'wss' : 'ws'
  const vncWsUrl = `${wsProtocol}://${pveHost}:${pvePort}${vncWsPath}`

  const authCookie = await pveClient.ensureTicketForVnc()

  const pveWs = new WebSocket(vncWsUrl, {
    headers: {
      Cookie: `PVEAuthCookie=${authCookie}`,
    },
    rejectUnauthorized: false,
  })

  const session: VncProxySession = {
    id: sessionId,
    instanceId,
    userId,
    host,
    pveWebSocket: pveWs,
    clientWebSocket: clientSocket,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  }

  activeVncSessions.set(sessionId, session)

  return new Promise((resolve, reject) => {
    let resolved = false

    pveWs.on('open', () => {
      console.log(`[VNC Proxy] Session ${sessionId}: PVE WebSocket connected`)

      pveWs.on('message', (data: Buffer) => {
        session.lastActivity = Date.now()
        if (clientSocket.readyState === clientSocket.OPEN) {
          clientSocket.send(data)
        }
      })

      clientSocket.on('message', (data: Buffer | string) => {
        session.lastActivity = Date.now()
        if (pveWs.readyState === WebSocket.OPEN) {
          const buf = typeof data === 'string' ? Buffer.from(data) : data
          pveWs.send(buf)
        }
      })

      if (!resolved) {
        resolved = true
        resolve(session)
      }
    })

    pveWs.on('error', (err) => {
      console.error(`[VNC Proxy] Session ${sessionId}: PVE WebSocket error:`, err.message)
      if (!resolved) {
        resolved = true
        reject(new Error(`PVE VNC WebSocket connection failed: ${err.message}`))
      }
      if (clientSocket.readyState === clientSocket.OPEN) {
        clientSocket.send(JSON.stringify({ type: 'error', code: 'CONNECTION_FAILED', message: 'VNC connection failed' }))
        clientSocket.close(4000, 'VNC connection failed')
      }
    })

    pveWs.on('close', (code) => {
      console.log(`[VNC Proxy] Session ${sessionId}: PVE WebSocket closed (code=${code})`)
      activeVncSessions.delete(sessionId)
      if (clientSocket.readyState === clientSocket.OPEN) {
        clientSocket.close()
      }
    })

    clientSocket.on('close', () => {
      console.log(`[VNC Proxy] Session ${sessionId}: Client disconnected`)
      if (pveWs.readyState === WebSocket.OPEN || pveWs.readyState === WebSocket.CONNECTING) {
        pveWs.close()
      }
      activeVncSessions.delete(sessionId)
    })

    setTimeout(() => {
      if (!resolved) {
        resolved = true
        reject(new Error('PVE VNC WebSocket connection timeout'))
      }
    }, 15000)
  })
}

export function closeVncSession(sessionId: string): void {
  const session = activeVncSessions.get(sessionId)
  if (!session) return

  if (session.pveWebSocket?.readyState === WebSocket.OPEN) {
    session.pveWebSocket.close()
  }
  if (session.clientWebSocket.readyState === session.clientWebSocket.OPEN) {
    session.clientWebSocket.close()
  }
  activeVncSessions.delete(sessionId)
}