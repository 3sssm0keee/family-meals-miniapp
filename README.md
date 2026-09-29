# Family Meals Miniapp

简体中文 | [English](README.en.md)

> **严禁商用。未经作者书面授权，不得将本项目的源码、界面设计及配套文档用于商业用途，包括销售、付费部署、商业项目集成或提供收费服务。**

家庭协作点餐微信小程序，包含原生小程序前端和 NestJS 后端。成员选择菜品、提交点单，管理员审核后汇总为家庭菜单，并管理菜品、成员和历史清理。

## 界面展示

下图基于开发阶段保留的三张界面截图，依次展示首页与昵称编辑、成员与邀请管理、无引用图片清理。昵称、成员时间及文件标识经过 AI 辅助脱敏处理；图片仅展示界面风格与功能布局，不作为当前线上状态或真实数据的验收证据。

**为什么截图里的菜品没有图片？** 这些截图记录的是开发测试时的界面状态，当时菜品图片未显示，卡片保留了图片占位区域，并不是产品不支持图片。正常使用时，管理员可以上传菜品图片；配置好 COS 存储、访问权限和小程序域名，且图片已成功上传并可访问后，菜品卡片会显示对应图片。源码包不包含线上菜品照片，需要使用自己的图片数据。现有截图无法确定当时未显示图片的具体原因，因此不将其归因于某个已确认的存储或网络故障。

![首页、成员邀请和图片清理的开发界面脱敏展示](docs/screenshots/development-showcase.png)

| 首页与昵称 | 成员与邀请 | 图片清理 |
| --- | --- | --- |
| 编辑昵称、选择头像、浏览菜品和底部导航 | 创建正式/访客邀请，处理到期访客及成员 | 查看清理候选、申请清理并查询任务状态 |

## 版本与交付范围

- 源码基线：`1e21c2e1ad86fdebd6a74613daa86398d8bce162`。
- 配套前端：`0.3.9`，有开发版本上传记录；未据此声明已提交审核或发布微信正式版。
- 后端：`family-meals-api-010` 发布上述源码；`011` 是后续配置变更。2026-09-29 用户提供的控制台截图显示 `011` 为线上版本，`010` 备注标明源码和前端配套版本。
- 已核对原后端发布归档哈希、前端上传目录与源码对应关系；未读取云端镜像进行逐文件验证。
- 本包是脱敏源码：包含应用、测试代码、接口契约、迁移和构建配置，不包含真实环境配置、数据库内容、私人资料或依赖安装目录。具体处理见 `README-源码交付.md` 和 `manifest.json`。

## 技术栈

以下版本来自本次源码中的 package.json、Dockerfile 和 compose.yaml，不代表平台最新版本或云数据库实际版本。

| 层次 | 本次使用的技术 | 用途 |
| --- | --- | --- |
| 前端 | 微信原生小程序、JavaScript、WXML、WXSS、JSON | 页面、组件、样式和项目配置；不是 React、Vue 或独立原生 App |
| 微信接口 | `wx.login`、`wx.cloud.callContainer`、`wx.uploadFile` | 微信登录、云托管 API 请求、图片上传 |
| 前端模块 | CommonJS、原生 Page / Component | 页面逻辑、请求封装、会话与幂等重试 |
| 运行时 | Node.js 24；Docker 基础镜像 24.14.0 | 后端 JavaScript 运行环境 |
| 后端 | TypeScript 5.9.3、NestJS 12.0.1、platform-express 12.0.3 | REST API、服务模块及 HTTP 适配 |
| 数据访问 | Prisma / Prisma Client / MariaDB adapter 7.10.0 | MySQL 访问、模型生成、事务和迁移 |
| 数据库 | MySQL；本地 Compose 固定 MySQL 8.4 镜像 | 用户、家庭、菜品、点单、审核、清理任务等持久化 |
| 认证 | 微信登录换取身份、JWT（NestJS JWT 12.0.1） | API 身份识别与家庭角色校验 |
| 文件 | 腾讯云 COS、cos-nodejs-sdk-v5 3.0.0、sharp 0.35.4 | 私有对象存储、图片直传及处理 |
| API 契约 | OpenAPI JSON、前端类型文件、示例 JSON | 前后端接口对齐；不保证存在在线 Swagger 页面 |
| 构建部署 | npm / package-lock、TypeScript 编译、Docker 多阶段构建、微信云托管 | 可复现安装、容器构建和发布 |
| 验证 | Node.js 测试 / assert、tsx 4.23.13、Python 契约检查脚本 | 单元与接口测试、契约检查；Python 不参与正常后端运行 |

