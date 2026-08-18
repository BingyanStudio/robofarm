// 版本号与更新日志管理。
// - 版本号在页面顶部标题栏总是展示 (灰色小字)
// - 进入网页时检查 localStorage:
//   1. 无版本号 (首次进入) → 自动展开右侧 API 手册
//   2. 版本号更老或无法识别 → 展示更新日志
//   3. 写入当前版本号 (供下次对比)
import { el, button, modal } from './ui';

export const VERSION = '0.1.2';
export const VERSION_KEY = 'robofarm.version';

export interface UpdateEntry {
  version: string;
  title: string;
  items: string[];
}

/** 更新日志 (按版本从新到旧) */
export const UPDATE_LOG: UpdateEntry[] = [
  {
    version: '0.1.2',
    title: 'v0.1.2',
    items: [
      '新作物: 水仙 (种在水池, 生长中每 3 周期自动给周围缺水作物浇水, 带淡蓝特效) / 西瓜 / 紫云英 / 香菇',
      '新操作: ChangeTile (3 能量转换脚下地块为土地/水池/沙地, 需相邻同类型地块)',
      '数值同步: 小麦 (收获 120 / 30 周期)、南瓜 (收获 500)',
      '排行榜: 金色皇冠按钮, 自己的成绩高亮',
      '提交优化: 确认弹窗无关闭按钮, 提交后显示加载圈, 完成自动弹排行榜',
      '首次进入: 自动展开 API 手册并弹出更新日志',
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
