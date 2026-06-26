# Incudal

基于 Incus / PVE 的 NAT VPS 销售、交付与管理面板。

## 功能特性

- **多节点类型** — 支持 Incus 和 PVE (Proxmox VE) 节点，PVE 支持 LXC 容器和 QEMU 虚拟机
- **PVE VM 模板克隆** — 支持 cloud-init VM 模板一键克隆创建，无需 ISO 手动安装
- **套餐与方案** — 灵活的套餐配置，支持多方案、多计费周期，区分容器/虚拟机实例类型
- **实例全生命周期** — 创建、启动、停止、重装、快照、备份、销毁
- **NAT 端口映射** — 自动分配 NAT 端口，支持 IPv4 + IPv6 双栈
- **终端代理** — WebSocket SSH 终端（LXC/QEMU 统一 SSH 直连），PVE noVNC 远程桌面
- **托管系统** — 支持第三方托管节点接入
- **多种支付** — 易支付、Stripe、加密货币、卡密
- **多语言** — 简体中文、繁体中文、English
- **深色/浅色主题** — 完整适配

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | Vue 3 + TypeScript + Tailwind CSS + Vite |
| 后端 | Fastify + TypeScript + Prisma + PostgreSQL |
| 缓存 | Redis |
| 宿主机代理 | Go (incudal-agent) |
| 部署 | Docker Compose |

## 快速开始

### 环境要求

- Node.js 20+
- pnpm 9+
- PostgreSQL 16+
- Redis 7+
- Docker & Docker Compose（生产部署）

### 开发

```bash
# 安装依赖
corepack enable
corepack prepare pnpm@9 --activate
pnpm install

# 前端开发
pnpm --filter client dev

# 后端开发
pnpm --filter server dev
```

### 生产部署

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env 填写数据库、Redis、管理员密码等配置

# 启动服务
docker-compose up -d
```

## PVE 节点配置

PVE 节点需要以下前置配置：

1. **NAT 内网桥** — `vmbr1`（如 172.16.1.1/24），用于实例 IPv4 内网通信
2. **IPv6 桥** — `vmbr2`，用于实例 IPv6 通信
3. **API Token** — 在 PVE 创建 API Token（如 `root@pam!incudal`），权限需包含 VM.Audit、VM.Create、VM.Destroy 等
4. **nftables** — PVE 使用 nftables 配置 NAT 转发规则和 forward 链
5. **VM 模板** — 下载 cloud-init 兼容的 VM 镜像（qcow2），导入 PVE 后转换为模板，创建 VM 时使用克隆方式

### VM 模板创建示例

```bash
# 下载 Debian 12 cloud-init 镜像
wget -O /tmp/debian-12.qcow2 https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-generic-amd64.qcow2

# 创建 VM 并导入磁盘
qm create 9000 --name debian-12-cloudinit --memory 512 --cores 1 --net0 virtio,bridge=vmbr1 --serial0 socket --scsihw virtio-scsi-pci --ostype l26
qm importdisk 9000 /tmp/debian-12.qcow2 local

# 配置 VM
qm set 9000 --scsi0 local:9000/vm-9000-disk-0.raw
qm set 9000 --ide2 local:cloudinit
qm set 9000 --ciuser root

# 转换为模板
qm template 9000
```

## 项目结构

```
incudal/
├── client/          # 前端 (Vue 3)
├── server/          # 后端 (Fastify)
│   ├── src/lib/pve/ # PVE API 客户端、连接池、VNC 代理、NAT 管理
│   └── prisma/      # 数据库模型与迁移
├── agent/           # 宿主机代理 (Go)
├── scripts/         # 运维脚本
└── docker-compose.yml
```

## 版本历史

- **v0.13** — PVE VM 模板克隆创建、cloud-init 自动配置、终端密码解密修复、LXC chpasswd 修复
- **v0.12** — PVE noVNC 远程桌面、SSH 终端直连 VM、QEMU cloud-init 支持、实例类型(instanceType)区分
- **v0.11** — PVE 节点类型支持（LXC + QEMU VM）、NAT 端口映射(nftables)、IPv6 双栈、上游合并
- **v0.10** — 公开前端页面（首页/登录/注册/公告/帮助/套餐列表），PublicSiteLayout 布局，公开公告 API

## 许可证

Private — 未经授权禁止使用
