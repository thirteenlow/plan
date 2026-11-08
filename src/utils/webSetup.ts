/**
 * iPhone/iPad Safari zooms the page in when a text box with text under 16px gets focus, shifting the whole
 * layout. Adding maximum-scale=1 stops that auto-zoom (iOS still allows pinch-to-zoom). Other browsers keep
 * the default viewport so pinch-zoom isn't blocked there.
 */
if (typeof document !== 'undefined') {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const meta = document.querySelector('meta[name="viewport"]');
  const content = meta?.getAttribute('content') ?? '';
  if (ios && meta && !content.includes('maximum-scale')) meta.setAttribute('content', `${content}, maximum-scale=1`);

  // Home Screen app on iPhone/iPad: iOS can report the page as shorter than the screen (by about the status bar's
  // height), leaving a gap under the tab bar. The app fills the whole screen there, so size the page to it.
  const standalone = (navigator as { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  if (ios && standalone) {
    const fit = () => {
      // iPhone apps are always full screen; iPad ones can be in a resizable window, so trust the window there.
      const portrait = window.matchMedia('(orientation: portrait)').matches;
      const screenH = /iPhone|iPod/.test(navigator.userAgent) ? (portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)) : 0;
      const full = Math.max(window.innerHeight, document.documentElement.clientHeight, screenH);
      document.documentElement.style.setProperty('--app-height', `${full}px`);
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', () => setTimeout(fit, 250));
    window.addEventListener('pageshow', fit);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && fit());
  }

  // When the keyboard closes, iOS can leave the page scrolled up. Put it back once focus leaves all text boxes.
  if (ios) {
    document.addEventListener('focusout', () => {
      setTimeout(() => {
        const el = document.activeElement;
        if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) window.scrollTo(0, 0);
      }, 50);
    });
  }

  // Keep the app's code on the device (public/sw.js) so it opens fast. Not on the dev server, where files change
  // without new names.
  if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
    const register = () => void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
  }
}
