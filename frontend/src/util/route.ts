import { create } from 'zustand';

// Top-level pages. Kept as plain paths (Vercel rewrites everything that
// isn't a file to index.html), so a page can be bookmarked or reloaded.
export type Page = 'openings' | 'puzzles';

const PATHS: Record<Page, string> = {
  openings: '/',
  puzzles: '/puzzles',
};

function pageFromPath(path: string): Page {
  return path.replace(/\/+$/, '') === PATHS.puzzles ? 'puzzles' : 'openings';
}

export const useRoute = create<{ page: Page }>(() => ({
  page: pageFromPath(window.location.pathname),
}));

export function navigate(page: Page) {
  if (useRoute.getState().page === page) return;
  window.history.pushState(null, '', PATHS[page] + window.location.search);
  useRoute.setState({ page });
}

window.addEventListener('popstate', () => {
  useRoute.setState({ page: pageFromPath(window.location.pathname) });
});
