// 应用入口 + 极简 hash 路由。
import { startScreen } from './screens/start';
import { menuScreen } from './screens/menu';
import { singleScreen } from './screens/single';
import { simulateScreen } from './screens/simulate';
import { matchScreen } from './screens/match';
import { battleScreen } from './screens/battle';
import { replayScreen } from './screens/replay';
import { spectateScreen } from './screens/spectate';
import { mountApiManual } from './api-manual';

const app = document.getElementById('app')!;

// 全局右侧 API 手册边栏 (所有界面可用, 默认收起)
mountApiManual();

function route(): void {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, queryStr] = hash.split('?');
  const params = new URLSearchParams(queryStr ?? '');
  switch (path) {
    case '':
    case 'start':
      startScreen(app);
      break;
    case 'menu':
      menuScreen(app);
      break;
    case 'single':
      singleScreen(app);
      break;
    case 'simulate':
      simulateScreen(app);
      break;
    case 'match':
      matchScreen(app);
      break;
    case 'battle':
      battleScreen(app, params);
      break;
    case 'replay':
      replayScreen(app, params);
      break;
    case 'spectate':
      spectateScreen(app);
      break;
    default:
      startScreen(app);
  }
}

window.addEventListener('hashchange', route);
route();
