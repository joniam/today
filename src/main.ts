import './styles.css';

const root = document.getElementById('app');
if (root) {
  // Scaffold only. Real UI lands in Phase 1.
  root.textContent = 'today';
}

// Build info for the settings sheet, wired up in Phase 10.
export const buildInfo = {
  sha: __BUILD_SHA__,
  time: __BUILD_TIME__,
};
