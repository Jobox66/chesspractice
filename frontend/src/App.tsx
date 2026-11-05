import React from 'react';
import Chesspractice from './Chesspractice';
import { LoginModal } from './components/modals/LoginModal';
import { ServerWakeBanner } from './components/ServerWakeBanner';

const App: React.FC = () => {
  return (
    <main className="app-shell">
      <Chesspractice />
      <LoginModal />
      <ServerWakeBanner />
    </main>
  );
};

export default App;