没有独立网页前端，也不需要 Redis 才能启动本版。

## 前端页面清单

页面以 `miniprogram/app.json` 注册项为准，共 13 个。部分共享页面虽以 `admin-` 命名，仍承担普通成员选菜功能；管理操作另有权限判断。

| 页面 | 源码目录（均位于 miniprogram/pages） | 使用方式 / 主要功能 |
| --- | --- | --- |
| 登录 | `login` | 微信登录；输入邀请信息进入家庭加入流程 |
| 首页 | `index` | 查看当前家庭和餐次、浏览与选择菜品、修改昵称/头像、收藏、进入管理员工作台 |
| 家庭菜单 | `family-menu` | 查看家庭汇总菜单及当前点单结果 |
| 管理工作台 | `admin-console` | 管理入口：审核、菜品维护、成员、历史清理、图片清理和审计 |
| 点单审核 | `admin-review` | 管理员处理成员提交、调整审核数量并提交审核决定 |
| 个人点单 | `personal-menu` | 查看自己的提交与审核结果、编辑逐菜备注、按允许状态补充点单 |
| 我的选择 | `cart` | 查看待提交菜品、调整数量、移除条目及提交点单 |
| 家庭选择 | `family-select` | 选择已加入家庭、兑换邀请码 |
| 菜品库 | `admin-dishes` | 搜索、分类筛选、查看规格与选菜；管理员额外可编辑或管理菜品 |
| 清理管理 | `admin-cleanup` | 管理员选择历史菜品执行清理、查看图片清理候选和任务状态 |
| 菜品编辑 | `admin-dish-edit` | 管理员新增/编辑菜品、规格和图片，执行允许的删除操作 |
| 成员管理 | `admin-members` | 管理员查看成员、生成/分享邀请、将访客转为正式成员、移除成员 |
| 操作审计 | `admin-audit` | 管理员查看家庭操作记录 |

底部导航为：首页、菜品库、我的选择、家庭菜单。其余页面通过业务入口进入。

## 使用流程

### 家庭成员

1. 在微信中打开已配置并可访问的小程序，完成微信登录。
2. 选择已加入的家庭；新成员使用管理员提供的有效邀请码加入。
3. 在首页或菜品库选择菜品和规格，加入“我的选择”。
4. 核对数量和逐菜备注，提交点单。购物车内容不等于已经提交。
5. 在个人点单查看审核情况，在家庭菜单查看汇总结果；是否能补单由当前餐次和服务端状态决定。

### 管理员

1. 进入管理工作台，维护菜品、规格和图片。
2. 生成成员/访客邀请，查看并管理家庭成员。
3. 在审核页处理成员点单，然后核对家庭菜单。
4. 需要清理时，进入清理页面查看候选和确认范围。图片清理是任务流程，应查询结果后再决定是否重试。
5. 在审计页查看管理操作。数据库迁移与应用部署不会自动执行历史业务数据清理。

### 角色约束

- `ADMIN`：家庭管理与审核角色。
- `MEMBER`：正式成员，权限由服务端按家庭校验。
- `GUEST`：限时访客；当前实现创建访客时设置 24 小时有效期。转为正式成员会清除到期时间。
- 被移除、已退出或到期身份不能依靠旧邀请简单恢复原权限；具体兑换结果以服务端校验为准。
- 本版保留 Mock 模块作为开发代码，但交付配置 `USE_MOCK=false`；看到页面不等于已连接真实后端。

## 目录结构

```text
miniprogram/          小程序页面、组件、API 请求及静态图标
backend/src/         后端业务模块与接口
backend/prisma/      数据模型和 6 项版本迁移
backend/scripts/     启动及验证脚本
backend/test/        后端测试
docs/contracts/      OpenAPI、类型、示例和业务契约
Dockerfile           云托管镜像构建入口
compose.yaml         本地 MySQL 开发容器
manifest.json        文件哈希、来源、脱敏与排除记录
```

