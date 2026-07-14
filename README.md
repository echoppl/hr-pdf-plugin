# HR PDF 简历上传管理后台

浏览器插件采集 PDF 简历文件，上传到独立后端服务，通过管理后台查看、预览、下载、管理。

## 技术栈

- **后端**：Node.js + Express
- **数据库**：SQLite（better-sqlite3，零配置）
- **文件存储**：腾讯云 COS（cos-nodejs-sdk-v5）
- **认证**：JWT（jsonwebtoken + bcryptjs）
- **前端**：纯 HTML / CSS / JS

## 项目结构

```
pdf-upload-service/
├── server.js              # 主入口
├── .env.example           # 配置模板
├── .gitignore
├── package.json
├── db/
│   └── database.js        # SQLite 数据库（users + files 表）
├── middleware/
│   └── auth.js            # JWT 认证中间件
├── routes/
│   ├── auth.js            # 注册 / 登录
│   └── files.js           # 上传 / 列表 / 下载 / 删除
├── services/
│   └── cos.js             # 腾讯云 COS 操作
└── admin/                 # 管理后台网页
    ├── login.html         # 登录 / 注册页
    ├── index.html         # 文件管理面板（表格 + 搜索 + 预览）
    └── css/
        └── style.css      # 样式
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置腾讯云 COS

复制 `.env.example` 为 `.env`，填入你的 COS 信息：

```bash
cp .env.example .env
```

```env
# 服务端口
PORT=3000
JWT_SECRET=your-secret-key-change-this

# 腾讯云 COS
COS_SECRET_ID=AKIDxxxxxxxx
COS_SECRET_KEY=xxxxxxxx
COS_BUCKET=your-bucket-1234567890
COS_REGION=ap-guangzhou

# 文件大小限制（MB）
MAX_FILE_SIZE=10
```

> COS 密钥获取：https://console.cloud.tencent.com/cam/capi
> COS 存储桶创建：https://console.cloud.tencent.com/cos5/bucket

### 3. 启动服务

```bash
npm start
```

### 4. 访问管理后台

浏览器打开 `http://localhost:3000/admin`

1. 点击「立即注册」，输入用户名和密码
2. 登录后进入文件管理面板
3. 拖拽或点击上传 PDF 文件
4. 表格中可预览、下载、删除文件

## API 接口

### 认证

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/auth/register` | POST | 注册（username, password） |
| `/api/auth/login` | POST | 登录，返回 JWT Token |

### 文件操作（需认证）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/files/upload` | POST | 上传 PDF（multipart/form-data，字段 `file`） |
| `/api/files/list` | GET | 获取文件列表 |
| `/api/files/:id/download` | GET | 下载/预览文件（`?preview=1` 为预览模式） |
| `/api/files/:id` | DELETE | 删除文件 |

### 认证方式

除注册和登录外，所有接口需在 Header 中携带：

```
Authorization: Bearer <token>
```

## 浏览器插件对接

```javascript
const API_BASE = 'http://localhost:3000';

// 1. 登录获取 Token
const res = await fetch(API_BASE + '/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'your-username', password: 'your-password' }),
});
const { token } = (await res.json()).data;

// 2. 上传 PDF
const formData = new FormData();
formData.append('file', pdfFile);
const uploadRes = await fetch(API_BASE + '/api/files/upload', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + token },
  body: formData,
});
```

## 部署到服务器

```bash
# 安装 pm2 进程守护
npm install -g pm2

# 启动
pm2 start server.js --name pdf-upload-service

# 设置开机自启
pm2 startup
pm2 save
```

## License

MIT
