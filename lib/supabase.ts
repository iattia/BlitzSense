import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Supabase is optional — app works fine in guest mode without it
export const supabase: SupabaseClient | null =
    supabaseUrl && supabaseKey
        ? createClient(supabaseUrl, supabaseKey)
        : null;

if (!supabase) {
    console.info('[BlitzSense] Running without Supabase — guest mode only.');
}
