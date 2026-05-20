"use client";

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabase } from '../../../lib/supabase';
import { useI18n } from '../../../lib/i18n/provider';
import AuthFormCard from './components/AuthFormCard';

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
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;

        const redirectTo = searchParams.get('redirect') || '/dashboard';
        router.push(redirectTo);
      } else {
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (authError) throw authError;
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
    <div className="min-h-screen bg-slate-950">
      <div className="w-full max-w-md mx-auto px-4 py-10">
        <AuthFormCard
          t={t}
          isLogin={isLogin}
          email={email}
          password={password}
          fullName={fullName}
          loading={loading}
          error={error}
          success={success}
          setEmail={setEmail}
          setPassword={setPassword}
          setFullName={setFullName}
          onSubmit={handleSubmit}
          onGoogleSignIn={handleGoogleSignIn}
        />
      </div>
    </div>
  );
}
