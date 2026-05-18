import './styles.css';
import { init } from './render';
import { initPwa } from './pwa';
import { startEngine } from './sync/engine';
import { loadState } from './sync/storage';

export const buildInfo = {
  sha: __BUILD_SHA__,
  time: __BUILD_TIME__,
};

initPwa();

loadState().then(() => {
  const root = document.getElementById('app');
  if (root) {
    init(root);
    startEngine();
  }
}).catch((err) => {
  console.error('[storage] failed to load state, starting empty', err);
  const root = document.getElementById('app');
  if (root) {
    init(root);
    startEngine();
  }
});
