import { sshExec } from '../ssh-exec.js'
import type { Host } from '../../types/database.js'

function getSshConfig(host: Host) {
  return {
    host: host.url.replace(/^https?:\/\//, '').split(':')[0],
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
  const { protocol, publicIp, publicPort, targetIp, targetPort } = params

  const rule = `-t nat -A PREROUTING -p ${protocol} -d ${publicIp} --dport ${publicPort} -j DNAT --to-destination ${targetIp}:${targetPort}`
  const comment = `-m comment --comment "incudal:${protocol}:${publicPort}"`

  await sshExec(ssh.host, ssh.port, ssh.username, ssh.password,
    `iptables ${rule.replace('-A PREROUTING', `-A PREROUTING ${comment}`)} && iptables-save > /etc/iptables/rules.v4 2>/dev/null || true`
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

  await sshExec(ssh.host, ssh.port, ssh.username, ssh.password,
    `line=$(iptables -t nat -L PREROUTING -n --line-numbers | grep "incudal:${protocol}:${publicPort}" | head -1 | awk '{print $1}'); if [ -n "$line" ]; then iptables -t nat -D PREROUTING $line; iptables-save > /etc/iptables/rules.v4 2>/dev/null || true; fi`
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

  const rule = `-t nat -A PREROUTING -p ${protocol} -d ${publicIpv6} --dport ${publicPort} -j DNAT --to-destination [::]:${targetPort}`
  const comment = `-m comment --comment "incudal:v6:${protocol}:${publicPort}"`

  await sshExec(ssh.host, ssh.port, ssh.username, ssh.password,
    `ip6tables ${rule.replace('-A PREROUTING', `-A PREROUTING ${comment}`)} && ip6tables-save > /etc/iptables/rules.v6 2>/dev/null || true`
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

  await sshExec(ssh.host, ssh.port, ssh.username, ssh.password,
    `line=$(ip6tables -t nat -L PREROUTING -n --line-numbers | grep "incudal:v6:${protocol}:${publicPort}" | head -1 | awk '{print $1}'); if [ -n "$line" ]; then ip6tables -t nat -D PREROUTING $line; ip6tables-save > /etc/iptables/rules.v6 2>/dev/null || true; fi`
  )
}