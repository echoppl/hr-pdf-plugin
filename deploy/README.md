# Phase 0 部署说明（安全加固）

本目录包含上线前必须完成的安全加固产物。

## 已完成（代码层）
- `routes/resume.js`：`GET /api/resume` 全量接口已收窄为「仅当前用户」，修复跨用户 PII 泄露。
- `routes/admin.js`：新增 `GET /api/admin/resumes`（仅 admin 可访问）作为受控的全公司视图。
- `server.js`：CORS 由全开改为白名单（同源 + 插件来源 + `CORS_ORIGIN` 配置项）。
- 已删除磁盘上 `data/data.db.b64`（全库 PII 的 base64 副本）。

## 待你在服务器执行（运维层）
1. **HTTPS**：用 `nginx/conf.d/app.conf` 模板 + certbot 申请证书，对外仅暴露 443。
   反向代理到容器 `pdf-upload-service:3000`。
2. **收口端口**：把 `docker-compose.yml` 的 `ports` 改为不暴露公网 3000
   （仅 `127.0.0.1:3000:3000` 或交给同网络 nginx），避免明文 HTTP 直连。
3. **确认密钥**：`.env.production` 中 `JWT_SECRET` 必须已设为强随机值（已确认非占位符）。

## certbot 示例
```
certbot certonly --nginx -d 你的域名
```
