# PDF 上传服务部署指南

## 第一步：创建腾讯云 COS 存储桶

### 1. 进入 COS 控制台

打开 [https://console.cloud.tencent.com/cos5/bucket](https://console.cloud.tencent.com/cos5/bucket)

### 2. 创建存储桶

| 字段 | 填写内容 |
|------|---------|
| 名称 | `my-pdf-upload-2026`（自定义，全小写+数字+中划线） |
| 所属地域 | **广州（ap-guangzhou）** |
| 数据冗余策略 | **单 AZ 存储** |
| 访问权限 | **公有读私有写** |
| 版本控制 | 不开 |
| 服务器端加密 | 不开 |
| 日志存储 | 不开 |

填完后点底部「创建」。

### 3. 记录存储桶信息

创建完成后，在存储桶列表点击你刚创建的桶，进入「概览」页面：

- **存储桶名称** → 填到 `.env` 的 `COS_BUCKET`
- **所属地域** → 填到 `.env` 的 `COS_REGION`

---

## 第二步：获取 API 密钥

打开 [https://console.cloud.tencent.com/cam/capi](https://console.cloud.tencent.com/cam/capi)

点击「新建密钥」，复制：

- `SecretId` → 填到 `.env` 的 `COS_SECRET_ID`
- `SecretKey` → 填到 `.env` 的 `COS_SECRET_KEY`

---

## 第三步：配置 .env

编辑 `pdf-upload-service/.env`：

```bash
# 服务配置
PORT=3000
JWT_SECRET=随机生成一串复杂字符串

# 文件上传限制
MAX_FILE_SIZE=10

# 腾讯云 COS
COS_SECRET_ID=AKIDxxxxxxxxxxxxxxxx
COS_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
COS_BUCKET=my-pdf-upload-2026-1234567890
COS_REGION=ap-guangzhou
```

---

## 第四步：本地启动测试

```bash
cd pdf-upload-service
npm start
```

看到以下输出表示启动成功：

```
  PDF Upload Service 已启动
  ─────────────────────────────────
  服务地址:  http://localhost:3000
  管理后台:  http://localhost:3000/admin
```

### 测试流程

1. 浏览器打开 `http://localhost:3000/admin`
2. 点「立即注册」，输入用户名和密码（密码 6 位以上）
3. 登录后进入文件管理面板
4. 拖一个 PDF 文件到上传区域，或点击选择文件
5. 上传成功后，列表中会出现该文件
6. 点击「下载」保存到本地，「预览」新窗口查看，「删除」移除文件

---

## 第五步：部署到腾讯云服务器

### 购买服务器

1. 打开 [轻量应用服务器](https://cloud.tencent.com/product/lighthouse)
2. 选择最低配（2核2G）即可，系统选 **CentOS 7.9** 或 **Ubuntu 22.04**
3. 购买后在控制台「防火墙」中放行 **3000** 端口

### 上传代码

```bash
# 在本地项目目录执行
cd pdf-upload-service
zip -r ../pdf-upload-service.zip . -x "node_modules/*" "db/data.db"
```

将 `pdf-upload-service.zip` 上传到服务器：

```bash
scp ../pdf-upload-service.zip root@你的服务器IP:/root/
```

### 服务器上部署

```bash
# SSH 登录服务器
ssh root@你的服务器IP

# 安装 Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# 解压项目
cd /root
unzip pdf-upload-service.zip -d pdf-upload-service
cd pdf-upload-service

# 安装依赖
npm install

# 安装 pm2（进程守护）
npm install -g pm2

# 启动服务
pm2 start server.js --name pdf-upload
pm2 save
pm2 startup
```

### 访问

```
http://你的服务器IP:3000/admin
```

---

## 第六步：修改浏览器插件

在插件代码中，把原来的上传接口替换为新接口。

### 原接口（公司）

```javascript
const formData = new FormData();
formData.append('phone', phoneNumber);
formData.append('file', pdfFile);

const res = await fetch('https://公司域名/hrm-internet/user-profile/resume/upload', {
  method: 'POST',
  body: formData
});
```

### 新接口（自建）

```javascript
const API_BASE = 'http://你的服务器IP:3000';

// 1. 首次使用时登录（token 缓存到 localStorage）
let token = localStorage.getItem('pdf_upload_token');
if (!token) {
  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'your-username', password: 'your-password' })
  });
  const data = await loginRes.json();
  token = data.data.token;
  localStorage.setItem('pdf_upload_token', token);
}

// 2. 上传文件
const formData = new FormData();
formData.append('file', pdfFile);  // 只需要 file 字段

const uploadRes = await fetch(`${API_BASE}/api/files/upload`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

const result = await uploadRes.json();
if (result.code === 200) {
  console.log('上传成功:', result.data.fileUrl);
}
```

---

## API 接口速查

| 接口 | 方法 | 是否需要认证 | 说明 |
|------|------|-------------|------|
| `/api/auth/register` | POST | 否 | 注册，body: `{username, password}` |
| `/api/auth/login` | POST | 否 | 登录，返回 `{token, username}` |
| `/api/files/upload` | POST | 是 | 上传 PDF，form-data: `file` |
| `/api/files/list` | GET | 是 | 文件列表 |
| `/api/files/:id/download` | GET | 是 | 下载/预览（加 `?preview=1` 预览） |
| `/api/files/:id` | DELETE | 是 | 删除文件 |
| `/api/health` | GET | 否 | 健康检查 |

认证方式：请求头 `Authorization: Bearer <token>`，或 URL 参数 `?token=<token>`

---

## 常见问题

**Q: 上传报错 "Access Denied"？**
A: COS 存储桶权限看看是不是「公有读私有写」，另外 API 密钥是否有 COS 写入权限。

**Q: 管理后台打不开？**
A: 确认服务器防火墙已放行 3000 端口。

**Q: token 过期？**
A: token 有效期 7 天，过期后重新登录获取。
