// 全量业务契约 Mock 数据库（完全对齐 openapi-v1.json 与《Gemini 前端交接 V1》）

const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// 初始数据状态
const mockDB = {
  currentUser: {
    id: "user_zhang",
    displayName: "张三"
  },
  token: "mock_jwt_token_zhang_san_2026",
  expiresAt: new Date(Date.now() + 7200 * 1000).toISOString(),
  
  families: [
    {
      id: "fam_1",
      name: "幸福三叶草之家",
      memberId: "m1",
      role: "ADMIN"
    },
    {
      id: "fam_2",
      name: "周末家庭美食小分队",
      memberId: "m10",
      role: "MEMBER"
    }
  ],

  members: {
    "fam_1": [
      { id: "m1", displayName: "张三", role: "ADMIN", status: "ACTIVE", joinedAt: "2026-08-01T08:00:00Z" },
      { id: "m2", displayName: "李四", role: "MEMBER", status: "ACTIVE", joinedAt: "2026-08-05T09:30:00Z" },
      { id: "m3", displayName: "王五", role: "MEMBER", status: "ACTIVE", joinedAt: "2026-08-10T12:00:00Z" },
      { id: "m4", displayName: "赵六", role: "MEMBER", status: "ACTIVE", joinedAt: "2026-08-15T18:20:00Z" },
      { id: "m5", displayName: "小明", role: "MEMBER", status: "ACTIVE", joinedAt: "2026-09-01T08:00:00Z" }
    ]
  },

  // 菜品库
  dishes: {
    "fam_1": [
      {
        id: "dish_1",
        name: "红烧肉",
        tag: "招牌",
        category: "下饭菜",
        description: "农家五花肉慢火细煨，软糯入味、肥而不腻，经典家传好味道。",
        image: { fileId: "file_hshr", url: "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop", expiresAt: "2026-09-12T00:00:00Z" },
        isAvailable: true,
        kind: "PERMANENT",
        originSessionId: null,
        version: 2,
        deletedAt: null,
        variants: [
          {
            id: "variant_1",
            name: "普通版",
            portionDescription: "一份约供两人分享，酱香微甜",
            description: "传统配方，葱姜冰糖收汁",
            isAvailable: true,
            version: 1,
            deletedAt: null
          },
          {
            id: "variant_2",
            name: "少油版",
            portionDescription: "一份约供两人分享，先焯后烤去脂",
            description: "控脂少糖，口感清爽韧香",
            isAvailable: true,
            version: 1,
            deletedAt: null
          },
          {
            id: "variant_1_spicy",
            name: "香辣微麻版",
            portionDescription: "一份约供两人，鲜辣开胃",
            description: "加入秘制鲜花椒慢煨",
            isAvailable: true,
            version: 1,
            deletedAt: null
          }
        ]
      },
      {
        id: "dish_5",
        name: "番茄炒蛋",
        tag: "热推",
        category: "家常菜",
        description: "自然成熟番茄鲜甜多汁，土鸡蛋滑嫩蓬松，酸甜黄金配比。",
        image: { fileId: "file_fqqd", url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop", expiresAt: "2026-09-12T00:00:00Z" },
        isAvailable: true,
        kind: "PERMANENT",
        originSessionId: null,
        version: 1,
        deletedAt: null,
        variants: [
          {
            id: "variant_7",
            name: "经典酸甜版",
            portionDescription: "一份约2人份，汁浓拌饭绝配",
            description: "番茄起沙，酸甜适口",
            isAvailable: true,
            version: 1,
            deletedAt: null
          },
          {
            id: "variant_8",
            name: "葱香微咸版",
            portionDescription: "一份约2人份，少糖更清口",
            description: "香葱提味，原汁原味",
            isAvailable: true,
            version: 1,
            deletedAt: null
          }
        ]
      },
      {
        id: "dish_6",
        name: "可乐鸡翅",
        tag: "人气",
        category: "下饭菜",
        description: "精选中翅两面煎金黄，可乐小火收汁，色泽红亮、骨肉分离。",
        image: { fileId: "file_kljc", url: "https://images.unsplash.com/photo-1527477378694-7cc757b54fa0?w=600&auto=format&fit=crop", expiresAt: "2026-09-12T00:00:00Z" },
        isAvailable: true,
        kind: "PERMANENT",
        originSessionId: null,
        version: 1,
        deletedAt: null,
        variants: [
          {
            id: "variant_9",
            name: "浓汁甜香版",
            portionDescription: "一盘8支，全家齐分享",
            description: "酱香浓郁，老少皆宜",
            isAvailable: true,
            version: 1,
            deletedAt: null
          }
        ]
      },
      {
        id: "dish_4_temp",
        name: "今日特别：清蒸鲈鱼",
        tag: "特供",
        category: "家常菜",
        description: "早市鲜活鲈鱼，葱丝热油滋润，肉质如蒜瓣嫩滑。",
        image: { fileId: "file_ly", url: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=600&auto=format&fit=crop", expiresAt: "2026-09-12T00:00:00Z" },
        isAvailable: true,
        kind: "TEMPORARY",
        originSessionId: "session_lunch_today",
        version: 1,
        deletedAt: null,
        variants: [
          {
            id: "variant_6_temp",
            name: "清蒸葱油",
            portionDescription: "整条约1.2斤",
            description: "极度新鲜，刺少肉嫩",
            isAvailable: true,
            version: 1,
            deletedAt: null
          }
        ]
      },
      {
        id: "dish_7",
        name: "宫保鸡丁",
        tag: "下饭",
        category: "家常菜",
        description: "嫩滑鸡腿肉丁搭配香脆花生米与葱白，糊辣荔枝口，回味无穷。",
        image: { fileId: "file_gbjd", url: "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=600&auto=format&fit=crop", expiresAt: "2026-09-12T00:00:00Z" },
        isAvailable: true,
        kind: "PERMANENT",
        originSessionId: null,
        version: 1,
        deletedAt: null,
        variants: [
          {
            id: "variant_10",
            name: "糊辣微甜版",
            portionDescription: "一份约2-3人份，经典传统川味",
            description: "葱香浓郁，酸甜微辣",
            isAvailable: true,
            version: 1,
            deletedAt: null
          }
        ]
      },
      {
        id: "dish_8",
        name: "地三鲜",
        tag: "素菜",
        category: "素菜",
        description: "茄子软糯、土豆粉绵、青椒脆甜，咸鲜浓郁、地道家常味。",
        image: { fileId: "file_dsx", url: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop", expiresAt: "2026-09-12T00:00:00Z" },
        isAvailable: true,
        kind: "PERMANENT",
        originSessionId: null,
        version: 1,
        deletedAt: null,
        variants: [
          {
            id: "variant_11",
            name: "少油家常版",
            portionDescription: "一盘约3人份，喷香下饭",
            description: "蒜香扑鼻，酱汁微裹",
            isAvailable: true,
            version: 1,
            deletedAt: null
          }
        ]
      },
      {
        id: "dish_2",
        name: "清炒广东菜心",
        tag: "清爽",
        category: "素菜",
        description: "嫩脆甜爽，蒜蓉微炝，碧绿生青。",
        image: { fileId: "file_cx", url: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop", expiresAt: "2026-09-12T00:00:00Z" },
        isAvailable: true,
        kind: "PERMANENT",
        originSessionId: null,
        version: 1,
        deletedAt: null,
        variants: [
          {
            id: "variant_3",
            name: "蒜蓉脆炒",
            portionDescription: "一盘约3人份",
            description: "大火快翻",
            isAvailable: true,
            version: 1,
            deletedAt: null
          },
          {
            id: "variant_4",
            name: "白灼清淡",
            portionDescription: "一盘约2-3人份",
            description: "滚水微烫配蒸鱼豉油",
            isAvailable: true,
            version: 1,
            deletedAt: null
          }
        ]
      },
      {
        id: "dish_3",
        name: "西红柿炖牛腩",
        tag: "暖胃",
        category: "汤羹",
        description: "新鲜番茄熬煮成浓汤，牛腩大块软烂浓香开胃。",
        image: { fileId: "file_nn", url: "https://images.unsplash.com/photo-1547496502-affa22d38842?w=600&auto=format&fit=crop", expiresAt: "2026-09-12T00:00:00Z" },
        isAvailable: true,
        kind: "PERMANENT",
        originSessionId: null,
        version: 1,
        deletedAt: null,
        variants: [
          {
            id: "variant_5",
            name: "酸甜浓郁版",
            portionDescription: "沙锅大煲，适宜全家拌饭",
            description: "双倍熟番茄慢炖",
            isAvailable: true,
            version: 1,
            deletedAt: null
          }
        ]
      }
    ]
  },

  // 餐次
  sessions: {
    "session_lunch_today": {
      id: "session_lunch_today",
      serviceDate: todayStr,
      mealType: "LUNCH",
      timezone: "Asia/Shanghai",
      serverTime: new Date().toISOString(),
      canSubmit: true,
      submitBlockedReason: null,
      reviewVersion: 7
    },
    "session_dinner_today": {
      id: "session_dinner_today",
      serviceDate: todayStr,
      mealType: "DINNER",
      timezone: "Asia/Shanghai",
      serverTime: new Date().toISOString(),
      canSubmit: true,
      submitBlockedReason: null,
      reviewVersion: 1
    }
  },

  // 购物车（按成员隔离）
  carts: {
    "session_lunch_today_m1": {
      sessionId: "session_lunch_today",
      version: 1,
      items: [
        {
          dishId: "dish_1",
          variantId: "variant_1_spicy",
          dishName: "红烧肉",
          variantName: "香辣微麻版",
          portionDescription: "加干辣椒与花椒，微麻下饭",
          image: { fileId: "file_hshr", url: "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop" },
          isSelectable: true,
          unavailableReason: null
        }
      ]
    },
    "session_lunch_today_m5": {
      sessionId: "session_lunch_today",
      version: 1,
      items: []
    }
  },

  // 个人提交（按成员隔离）
  personalMenus: {
    "session_lunch_today_m1": null,
    "session_lunch_today_m5": null
  },

  // 各成员当餐点单状态（per-member）
  memberSubmitState: {
    "session_lunch_today_m5": { canSubmit: true, submitBlockedReason: null }
  },

  // 审核状态数据（严格对齐交接文档：红烧肉 4人想吃，普通版3人、少油版2人）
  reviews: {
    "session_lunch_today": {
      session: {
        id: "session_lunch_today",
        serviceDate: todayStr,
        mealType: "LUNCH",
        timezone: "Asia/Shanghai",
        serverTime: new Date().toISOString(),
        canSubmit: true,
        submitBlockedReason: null,
        reviewVersion: 7
      },
      dishes: [
        {
          dishId: "dish_1",
          name: "红烧肉",
          kind: "PERMANENT",
          uniqueParticipantCount: 4, // 严格使用后端并集人数，不可简单3+2计算
          variants: [
            {
              itemId: "item_hshr_1",
              variantId: "variant_1",
              name: "普通版",
              portionDescription: "一份约供两人分享，酱香微甜",
              participantCount: 3,
              decision: "CONFIRMED",
              needsReview: true, // 已确认但新增需求待审核！必须同时显示已确认标记与待审标记
              plannedQuantity: 1.5,
              unit: "PORTION",
              reason: "",
              participants: [
                { memberId: "m1", displayName: "张三", note: "少放盐，多放点姜" },
                { memberId: "m2", displayName: "李四", note: "" },
                { memberId: "m3", displayName: "王五", note: "想吃软烂一点" }
              ],
              lastReviewedParticipantCount: 2,
              demandVersion: 3,
              reviewedDemandVersion: 2
            },
            {
              itemId: "item_hshr_2",
              variantId: "variant_2",
              name: "少油版",
              portionDescription: "一份约供两人分享，先焯后烤去脂",
              participantCount: 2,
              decision: "UNREVIEWED", // 未审核
              needsReview: true,
              plannedQuantity: null, // 份数为空，填写后才能确认
              unit: "PORTION",
              reason: "",
              participants: [
                { memberId: "m2", displayName: "李四", note: "" },
                { memberId: "m4", displayName: "赵六", note: "尽量少油" }
              ],
              lastReviewedParticipantCount: 0,
              demandVersion: 1,
              reviewedDemandVersion: 0
            }
          ]
        },
        {
          dishId: "dish_2",
          name: "清炒广东菜心",
          kind: "PERMANENT",
          uniqueParticipantCount: 3,
          variants: [
            {
              itemId: "item_cx_1",
              variantId: "variant_3",
              name: "蒜蓉脆炒",
              portionDescription: "一盘约3人份",
              participantCount: 3,
              decision: "UNREVIEWED",
              needsReview: true,
              plannedQuantity: null,
              unit: "PORTION",
              reason: "",
              participants: [
                { memberId: "m1", displayName: "张三", note: "" },
                { memberId: "m3", displayName: "王五", note: "" },
                { memberId: "m4", displayName: "赵六", note: "" }
              ],
              lastReviewedParticipantCount: 0,
              demandVersion: 1,
              reviewedDemandVersion: 0
            }
          ]
        },
        {
          dishId: "dish_4_temp",
          name: "今日特别：清蒸鲈鱼",
          kind: "TEMPORARY",
          uniqueParticipantCount: 2,
          variants: [
            {
              itemId: "item_temp_fish",
              variantId: "variant_6_temp",
              name: "清蒸葱油",
              portionDescription: "整条约1.2斤",
              participantCount: 2,
              decision: "UNREVIEWED",
              needsReview: true,
              plannedQuantity: null,
              unit: "PORTION",
              reason: "",
              participants: [
                { memberId: "m2", displayName: "李四", note: "新鲜葱油" },
                { memberId: "m3", displayName: "王五", note: "" }
              ],
              lastReviewedParticipantCount: 0,
              demandVersion: 1,
              reviewedDemandVersion: 0
            }
          ]
        }
      ]
    }
  },

  invites: [
    {
      id: "inv_1",
      role: "MEMBER",
      code: "inv_abc1234567890abcdef123456789",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      status: "ACTIVE",
      redemptionCount: 0
    }
  ],

  operations: [
    {
      id: "op_1",
      actorMemberId: "m1",
      actorName: "张三",
      action: "MENU_REVIEW",
      resourceId: "session_lunch_today",
      reason: "",
      summary: "确认红烧肉普通版 1.5 份",
      createdAt: new Date(Date.now() - 3600 * 1000).toISOString()
    },
    {
      id: "op_2",
      actorMemberId: "m1",
      actorName: "张三",
      action: "TEMPORARY_CREATE",
      resourceId: "dish_4_temp",
      reason: "",
      summary: "新增当餐临时菜：清蒸鲈鱼",
      createdAt: new Date(Date.now() - 7200 * 1000).toISOString()
    }
  ]
};

module.exports = mockDB;