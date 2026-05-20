import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AppHeader from '../../../components/AppHeader';

type TranslateFn = (key: string, vars?: Record<string, unknown>) => string;

type ProfileHeaderProps = {
  t: TranslateFn;
};

export default function ProfileHeader({ t }: ProfileHeaderProps) {
  return (
    <AppHeader
      maxWidthClassName="max-w-2xl"
      right={
        <Link href="/dashboard" className="btn-ghost text-sm flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> {t('profile.back')}
        </Link>
      }
    />
  );
}
