// 版本号与更新日志管理。
// - 版本号在页面顶部标题栏总是展示 (灰色小字)
// - 进入网页时检查 localStorage:
//   1. 无版本号 (首次进入) → 自动展开右侧 API 手册
//   2. 版本号更老或无法识别 → 展示更新日志
//   3. 写入当前版本号 (供下次对比)
import { el, button, modal } from './ui';

export const VERSION = '1.0.1';
export const VERSION_KEY = 'robofarm.version';

export interface UpdateEntry {
  version: string;
  title: string;
  items: string[];
}

/** 更新日志 (按版本从新到旧) */
export const UPDATE_LOG: UpdateEntry[] = [
  {
    version: '1.0.1',
    title: 'v1.0.1',
    items: [
      '## 性能与稳定性',
      '单人验证增加全局并发上限 (SINGLE_MAX_CONCURRENT, 默认 4, 超限返回繁忙); 预留每用户每分钟提交限流 (SINGLE_SUBMIT_LIMIT_PER_MIN, 默认不限流, 超限返回 429)',
      '首次编译会下载编译器 (esbuild), 日志中明确提示"首次编译, 正在下载编译器…"',
      '## 界面',
      '多人竞技左侧面板: 出战状态与"模拟竞技 / 上传代码"按钮移到"出战代码"栏右对齐; "上传代码"按钮改为绿色 accent',
      '竞技模式金钱显示: 对方金钱改为整段红色 "对方: xxx" (原"对方"金色、"数字"红色)',
      '## 安全',
      'GitHub 登录最小权限: 移除 read:user scope (仅通过 GET /user 获取用户名)',
      '## 重构',
      '抽取 GameRunner 统一单人种植 / 模拟竞技的回合循环 (编译→开始→步进/暂停/调速→结束), 消除两处重复实现',
    ],
  },
  {
    version: '1.0.0',
    title: 'v1.0.0',
    items: [
      '## 新操作',
      'PlantRow / PlantCol: 消耗 3 能量按数组顺序种植整行/列, 自动跳过无法种植的格子',
      'Teleport: 传送到任意位置, 消耗 ceil(欧氏距离) 能量; 竞技模式仅限己方半场内',
      'NewDrone: 花费 4000 金钱在指定位置创建新无人机 (上限: 单人 2 / 竞技 3, 下一回合开始执行代码)',
      '## 平衡性调整',
      '回合上限: 单人/竞技模式默认回合数 300 → 500',
      '香菇: 成熟后按上右下左顺序分 4 回合各扩散 1 株; 需浇水; 总生长周期在种植时动态计算 (20 + 2 × 场上香菇总数, 越多长得越慢)',
      '紫云英: 成本 100 / 收获 120 / 160 周期, 生长中每回合加速周围作物',
      '西瓜: 成本 1000 / 收获 1800 / 100 周期; 移除沙地免疫 (沙地生长同样 ×1.5)',
      '行/列范围操作 (种植/收割/浇灌/拦截) 范围缩短为以施法点为中心的 3 格',
      'ChangeTile 能量消耗提升至 6',
      '新机制 沙漠化: 收获的格子相邻有沙地时转化为沙地 (仅蚕食土地)',
      '新机制 间作: 四方向 ≥2 个不同种类作物时, 收获收益 +20%',
      '## 大版本迁移',
      '排行榜: 按大版本分 Tab (V0.x 时代的排行榜已冻结保留), 前三名用奖牌 Emoji 标注',
      '多人竞技: 上传代码池已清空 (所有玩家恢复未上传状态)',
      '## 界面改进',
      '主菜单全新布局: logo 替换大标题, 单人/多人两个大按钮居中, 其余入口平铺下方, 返回菜单改为图标按钮',
      '"模拟竞技"入口移入多人竞技页面 ("上传出战代码"左侧)',
      '回放页面: 未选择回放时 "选择回放" 按钮居中醒目展示',
      '页面整体不再滚动: 长代码不再把整个页面撑出滚动条 (各面板内部自行滚动)',
      '"单人模式" 更名为 "单人种植" (代码与文档同步); 排行榜按钮移除 👑 王冠 Emoji',
      '主菜单背景新增浅色动态发光',
      '主菜单 Logo 下方显示当前版本号 (灰色小字)',
      '修复: 返回菜单图标显示为裂图 (back.svg 此前为空文件, 已补充)',
      '修复: 按钮文字竖直居中 (中文/Emoji 混排时的基线偏移)',
      '修复: 首次点击"开始"编译期间 (远程拉取 esbuild) 禁用开始/步进按钮, 避免重复点击; 按钮显示"编译中…"',
      '回放界面: "播放"按钮绿色、"暂停"按钮红色 accent',
    ],
  },
  {
    version: '0.1.5',
    title: 'v0.1.5',
    items: [
      'MCP 新增 12 个后端 API 工具: 单人 (提交验证 / 验证状态 / 提交历史 / 排行榜 / 回放下载) 与竞技 (出战状态 / 上传代码 / 玩家列表 / 发起对战 / 观战房间 / 历史对局 / 回放下载)',
      'MCP 调用改进: 请求失败返回明确错误, 未登录时提示先完成 GitHub 登录流程',
    ],
  },
  {
    version: '0.1.4',
    title: 'v0.1.4',
    items: [
      'AI 接入: 新增 /llm.txt (全部游戏文档拼接, LLM 可直接抓取) 与 /api-docs (后端 API 文档)',
      'MCP 卡片: 改为"支持两种方式接入" (llm.txt / MCP), 均可点击复制',
      '加速: 新增 ×8 档位, 回合间延迟取 0.1s 与程序实际执行时间的最大值',
      '香菇描述更新: 成熟时向上下左右四格种下新的香菇',
    ],
  },
  {
    version: '0.1.3',
    title: 'v0.1.3',
    items: [
      '回放导出: 单人本地 (结束弹窗"保存回放") / 服务器验证 ("我的成绩"下载) / 竞技历史 (下载) 均可导出 JSON 回放文件',
      '回放导入: 回放界面新增"导入回放记录", 可载入本地回放文件播放; 主菜单新增"回放"入口',
      '回放播放增强: 复用游戏内事件管线, 支持移动动画 / 浇水收获拦截特效; 回合 0 显示初始状态',
      '模拟竞技: 支持 ×2 / ×4 加速',
    ],
  },
  {
    version: '0.1.2',
    title: 'v0.1.2',
    items: [
      '新作物: 水仙 (种在水池, 自动给周围缺水作物浇水, 带淡蓝特效) / 西瓜 / 紫云英 / 香菇',
      '新操作: ChangeTile (3 能量转换脚下地块为土地/水池/沙地, 需相邻同类型地块)',
      '数值同步: 小麦 (收获 120 / 30 周期)、南瓜 (收获 500)',
      '排行榜: 金色皇冠按钮, 自己的成绩高亮',
      '提交优化: 确认弹窗无关闭按钮, 提交后显示加载圈, 完成自动弹排行榜',
      '首次进入: 自动展开 API 手册并弹出更新日志',
      '水仙加强: 生长中改为每回合自动给邻格缺水作物浇水一次 (原为每 3 周期)',
      '取水优化: CollectWater 一次取满 5 格水 (原为每次 1 格)',
    ],
  },
  {
    version: '0.1.1',
    title: 'v0.1.1',
    items: [
      '能量机制: 新增 Charge / HarvestRow / HarvestCol / WaterRow / WaterCol / InterceptRow / InterceptCol 操作',
      '新地块沙地: 草莓/葡萄/南瓜可种植, 生长周期 ×1.5; 更新地图布局',
      '视觉效果: 浇水/收获/拦截/充能 0.2s 淡出特效',
      '对战修复: 对手 Move 坐标换算、重复开房间限制、观战列表过滤已结束对局',
      '提交按钮改金黄色并靠右, 提交前增加确认弹窗',
      '对方金钱以淡红色展示',
      '初始资金调整为 20',
    ],
  },
];

