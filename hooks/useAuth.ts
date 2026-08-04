import { useState, useEffect } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface AuthState {
    user: User | null;
    session: Session | null;
    loading: boolean;
}

export function useAuth(): AuthState & {
    signInWithGoogle: () => Promise<void>;
    signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
} {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!supabase) {
            setLoading(false);
            return;
        }

        // Get initial session
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setUser(data.session?.user ?? null);
            setLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const signInWithGoogle = async () => {
        if (!supabase) return;
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        });
    };

    const signInWithMagicLink = async (email: string) => {
        if (!supabase) return { error: 'Auth not configured' };
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: window.location.origin },
        });
        return { error: error?.message ?? null };
    };

    const signOut = async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
    };

    return { user, session, loading, signInWithGoogle, signInWithMagicLink, signOut };
}
