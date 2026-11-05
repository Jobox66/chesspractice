import { create } from 'zustand';

// The backend runs on Render's free tier, which spins down after 15 idle
// minutes and takes about a minute to come back. ensureServerAwake()
// polls /healthz until the server answers, so callers can hold off their
// real request instead of hitting a proxy timeout, and drives the
// "server is starting" banner (ServerWakeBanner) while it waits.

const API_URL: string = import.meta.env.VITE_API_URL;

// A warm server answers well under this; slower means it's spinning up.
const FAST_TIMEOUT_MS = 2_000;
const ATTEMPT_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 3_000;
const DEADLINE_MS = 150_000;

type ServerWakeState = {
  // A probe is in flight and the first, fast attempt already failed.
  waking: boolean;
  // Gave up after DEADLINE_MS.
  failed: boolean;
  // Some caller is actually blocked on the server, so the banner should
  // show. Background pre-warming leaves this false.
  shown: boolean;
};

export const useServerWake = create<ServerWakeState>(() => ({
  waking: false,
  failed: false,
  shown: false,
}));

async function probe(timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/healthz`, { cache: 'no-store', signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let inflight: Promise<boolean> | null = null;

async function wake(): Promise<boolean> {
  if (await probe(FAST_TIMEOUT_MS)) {
    useServerWake.setState({ shown: false });
    return true;
  }

  useServerWake.setState({ waking: true, failed: false });
  const deadline = Date.now() + DEADLINE_MS;
  while (Date.now() < deadline) {
    if (await probe(ATTEMPT_TIMEOUT_MS)) {
      useServerWake.setState({ waking: false, failed: false, shown: false });
      return true;
    }
    await sleep(RETRY_DELAY_MS);
  }
  useServerWake.setState({ waking: false, failed: true });
  return false;
}

// Resolves true once the backend answers /healthz, false if it never
// does within the deadline. Concurrent callers share one probe loop.
// silent: warm the server in the background without showing the banner.
export function ensureServerAwake(opts: { silent?: boolean } = {}): Promise<boolean> {
  if (!opts.silent) useServerWake.setState({ shown: true });
  if (!inflight) {
    inflight = wake().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
