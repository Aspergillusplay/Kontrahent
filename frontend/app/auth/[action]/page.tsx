'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Shield, Mail, Lock, User, Loader2 } from 'lucide-react';
import { getSupabase } from '../../../lib/supabase';
import { useI18n } from '../../../lib/i18n/provider';

export default function AuthPage({ params }: { params: { action: string } }) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isLogin = params.action === 'login';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const supabase = getSupabase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        const redirectTo = searchParams.get('redirect') || '/dashboard';
        router.push(redirectTo);
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setSuccess(t('auth.checkEmail'));
      }
    } catch (err: any) {
      setError(err.message || t('auth.genericError'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <Shield className="text-brand-500 w-7 h-7" />
          <span className="font-bold text-2xl tracking-tight">
            Kontrahent<span className="text-brand-500">.sk</span>
          </span>
        </Link>

        <div className="card">
          <h1 className="text-xl font-bold mb-6">
            {isLogin ? t('auth.signIn') : t('auth.createAccount')}
          </h1>

          {/* Google SSO */}
          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors mb-4"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {t('auth.continueGoogle')}
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-xs text-slate-500">{t('auth.orEmail')}</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="text-sm text-slate-400 block mb-1.5">{t('auth.fullName')}</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t('auth.fullNamePlaceholder')}
                    required={!isLogin}
                    className="input pl-10"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-sm text-slate-400 block mb-1.5">{t('auth.email')}</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jan@firma.sk"
                  required
                  className="input pl-10"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-400 block mb-1.5">{t('auth.password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  required
                  minLength={8}
                  className="input pl-10"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 text-green-400 text-sm">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t('auth.processing')}</>
              ) : isLogin ? t('auth.signIn') : t('auth.createAccount')}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-4">
            {isLogin ? (
              <>{t('auth.noAccount')}{' '}
                <Link href="/auth/register" className="text-brand-400 hover:text-brand-300">
                  {t('auth.register')}
                </Link>
              </>
            ) : (
              <>{t('auth.haveAccount')}{' '}
                <Link href="/auth/login" className="text-brand-400 hover:text-brand-300">
                  {t('auth.signIn')}
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
