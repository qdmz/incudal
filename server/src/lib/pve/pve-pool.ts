import { PveClient } from './pve-client.js'
import type { Host } from '../../types/database.js'

interface PooledPveClient {
  client: PveClient
  lastUsed: number
  errorCount: number
}

const clientPool = new Map<number, PooledPveClient>()
const POOL_MAX_AGE = 30 * 60 * 1000
const POOL_MAX_ERRORS = 3

export function getPveClient(host: Host): PveClient {
  const now = Date.now()
  const pooled = clientPool.get(host.id)

  if (pooled && (now - pooled.lastUsed < POOL_MAX_AGE) && pooled.errorCount < POOL_MAX_ERRORS) {
    pooled.lastUsed = now
    return pooled.client
  }

  if (pooled) {
    clientPool.delete(host.id)
  }

  const client = PveClient.fromHost(host)

  clientPool.set(host.id, { client, lastUsed: now, errorCount: 0 })
  return client
}

export function removePveClient(hostId: number): void {
  clientPool.delete(hostId)
}

setInterval(() => {
  const now = Date.now()
  for (const [id, pooled] of clientPool) {
    if (now - pooled.lastUsed > POOL_MAX_AGE || pooled.errorCount >= POOL_MAX_ERRORS) {
      clientPool.delete(id)
    }
  }
}, 5 * 60 * 1000)