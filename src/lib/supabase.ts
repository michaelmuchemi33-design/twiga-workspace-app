import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_STARTED_KEY = "twiga_session_started_at";

const sevenDayStorage = {
  getItem(key: string) {
    try {
      if (key.endsWith("-auth-token")) {
        const started = Number(localStorage.getItem(SESSION_STARTED_KEY) || 0);
        if (started && Date.now() - started >= SESSION_MAX_AGE_MS) {
          localStorage.removeItem(key);
          localStorage.removeItem(SESSION_STARTED_KEY);
          return null;
        }
      }
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      if (key.endsWith("-auth-token") && !localStorage.getItem(SESSION_STARTED_KEY)) {
        localStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
      }
      localStorage.setItem(key, value);
    } catch {
      // The auth client will surface storage errors when it cannot persist a session.
    }
  },
  removeItem(key: string) {
    try {
      localStorage.removeItem(key);
      if (key.endsWith("-auth-token")) localStorage.removeItem(SESSION_STARTED_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
  },
};

export const supabase = url && publishableKey
  ? createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        storage: sevenDayStorage,
      },
    })
  : null;

export const hasSupabaseConfig = Boolean(supabase);
export const TWIGA_SESSION_MAX_AGE_MS = SESSION_MAX_AGE_MS;
