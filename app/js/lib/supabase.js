import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_JS } from '../config.js';
import { storage } from './storage.js';

const { createClient } = await import(SUPABASE_JS);

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