## 后端部署前置条件

本节依据本版源码的运行条件编写，云平台按钮名称及配额以实际控制台为准。

| 条件 | 要求 |
| --- | --- |
| 微信身份 | 自有小程序 AppID / AppSecret，具备项目开发和上传权限 |
| 云环境 | 已可用的微信云托管环境、服务和必要的发布权限；前端环境、服务名与后端对应 |
| 数据库 | 后端可访问的 MySQL；应用账号具备业务读写权限，执行迁移的账号还需相应建表/变更权限 |
| 持久化存储 | COS 桶、地域和对象读写删除能力；云托管模式要求 COS，不能依靠实例临时磁盘保存长期图片 |
| 网络 | 容器能访问数据库、微信登录接口及 COS；图片直传使用的 COS HTTPS 域名需符合小程序平台域名配置要求 |
| HTTPS | 为图片签名地址配置真实 HTTPS origin；前端 BASE_URL 在其后附加 `/api/v1` |
| 容器 | 从仓库根目录构建 Dockerfile，监听 `0.0.0.0:3000`；健康路径 `/api/v1/health` |
| 密钥 | 各环境使用自有随机密钥，注入平台配置；不提交 Git，不复用包中的占位值 |
| 数据准备 | 迁移仅准备结构，不会创建首个家庭、管理员或菜品，需要单独受控初始化 |

### 环境变量

`backend/.env.example` 不是完整云部署模板；云托管还必须提供以下配置。

| 变量 | 配置要求 |
| --- | --- |
| `DEPLOY_TARGET` | `wechat-cloudrun`；启用云配置校验和启动迁移 |
| `NODE_ENV` | `production` |
| `HOST` / `PORT` | `0.0.0.0` / `3000` |
| `DATABASE_URL` | `mysql://USER:PASSWORD@HOST:3306/DATABASE`；特殊字符需 URL 编码 |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 自有小程序身份与密钥，须与前端项目匹配 |
| `JWT_SECRET` | 随机密钥，至少 32 字节 |
| `IDEMPOTENCY_ENCRYPTION_KEY` | 32 字节随机值的 Base64 编码，解码后必须恰好 32 字节 |
| `FILE_SIGNING_KEY` | 独立随机密钥，至少 32 字节 |
| `FILE_PUBLIC_BASE_URL` | HTTPS origin，例如 `https://api.example.com`；不能含 `/api/v1`、查询参数或用户名密码 |
| `FILE_STORAGE_DRIVER` | 云托管必须为 `cos` |
| `COS_BUCKET` / `COS_REGION` | 自有桶完整名称及地域 |
| `COS_AUTH_MODE` | 微信云托管使用 `wechat-cloudrun`，由平台临时凭据接口授权；必须确保环境实际支持并授权 |
| `COS_SECRET_ID` / `COS_SECRET_KEY` | 仅静态认证模式需要；不使用时不要填写或上传真实值 |
| `COS_SECURITY_TOKEN` | 静态模式采用临时凭据时的可选 token |
| `REGISTRATION_FAMILY_ID` | 已存在家庭 ID；固定注册入口依赖此项 |
| `REGISTRATION_ADMIN_CODE` | 可选的管理员注册码，若设置须至少 32 字符，并严格保密 |

固定访客码在本包中已替换为 `REPLACE_GUEST_CODE`，当前代码仍为常量比较，并没有 `REGISTRATION_GUEST_CODE` 环境变量。部署前应替换该占位值并同步契约/测试，或另行实现环境变量读取；不能把公开占位值作为线上邀请码。`REPLACE_LEGACY_CODE` 是已脱敏的旧码示例，不是当前管理员注册配置。

### 首个家庭与管理员

全新数据库执行迁移后仍没有业务数据。当前创建家庭接口要求调用者已经是有效管理员，所以首个家庭不能靠普通新用户直接创建。

