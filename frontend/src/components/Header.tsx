import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  ChevronDown,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Puzzle,
  Sun,
  Swords,
  Target,
  User,
  X,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';
import { useTrainerStore, type Peer } from '../store/state';
import { navigate, setMenuOpen, useRoute, type Page } from '../util/route';

const PAGES: { page: Page; label: string; icon: ReactNode }[] = [
  { page: 'openings', label: 'Openings', icon: <BookOpen /> },
  { page: 'puzzles', label: 'Puzzles', icon: <Puzzle /> },
  { page: 'play', label: 'Play', icon: <Swords /> },
  { page: 'mistakes', label: 'Mistakes', icon: <Target /> },
];

interface Props {
  // Other users currently connected to the same repertoire. Only meaningful
  // on Chesspractice; Login omits this.
  connectedUsers?: Peer[];
  incomingCollaboratorsCount?: number;
  // A page's side panels, shown in the menu under the page list (the
  // openings page puts its repertoire there on narrow screens).
  drawerExtra?: ReactNode;
}

export function Header({ connectedUsers, incomingCollaboratorsCount = 0, drawerExtra }: Props) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const isDark = theme === 'dark';

  const authUser = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const openLogin = useAuthStore((s) => s.openLogin);
  const showLogin = useAuthStore((s) => s.showLogin);

  const page = useRoute((s) => s.page);
  const menuOpen = useRoute((s) => s.menuOpen);
  const current = PAGES.find((p) => p.page === page) ?? PAGES[0];
  const peers = connectedUsers?.filter((u) => u.username !== authUser?.username) ?? [];
  const showSignIn = !showLogin;

  return (
    <div id="header">
      {/* Page menu: collapsed to the current page's name; opens a list of
          pages on the left, and on narrow screens the page's side panels. */}
      <button
        type="button"
        className={`header-menu-btn ${menuOpen ? 'is-open' : ''}`}
        aria-expanded={menuOpen}
        aria-controls="nav-drawer"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        {menuOpen ? <X /> : <Menu />}
        <span>{current.label}</span>
        <ChevronDown className="header-menu-caret" />
      </button>

      <div className="logo-wrap">
        <span>chess</span>
        <span className="accent">practice</span>
      </div>

      {/* Identity sits next to the wordmark; the links are pushed right. Who
          you are and the control that changes it live in one recessed track,
          the same treatment the peer avatars and the board's segmented
          controls get. */}
      <div className="header-auth">
        {authUser ? (
          <div className="header-identity">
            <span className="header-user">
              {authUser.picture ? (
                <img
                  src={authUser.picture}
                  alt={authUser.username ?? 'profile'}
                  referrerPolicy="no-referrer"
                  className="header-avatar"
                />
              ) : (
                <User />
              )}
              <span className="header-username">{authUser.username ?? 'Unnamed'}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                clearAuth();
                //TODO we don't need to reload but this make it easy ..
                location.reload();
              }}
              title="Sign out"
              className="header-link"
            >
              <LogOut />
            </button>
          </div>
        ) : (
          showSignIn && (
            <div className="header-identity">
              <button
                type="button"
                onClick={openLogin}
                className="header-link header-signin"
                title="Log in"
              >
                <span>log in</span>
                <LogIn />
              </button>
            </div>
          )
        )}

        {/* Live view: just the faces of the people on this repertoire now.
            Sits with the identity on the left rather than in the right-hand
            link cluster — it's about who's here, not somewhere to go. */}
        {peers.length > 0 && (
          <div className="header-peers" title="Here now">
            {peers.map((u) => {
              // train collaborators get a light-blue ring; everyone else
              // (owner, edit) gets dark blue. Owner appears as a peer
              // only when a collaborator is viewing — same color as edit
              // since they have full access too.
              const ring = u.permission === 'train' ? 'header-peer-train' : 'header-peer-edit';
              return (
                <img
                  key={u.username}
                  src={u.picture}
                  alt={u.username}
                  title={`${u.username} (${u.permission})`}
                  referrerPolicy="no-referrer"
                  className={`header-peer ${ring}`}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="header-actions">
        {/* Labelled by what it switches *to*, the way "hide comments" is, so
            the icon and the words say the same thing. First in the cluster, so
            the dot separator falls between it and the links rather than
            before it. */}
        <button
          type="button"
          onClick={toggleTheme}
          className="header-link"
          aria-pressed={isDark}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span>{isDark ? 'light mode' : 'dark mode'}</span>
          {isDark ? <Sun /> : <Moon />}
        </button>
      </div>

      {/* Portalled: #header is a size container, which would trap and clip
          a fixed-position child. */}
      {menuOpen &&
        createPortal(
          <>
            <div className="nav-backdrop" onClick={() => setMenuOpen(false)} />
            <aside id="nav-drawer" className={`nav-drawer ${drawerExtra ? 'has-extra' : ''}`}>
              <nav className="nav-list" aria-label="Practice mode">
                {PAGES.map(({ page: p, label, icon }) => (
                  <button
                    key={p}
                    type="button"
                    className={`nav-item ${page === p ? 'is-active' : ''}`}
                    aria-current={page === p ? 'page' : undefined}
                    onClick={() => navigate(p)}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </nav>
              {drawerExtra && <div className="nav-extra">{drawerExtra}</div>}
            </aside>
          </>,
          document.body,
        )}
    </div>
  );
}