function versionOf(v: string): string {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? `${m[1]}.${m[2]}.${m[3]}` : '';
}

function isKnownVersion(stored: string): boolean {
  const s = versionOf(stored);
  const cur = versionOf(VERSION);
  return s !== '' && s === cur;
}

/** 展示更新日志弹窗 */
export function showUpdateLog(): void {
  const body = el('div', { class: 'update-log' });
  for (const entry of UPDATE_LOG) {
    const list = el('ul', { class: 'doc-list' });
    for (const item of entry.items) {
      // 以 "## " 开头的条目渲染为加粗小标题 (分组)
      if (item.startsWith('## ')) {
        list.append(el('li', { class: 'update-group', text: item.slice(3) }));
      } else {
        list.append(el('li', { text: item }));
      }
    }
    body.append(el('h4', { text: entry.title }), list);
  }
  const m = modal('更新日志', body);
  body.append(el('div', { class: 'row' }, [button('知道了', () => m.close())]));
}

/** 进入网页时检查版本号 (首次自动展开 API 手册, 版本变更展示更新日志)。 */
export function checkVersionOnLoad(autoExpandManual: () => void): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(VERSION_KEY);
  } catch {
    // localStorage 不可用 (隐私模式等) 时静默跳过
  }
  if (stored === null) {
    // 首次进入: 自动展开右侧 API 手册, 同时弹出更新日志
    autoExpandManual();
    showUpdateLog();
  } else if (!isKnownVersion(stored)) {
    // 版本更老或无法识别: 展示更新日志
    showUpdateLog();
  }
  try {
    localStorage.setItem(VERSION_KEY, VERSION);
  } catch {
    // 忽略写入失败
  }
}
