import type { Host } from '../../types/database.js'

interface PveApiOptions {
  url: string
  username: string
  password: string
  realm?: string
  otp?: string
  nodeName: string
  apiToken?: string
}

interface PveApiToken {
  ticket: string
  csrfPreventionToken: string
  username: string
  expiry: number
}

export class PveClient {
  private url: string
  private username: string
  private password: string
  private realm: string
  private otp: string | null
  private _nodeName: string
  private apiToken: string | null
  private token: PveApiToken | null = null
  private sshPassword: string | null = null

  constructor(options: PveApiOptions) {
    this.url = options.url.replace(/\/+$/, '')
    this.username = options.username
    this.password = options.password
    this.realm = options.realm || 'pam'
    this.otp = options.otp || null
    this._nodeName = options.nodeName
    this.apiToken = options.apiToken || null
  }

  static fromHost(host: Host): PveClient {
    const username = host.pve_username || 'root@pam'
    const isTokenAuth = username.includes('!')
    const client = new PveClient({
      url: host.url,
      username: isTokenAuth ? username.split('!')[0] : username,
      password: isTokenAuth ? '' : (host.pve_password || ''),
      realm: isTokenAuth ? (username.split('!')[0].split('@')[1] || 'pam') : (host.pve_realm || 'pam'),
      nodeName: host.pve_node_name || 'pve',
      apiToken: isTokenAuth ? `${username}=${host.pve_password || ''}` : undefined,
    })
    client.sshPassword = host.pve_ssh_password || null
    return client
  }

  private async ensureToken(): Promise<void> {
    if (this.apiToken) return
    if (this.token && Date.now() < this.token.expiry - 60000) return
    await this.fetchTicket()
  }

