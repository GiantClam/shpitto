# Cloudflare SaaS Router 落地（shpitto zone）

本仓库已新增 `apps/saas-router` Worker 工程，用于 Cloudflare for SaaS fallback origin 场景。

## 已实现内容

1. Worker 路由层：`apps/saas-router/src/index.ts`
- 根据请求 Host 查询 D1 `shpitto_project_domains` 映射
- 反代到对应 `origin_host`（通常是 `{project}.pages.dev`）
- 未映射返回 404

2. D1 schema 扩展（`apps/web/lib/d1.ts`）
- 新表：`shpitto_project_domains`
  - `hostname`
  - `status`
  - `custom_hostname_id`
  - `ssl_status`
  - `origin_host`
  - `verification_errors_json`

3. 后端 API（`apps/web/app/api/projects/[projectId]/domains/route.ts`）
- `GET`：列出 project 域名绑定
- `POST`：创建/确保 custom hostname（若 Cloudflare for SaaS 已配置）并写入 D1

4. 部署后同步
- deploy 成功后会同步 `origin_host` 到该 project 的自定义域名记录，确保域名始终指向最新站点。

## 需要你在 Cloudflare 控制台完成的前置项

1. DNS 记录（`shpitto.com` zone）
- `fallback` -> `AAAA 100::`（Proxied）
- `customers` -> `CNAME fallback.shpitto.com`（Proxied）

2. Cloudflare for SaaS
- Enable Custom Hostnames
- Fallback origin 设置为：`fallback.shpitto.com`

3. Worker 路由
- 部署 `apps/saas-router`
- 绑定 D1 数据库
- 在 zone 上添加 `*/*` 路由到该 Worker
- 对主站域名（`shpitto.com`、`www.shpitto.com` 等）配置更高优先级 `None` 路由避免误拦截

## 环境变量

`apps/web` 侧：
- `CLOUDFLARE_ZONE_ID`（或 `SHPITTO_CLOUDFLARE_ZONE_ID`）
- `CLOUDFLARE_ZONE_NAME`（默认 `shpitto.com`）
- `CLOUDFLARE_SAAS_CNAME_TARGET`（默认 `customers.shpitto.com`）
- `CLOUDFLARE_SAAS_FALLBACK_HOST`（默认 `fallback.${CLOUDFLARE_ZONE_NAME}`）
- `CLOUDFLARE_SAAS_WORKER_NAME`（默认 `shpitto-saas-router`）
- `CLOUDFLARE_SAAS_PRIMARY_HOSTS`（默认 `shpitto.com,www.shpitto.com,app.shpitto.com`）
- `CLOUDFLARE_SAAS_ROUTE_MODE`（默认 `global`，可选 `host-only`）

## Worker 部署入口

详见：`apps/saas-router/README.md`

## 手动创建与部署（最终流程）

1. 准备环境变量（`apps/web`）
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ZONE_ID`（`shpitto.com` 对应 zone id）
- `CLOUDFLARE_SAAS_CNAME_TARGET=customers.shpitto.com`

2. 手动部署 Router Worker
```bash
cd apps/saas-router
cp wrangler.toml.example wrangler.toml
```
把 `database_id` 改成线上 D1 id，然后：
```bash
pnpm install
pnpm run deploy
```

3. 在 Cloudflare DNS 手动创建两条记录（Proxied）
- `fallback.shpitto.com` -> `AAAA 100::`
- `customers.shpitto.com` -> `CNAME fallback.shpitto.com`

4. 在 Cloudflare for SaaS 手动启用
- SSL 模式建议 `TXT + DV`
- Fallback origin 设置 `fallback.shpitto.com`

5. 在 Workers Routes 手动配置
- `*/*` -> `shpitto-saas-router`
- `shpitto.com/*` -> `None`
- `www.shpitto.com/*` -> `None`
- `app.shpitto.com/*` -> `None`

6. 业务侧绑定与验证
- 通过 `POST /api/projects/[projectId]/domains` 提交租户域名
- 用户在自己 DNS 平台添加 `CNAME -> customers.shpitto.com`
- 打开 `https://fallback.shpitto.com/__router/healthz` 检查路由服务
- 等证书 `active` 后访问租户域名确认上线

## API Token 权限要求

手动流程至少需要：
- `Zone:DNS Edit`
- `Zone:Workers Routes Edit`
- `Zone:SSL and Certificates Edit`
- `Account:Workers Scripts Edit`（`wrangler deploy` 所需）
