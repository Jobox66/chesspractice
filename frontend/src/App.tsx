import React, { Suspense, lazy } from 'react';
import Chesspractice from './Chesspractice';
import { LoginModal } from './components/modals/LoginModal';
import { ServerWakeBanner } from './components/ServerWakeBanner';
import { useStartup } from './hooks/useStartup';
import { useRoute } from './util/route';

// Loaded on first visit to the tab, so the openings page doesn't pay for it.
const PuzzlePage = lazy(() => import('./puzzles/PuzzlePage'));

const App: React.FC = () => {
  // Session + repertoire bootstrap runs once for the whole app (it also
  // tells every page who is signed in), not per page.
  useStartup();
  const page = useRoute((s) => s.page);

  return (
    <main className="app-shell">
      {page === 'puzzles' ? (
        <Suspense fallback={null}>
          <PuzzlePage />
        </Suspense>
      ) : (
        <Chesspractice />
      )}
      <LoginModal />
      <ServerWakeBanner />
    </main>
  );
};

export default App;
