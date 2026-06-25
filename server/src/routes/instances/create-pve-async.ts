import * as db from '../../db/index.js'
import { prisma } from '../../db/prisma.js'
import { createLog } from '../../db/logs.js'
import { getPveClient } from '../../lib/pve/index.js'
import type { Host } from '../../types/database.js'

export async function createPveInstanceAsync(
  instanceId: number,
  host: Host,
  config: {
    name: string
    image: string
    cpu: number
    memory: number
    disk: number
    instanceType?: 'container' | 'vm'
    storageName?: string | null
    bridgeName?: string | null
    sshKey?: string
    password?: string
  },
  userId: number,
  resources: { cpu: number; memory: number; disk: number }
): Promise<void> {
  try {
    console.log(`\n[PVE Provisioning] ===== 开始创建 PVE 实例 =====`)
    console.log(`[PVE Provisioning] 实例ID: ${instanceId}, 宿主机: ${host.name}`)

    const pveClient = getPveClient(host)
    const vmid = await pveClient.getNextVmId()
    console.log(`[PVE Provisioning] 分配 VMID: ${vmid}`)

    const storage = config.storageName || host.pve_storage_name || 'local-lvm'
    const bridge = config.bridgeName || host.pve_bridge_name || 'vmbr0'

    const internalIp = `172.16.1.${vmid}`
    const internalGw = '172.16.1.1'
    let net0Config = `name=eth0,bridge=${bridge},ip=${internalIp}/24,gw=${internalGw}`

    if (host.ipv6_subnet) {
      const ipv6Parts = host.ipv6_subnet.replace(/\/\d+$/, '').split(':')
      const ipv6Addr = `${ipv6Parts.slice(0, 4).join(':')}:${vmid.toString(16).padStart(4, '0')}::1/64`
      const ipv6Gw = host.ipv6_gateway || `${ipv6Parts.slice(0, 4).join(':')}::1`
      net0Config += `,ip6=${ipv6Addr},gw6=${ipv6Gw}`
    }

    if (config.instanceType === 'vm') {
      const upid = await pveClient.createQemu({
        vmid,
        name: config.name,
        cores: config.cpu,
        memory: config.memory,
        storage,
        net0: `virtio,bridge=${bridge}`,
        boot: 'order=scsi0',
        scsi0: `${storage}:${vmid}/disk-0,size=${config.disk}M`,
        onboot: 1,
        agent: 1,
        ...(config.image ? { ide2: config.image, cdrom: 1 } : {}),
        ...(config.password ? { cipassword: config.password } : {}),
        ...(config.sshKey ? { 'ssh-public-keys': config.sshKey } : {}),
      })
      if (upid) await pveClient.waitForTask(upid)
      console.log(`[PVE Provisioning] QEMU VM ${vmid} 创建完成`)
    } else {
      const upid = await pveClient.createLxc({
        vmid,
        hostname: config.name,
        cores: config.cpu,
        memory: config.memory,
        storage,
        rootfs: `${storage}:${vmid},size=${config.disk}M`,
        net0: net0Config,
        unprivileged: 1,
        onboot: 1,
        start: 1,
        ...(config.image ? { ostemplate: config.image } : {}),
        ...(config.password ? { password: config.password } : {}),
        ...(config.sshKey ? { 'ssh-public-keys': config.sshKey } : {}),
      })
      if (upid) await pveClient.waitForTask(upid)
      console.log(`[PVE Provisioning] LXC 容器 ${vmid} 创建完成, 内网IP: ${internalIp}`)

      if (config.password) {
        try {
          const { sshExec } = await import('../../lib/ssh-exec.js')
          const sshHost = host.url.replace(/^https?:\/\//, '').split(':')[0]
          const sshPort = host.pve_ssh_port || 22
          await sshExec(sshHost, sshPort, 'root', host.pve_ssh_password || '', 
            `pct exec ${vmid} -- bash -c 'sed -i \"s/^#*PermitRootLogin.*/PermitRootLogin yes/\" /etc/ssh/sshd_config && systemctl restart sshd 2>/dev/null || service sshd restart 2>/dev/null || service ssh restart 2>/dev/null || true'`
          )
          console.log(`[PVE Provisioning] LXC ${vmid} 已启用 root 密码登录`)
        } catch (sshErr) {
          console.error(`[PVE Provisioning] LXC ${vmid} 启用 root 密码登录失败:`, sshErr instanceof Error ? sshErr.message : String(sshErr))
        }
      }
    }

    await prisma.instance.updateMany({
      where: { id: instanceId, status: 'creating' },
      data: {
        status: 'running',
        pveVmid: vmid,
      }
    })

    // 自动添加 SSH 端口映射 (22)
    try {
      const { pveAddNatRule } = await import('../../lib/pve/pve-nat.js')
      const { selectBindableIpv4ListenAddress } = await import('../../lib/network-address.js')
      const bindableIpv4 = selectBindableIpv4ListenAddress(
        (host as any).nat_bind_ip || null, host.nat_public_ip || null, host.url, host.ip_address || null
      )
      if (bindableIpv4) {
        const allocatedPort = await db.allocatePort(host.id, 'tcp')
        if (allocatedPort) {
          const targetIp = `172.16.1.${vmid}`
          await pveAddNatRule(host, {
            protocol: 'tcp',
            publicIp: bindableIpv4,
            publicPort: allocatedPort,
            targetIp,
            targetPort: 22,
          })
          await db.createPortMapping({
            instanceId,
            hostId: host.id,
            protocol: 'tcp',
            publicPort: allocatedPort,
            privatePort: 22,
          })
          await prisma.instance.update({
            where: { id: instanceId },
            data: { sshPort: allocatedPort },
          })
          console.log(`[PVE Provisioning] SSH 端口映射已添加: ${allocatedPort} -> ${targetIp}:22`)
        }
      }
    } catch (portErr) {
      console.error(`[PVE Provisioning] SSH 端口映射添加失败:`, portErr instanceof Error ? portErr.message : String(portErr))
    }


    console.log(`[PVE Provisioning] ✔ 实例 ${instanceId} (vmid: ${vmid}) 创建成功!`)

    const instance = await db.getInstanceById(instanceId)
    if (instance) {
      const { sendNotification } = await import('../../lib/notifier.js')
      await sendNotification(userId, 'instance_created', {
        instanceName: instance.name,
        status: 'running',
        hostName: host.name,
        hostLocation: host.location || undefined,
        image: config.image,
        cpu: config.cpu,
        memory: config.memory,
        disk: config.disk,
        networkMode: 'nat',
      })

      await createLog(
        userId,
        'instance',
        'instance.create',
        `Created PVE instance "${instance.name}" [host: ${host.name}, vmid: ${vmid}, image: ${config.image}, CPU: ${config.cpu}, Memory: ${config.memory}MB, Disk: ${config.disk}MB]`,
        'success',
        { instanceId }
      )
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[PVE Provisioning] ✘ 实例 ${instanceId} 创建失败:`, errorMessage)

    const updateResult = await prisma.instance.updateMany({
      where: { id: instanceId, status: 'creating' },
      data: { status: 'error' }
    })

    if (updateResult.count > 0) {
      try {
        await db.rollbackResources({
          hostId: host.id,
          cpu: resources.cpu,
          memory: resources.memory,
          disk: resources.disk,
          portCount: 0
        })
        console.log(`[PVE Provisioning] 资源已回滚`)
      } catch (rollbackErr) {
        console.error(`[PVE Provisioning] 资源回滚失败:`, rollbackErr)
      }
    }

    const instance = await db.getInstanceById(instanceId)
    if (instance) {
      try {
        const { sendNotification } = await import('../../lib/notifier.js')
        await sendNotification(userId, 'instance_create_failed', {
          instanceName: instance.name,
          hostName: host.name,
          error: errorMessage
        })
      } catch (notifyErr) {
        console.error(`[PVE Provisioning] 发送失败通知失败:`, notifyErr)
      }

      await createLog(
        userId,
        'instance',
        'instance.create',
        `Failed to create PVE instance "${instance.name}": ${errorMessage}`,
        'failed',
        { instanceId }
      )
    }

    throw error
  }
}