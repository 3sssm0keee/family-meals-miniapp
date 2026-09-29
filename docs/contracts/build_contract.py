"""Generate the reviewable V1 API contract; Python standard library only."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
S = {}
def ref(n): return {'$ref': '#/components/schemas/' + n}
def string(n=200, **kw): return {'type': 'string', 'maxLength': n, **kw}
def integer(minimum=0): return {'type': 'integer', 'minimum': minimum}
def enum(*values): return {'type': 'string', 'enum': list(values)}
def arr(item, **kw): return {'type': 'array', 'items': item, **kw}
def nullable(item): return {'anyOf': [item, {'type': 'null'}]}
def obj(props, required=None, **kw):
    return {'type': 'object', 'properties': props, 'required': list(props) if required is None else required, 'additionalProperties': False, **kw}
ID = string(64, minLength=1, pattern='^[A-Za-z0-9_-]+$')
TS = {'type': 'string', 'format': 'date-time', 'pattern': 'Z$'}
DATE = {'type': 'string', 'format': 'date'}
NOTE = string(500)
QTY = {'type': 'number', 'minimum': 0.1, 'maximum': 999.9, 'multipleOf': 0.1}
BOOL = {'type': 'boolean'}
ROLE = enum('ADMIN', 'MEMBER', 'GUEST')
def add(n, p, required=None, **kw): S[n] = obj(p, required, **kw); return ref(n)

add('User', {'id': ID, 'displayName': string(40, minLength=1)})
S['User']['properties']['avatar'] = nullable(ref('Image'))
add('LoginRequest', {'code': string(256, minLength=1)})
add('LoginResult', {'token': string(4096, minLength=1), 'expiresAt': TS, 'user': ref('User')})
add('ProfileUpdate', {'displayName': string(40, minLength=1)})
add('FamilyCreate', {'name': string(60, minLength=1)})
add('Family', {'id': ID, 'name': string(60), 'memberId': ID, 'role': ROLE})
S['Family']['properties']['accessExpiresAt'] = nullable(TS)
add('Member', {'id': ID, 'displayName': string(40), 'role': ROLE, 'status': enum('ACTIVE', 'LEFT', 'REMOVED'), 'joinedAt': TS})
S['Member']['properties']['avatar'] = nullable(ref('Image'))
add('RoleUpdate', {'role': ROLE})
add('Ok', {'ok': {'const': True, 'type': 'boolean'}})
add('Image', {'fileId': ID, 'url': {'type': 'string', 'format': 'uri'}, 'expiresAt': TS})
add('FileResult', {'fileId': ID, 'url': {'type': 'string', 'format': 'uri'}, 'expiresAt': TS, 'mimeType': enum('image/jpeg', 'image/png', 'image/webp'), 'sizeBytes': integer(1)})
cleanup_status = enum('PENDING','DELETING','OBJECT_DELETED','FAILED','SKIPPED','COMPLETED')
add('FileCleanupCandidate', {'fileId': ID, 'sizeBytes': integer(1), 'createdAt': TS, 'taskId': nullable(ID), 'taskStatus': nullable(cleanup_status), 'canCleanup': BOOL})
add('FileCleanupTask', {'taskId': ID, 'fileId': ID, 'status': cleanup_status, 'attemptCount': integer(), 'lastErrorCode': nullable(string(40)), 'createdAt': TS, 'updatedAt': TS})
add('FileCleanupRequested', {'taskId': ID})
variant_fields = {'name': string(40, minLength=1), 'portionDescription': string(200, minLength=1), 'description': string(500), 'isAvailable': BOOL}
add('VariantCreate', variant_fields)
add('VariantUpdate', {'expectedVersion': integer(1), **variant_fields}, ['expectedVersion'], minProperties=2)
add('Variant', {'id': ID, **variant_fields, 'version': integer(1), 'deletedAt': nullable(TS)})
dish_fields = {'name': string(60, minLength=1), 'description': string(1000), 'imageFileId': nullable(ID), 'isAvailable': BOOL}
add('DishCreate', {**dish_fields, 'variants': arr(ref('VariantCreate'), minItems=1, maxItems=20)})
add('DishUpdate', {'expectedVersion': integer(1), **dish_fields}, ['expectedVersion'], minProperties=2)
add('Dish', {'id': ID, 'name': string(60), 'description': string(1000), 'image': nullable(ref('Image')), 'isAvailable': BOOL, 'kind': enum('PERMANENT', 'TEMPORARY'), 'originSessionId': nullable(ID), 'version': integer(1), 'deletedAt': nullable(TS), 'variants': arr(ref('Variant'), maxItems=20)})
add('DishDeletionPreview', {'dishId': ID, 'name': string(60), 'expectedVersion': integer(1), 'deletedAt': nullable(TS), 'variantCount': integer(), 'cartItemCount': integer(), 'submittedItemCount': integer(), 'menuItemCount': integer(), 'pendingReviewItemCount': integer(), 'confirmedItemCount': integer(), 'hasImage': BOOL})
add('VersionRequest', {'expectedVersion': integer(1)})
S['Member']['properties']['accessExpiresAt'] = nullable(TS)
add('Session', {'id': ID, 'serviceDate': DATE, 'mealType': enum('LUNCH', 'DINNER'), 'timezone': {'const': 'Asia/Shanghai', 'type': 'string'}, 'serverTime': TS, 'canSubmit': BOOL, 'submitBlockedReason': nullable(enum('ALREADY_SUBMITTED', 'DATE_READ_ONLY')), 'reviewVersion': integer(1)})
S['Session']['properties']['canAppend'] = {'type': 'boolean', 'description': '当天且本人已有提交时可追加；旧服务缺省时客户端不得启用追加。'}
add('SessionEnsure', {'serviceDate': DATE, 'mealType': enum('LUNCH', 'DINNER')})
snapshot = {'dishId': ID, 'variantId': ID, 'dishName': string(60), 'variantName': string(40), 'portionDescription': string(200)}
add('CartItem', {**snapshot, 'isSelectable': BOOL, 'unavailableReason': nullable(enum('DELETED', 'UNAVAILABLE', 'WRONG_SESSION'))})
S['CartItem']['properties']['note'] = NOTE
add('Cart', {'sessionId': ID, 'version': integer(1), 'items': arr(ref('CartItem'), maxItems=100)})
add('SubmitRequest', {'variantIds': arr(ID, minItems=1, maxItems=100, uniqueItems=True), 'note': NOTE})
add('AppendRequest', {'variantIds': arr(ID, minItems=1, maxItems=100, uniqueItems=True), 'expectedVersion': integer(1)})

decision_fields = {'decision': enum('UNREVIEWED', 'CONFIRMED', 'CANCELLED'), 'needsReview': BOOL, 'plannedQuantity': nullable(QTY), 'unit': {'type': 'string', 'const': 'PORTION'}, 'reason': string(200)}
add('PersonalItem', {**snapshot, **decision_fields})
S['PersonalItem']['properties']['dishDeleted'] = BOOL
S['PersonalItem']['properties'].update({'note': NOTE, 'noteUpdatedAt': nullable(TS), 'noteUpdatedAfterReview': BOOL})
add('PersonalMenu', {'id': ID, 'sessionId': ID, 'submittedAt': TS, 'note': NOTE, 'version': integer(1), 'items': arr(ref('PersonalItem'), minItems=1, maxItems=100)})
add('NoteUpdate', {'note': NOTE, 'expectedVersion': integer(1)})
add('Participant', {'memberId': ID, 'displayName': string(40), 'note': NOTE})
S['Participant']['properties'].update({'legacyNote': NOTE, 'noteUpdatedAt': nullable(TS), 'noteUpdatedAfterReview': BOOL})
public_variant = {'itemId': ID, 'variantId': ID, 'name': string(40), 'portionDescription': string(200), 'participantCount': integer(), **decision_fields}
add('MenuVariant', public_variant)
add('ReviewVariant', {**public_variant, 'participants': arr(ref('Participant')), 'lastReviewedParticipantCount': integer(), 'demandVersion': integer(1), 'reviewedDemandVersion': integer()})
for prefix, variant in [('Menu', 'MenuVariant'), ('Review', 'ReviewVariant')]:
    add(prefix+'Dish', {'dishId': ID, 'name': string(60), 'kind': enum('PERMANENT', 'TEMPORARY'), 'uniqueParticipantCount': integer(), 'variants': arr(ref(variant))})
    S[prefix+'Dish']['properties']['dishDeleted'] = BOOL
    add(prefix, {'session': ref('Session'), 'dishes': arr(ref(prefix+'Dish'))})
S['Review']['properties']['hasTemporaryAdditions'] = {'type': 'boolean', 'description': '服务端依据首个审核批次和当前需求计算：审批后首次新增且尚未审核的菜品版本（包括零需求临时菜），或已审核版本新增点餐人。单纯备注变化不算加菜。可选字段兼容旧响应；新后端始终返回。'}
S['Review']['properties']['hasNoteUpdates'] = BOOL
add('ConfirmItem', {'itemId': ID, 'decision': {'type': 'string', 'const': 'CONFIRMED'}, 'plannedQuantity': QTY, 'reason': string(200)})
add('CancelItem', {'itemId': ID, 'decision': {'type': 'string', 'const': 'CANCELLED'}, 'plannedQuantity': {'type': 'null'}, 'reason': string(200, minLength=1)})
S['ReviewItem'] = {'oneOf': [ref('ConfirmItem'), ref('CancelItem')]}
add('ReviewRequest', {'expectedReviewVersion': integer(1), 'items': arr(ref('ReviewItem'), minItems=1, maxItems=100)})
add('ReviewResult', {'batchId': ID, 'review': ref('Review'), 'notificationRecordCount': integer()})
add('InviteCreate', {'role': enum('MEMBER', 'GUEST')})
invite_fields = {'id': ID, 'role': enum('MEMBER', 'GUEST'), 'createdAt': TS, 'expiresAt': TS, 'status': enum('ACTIVE', 'EXPIRED', 'REVOKED'), 'redemptionCount': integer()}
add('Invite', invite_fields)
add('InviteCreated', {**invite_fields, 'code': string(128, minLength=32)})
add('RedeemRequest', {'code': {'anyOf': [enum('REPLACE_GUEST_CODE','REPLACE_LEGACY_CODE'), string(128, minLength=32)]}})
add('RedeemResult', {'family': ref('Family'), 'alreadyJoined': BOOL})
add('SubscriptionConfig', {'enabled': BOOL, 'templateId': nullable(string(200, minLength=1))})
add('SubscriptionResultRequest', {'templateId': string(200, minLength=1), 'result': enum('ACCEPT', 'REJECT', 'BAN')})
add('Notification', {'id': ID, 'batchId': ID, 'status': enum('PENDING', 'SENT', 'FAILED', 'SKIPPED', 'UNKNOWN'), 'createdAt': TS, 'sentAt': nullable(TS), 'reasonCode': nullable(enum('NO_CONSENT', 'CHANNEL_DISABLED', 'PROVIDER_REJECTED', 'RETRY_EXHAUSTED', 'DELIVERY_UNCERTAIN', 'MEMBER_INACTIVE'))})
add('AuditItem', {'id': ID, 'actorMemberId': ID, 'actorName': string(40), 'action': enum('DISH_CREATE', 'DISH_UPDATE', 'DISH_DELETE', 'VARIANT_CREATE', 'VARIANT_UPDATE', 'VARIANT_DELETE', 'TEMPORARY_CREATE', 'DISH_PROMOTE', 'MENU_REVIEW', 'INVITE_CREATE', 'INVITE_REVOKE', 'MEMBER_ROLE_UPDATE', 'MEMBER_REMOVE', 'FILE_UPLOAD'), 'resourceId': ID, 'reason': string(200), 'summary': string(500), 'createdAt': TS})
codes = {
 '400': ['VALIDATION_ERROR', 'INVALID_LOGIN_CODE'],
 '401': ['UNAUTHENTICATED'], '403': ['FORBIDDEN', 'MEMBERSHIP_INACTIVE'],
 '404': ['NOT_FOUND'],
 '409': ['ALREADY_SUBMITTED', 'REVIEW_VERSION_CONFLICT', 'VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'REQUEST_IN_PROGRESS', 'DATE_READ_ONLY', 'VARIANT_UNAVAILABLE', 'LAST_ADMIN', 'INVITE_ALREADY_USED', 'DUPLICATE_NAME', 'TEMPORARY_ONLY'],
 '410': ['INVITE_EXPIRED', 'INVITE_REVOKED'], '413': ['FILE_TOO_LARGE'],
 '415': ['UNSUPPORTED_MEDIA_TYPE'], '429': ['RATE_LIMITED'],
 '500': ['INTERNAL_ERROR'], '503': ['DEPENDENCY_UNAVAILABLE']
}
add('ErrorDetails', {'fieldErrors': arr(obj({'field': string(200), 'message': string(200)})), 'currentVersion': integer(1), 'resourceId': ID}, [])
add('Error', {'error': obj({'code': enum(*sum(codes.values(), [])), 'message': string(500), 'details': ref('ErrorDetails')}), 'requestId': ID})

API = {'openapi': '3.1.0', 'info': {'title': '家庭点饭系统 API', 'version': '1.0.0', 'description': 'V1 开发契约，尚未实现。业务规则见同目录业务规则与数据字典-v1.md。路径服务器为相对地址，不代表已部署环境。'}, 'servers': [{'url': '/api/v1'}], 'security': [{'bearerAuth': []}], 'paths': {}, 'components': {'securitySchemes': {'bearerAuth': {'type': 'http', 'scheme': 'bearer', 'bearerFormat': 'JWT'}}, 'schemas': S}}
def query(name, schema, required=False): return {'name': name, 'in': 'query', 'required': required, 'schema': schema}
PAGE = [query('page', {'type':'integer','minimum':1,'default':1}), query('pageSize', {'type':'integer','minimum':1,'maximum':100,'default':20})]
def page(name): return obj({'items': arr(ref(name)), 'page': integer(1), 'pageSize': integer(1), 'total': integer()})
def op(method, path, name, summary, out, body=None, params=None, role='MEMBER', desc='', status=200, idem=None, multipart=False, errors=None):
    parameters = [{'name': n, 'in': 'path', 'required': True, 'schema': ID} for n in re.findall(r'{(\w+)}', path)] + (params or [])
    mut = method != 'get'
    if idem is None: idem = mut and name != 'login'
    if idem: parameters.append({'name':'Idempotency-Key','in':'header','required':True,'schema':string(128,minLength=16,pattern='^[A-Za-z0-9_-]+$'),'description':'同一操作重试复用原键；保存 24 小时。'})
    success = obj({'data': out, 'requestId': ID})
    responses = {str(status): {'description': '成功', 'content': {'application/json': {'schema': success}}}}
    default_errors = ['400','401','403','404','429','500','503'] + (['409'] if mut else [])
    for code in sorted(set(default_errors + (errors or []))):
        responses[code] = {'description': ' / '.join(codes[code]), 'content': {'application/json': {'schema':ref('Error')}}}
        if code == '429': responses[code]['headers'] = {'Retry-After': {'schema': integer(1), 'description':'等待秒数'}}
    operation = {'operationId': name, 'summary': summary, 'description': desc or summary, 'tags': [role], 'x-required-role': role, 'parameters': parameters, 'responses': responses}
    if role == 'PUBLIC': operation['security'] = []
    if body is not None: operation['requestBody'] = {'required': True, 'content': {'multipart/form-data' if multipart else 'application/json': {'schema':body}}}
    API['paths'].setdefault(path,{})[method] = operation

F='/families/{familyId}'
M=F+'/meal-sessions/{sessionId}'
A=F+'/admin'
op('post','/auth/login','login','微信登录',ref('LoginResult'),ref('LoginRequest'),role='PUBLIC',desc='使用新微信 code 换取 2 小时 token；失败需重新获取 code。无 refresh token。')
op('post','/me/avatar','uploadAvatar','保存本人头像',ref('User'),obj({'file':{'type':'string','format':'binary'}}),role='AUTHENTICATED',multipart=True,errors=['413','415'])
op('get','/me','getMe','当前用户',ref('User'),role='AUTHENTICATED')
op('patch','/me','updateMe','修改显示名',ref('User'),ref('ProfileUpdate'),role='AUTHENTICATED')
op('get','/me/families','listMyFamilies','我的有效家庭',arr(ref('Family')),role='AUTHENTICATED')
op('post','/families','createFamily','创建家庭',ref('Family'),ref('FamilyCreate'),role='AUTHENTICATED',status=201,desc='仅已有有效管理员身份的用户可创建家庭；首次管理员由服务器预置，注册邀请码不授予管理员权限。')
op('get',F+'/dishes','listDishes','可选菜品列表',page('Dish'),params=PAGE+[query('q',string(60)),query('sessionId',ID,True)],desc='只返回未删除、在售且至少有一个未删除在售规格的正式菜及该餐临时菜。按 createdAt DESC,id DESC 排序。')
op('get',F+'/dishes/{dishId}','getDish','可选菜品详情',ref('Dish'),params=[query('sessionId',ID,True)])
admin_dish_page = page('Dish')
admin_dish_page['properties']['selectableCount'] = {'type': 'integer', 'minimum': 0, 'description': '当前餐次可选菜数；省略 sessionId 时仅统计正式菜，不受分页、搜索及 includeDeleted 影响。'}
admin_dish_page['required'].append('selectableCount')
op('get',A+'/dishes','listAdminDishes','管理菜品列表',admin_dish_page,params=PAGE+[query('q',string(60)),query('includeDeleted',BOOL),query('onlyDeleted',BOOL),query('sessionId',ID)],role='ADMIN',desc='默认不含已删除；onlyDeleted=true 仅列历史软删除菜品，用于逐项清理。返回不可用项及所有版本。selectableCount 统计当前餐次可选菜，省略 sessionId 时仅统计正式菜。')
op('get',A+'/dishes/{dishId}/deletion-preview','getDishDeletionPreview','菜品删除影响预览',ref('DishDeletionPreview'),role='ADMIN',desc='展示菜名、当前版本、规格数、受影响购物车与历史点单、待审核和已确认菜单计数。确认后仍需用 expectedVersion 调用 deleteDish，服务端在事务内重新核验。')
op('get',A+'/dishes/{dishId}','getAdminDish','管理菜品详情',ref('Dish'),role='ADMIN')
op('post',A+'/dishes','createDish','新增正式菜品',ref('Dish'),ref('DishCreate'),role='ADMIN',status=201)
op('patch',A+'/dishes/{dishId}','updateDish','修改菜品',ref('Dish'),ref('DishUpdate'),role='ADMIN')
op('delete',A+'/dishes/{dishId}','deleteDish','物理删除菜品及规格',ref('Ok'),params=[query('expectedVersion',integer(1),True)],role='ADMIN',desc='事务内物理删除菜品及其规格；受影响的未提交购物车项清除并递增购物车版本。已提交点单及家庭菜单保留原菜品和规格 ID、名称、份量、备注及审核结果快照。历史菜名、规格或份量快照缺失时返回 409 VALIDATION_ERROR，不执行删除；图片文件另行清理。已软删除菜品也可在对应版本下逐项清理。')
op('post',A+'/dishes/{dishId}/variants','createVariant','新增版本',ref('Variant'),ref('VariantCreate'),role='ADMIN',status=201)
op('patch',A+'/dishes/{dishId}/variants/{variantId}','updateVariant','修改版本',ref('Variant'),ref('VariantUpdate'),role='ADMIN')
op('delete',A+'/dishes/{dishId}/variants/{variantId}','deleteVariant','软删除版本',ref('Ok'),params=[query('expectedVersion',integer(1),True)],role='ADMIN')
op('post',F+'/meal-sessions','ensureSession','获取或建立当天餐次',ref('Session'),ref('SessionEnsure'),desc='事务 get-or-create，同家庭同日期同餐次唯一。仅当天可建立。重复请求返回同一餐次，200。')
op('get',F+'/meal-sessions','listSessions','查询已有餐次',arr(ref('Session'),maxItems=2),params=[query('serviceDate',DATE,True),query('mealType',enum('LUNCH','DINNER'))],desc='只读，不隐式建记录。某日无记录返回空数组；可读取近六个月。')
op('get',M,'getSession','获取餐次详情',ref('Session'))
op('get',M+'/cart','getCart','我的购物车',ref('Cart'))
op('put',M+'/cart/items/{variantId}','addCartItem','加入一个版本',ref('Cart'),desc='集合式幂等添加，无数量、无请求正文；当天提交后仍可选择追加菜品。')
op('delete',M+'/cart/items/{variantId}','removeCartItem','移除一个版本',ref('Cart'),desc='不存在时仍成功；仅操作未提交的购物车，不移除已提交菜品。')
op('post',M+'/personal-menu','submitMenu','提交个人选择',ref('PersonalMenu'),ref('SubmitRequest'),status=201)
op('get',M+'/personal-menu','getPersonalMenu','查看我的提交',nullable(ref('PersonalMenu')),desc='未提交返回 data:null，不返回错误。')
op('post',M+'/personal-menu/items','appendMenu','追加个人选择',ref('PersonalMenu'),ref('AppendRequest'),desc='仅当天已提交者可追加；仅增加新版本，不删旧项、不改备注；总计最多100项。校验个人菜单版本，已有版本不重复计数，全部重复时无变化。追加原子更新需求和餐次审核版本；清理本次请求对应购物车项。')
op('patch',M+'/cart/items/{variantId}/note','updateCartItemNote','保存本餐次本人待提交菜品备注',ref('Cart'),ref('NoteUpdate'),desc='按购物车版本保存，可原子加入未选择的规格；不得修改已提交菜品。')
op('patch',M+'/personal-menu/items/{variantId}/note','updatePersonalItemNote','更新本餐次本人单道菜备注',ref('PersonalMenu'),ref('NoteUpdate'),desc='仅当天；按个人点单版本更新；保留审核决定和需求版本，审核后修改记录提醒，不触发重新审核。')
op('patch',M+'/personal-menu/note','updateNote','修改已提交备注',ref('PersonalMenu'),ref('NoteUpdate'))
op('get',M+'/menu','getFamilyMenu','家庭菜单',ref('Menu'))
op('get',A+'/meal-sessions/{sessionId}/review','getReview','管理员审核视图',ref('Review'),role='ADMIN')
op('post',A+'/meal-sessions/{sessionId}/review','reviewMenu','原子批量确认或取消',ref('ReviewResult'),ref('ReviewRequest'),role='ADMIN',desc='items 的 itemId 必须唯一且属于此餐。校验餐次版本，全部成功或全部回滚；部分审核允许，未选项保持不变。CONFIRMED 份数必填；CANCELLED 份数必须 null、原因非空。')
op('post',A+'/meal-sessions/{sessionId}/temporary-dishes','createTemporaryDish','新增当餐临时菜',ref('Dish'),ref('DishCreate'),role='ADMIN',status=201,desc='创建 TEMPORARY 菜及版本，并为每版本建立零参与人数 UNREVIEWED 菜单项，管理员随后审核。')
op('post',A+'/dishes/{dishId}/promote','promoteDish','临时菜转正式',ref('Dish'),ref('VersionRequest'),role='ADMIN')
add('FileUploadRequest', {'sizeBytes': {'type':'integer','minimum':1,'maximum':20971520}})
add('FileUploadComplete', {'ticket': string(2048,minLength=1)})
upload_fields=['key','q-sign-algorithm','q-ak','q-key-time','success_action_status','acl','policy','q-signature']
add('FileUploadTicket', {'url': {'type':'string','format':'uri'}, 'formData': obj({k:string(8192) for k in upload_fields+['x-cos-security-token']},required=upload_fields), 'expiresAt': TS, 'ticket':string(2048,minLength=1)})
op('post',A+'/files/uploads','createFileUpload','申请单文件 COS 直传签名',ref('FileUploadTicket'),ref('FileUploadRequest'),role='ADMIN',errors=['413'],desc='限定随机路径、精确大小和最长10分钟有效期；原图最大20MiB。需配置COS上传域名及pending前缀生命周期。')
op('post',A+'/files/uploads/complete','completeFileUpload','校验直传图片并登记',ref('FileResult'),ref('FileUploadComplete'),role='ADMIN',status=201,errors=['413','415'],desc='绑定申请用户和家庭；按真实内容验证，去元数据并等比缩至最长1600px JPEG，保存到另一个私有对象。重复完成返回同一fileId。')
op('post',A+'/files','uploadFile','上传菜品图片',ref('FileResult'),obj({'file':{'type':'string','format':'binary'}}),role='ADMIN',status=201,multipart=True,errors=['413','415'],desc='仅 JPEG/PNG/WebP，最大 5 MiB，按文件实际内容校验并去元数据。签名 URL 有效 15 分钟，fileId 持久使用。')
op('get',F+'/files/{fileId}','getFile','刷新图片访问地址',ref('FileResult'),desc='ADMIN 可取本家庭上传文件；其他成员仅可取已关联可见菜品的图片。私有存储，URL 到期重新请求。')
op('get',A+'/files/cleanup-candidates','listFileCleanupCandidates','无菜品引用的图片候选',page('FileCleanupCandidate'),params=PAGE,role='ADMIN',desc='仅列当前无菜品引用的文件元数据；canCleanup=false 表示其他用途仍在引用。候选列表不执行删除。')
op('get',A+'/file-cleanup-tasks/{taskId}','getFileCleanupTask','查看图片清理任务状态',ref('FileCleanupTask'),role='ADMIN')
op('post',A+'/files/{fileId}/cleanup','requestFileCleanup','请求清理无引用图片',ref('FileCleanupRequested'),role='ADMIN',status=202,desc='仅管理员可请求；服务端再次核对菜品与头像引用，登记可重试任务。文件删除与元数据清理分阶段执行；同一 fileId 复用同一 taskId，状态通过 getFileCleanupTask 查询。失败重试可复用原幂等键。')
op('post',A+'/invites','createInvite','生成 24 小时邀请码',ref('InviteCreated'),ref('InviteCreate'),role='ADMIN',status=201)
op('get',A+'/invites','listInvites','邀请码列表（不含明文）',page('Invite'),params=PAGE,role='ADMIN')
op('delete',A+'/invites/{inviteId}','revokeInvite','撤销邀请码',ref('Ok'),role='ADMIN',desc='重复撤销成功；不影响已经加入的成员。')
op('post','/invites/redeem','redeemInvite','兑换邀请码',ref('RedeemResult'),ref('RedeemRequest'),role='AUTHENTICATED',errors=['410'],desc='固定码 REPLACE_GUEST_CODE 注册从首次兑换起 24 小时有效的 GUEST，重复兑换不续期；管理员改为 MEMBER 或有效正式成员邀请可转正并清除到期时间，REPLACE_LEGACY_CODE 注册或升级为 ADMIN，均绑定指定 REGISTRATION_FAMILY_ID；普通码不降级已有身份，未配置时 503，非 ACTIVE 旧成员不可重入；普通随机邀请有效期内多人共用，每用户一次。同用户成功兑换后仍为有效成员时重复返回 alreadyJoined=true，即使邀请码随后过期。退出或被移除后旧码不能重新入群。')
op('get',F+'/members','listFamilyMembers','家庭成员名册',page('Member'),params=PAGE,desc='仅有效家庭成员可读；只返回未到期 ACTIVE 成员公开昵称与身份，不返回点餐备注。到期访客仅在管理员成员列表保留。')
op('get',A+'/members','listMembers','成员列表',page('Member'),params=PAGE+[query('status',enum('ACTIVE','LEFT','REMOVED'))],role='ADMIN')
op('patch',A+'/members/{memberId}','updateMemberRole','调整成员角色',ref('Member'),ref('RoleUpdate'),role='ADMIN')
op('delete',A+'/members/{memberId}','removeMember','移除成员',ref('Ok'),role='ADMIN')
op('delete',F+'/members/me','leaveFamily','退出家庭',ref('Ok'),desc='最后一个管理员不得退出。新键请求若已非成员则 403；原键重试按幂等规则返回原成功结果。')
op('get',F+'/notification-config','getNotificationConfig','取得微信订阅消息配置',ref('SubscriptionConfig'))
op('post',F+'/subscription-results','recordSubscriptionResult','记录客户端订阅结果',ref('Ok'),ref('SubscriptionResultRequest'),desc='只作意愿记录，不证明微信已授予发送权限；后端发送时以平台结果为准。')
op('get',F+'/notifications','listMyNotifications','当前成员通知记录',page('Notification'),params=PAGE)
op('get',A+'/operations','listOperations','管理操作审计',page('AuditItem'),params=PAGE+[query('sessionId',ID)],role='ADMIN')

# Readable route inventory is generated from the same source as OpenAPI.
ROOT.mkdir(parents=True, exist_ok=True)
(ROOT/'openapi-v1.json').write_text(json.dumps(API,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
rows=['# API 接口索引 V1','','所有路径前缀为 `/api/v1`。具体字段及响应以 openapi-v1.json 为准。','','| 方法 | 路径 | operationId | 权限 | 功能 |','| --- | --- | --- | --- | --- |']
for path, methods in API['paths'].items():
    for method, operation in methods.items(): rows.append(f"| {method.upper()} | `{path}` | `{operation['operationId']}` | {operation['x-required-role']} | {operation['summary']} |")
(ROOT/'接口索引-v1.md').write_text('\n'.join(rows)+'\n',encoding='utf-8')
print(f'Generated {sum(map(len,API["paths"].values()))} operations and {len(S)} schemas')
