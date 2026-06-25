import { sshExec } from '../ssh-exec.js'
import type { Host } from '../../types/database.js'

function getSshConfig(host: Host) {
  return {
    host: host.ip_address || host.url.replace(/^https?:\/\//, '').split(':')[0],
    port: host.pve_ssh_port || 22,
    username: 'root',
    password: host.pve_ssh_password || '',
  }
}

export async function pveAddNatRule(
  host: Host,
  params: {
    protocol: 'tcp' | 'udp'
    publicIp: string
    publicPort: number
    targetIp: string
    targetPort: number
  }
): Promise<void> {
  const ssh = getSshConfig(host)
  const { protocol, publicPort, targetIp, targetPort } = params

  const proto = protocol === 'tcp' ? 'tcp' : 'udp'
  const comment = `incudal-${proto}-${publicPort}`

  await sshExec(ssh.host, ssh.port, ssh.username, ssh.password,
    `nft add rule ip nat prerouting iifname "vmbr0" ${proto} dport ${publicPort} dnat to ${targetIp}:${targetPort} comment \\"${comment}\\"`
  )
}

export async function pveRemoveNatRule(
  host: Host,
  params: {
    protocol: 'tcp' | 'udp'
    publicIp: string
    publicPort: number
  }
): Promise<void> {
  const ssh = getSshConfig(host)
  const { protocol, publicPort } = params

  const proto = protocol === 'tcp' ? 'tcp' : 'udp'
  const comment = `incudal-${proto}-${publicPort}`

  await sshExec(ssh.host, ssh.port, ssh.username, ssh.password,
    `handle=$(nft -a list chain ip nat prerouting 2>/dev/null | grep \\"${comment}\\" | awk '{print $NF}'); if [ -n "$handle" ]; then nft delete rule ip nat prerouting handle $handle; fi`
  )
}

export async function pveAddIpv6NatRule(
  host: Host,
  params: {
    protocol: 'tcp' | 'udp'
    publicIpv6: string
    publicPort: number
    targetPort: number
  }
): Promise<void> {
  const ssh = getSshConfig(host)
  const { protocol, publicIpv6, publicPort, targetPort } = params

  const proto = protocol === 'tcp' ? 'tcp' : 'udp'
  const comment = `incudal-v6-${proto}-${publicPort}`

  await sshExec(ssh.host, ssh.port, ssh.username, ssh.password,
    `nft add rule ip6 nat prerouting iifname "vmbr0" ${proto} dport ${publicPort} dnat to [${publicIpv6}]:${targetPort} comment \\"${comment}\\"`
  )
}

export async function pveRemoveIpv6NatRule(
  host: Host,
  params: {
    protocol: 'tcp' | 'udp'
    publicIpv6: string
    publicPort: number
  }
): Promise<void> {
  const ssh = getSshConfig(host)
  const { protocol, publicPort } = params

  const proto = protocol === 'tcp' ? 'tcp' : 'udp'
  const comment = `incudal-v6-${proto}-${publicPort}`

  await sshExec(ssh.host, ssh.port, ssh.username, ssh.password,
    `handle=$(nft -a list chain ip6 nat prerouting 2>/dev/null | grep \\"${comment}\\" | awk '{print $NF}'); if [ -n "$handle" ]; then nft delete rule ip6 nat prerouting handle $handle; fi`
  )
}
