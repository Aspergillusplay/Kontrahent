import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AppHeader from '../../../components/AppHeader';

type TranslateFn = (key: string, vars?: Record<string, unknown>) => string;

type NotificationsHeaderProps = {
  t: TranslateFn;
};

export default function NotificationsHeader({ t }: NotificationsHeaderProps) {
  return (
    <AppHeader
      maxWidthClassName="max-w-4xl"
      center={<span className="font-bold tracking-tight hidden sm:block">{t('notifications.title')}</span>}
      right={
        <Link href="/dashboard" className="flex items-center gap-2 btn-ghost text-sm">
          <ArrowLeft className="w-4 h-4" />
          <span className="sr-only">{t('notifications.back')}</span>
          <span className="hidden sm:inline">{t('notifications.back')}</span>
        </Link>
      }
    />
  );
}
