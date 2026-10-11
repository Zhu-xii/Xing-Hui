// 视图路由：用 replaceState 切换，不再往历史里堆记录，
// 这样浏览器的「返回」可以直接退出本站（对齐参考站 mochi 的退出行为）。
export const NAVIGATE_EVENT = 'xinghui:navigate';

export function normalizeRoute(value) {
  return String(value || '').replace(/^#\/?/, '').trim();
}

export function navigateTo(view) {
  if (typeof window === 'undefined') return;
  const route = normalizeRoute(view) || 'home';
  const hash = '#/' + route;
  if (window.location.hash !== hash) {
    window.history.replaceState(null, '', hash);
  }
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: { view: route } }));
}

export function initRouter(onNavigate) {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', (event) => {
    const link = event.target?.closest?.('a[href^="#/"]');
    if (!link) return;
    const route = normalizeRoute(link.getAttribute('href'));
    if (!route) return;
    event.preventDefault();
    navigateTo(route);
  });
  window.addEventListener(NAVIGATE_EVENT, () => onNavigate());
  window.addEventListener('hashchange', () => onNavigate());
}
