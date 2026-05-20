import Link from 'next/link';
import AppHeader from '../../../../components/AppHeader';

type TranslateFn = (key: string, vars?: Record<string, unknown>) => string;

type AuthHeaderProps = {
  t: TranslateFn;
  isLogin: boolean;
};

export default function AuthHeader({ t, isLogin }: AuthHeaderProps) {
  return (
    <AppHeader
      maxWidthClassName="max-w-6xl"
      right={
        isLogin ? (
          <Link href="/auth/register" className="btn-primary text-sm">
            {t('auth.register')}
          </Link>
        ) : (
          <Link href="/auth/login" className="btn-ghost text-sm">
            {t('auth.signIn')}
          </Link>
        )
      }
    />
  );
}
