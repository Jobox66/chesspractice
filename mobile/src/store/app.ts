// App state: who is signed in and the repertoire being trained.
//
// Two modes, like the web app:
// - offline ("playground"): not signed in; chapters live in files on the
//   phone and cards are keyed by PLAYGROUND_KEY.
// - signed in: chapters come from the backend; changes are sent over the
//   WebSocket (and POST /chapter for new chapters), cards keyed by
//   username. Offline chapters are kept on the phone, untouched.
import { create } from 'zustand';
import { OPENING_LIBRARY } from '../data/openingLibrary';
import type { Card } from '../core/srs';
import { deleteNodeAt, nodeAtPathOrNull } from '../core/tree';
import { chapterFromPgn, parseChapters, sortChapters, withCounts } from '../core/training';
import { PLAYGROUND_KEY, type Chapter, type TrainableNode } from '../core/types';
import { api, ApiError, setApiToken } from '../services/api';
import { syncSocket } from '../services/socket';
import {
  deleteLocalChapter,
  hasLocalChapters,
  loadSession,
  readLocalChapters,
  saveSession,
  writeLocalChapter,
} from '../services/storage';

export type User = { username: string; picture?: string };

interface AppState {
  ready: boolean;
  user: User | null;
  repertoire: Chapter[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  pending: number;

  key: () => string;
  chapter: (uuid: string) => Chapter | undefined;

  bootstrap: () => Promise<void>;
  refresh: () => Promise<void>;
  // due counts drift with the clock; recompute them
  recount: () => void;
  signedIn: (token: string, user: User, chapters: any[]) => Promise<void>;
  logout: () => Promise<void>;

  addChapter: (c: Chapter) => Promise<void>;
  renameChapter: (uuid: string, name: string) => void;
  deleteChapter: (uuid: string) => void;
  setCard: (uuid: string, path: string, card: Card) => void;
}

// Seed for a first launch, so the app isn't empty: the first library
// chapter for White (same idea as the web's example chapter).
function seedLocal(): Chapter[] {
  const entry = OPENING_LIBRARY.find((e) => e.trainAs === 'white');
  if (!entry) return [];
  const c = chapterFromPgn(entry.pgn, entry.trainAs, entry.name);
  writeLocalChapter(c);
  return [c];
}

function loadLocal(): Chapter[] {
  if (!hasLocalChapters()) return seedLocal();
  return parseChapters(readLocalChapters(), PLAYGROUND_KEY);
}

export const useApp = create<AppState>((set, get) => {
  // Replace one chapter (after an in-place tree mutation) with a fresh
  // object carrying recomputed counts, so subscribers re-render.
  const touch = (uuid: string) =>
    set((s) => ({
      repertoire: s.repertoire.map((c) => (c.uuid === uuid ? withCounts({ ...c }, get().key()) : c)),
    }));

  const persistLocal = (uuid: string) => {
    if (get().user) return;
    const c = get().chapter(uuid);
    if (c) writeLocalChapter(c);
  };

  async function fetchServer(): Promise<void> {
    const { user } = get();
    if (!user) return;
    set({ loading: true, error: null });
    try {
      const data = await api(`/repertoire?owner=${encodeURIComponent(user.username)}`);
      set({ repertoire: parseChapters(data?.chapters, user.username) });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // session expired or revoked: back to offline mode
        await get().logout();
        set({ error: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' });
        return;
      }
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ loading: false });
    }
  }

  syncSocket.onStatus = ({ connected, pending }) => set({ connected, pending });
  syncSocket.onMessage = (msg) => {
    const c = msg.chapterId ? get().chapter(msg.chapterId) : undefined;
    switch (msg.type) {
      case 'reload':
        void fetchServer();
        break;
      case 'training_updated': {
        const node = c && nodeAtPathOrNull(c.root, msg.path);
        if (!c || !node) return;
        node.data.training = { ...(node.data.training ?? {}), [msg.username]: msg.card };
        touch(c.uuid);
        break;
      }
      case 'move_created': {
        const parent = c && nodeAtPathOrNull(c.root, msg.path);
        if (!c || !parent) return void fetchServer();
        if (!parent.children.some((n) => n.data.id === msg.move.id)) {
          const node: TrainableNode = { data: msg.move, children: [] };
          parent.children.push(node);
        }
        touch(c.uuid);
        break;
      }
      case 'node_deleted':
        if (!c) return;
        deleteNodeAt(c.root, msg.path);
        touch(c.uuid);
        break;
      case 'set_comment': {
        const node = c && nodeAtPathOrNull(c.root, msg.path);
        if (!c || !node) return;
        node.data.comment = msg.comment;
        touch(c.uuid);
        break;
      }
    }
  };

  return {
    ready: false,
    user: null,
    repertoire: [],
    loading: false,
    error: null,
    connected: false,
    pending: 0,

    key: () => get().user?.username ?? PLAYGROUND_KEY,
    chapter: (uuid) => get().repertoire.find((c) => c.uuid === uuid),

    bootstrap: async () => {
      const session = await loadSession();
      if (session) {
        setApiToken(session.token);
        set({ user: { username: session.username, picture: session.picture }, ready: true });
        syncSocket.start(session.username);
        await fetchServer();
      } else {
        set({ repertoire: loadLocal(), ready: true });
      }
    },

    refresh: async () => {
      if (get().user) await fetchServer();
      else set({ repertoire: loadLocal() });
    },

    recount: () => set((s) => ({ repertoire: s.repertoire.map((c) => withCounts(c, get().key())) })),

    signedIn: async (token, user, chapters) => {
      await saveSession({ token, username: user.username, picture: user.picture });
      setApiToken(token);
      set({ user, error: null, repertoire: parseChapters(chapters, user.username) });
      syncSocket.start(user.username);
    },

    logout: async () => {
      const wasSignedIn = !!get().user;
      syncSocket.stop();
      if (wasSignedIn) {
        // best effort: drop the server session
        api('/logout', { method: 'POST' }).catch(() => {});
      }
      await saveSession(null);
      setApiToken(null);
      set({ user: null, repertoire: loadLocal(), error: null });
    },

    addChapter: async (c) => {
      const { user } = get();
      const chapter = withCounts(c, get().key());
      set((s) => ({ repertoire: [...s.repertoire, chapter].sort(sortChapters) }));
      if (!user) {
        writeLocalChapter(chapter);
        return;
      }
      try {
        await api(`/chapter?owner=${encodeURIComponent(user.username)}`, {
          method: 'POST',
          body: JSON.stringify({ chapterId: c.uuid, name: c.name, trainAs: c.trainAs, root: c.root }),
        });
      } catch (e) {
        let msg = e instanceof Error ? e.message : String(e);
        if (e instanceof ApiError && e.status === 413) msg = 'Chương vượt giới hạn số nước đi trên server.';
        if (e instanceof ApiError && e.status === 409) msg = 'Repertoire đã đạt giới hạn số chương trên server.';
        await fetchServer();
        throw new Error(msg);
      }
    },

    renameChapter: (uuid, name) => {
      const c = get().chapter(uuid);
      if (!c) return;
      c.name = name;
      touch(uuid);
      set((s) => ({ repertoire: [...s.repertoire].sort(sortChapters) }));
      if (get().user) syncSocket.send({ type: 'chapter_renamed', chapterId: uuid, name });
      else persistLocal(uuid);
    },

    deleteChapter: (uuid) => {
      set((s) => ({ repertoire: s.repertoire.filter((c) => c.uuid !== uuid) }));
      if (get().user) syncSocket.send({ type: 'chapter_deleted', chapterId: uuid });
      else deleteLocalChapter(uuid);
    },

    // Store the current user's card on the move at path (path of the
    // move itself, not of the position it's played from).
    setCard: (uuid, path, card) => {
      const c = get().chapter(uuid);
      const node = c && nodeAtPathOrNull(c.root, path);
      if (!c || !node) return;
      const key = get().key();
      node.data.training = { ...(node.data.training ?? {}), [key]: card };
      touch(uuid);
      if (get().user) {
        syncSocket.send({ type: 'training_updated', chapterId: uuid, path, username: key, card });
      } else {
        persistLocal(uuid);
      }
    },
  };
});
