import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

// Hash routing: works from file:// and inside a native WebView without server rewrites.
// "#/activity/abc" -> ['activity', 'abc']; "" or "#/" -> [''].
const parse = () => location.hash.replace(/^#\/?/, '').split('/');

// Detail pages sit below tabs (a segment below the activity it was opened from): going
// deeper slides forward, coming back slides back.
const DEPTH = { activities: 1, activity: 2, manual: 1, log: 1, route: 1, settings: 1, segment: 3, legal: 2 };
const depth = (route) => DEPTH[route[0]] ?? 0;
let inApp = false; // a hash change happened in this session, so history.back() stays in the app
const scrolls = new Map(); // hash -> scrollY, so going back to the feed keeps its position

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    let prevHash = location.hash;
    let prevRoute = parse();
    const onChange = () => {
      inApp = true;
      scrolls.set(prevHash, window.scrollY);
      const next = parse();
      const d = depth(next) - depth(prevRoute);
      document.documentElement.dataset.nav = d > 0 ? 'forward' : d < 0 ? 'back' : 'fade';
      const update = () => {
        flushSync(() => setRoute(next));
        window.scrollTo(0, scrolls.get(location.hash) ?? 0);
      };
      if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.startViewTransition(update);
      } else update();
      prevHash = location.hash;
      prevRoute = next;
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** replace: take the current screen's place in history (a finished form back would reopen). */
export function go(path, replace = false) {
  if (replace) location.replace(`#${path}`);
  else location.hash = path;
}

/** Back to the previous screen, or to `fallback` when the app was opened on this one (deep link). */
export function back(fallback) {
  if (inApp) history.back();
  else go(fallback);
}
