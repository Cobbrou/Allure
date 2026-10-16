import { useEffect, useState } from 'react';

// Hash routing: works from file:// and inside a native WebView without server rewrites.
// "#/activity/abc" -> ['activity', 'abc']; "" or "#/" -> [''].
const parse = () => location.hash.replace(/^#\/?/, '').split('/');

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => { setRoute(parse()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function go(path) {
  location.hash = path;
}
