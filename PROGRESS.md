# Incudal 项目进度记录

## 项目信息

- **仓库**: https://github.com/qdmz/incudal
- **GitHub 用户**: qdmz
- **Token**: 已存储在 ~/.git-credentials
- **部署地址**: http://incudal.ypvps.com (HTTP, 端口80)
- **服务器IP**: 154.9.237.203
- **Docker 容器**: incudal_app_1 / incudal_db_1 / incudal_redis_1
- **后端端口**: 3001 (容器内 3000)
- **数据库**: PostgreSQL (容器内), MariaDB (宿主机, 用户 oneclickvirt, 密码 gaGvWHJ9l6iP6g8jUGEK7fsG)
- **Caddy 反向代理**: 宿主机 80/443 → 127.0.0.1:3001
- **Let's Encrypt 证书**: incudal.ypvps.com (有效期至 2026-09-22, certbot 自动续期)
- **管理员密码**: 5S9g5qLEaRF6iAtCMBZT00lw (在 .env 的 ADMIN_PASSWORD)

## 关键网络配置

- `/etc/nftables.conf` — 删除了 80/443 → 172.16.1.112 的 DNAT 规则
- `/etc/sysctl.d/99-bridge.conf` — bridge-nf-call-iptables=0 (修复 vmbr0 桥接流量被丢弃)
- `/etc/caddy/Caddyfile` — incudal.ypvps.com + 154.9.237.203 反向代理到 127.0.0.1:3001

## 已完成 (v0.10)

### 第一步：公开前端页面

- [x] HomeView.vue — 公开首页 (Hero+统计+特性+热门套餐+CTA)
- [x] AnnouncementsView.vue — 公开公告页
- [x] 后端公开公告 API — GET /api/announcements/public (无需认证)
- [x] HelpView — 改为公开访问 (guest 路由)
- [x] MarketView — 改为公开访问 (guest 路由)
- [x] PublicSiteLayout — 统一布局, w-[90%] max-w-7xl
- [x] PublicSiteHeader — 导航添加帮助中心链接
- [x] PublicSiteFooter — 卡片式链接区域 + 版权行
- [x] 登录/注册/忘记密码页 — 统一宽度 + 显示页脚
- [x] 前端构建部署到 Docker 容器

### 修改的关键文件

| 文件 | 说明 |
|------|------|
| client/src/views/HomeView.vue | 新建 - 公开首页 |
| client/src/views/AnnouncementsView.vue | 新建 - 公开公告页 |
| client/src/router/index.ts | 修改 - 添加公开路由 |
| client/src/App.vue | 修改 - PublicSiteLayout 布局逻辑 |
| client/src/components/public/PublicSiteLayout.vue | 修改 - 统一宽度 |
| client/src/components/public/PublicSiteHeader.vue | 修改 - 导航链接 |
| client/src/components/public/PublicSiteFooter.vue | 修改 - 卡片式+版权 |
| client/src/api/index.ts | 修改 - 公开公告 API |
| server/src/routes/announcements.ts | 修改 - 公开公告路由 |
| server/dist/routes/public-announcements.js | 新建 - 编译后公开路由 |
| server/dist/app.js | 修改 - 注册公开路由 |

## 待完成

### 第二步：增加节点类型支持

优先级：先增加 PVE 节点支持，走通后再增加其他类型

- [ ] 数据库模型：Host 模型增加 nodeType 字段 (incus/pve/lxd/kvm/external_api)
- [ ] 后端 API：PVE 节点的增删改查
- [ ] PVE API 客户端：连接 PVE 服务器，获取节点/存储/镜像信息
- [ ] PVE 实例管理：通过 PVE API 创建/启动/停止/删除 LXC 和 KVM 实例
- [ ] PVE 网络配置：NAT 端口映射、IPv6 分配
- [ ] 前端：节点管理页面支持 PVE 类型
- [ ] 前端：创建实例时支持 PVE 节点的镜像选择
- [ ] 测试：PVE 节点完整流程测试

后续类型：
- [ ] LXD 节点支持
- [ ] KVM 节点支持 (独立 KVM，非 PVE)
- [ ] 外部智简魔方 API 接口

## 部署注意事项

1. 宿主机 Node.js 已升级到 v22.23.0 (原 v18)
2. 前端构建在宿主机: `pnpm --filter client build`
3. 部署方式: `docker cp client/dist/. incudal_app_1:/app/client/dist/`
4. 后端代码修改需同时更新容器内编译后的 JS 文件
5. 完整重建需 Docker build，但 npm registry 在容器内不可达，需解决网络问题
6. ufw 防火墙已启用，放行 22/80/443
7. PVE 防火墙已禁用