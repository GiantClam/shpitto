# shpitto SaaS Router Worker

该 Worker 用于 Cloudflare for SaaS fallback origin 场景：
- `fallback.shpitto.com` 指向该 Worker
- custom hostname 流量进入 Worker 后，按 Host 查 D1 映射并反代到对应 Cloudflare Pages 站点

## 1) 本地准备

```bash
cd apps/saas-router
cp wrangler.toml.example wrangler.toml
# 编辑 wrangler.toml，填入 D1 database_id
```

## 2) 部署 Worker

```bash
pnpm install
pnpm run deploy
```

## 3) Cloudflare DNS

在 `shpitto.com` zone 创建：
- `fallback` -> `AAAA 100::`（Proxied）
- `customers` -> `CNAME fallback.shpitto.com`（Proxied）

## 4) Cloudflare for SaaS

- Custom Hostnames -> Enable
- Fallback origin 设置为：`fallback.shpitto.com`

## 5) 路由注意事项

`*/*` 路由会命中所有主机名。请在 Dashboard 中把主站域名（如 `shpitto.com`, `www.shpitto.com`）配置为更高优先级的 `None` 路由，避免误拦截控制台流量。

## 6) 手动部署清单（推荐）

1. 配置 `wrangler.toml`
```bash
cd apps/saas-router
cp wrangler.toml.example wrangler.toml
```
把 `database_id` 改成你线上 D1 的 `CLOUDFLARE_D1_DATABASE_ID`。

2. 部署 Worker
```bash
pnpm install
pnpm run deploy
```

3. 在 Cloudflare 控制台创建/确认 DNS（都要 Proxied）
- `fallback.shpitto.com` -> `AAAA 100::`
- `customers.shpitto.com` -> `CNAME fallback.shpitto.com`

4. 在 Cloudflare for SaaS 打开 Custom Hostnames
- SSL 建议选 `TXT + DV`
- Fallback origin 设为 `fallback.shpitto.com`

5. 在 Workers Routes 配置路由
- `*/*` -> `shpitto-saas-router`
- `shpitto.com/*` -> `None`
- `www.shpitto.com/*` -> `None`
- `app.shpitto.com/*` -> `None`

6. 验证
- 打开 `https://fallback.shpitto.com/__router/healthz`，返回 `ok: true`
- 在业务里绑定一个测试自定义域名，确认 `shpitto_project_domains` 有记录且可访问
