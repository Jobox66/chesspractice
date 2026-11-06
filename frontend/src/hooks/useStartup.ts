//TODO how to combine with logging in manually?
//TODO useEffect on owner id switch?

import { useEffect } from 'react';
import { useTrainerStore } from '../store/state';
import { fetchRepertoire } from '../services/repertoire';
import { ensureServerAwake } from '../services/serverWake';
import { useAuthStore } from '../store/auth';
import { tryStoredSyncKey } from '../services/auth';
import { getSyncKey } from '../lib/syncKey';

/*
  Boot chesspractice:
    - signed out: pull from indexedDB
    - signed in: hit /repertoire (via fetchRepertoire), which hydrates
      the auth store + repertoireAuthor from the response and computes
      per-chapter counts before installing.
*/

export function useStartup() {
  useEffect(() => {
    // getState, not the hook: App calls this, and subscribing App to the
    // whole trainer store would re-render every page on each change.
    const { updateDueCounts, hydrateRepertoireFromIDB } = useTrainerStore.getState();
    const hasSessionHint = document.cookie.split('; ').some((c) => c.startsWith('chesspractice_has_session='));
    let cancelled = false;
    /* Don't try to log-in if session hint cookie is missing */
    (async () => {
      // Owner's sync key remembered in this browser: sign in with it
      // instead of showing the playground (no session yet, or it expired).
      const signInWithSyncKey = async () => {
        if (!getSyncKey()) return false;
        await ensureServerAwake();
        if (cancelled) return false;
        const ok = await tryStoredSyncKey();
        if (ok && !cancelled) {
          useAuthStore.setState({ checked: true });
          updateDueCounts();
        }
        return ok;
      };

      if (!hasSessionHint) {
        if (await signInWithSyncKey()) return;
        if (cancelled) return;
        // Warm the (possibly sleeping) backend so a later sign-in is fast.
        void ensureServerAwake({ silent: true });
        useAuthStore.setState({ checked: true });
        await hydrateRepertoireFromIDB();
        updateDueCounts();
        return;
      }
      // Free-tier backend may be asleep: wait (with a banner) rather
      // than let the first request time out.
      await ensureServerAwake();
      if (cancelled) return;
      const result = await fetchRepertoire();
      if (cancelled) return;
      if (!result.ok && result.status === 401 && (await signInWithSyncKey())) return;
      useAuthStore.setState({ checked: true });
      if (cancelled) return;
      // Fall back to IDB on auth failure (stale session hint) or a
      // network error — anything else (5xx, etc.) returns silently as
      // before, no fallback.
      if (!result.ok && (result.status === 401 || result.status === undefined)) {
        await hydrateRepertoireFromIDB();
      }
      updateDueCounts();
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
