import { useEffect, useState } from 'react';

/**
 * Web: how much of the bottom of the page the on-screen keyboard covers, and the height left above it.
 * iOS Safari doesn't resize the page when the keyboard opens, so bottom sheets and footers would end up
 * behind it. (Android Chrome resizes the page itself, so this stays 0 there.)
 */
export function useKeyboard(): { inset: number; visibleHeight: number | null; height: number } {
  const [state, setState] = useState<{ inset: number; visibleHeight: number | null }>({ inset: 0, visibleHeight: null });
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      // Measured from the app's own bottom edge, not the window's: in the iPhone Home Screen app the app is sized to
      // the whole screen (--app-height, src/utils/webSetup.ts), which is taller than window.innerHeight, so measuring
      // from the window left bars a status bar's height too low, behind the keyboard.
      const root = document.getElementById('root')?.getBoundingClientRect().bottom ?? 0;
      const bottom = Math.max(window.innerHeight, root);
      const inset = Math.max(0, Math.round(bottom - vv.height - vv.offsetTop));
      setState((s) => (s.inset === inset && s.visibleHeight === vv.height ? s : { inset: inset > 40 ? inset : 0, visibleHeight: vv.height }));
    };
    update();
    // iOS reports the keyboard's size while it's still sliding in (and scrolls the page to the text box afterwards),
    // so the first reading is short. Keep measuring every frame for a moment after focus moves, until it settles.
    let frame = 0;
    let until = 0;
    const follow = () => {
      update();
      if (performance.now() < until) frame = requestAnimationFrame(follow);
    };
    const settle = () => {
      until = performance.now() + 900;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(follow);
    };
    // Things that use this often appear just as a text box takes focus, before these listeners exist.
    settle();
    vv.addEventListener('resize', settle);
    vv.addEventListener('scroll', update);
    window.addEventListener('scroll', update);
    document.addEventListener('focusin', settle);
    document.addEventListener('focusout', settle);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', settle);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
      document.removeEventListener('focusin', settle);
      document.removeEventListener('focusout', settle);
    };
  }, []);
  // On the web the keyboard's height is the part of the page it covers.
  return { ...state, height: state.inset };
}

/** Phones and tablets in a browser: don't pop the keyboard up unless the user taps a text box. */
export const isTouchWeb = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** Closes the keyboard by taking focus off whatever text box has it. */
export function blurActiveField() {
  if (typeof document === 'undefined') return;
  const el = document.activeElement as HTMLElement | null;
  if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) el.blur();
}
