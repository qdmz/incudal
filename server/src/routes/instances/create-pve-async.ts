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

    if (config.instanceType === 'vm') {
      const upid = await pveClient.createQemu({
        vmid,
        name: config.name,
        cores: config.cpu,
        memory: config.memory,
        storage,
        net0: `virtio,bridge=${bridge}`,
        boot: 'order=scsi0',
        scsi0: `${storage}:vm-${vmid}-disk-0,size=${config.disk}M`,
        onboot: 1,
        agent: 1,
        ...(config.image ? { ide2: `${storage}:iso/${config.image},media=cdrom` } : {}),
        ...(config.password ? { cipassword: config.password } : {}),
        ...(config.sshKey ? { sshkeys: config.sshKey } : {}),
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
        rootfs: `${storage}:vm-${vmid}-disk-0,size=${config.disk}M`,
        net0: `name=eth0,bridge=${bridge},ip=dhcp`,
        unprivileged: 1,
        onboot: 1,
        start: 1,
        ...(config.image ? { ostemplate: config.image } : {}),
        ...(config.password ? { password: config.password } : {}),
        ...(config.sshKey ? { sshkeys: config.sshKey } : {}),
      })
      if (upid) await pveClient.waitForTask(upid)
      console.log(`[PVE Provisioning] LXC 容器 ${vmid} 创建完成`)
    }

    await prisma.instance.updateMany({
      where: { id: instanceId, status: 'creating' },
      data: {
        status: 'running',
        pveVmid: vmid,
      }
    })

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