由部署负责人按 `backend/prisma/schema.prisma` 受控创建首个家庭，配置其 `REGISTRATION_FAMILY_ID`，再使用私密的 `REGISTRATION_ADMIN_CODE` 通过登录后的兑换入口建立管理员身份。此初始化应单独执行并核验；本仓库没有自动完成该流程的一键生产初始化脚本，也不包含原线上家庭、成员或数据库备份。

## 部署步骤

### 1. 配置前端与脱敏占位值

- 在 `miniprogram/project.config.json` 填入真实 AppID；`touristappid` 仅为脱敏占位，不能用于真实微信登录验收。
- 在 `miniprogram/config.js` 设置 `CLOUD_ENV`、`CLOUD_SERVICE` 和 `BASE_URL`，保留 `TRANSPORT_MODE: 'cloudrun'`、`USE_MOCK: false`。
- `BASE_URL` 示例：`https://api.example.com/api/v1`。业务请求由 `wx.cloud.callContainer` 使用环境与 `X-WX-SERVICE` 路由。
- 处理邀请码占位值，并在部署平台配置后端全部环境变量。

### 2. 构建和部署后端

在源码根目录构建镜像，而不是只上传 backend 目录；Dockerfile 还需要 `docs/contracts`。

```powershell
docker build -t family-meals-backend:0.3.9 .
```

也可使用云托管源码构建入口提交同一根目录内容，Dockerfile 选根目录文件，服务端口设为 3000。使用平台安全配置注入变量，不能将真实 `.env`、证书私钥或数据备份塞入源码包。

Docker 构建执行 `npm ci`、Prisma Client 生成和 TypeScript 编译。启动脚本在 `DEPLOY_TARGET=wechat-cloudrun` 时先执行 `prisma migrate deploy`，成功后才启动应用；迁移失败会停止启动。

默认镜像设置 `NODE_EXTRA_CA_CERTS=/app/cert/certificate.crt`。部署环境需核对该证书路径是否按预期提供；迁移到普通服务器时应按实际证书链调整该配置，不复制原机器凭据。

### 3. 核验后端

1. 查看构建、迁移与启动日志，确认全部迁移成功。
2. 请求 `GET /api/v1/health`，检查服务和数据库状态；健康正常不代表全部业务已通过。
3. 准备首个家庭/管理员，验证微信登录、角色权限、点单和审核流程。
4. 真机测试图片上传与显示；确认 COS 授权及上传/下载域名配置生效。
5. 涉及已有数据库升级时，先保留可恢复备份。回退镜像不会自动撤销迁移或恢复删除的数据。

### 4. 导入并上传前端

用微信开发者工具导入 `miniprogram`，确认 AppID、云环境、服务名和真实后端配置，编译后用真机测试成员及管理员流程。

上传开发版本、设置体验版、提交审核、正式发布是不同步骤；仅完成上传不能记为正式上线。本次文档整理没有重新部署后端或上传前端。

## 本地开发与测试

本地后端需要 Node.js 24 和可访问的 MySQL。可按根目录 `.env.example` 配置自有密码后运行 `docker compose up -d mysql`；Compose 只启动数据库，不会启动后端或导入原线上数据。

在 backend 目录准备自己的 `.env` 后执行：

```powershell
npm ci
npm run db:generate
npm run db:validate
npx prisma migrate deploy
npm run build
npm start
```

以上迁移命令只应指向你明确选择的开发数据库。普通 `npm start` 不自动迁移，云托管专用启动脚本与它不同。

可使用 `npm run typecheck`、`npm run test:base`、`npm run test:menu` 做对应静态/测试检查。HTTP、isolated、图片及注册等测试脚本可能写数据，须先核对脚本配置并使用隔离数据库和存储，不能直接连接线上库运行。

前端真实本地 HTTP 调试需修改传输模式和地址，并处理开发者工具网络配置；`COS_AUTH_MODE=wechat-cloudrun` 的平台临时凭据接口不能假定在普通本地容器中可用。Mock 只能验证模拟交互，不能替代真实微信登录、云权限、数据库和 COS 验收。

## 本次文档验证边界

页面数、依赖版本、变量约束、启动顺序与部署条件均按交付源码核对。本次只更新文档和归档哈希，没有重新构建镜像、执行数据库迁移或进行新一轮真机业务回归。此文档不包含任何真实密钥或用户数据库数据。
