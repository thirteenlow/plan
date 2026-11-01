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

  // When the keyboard closes, iOS can leave the page scrolled up. Put it back once focus leaves all text boxes.
  if (ios) {
    document.addEventListener('focusout', () => {
      setTimeout(() => {
        const el = document.activeElement;
        if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) window.scrollTo(0, 0);
      }, 50);
    });
  }
}
