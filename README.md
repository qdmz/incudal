# Incudal

基于 Incus 的 NAT VPS 销售、交付与管理面板。

## 功能特性

- **多节点管理** — 支持 Incus 节点，后续将支持 PVE/LXD/KVM 等节点类型
- **套餐与方案** — 灵活的套餐配置，支持多方案、多计费周期
- **实例全生命周期** — 创建、启动、停止、重装、快照、备份、销毁
- **NAT 端口映射** — 自动分配 NAT 端口，支持 IPv6
- **托管系统** — 支持第三方托管节点接入
- **多种支付** — 易支付、Stripe、加密货币、卡密
- **终端代理** — WebSocket 终端，支持多实例切换
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

## 项目结构

```
incudal/
├── client/          # 前端 (Vue 3)
├── server/          # 后端 (Fastify)
├── agent/           # 宿主机代理 (Go)
├── scripts/         # 运维脚本
└── docker-compose.yml
```

## 版本历史

- **v0.10** — 公开前端页面（首页/登录/注册/公告/帮助/套餐列表），PublicSiteLayout 布局，公开公告 API

## 许可证

Private — 未经授权禁止使用
