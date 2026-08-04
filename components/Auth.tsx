import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Loader2, CheckCircle2, ArrowRight } from 'lucide-react';

interface AuthProps {
    onPlayAsGuest: () => void;
}

const GoogleLogo = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
    </svg>
);

export const Auth: React.FC<AuthProps> = ({ onPlayAsGuest }) => {
    const { signInWithGoogle, signInWithMagicLink } = useAuth();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState<'google' | 'email' | null>(null);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showEmail, setShowEmail] = useState(false);

    const handleGoogle = async () => {
        setLoading('google');
        setError(null);
        await signInWithGoogle();
        setLoading(null);
    };

    const handleEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;
        setLoading('email');
        setError(null);
        const { error } = await signInWithMagicLink(email.trim());
        setLoading(null);
        if (error) setError(error);
        else setSent(true);
    };

    return (
        <div className="theme-game min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-full max-w-sm">
                <div className="flex flex-col items-center mb-8">
                    <h1 className="text-3xl font-extrabold text-slate-50 tracking-tight">
                        Blitz<span className="text-cyan-400">Sense</span>
                    </h1>
                    <p className="max-w-xs text-slate-400 text-sm leading-6 mt-2">Solve tactical positions from real rated games.</p>
                </div>

                {/* Card */}
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 text-left shadow-sm">
                    <h2 className="text-slate-200 font-bold text-base mb-4">Sign in to save your progress</h2>

                    <div className="space-y-3">
                        {/* Google */}
                        <button
                            onClick={handleGoogle}
                            disabled={loading !== null}
                            className="w-full flex items-center justify-center gap-3 h-11 px-4 rounded-md border border-slate-700 bg-slate-950 hover:bg-slate-900 text-slate-200 text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {loading === 'google' ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleLogo />}
                            Continue with Google
                        </button>

                        {/* Divider */}
                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-slate-700" />
                            <span className="text-slate-600 text-xs">or</span>
                            <div className="flex-1 h-px bg-slate-700" />
                        </div>

                        {/* Email */}
                        {!showEmail && !sent && (
                            <button
                                onClick={() => setShowEmail(true)}
                                className="w-full flex items-center justify-center h-11 px-4 rounded-md border border-slate-700 bg-slate-950 hover:bg-slate-900 text-slate-300 text-sm font-medium transition-colors"
                            >
                                Continue with Email
                            </button>
                        )}

                        {showEmail && !sent && (
                            <form onSubmit={handleEmail} className="space-y-2.5">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@email.com"
                                    autoFocus
                                    required
                                    className="w-full h-11 bg-slate-950 border border-slate-700 rounded-md px-4 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-colors"
                                />
                                {error && <p className="text-rose-400 text-xs px-1">{error}</p>}
                                <button
                                    type="submit"
                                    disabled={loading !== null || !email.trim()}
                                    className="w-full h-11 flex items-center justify-center gap-2 rounded-md bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                                >
                                    {loading === 'email'
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <><span>Send sign-in link</span><ArrowRight className="w-4 h-4" /></>}
                                </button>
                            </form>
                        )}

                        {sent && (
                            <div className="flex items-start gap-3 px-4 py-3.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-emerald-300 text-sm font-medium">Check your inbox</p>
                                    <p className="text-slate-500 text-xs mt-0.5">
                                        Sent to <span className="text-slate-400">{email}</span>
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Guest */}
                <div className="mt-5 text-center">
                    <button
                        onClick={onPlayAsGuest}
                        className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
                    >
                        Continue as guest →
                    </button>
                </div>
            </div>
        </div>
    );
};
