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

    const storage = config.storageName || host.pve_storage_name || 'local'
    const bridge = config.bridgeName || host.pve_bridge_name || 'vmbr1'

    const internalIp = `172.16.1.${vmid}`
    const internalGw = '172.16.1.1'
    let net0Config = `name=eth0,bridge=${bridge},ip=${internalIp}/24,gw=${internalGw}`
    let net1Config = ''

    if (host.ipv6_subnet) {
      const ipv6Parts = host.ipv6_subnet.replace(/\/\d+$/, '').split(':')
      const ipv6Addr = `${ipv6Parts.slice(0, 4).join(':')}:${vmid.toString(16).padStart(4, '0')}::1/64`
      const ipv6Gw = host.ipv6_gateway || `${ipv6Parts.slice(0, 4).join(':')}::1`
      const ipv6Bridge = (host as any).pve_ipv6_bridge_name || 'vmbr2'
      net1Config = `name=eth1,bridge=${ipv6Bridge},ip6=${ipv6Addr},gw6=${ipv6Gw}`
    }

    const isVm = config.instanceType === 'vm' || (config.image && (config.image.includes(':iso/') || config.image.startsWith('vmtemplate:')))

    if (isVm) {
      const isVmTemplate = config.image && config.image.startsWith('vmtemplate:')
      if (isVmTemplate) {
        const sourceVmid = parseInt(config.image.replace('vmtemplate:', ''), 10)
        console.log(`[PVE Provisioning] 从 VM 模板 ${sourceVmid} 克隆到 ${vmid}`)
        const cloneUpid = await pveClient.cloneQemu(vmid, sourceVmid, config.name)
        if (cloneUpid) await pveClient.waitForTask(cloneUpid, 300000)
        console.log(`[PVE Provisioning] VM ${vmid} 克隆完成, 正在配置...`)

        const updateParams: Record<string, any> = {
          cores: config.cpu,
          memory: config.memory,
          onboot: 1,
          net0: `virtio,bridge=${bridge}`,
        }
        if (net1Config) updateParams.net1 = `virtio,bridge=${(host as any).pve_ipv6_bridge_name || 'vmbr2'}`
        updateParams.ipconfig0 = `ip=${internalIp}/24,gw=${internalGw}`
        if (host.ipv6_subnet) {
          const ipv6Parts = host.ipv6_subnet.replace(/\/\d+$/, '').split(':')
          const ipv6Addr = `${ipv6Parts.slice(0, 4).join(':')}:${vmid.toString(16).padStart(4, '0')}::1/64`
          const ipv6Gw = host.ipv6_gateway || `${ipv6Parts.slice(0, 4).join(':')}::1`
          updateParams.ipconfig1 = `ip6=${ipv6Addr},gw6=${ipv6Gw}`
        }
        if (config.password) updateParams.cipassword = config.password
        if (config.sshKey) updateParams.sshkeys = config.sshKey
        updateParams.ciuser = 'root'
        await pveClient.updateQemu(vmid, updateParams)

        try {
          const startUpid = await pveClient.startQemu(vmid)
          if (startUpid) await pveClient.waitForTask(startUpid)
          console.log(`[PVE Provisioning] VM ${vmid} 已启动`)
        } catch (startErr) {
          console.error(`[PVE Provisioning] VM ${vmid} 启动失败:`, startErr instanceof Error ? startErr.message : String(startErr))
        }
      } else {
        const isCloudInit = config.image && !config.image.includes(':iso/')
        const qemuParams: Record<string, any> = {
          vmid,
          name: config.name,
          cores: config.cpu,
          memory: config.memory,
          storage,
          net0: `virtio,bridge=${bridge}`,
          boot: 'order=virtio0',
          virtio0: `${storage}:${Math.max(1, Math.round(config.disk / 1024))}`,
          onboot: 1,
        }
        if (net1Config) qemuParams.net1 = `virtio,bridge=${(host as any).pve_ipv6_bridge_name || 'vmbr2'}`
        if (isCloudInit) {
          qemuParams.cloudinit = `${storage}:cloudinit`
          qemuParams.serial0 = 'socket'
          qemuParams.ciuser = 'root'
          if (config.password) qemuParams.cipassword = config.password
          if (config.sshKey) qemuParams.sshkeys = config.sshKey
          if (config.image) qemuParams.ide2 = `${config.image},media=cdrom`
        } else {
          qemuParams.agent = 1
          if (config.image && config.image.includes(':iso/')) {
            qemuParams.ide2 = `${config.image},media=cdrom`
          }
        }
        const upid = await pveClient.createQemu(qemuParams as any)
        if (upid) await pveClient.waitForTask(upid)
        console.log(`[PVE Provisioning] QEMU VM ${vmid} 创建完成, 正在启动...`)
        try {
          const startUpid = await pveClient.startQemu(vmid)
          if (startUpid) await pveClient.waitForTask(startUpid)
          console.log(`[PVE Provisioning] QEMU VM ${vmid} 已启动`)
        } catch (startErr) {
          console.error(`[PVE Provisioning] QEMU VM ${vmid} 启动失败:`, startErr instanceof Error ? startErr.message : String(startErr))
        }
      }
    } else {
      const lxcParams: Record<string, any> = {
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
      }
      if (net1Config) lxcParams.net1 = net1Config
      if (config.image) lxcParams.ostemplate = config.image
      if (config.password) lxcParams.password = config.password
      if (config.sshKey) lxcParams['ssh-public-keys'] = config.sshKey
      const upid = await pveClient.createLxc(lxcParams as any)
      if (upid) await pveClient.waitForTask(upid)
      console.log(`[PVE Provisioning] LXC 容器 ${vmid} 创建完成, 内网IP: ${internalIp}`)

      if (config.password) {
        try {
          const { sshExec } = await import('../../lib/ssh-exec.js')
          const sshHost = host.ip_address || host.url.replace(/^https?:\/\//, '').split(':')[0]
          const sshPort = host.pve_ssh_port || 22
          await sshExec(sshHost, sshPort, 'root', host.pve_ssh_password || '', 
            `pct exec ${vmid} -- bash -c 'echo root:${config.password} | chpasswd && sed -i \"s/^#*PermitRootLogin.*/PermitRootLogin yes/\" /etc/ssh/sshd_config && echo \"PasswordAuthentication yes\" >> /etc/ssh/sshd_config && sed -i \"s/^session.*pam_systemd/#&/\" /etc/pam.d/common-session && systemctl disable ssh.socket 2>/dev/null && systemctl stop ssh.socket 2>/dev/null && systemctl enable ssh.service 2>/dev/null && systemctl restart ssh.service 2>/dev/null || service ssh restart 2>/dev/null || true'`
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

    // 写入 IP 地址记录
    try {
      const ipv6Addr = host.ipv6_subnet
        ? `${host.ipv6_subnet.replace(/\/\d+$/, '').split(':').slice(0, 4).join(':')}:${vmid.toString(16).padStart(4, '0')}::1`
        : null
      await prisma.ipAddress.create({
        data: { address: internalIp, type: 'inet4', isPrimary: true, device: 'eth0', instanceId, hostId: host.id }
      })
      if (ipv6Addr) {
        await prisma.ipAddress.create({
          data: { address: ipv6Addr, type: 'inet6', isPrimary: true, device: 'eth1', instanceId, hostId: host.id }
        })
      }
      await prisma.instance.update({
        where: { id: instanceId },
        data: { ipv4: internalIp, ipv6: ipv6Addr }
      })
      console.log(`[PVE Provisioning] IP 地址记录已写入`)
    } catch (ipErr) {
      console.error(`[PVE Provisioning] IP 地址写入失败:`, ipErr instanceof Error ? ipErr.message : String(ipErr))
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