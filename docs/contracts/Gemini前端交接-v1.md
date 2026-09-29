# Gemini 前端交接 V1

本文件是前端开发任务说明。开发对象为一个微信小程序，包含成员功能和 ADMIN 管理功能。Codex 负责后端、数据库、契约及集成；前端不修改后端或自行扩充接口。

## 必读顺序与文件

1. 本文：范围、页面与异常处理。
2. 业务规则与数据字典-v1.md：已确认规则、默认规则及状态含义。
3. openapi-v1.json：所有请求、响应、字段限制、权限与错误。
4. frontend-types.ts：自动生成类型；可导入前端服务层。
5. examples-v1.json：每接口的示例输入和成功返回，仅开发用。
6. 验收场景-v1.md：完成标准。

优先级：用户后续明确变更 > 同版本 OpenAPI 字段协议及业务规则 > 自动生成类型/样例 > 旧 v0.1 提纲。冲突交由 Codex 统一修订，禁止前端自行修补出另一套协议。

## 页面与调用顺序

| 页面 | operationId | 完成行为 |
| --- | --- | --- |
| 登录/资料 | login/getMe/updateMe | wx.login code换token，显示名编辑，过期重登录 |
| 家庭入口 | listMyFamilies/createFamily/redeemInvite | 无家庭显示创建/邀请码加入，有家庭可切换 |
| 首页/餐次 | ensureSession/listSessions/getSession | 当天POST获取餐次，历史GET只读；中饭晚饭明确区分 |
| 菜品列表/详情 | listDishes/getDish | sessionId过滤临时菜；展示版本、份规格、可用图片 |
| 购物车 | getCart/addCartItem/removeCartItem | 一版本一个选中项，没有“份数加减器” |
| 提交 | submitMenu/getPersonalMenu | 提交完整variantIds和整体备注；成功显示等待安排 |
| 个人菜单 | getPersonalMenu/updateNote | 提交后选择只读，备注可编辑；逐项显示管理员结果 |
| 家庭菜单 | getFamilyMenu | 菜品去重人数、各版本人数、决定及制作份数；不展示他人备注 |
| 管理菜品 | listAdminDishes/getAdminDish/createDish/updateDish/deleteDish | 能查看已下架项并重新启用；版本冲突后核对 |
| 管理版本 | createVariant/updateVariant/deleteVariant | 版本名、规格、说明、可用开关 |
| 图片 | uploadFile/getFile | 使用wx.uploadFile的name=file，JSON解析返回；过期刷新地址 |
| 管理审核 | getReview/reviewMenu | 完整版本名单和备注；逐项确认/取消；制作份数由管理员填 |
| 临时菜 | createTemporaryDish/promoteDish | 新建当餐特别菜，审核制作量；可转正式菜 |
| 邀请/成员 | createInvite/listInvites/revokeInvite/listMembers/updateMemberRole/removeMember/leaveFamily | 24小时有效；分享页或二维码只承载code，不含密钥 |
| 消息 | getNotificationConfig/recordSubscriptionResult/listMyNotifications | enabled时请求订阅；不把客户端accept视为发送成功 |
| 审计 | listOperations | 管理操作只读列表，可按餐次筛选 |

## 审核页面必须这样展示

菜品卡片：红烧肉，共4人想吃。

- 普通版：3人；张三、李四、王五；展开各人备注；上次审核2人；当前已确认但新增需求待审核；制作1.5份，可重新确认或取消。
- 少油版：2人；李四、赵六；未审核；制作份数为空，填写后才能确认。

4是两版本成员并集人数，不是3+2。直接使用后端 uniqueParticipantCount，不能由显示名计算。已确认且needsReview=true必须同时显示已确认结果与待审标记，不能只显示其中一种。

“全部确认”组装每项的明确数量，空数量应阻止提交。取消必须填写原因。批量操作为单请求，409后保留输入草稿并展示最新数据，不自动覆盖原草稿或自动重送。

## API 层约定

- baseUrl 由环境配置注入，以 /api/v1 结尾；不存在正式服务器地址时仅启用清楚标识的 MOCK 模式。
- 自动带 Authorization；写操作（登录除外）带新的 Idempotency-Key，同一网络重试保留原键和正文。不得为每次HTTP尝试重生键。
- 文件用 wx.uploadFile；其他用统一JSON请求器。统一读取 data 或 error，不能只看HTTP是否200。
- 401仅一次重新登录，重新取得上下文。只有相同用户且操作仍适用时才能按原键继续，不能跨用户自动重放；409需要业务处理。
- 禁止在前端保存AppSecret、数据库连接、签名密钥或自造角色。角色来自当前家庭；切家庭必须清除旧家庭页面缓存与草稿上下文。
- 500/503/网络超时不能弹成功提示。超时可查个人菜单确认是否已提交，或按原键重试。
- GET刷新不覆盖未提交表单。审核页可见时每15秒刷新无编辑状态；有编辑时只提示数据变化。onHide停轮询，onShow刷新。
- 不需要WebSocket。页面加载中、空数据、失败重试、无权限、已过期、历史只读都必须有明确状态。
- types内null是明确空值，PATCH省略是保留。ID一律字符串，不能转数字。number份数按一位小数输入和显示，实际精度由后端Decimal校验。

## 范围及提交要求

前端代码建议集中 miniprogram/；框架选择不改变协议。请提交页面、组件、独立API模块、环境配置样例、Mock隔离开关、运行说明、完成的验收场景及未验证项。

当前后端尚未运行，无可用测试账号或真实API地址。样例可用于页面开发；前端就绪不能宣称真实联调通过。后续由Codex提供实际环境并共同执行验收场景。