  private async fetchTicket(): Promise<void> {

    const body: Record<string, string> = {
      username: this.username,
      password: this.password,
      realm: this.realm,
    }
    if (this.otp) body['otp'] = this.otp

    const res = await fetch(`${this.url}/api2/json/access/ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`PVE auth failed (${res.status}): ${text}`)
    }

    const json = await res.json() as any
    const data = json.data
    if (!data?.ticket || !data?.CSRFPreventionToken) {
      throw new Error('PVE auth response missing ticket or CSRF token')
    }

    this.token = {
      ticket: data.ticket,
      csrfPreventionToken: data.CSRFPreventionToken,
      username: data.username || this.username,
      expiry: Date.now() + 2 * 60 * 60 * 1000,
    }
  }

  async request<T = any>(method: string, path: string, body?: any): Promise<T> {
    if (!this.apiToken) {
      await this.ensureToken()
    }

    const headers: Record<string, string> = {}

    if (this.apiToken) {
      headers['Authorization'] = `PVEAPIToken=${this.apiToken}`
    } else {
      headers['Cookie'] = `PVEAuthCookie=${this.token!.ticket}`
      headers['CSRFPreventionToken'] = this.token!.csrfPreventionToken
    }

    let requestBody: string | undefined
    if (body !== undefined) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      requestBody = new URLSearchParams(
        Object.entries(body).reduce((acc, [k, v]) => {
          acc[k] = String(v)
          return acc
        }, {} as Record<string, string>)
      ).toString()
    }

    const res = await fetch(`${this.url}/api2/json${path}`, {
      method,
      headers,
      body: requestBody,
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`PVE API ${method} ${path} failed (${res.status}): ${text}`)
    }

    const json = await res.json() as any
    return json.data as T
  }

  get nodeName(): string {
    return this._nodeName
  }

  getAuthCookie(): string {
    if (this.apiToken) {
      const parts = this.apiToken.split('=')
      return parts[0]
    }
    return this.token?.ticket || ''
  }

  async ensureTicketForVnc(): Promise<string> {
    if (this.token && Date.now() < this.token.expiry - 60000) {
      return this.token.ticket
    }
    if (this.apiToken && this.sshPassword) {
      const { sshExec } = await import('../ssh-exec.js')
      const sshHost = this.url.replace(/^https?:\/\//, '').split(':')[0]
      const sshPort = parseInt(this.url.replace(/^https?:\/\/[^:]+:?/, '').split('/')[0]) || 22
      const result = await sshExec(sshHost, sshPort, 'root', this.sshPassword,
        `curl -sk -d 'username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.sshPassword)}' https://localhost:8006/api2/json/access/ticket`
      )
      const json = JSON.parse(result.stdout)
      if (json?.data?.ticket && json?.data?.CSRFPreventionToken) {
        this.token = {
          ticket: json.data.ticket,
          csrfPreventionToken: json.data.CSRFPreventionToken,
          username: json.data.username || this.username,
          expiry: Date.now() + 2 * 60 * 60 * 1000,
        }
        return this.token.ticket
      }
      throw new Error('Failed to get PVE ticket via SSH for VNC')
    }
    if (this.apiToken) {
      throw new Error('Cannot get PVE ticket for VNC: API Token auth without SSH password')
    }
    await this.fetchTicket()
    return this.token!.ticket
  }

  // ==================== 节点信息 ====================

  async getNodeStatus(): Promise<any> {
    return this.request('GET', `/nodes/${this._nodeName}/status`)
  }

  async getNodeVersion(): Promise<any> {
    return this.request('GET', `/nodes/${this._nodeName}/version`)
  }

  // ==================== LXC 容器管理 ====================

  async listLxc(): Promise<any[]> {
    return this.request('GET', `/nodes/${this._nodeName}/lxc`) || []
  }

  async getLxcStatus(vmid: number): Promise<any> {
    return this.request('GET', `/nodes/${this._nodeName}/lxc/${vmid}/status/current`)
  }

  async createLxc(params: {
    vmid: number
    hostname: string
    password?: string
    ostemplate?: string
    cores: number
    memory: number
    swap?: number
    storage: string
    rootfs?: string
    net0?: string
    sshkeys?: string
    unprivileged?: number
    start?: number
    onboot?: number
    features?: string
  }): Promise<string> {
    return this.request('POST', `/nodes/${this._nodeName}/lxc`, params)
  }

  async startLxc(vmid: number): Promise<string> {
    return this.request('POST', `/nodes/${this._nodeName}/lxc/${vmid}/status/start`)
  }

  async stopLxc(vmid: number): Promise<string> {
    return this.request('POST', `/nodes/${this._nodeName}/lxc/${vmid}/status/stop`)
  }

  async rebootLxc(vmid: number): Promise<string> {
    return this.request('POST', `/nodes/${this._nodeName}/lxc/${vmid}/status/reboot`)
  }

  async deleteLxc(vmid: number): Promise<string> {
    return this.request('DELETE', `/nodes/${this._nodeName}/lxc/${vmid}`)
  }

  async getLxcConfig(vmid: number): Promise<any> {
    return this.request('GET', `/nodes/${this._nodeName}/lxc/${vmid}/config`)
  }

  async updateLxc(vmid: number, params: Record<string, any>): Promise<string> {
    return this.request('PUT', `/nodes/${this._nodeName}/lxc/${vmid}/config`, params)
  }

  // ==================== KVM 虚拟机管理 ====================

  async listQemu(): Promise<any[]> {
    return this.request('GET', `/nodes/${this._nodeName}/qemu`) || []
  }

  async getQemuStatus(vmid: number): Promise<any> {
    return this.request('GET', `/nodes/${this._nodeName}/qemu/${vmid}/status/current`)
  }

  async createQemu(params: {
    vmid: number
    name: string
    cores: number
    memory: number
    storage: string
    ide2?: string
    net0?: string
    scsi0?: string
    boot?: string
    start?: number
    onboot?: number
    agent?: number
    ostype?: string
    ciuser?: string
    cipassword?: string
    sshkeys?: string
    cloudinit?: string
  }): Promise<string> {
    return this.request('POST', `/nodes/${this._nodeName}/qemu`, params)
  }

  async startQemu(vmid: number): Promise<string> {
    return this.request('POST', `/nodes/${this._nodeName}/qemu/${vmid}/status/start`)
  }

  async stopQemu(vmid: number): Promise<string> {
    return this.request('POST', `/nodes/${this._nodeName}/qemu/${vmid}/status/stop`)
  }

  async rebootQemu(vmid: number): Promise<string> {
    return this.request('POST', `/nodes/${this._nodeName}/qemu/${vmid}/status/reboot`)
  }

  async deleteQemu(vmid: number): Promise<string> {
    return this.request('DELETE', `/nodes/${this._nodeName}/qemu/${vmid}`)
  }

  async getQemuConfig(vmid: number): Promise<any> {
    return this.request('GET', `/nodes/${this._nodeName}/qemu/${vmid}/config`)
  }

  async updateQemu(vmid: number, params: Record<string, any>): Promise<any> {
    return this.request('POST', `/nodes/${this._nodeName}/qemu/${vmid}/config`, params)
  }


  async vncProxyQemu(vmid: number, websocket?: number): Promise<{ port: number; ticket: string }> {
    const params: Record<string, any> = { websocket: websocket ?? 1 }
    return this.request('POST', `/nodes/${this._nodeName}/qemu/${vmid}/vncproxy`, params)
  }

  async vncProxyLxc(vmid: number, websocket?: number): Promise<{ port: number; ticket: string }> {
    const params: Record<string, any> = { websocket: websocket ?? 1 }
    return this.request('POST', `/nodes/${this._nodeName}/lxc/${vmid}/vncproxy`, params)
  }

  // ==================== 镜像/存储 ====================

  async listStorage(): Promise<any[]> {
    return this.request('GET', `/nodes/${this._nodeName}/storage`) || []
  }

  async listStorageContent(storage: string): Promise<any[]> {
    return this.request('GET', `/nodes/${this._nodeName}/storage/${storage}/content`) || []
  }

  async listIsoImages(storage: string = 'local'): Promise<any[]> {
    const content = await this.listStorageContent(storage)
    return content.filter((item: any) => item.content === 'iso')
  }

  async listContainerTemplates(storage: string = 'local'): Promise<any[]> {
    const content = await this.listStorageContent(storage)
    return content.filter((item: any) => item.content === 'vztmpl')
  }

  async listVmImages(storage: string = 'local'): Promise<any[]> {
    const content = await this.listStorageContent(storage)
    return content.filter((item: any) => item.content === 'images' && !item.volid.includes('/vm-') || (item.content === 'images' && item.volid.includes('base-')))
  }

  async listVmTemplates(): Promise<Array<{vmid: number; name: string; description?: string}>> {
    const vms = await this.request('GET', `/nodes/${this._nodeName}/qemu`) || []
    return vms
      .filter((vm: any) => vm.template === 1)
      .map((vm: any) => ({
        vmid: vm.vmid,
        name: vm.name || `VM ${vm.vmid}`,
      }))
  }

  async cloneQemu(newVmid: number, sourceVmid: number, name: string, description?: string): Promise<string> {
    const params: Record<string, any> = {
      newid: newVmid,
      name,
      target: this._nodeName,
      full: 1,
    }
    if (description) params.description = description
    const result = await this.request('POST', `/nodes/${this._nodeName}/qemu/${sourceVmid}/clone`, params)
    return result as string
  }

  // ==================== 网络 ====================

  async listNetworkInterfaces(): Promise<any[]> {
    return this.request('GET', `/nodes/${this._nodeName}/network`) || []
  }

  async getNetworkInterface(iface: string): Promise<any> {
    return this.request('GET', `/nodes/${this._nodeName}/network/${iface}`)
  }

  // ==================== 操作等待 ====================

  async waitForTask(upid: string, timeoutMs: number = 120000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const status = await this.request('GET', `/nodes/${this._nodeName}/tasks/${encodeURIComponent(upid)}/status`)
      if (status?.status === 'OK' || status?.exitstatus === 'OK') return
      if (status?.status === 'STOPPED' && status?.exitstatus && status.exitstatus !== 'OK') {
        throw new Error(`PVE task ${upid} failed: ${status.exitstatus}`)
      }
      await new Promise(r => setTimeout(r, 2000))
    }
    throw new Error(`PVE task ${upid} timed out after ${timeoutMs}ms`)
  }

  // ==================== Next VM ID ====================

  async getNextVmId(): Promise<number> {
    const data = await this.request('GET', '/cluster/nextid')
    return Number(data)
  }

  // ==================== 测试连接 ====================

  async testConnection(): Promise<{ success: boolean; version?: string; error?: string }> {
    try {
      await this.ensureToken()
      const version = await this.request('GET', `/nodes/${this._nodeName}/version`)
      return { success: true, version: version?.version || 'unknown' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }
}