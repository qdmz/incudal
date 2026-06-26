import type { WebSocket as WsWebSocket } from 'ws'
import WebSocket from 'ws'
import type { Host } from '../../types/database.js'

import { sshExec } from '../ssh-exec.js'

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

async function getPveVncInfoViaSsh(
  host: Host,
  vmid: number,
  isQemu: boolean
): Promise<{ port: string; ticket: string; cookie: string }> {
  const sshHost = host.ip_address || host.url.replace(/^https?:\/\//, '').split(':')[0]
  const sshPort = host.pve_ssh_port || 22
  const sshPassword = host.pve_ssh_password || ''
  const pveUsername = (host.pve_username || 'root@pam').split('!')[0]

  const authResult = await sshExec(sshHost, sshPort, 'root', sshPassword,
    `curl -sk -d 'username=${encodeURIComponent(pveUsername)}&password=${encodeURIComponent(sshPassword)}' https://localhost:8006/api2/json/access/ticket`
  )
  const authJson = JSON.parse(authResult.stdout)
  if (!authJson?.data?.ticket) {
    throw new Error('Failed to get PVE auth ticket via SSH')
  }
  const cookie = authJson.data.ticket
  const csrf = authJson.data.CSRFPreventionToken

  const vncPath = isQemu
    ? `/nodes/${host.pve_node_name || 'pve'}/qemu/${vmid}/vncproxy`
    : `/nodes/${host.pve_node_name || 'pve'}/lxc/${vmid}/vncproxy`

  const vncResult = await sshExec(sshHost, sshPort, 'root', sshPassword,
    `curl -sk -X POST -H 'Cookie: PVEAuthCookie=${cookie}' -H 'CSRFPreventionToken: ${csrf}' -d 'websocket=1' https://localhost:8006/api2/json${vncPath}`
  )
  const vncJson = JSON.parse(vncResult.stdout)
  if (!vncJson?.data?.port || !vncJson?.data?.ticket) {
    throw new Error('Failed to get PVE VNC proxy info via SSH: ' + JSON.stringify(vncJson))
  }

  return {
    port: String(vncJson.data.port),
    ticket: vncJson.data.ticket,
    cookie,
  }
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
  const isQemu = instanceType === 'vm'

  const vncInfo = await getPveVncInfoViaSsh(host, vmid, isQemu)

  const pveHost = host.url.replace(/^https?:\/\//, '').split(':')[0]
  const pvePort = parseInt(host.url.replace(/^https?:\/\/[^:]+:?/, '').split('/')[0]) || (host.url.startsWith('https') ? 8006 : 80)
  const node = host.pve_node_name || 'pve'

  const vncWsPath = isQemu
    ? `/api2/json/nodes/${node}/qemu/${vmid}/vncwebsocket?port=${vncInfo.port}&vncticket=${encodeURIComponent(vncInfo.ticket)}`
    : `/api2/json/nodes/${node}/lxc/${vmid}/vncwebsocket?port=${vncInfo.port}&vncticket=${encodeURIComponent(vncInfo.ticket)}`

  const wsProtocol = host.url.startsWith('https') ? 'wss' : 'ws'
  const vncWsUrl = `${wsProtocol}://${pveHost}:${pvePort}${vncWsPath}`

  const pveWs = new WebSocket(vncWsUrl, {
    headers: {
      Cookie: `PVEAuthCookie=${vncInfo.cookie}`,
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
          if (data.length > 1 && data[0] === 0x01) {
            clientSocket.send(data.subarray(1))
          } else if (data.length > 1 && data[0] === 0x00) {
            // channel 0 is qemu serial terminal, ignore for VNC
          } else {
            clientSocket.send(data)
          }
        }
      })

      clientSocket.on('message', (data: Buffer | string) => {
        session.lastActivity = Date.now()
        if (pveWs.readyState === WebSocket.OPEN) {
          const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data.buffer, data.byteOffset, data.byteLength)
          const framed = Buffer.alloc(buf.length + 1)
          framed[0] = 0x01
          buf.copy(framed, 1)
          pveWs.send(framed)
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
