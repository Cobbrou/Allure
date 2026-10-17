import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

// Hash routing: works from file:// and inside a native WebView without server rewrites.
// "#/activity/abc" -> ['activity', 'abc']; "" or "#/" -> [''].
const parse = () => location.hash.replace(/^#\/?/, '').split('/');

// Detail pages sit one level below tabs: going deeper slides forward, coming back slides back.
const depth = (route) => (route[0] === 'activity' || route[0] === 'log' ? 1 : 0);
const scrolls = new Map(); // hash -> scrollY, so going back to the feed keeps its position

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    let prevHash = location.hash;
    let prevRoute = parse();
    const onChange = () => {
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

export function go(path) {
  location.hash = path;
}
