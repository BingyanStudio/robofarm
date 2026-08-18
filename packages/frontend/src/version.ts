// 版本号与更新日志管理。
// - 版本号在页面顶部标题栏总是展示 (灰色小字)
// - 进入网页时检查 localStorage:
//   1. 无版本号 (首次进入) → 自动展开右侧 API 手册
//   2. 版本号更老或无法识别 → 展示更新日志
//   3. 写入当前版本号 (供下次对比)
import { el, button, modal } from './ui';

export const VERSION = '0.1.5';
export const VERSION_KEY = 'robofarm.version';

export interface UpdateEntry {
  version: string;
  title: string;
  items: string[];
}

/** 更新日志 (按版本从新到旧) */
export const UPDATE_LOG: UpdateEntry[] = [
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
    for (const item of entry.items) list.append(el('li', { text: item }));
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
