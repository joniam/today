import { setSyncStatus } from './ui/statusDot';

let registration: ServiceWorkerRegistration | null = null;
let _updateAvailable = false;

export function updateAvailable(): boolean {
  return _updateAvailable;
}

export function checkForUpdate(): void {
  if (registration) void registration.update();
}

export function applyUpdate(): void {
  if (!registration?.waiting) return;
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function initPwa(): void {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/today/sw.js', { scope: '/today/' }).then((reg) => {
    registration = reg;

    function trackInstalling(worker: ServiceWorker): void {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          _updateAvailable = true;
          setSyncStatus('update');
        }
      });
    }

    if (reg.waiting && navigator.serviceWorker.controller) {
      _updateAvailable = true;
      setSyncStatus('update');
    }

    if (reg.installing) trackInstalling(reg.installing);

    reg.addEventListener('updatefound', () => {
      if (reg.installing) trackInstalling(reg.installing);
    });
  }).catch((err) => {
    console.warn('[pwa] SW registration failed:', err);
  });

  // Reload all tabs when the new SW takes over.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
