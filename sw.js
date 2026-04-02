// HayDay Ad Timer — Service Worker
// Fires system notifications when the timer cycle is due

const CACHE = 'hayday-timer-v1';

// ── INSTALL & CACHE ──
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// ── RECEIVE MESSAGE FROM MAIN APP ──
// Main app sends { type, startEpoch, intervalMin, alertBeforeSec, running }
let timerState = null;
let tickInterval = null;

self.addEventListener('message', e => {
  const msg = e.data;

  if (msg.type === 'START') {
    timerState = {
      startEpoch:    msg.startEpoch,
      intervalMin:   msg.intervalMin,
      alertBeforeSec: msg.alertBeforeSec,
      shownForCycle: -1
    };
    startTicking();
  }

  if (msg.type === 'STOP') {
    timerState = null;
    stopTicking();
  }

  if (msg.type === 'UPDATE') {
    if (timerState) {
      timerState.intervalMin    = msg.intervalMin;
      timerState.alertBeforeSec = msg.alertBeforeSec;
    }
  }
});

function startTicking() {
  stopTicking(); // clear any old interval
  tickInterval = setInterval(tick, 1000);
}

function stopTicking() {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
}

async function tick() {
  if (!timerState) return;

  const now         = Date.now();
  const elapsed     = now - timerState.startEpoch;
  const intervalMs  = timerState.intervalMin * 60 * 1000;
  const alertMs     = timerState.alertBeforeSec * 1000;

  const cycleIdx    = Math.floor(elapsed / intervalMs);
  const posInCycle  = elapsed - cycleIdx * intervalMs;
  const msLeft      = intervalMs - posInCycle;

  if (msLeft <= alertMs && timerState.shownForCycle !== cycleIdx) {
    timerState.shownForCycle = cycleIdx;

    // Check if app is in foreground — if yes, let the app handle the in-app popup
    // If no (user is in HayDay) — fire a system notification
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appVisible = allClients.some(c => !c.hidden && c.visibilityState === 'visible');

    if (appVisible) {
      // Tell the page to show its own in-app popup
      allClients.forEach(c => c.postMessage({ type: 'SHOW_POPUP', alertBeforeSec: timerState.alertBeforeSec }));
    } else {
      // Fire system notification (visible over HayDay or any other app)
      fireNotification(timerState.alertBeforeSec);
    }
  }
}

function fireNotification(sec) {
  self.registration.showNotification('🌾 Best Time for Ad!', {
    body: `Place your ad now — newspaper refreshes in ~${sec}s!`,
    icon: './icon.png',
    badge: './icon.png',
    tag: 'hayday-ad-alert',          // replaces previous if still showing
    renotify: true,
    vibrate: [120, 60, 120],
    requireInteraction: false,        // auto-dismisses
    silent: false
  });
}

// Clicking the notification brings app to foreground
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow('./');
    })
  );
});
