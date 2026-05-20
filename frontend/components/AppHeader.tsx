'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';

type BrandLogoProps = {
  href?: string;
  showText?: boolean;
  iconSize?: number;
  className?: string;
};

export function BrandLogo({
  href = '/',
  showText = true,
  iconSize = 20,
  className = '',
}: BrandLogoProps) {
  return (
    <Link href={href} className={`flex items-center gap-2 ${className}`.trim()}>
      <Image
        src="/icons/icon-192x192.png"
        alt="Kontrahent logo"
        width={iconSize}
        height={iconSize}
        className="rounded-sm"
      />
      {showText && (
        <span className="font-bold tracking-tight hidden sm:block">
          Kontrahent<span className="text-brand-500">.sk</span>
        </span>
      )}
    </Link>
  );
}

type AppHeaderProps = {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  maxWidthClassName?: string;
  sticky?: boolean;
  className?: string;
};

export default function AppHeader({
  left,
  center,
  right,
  maxWidthClassName = 'max-w-7xl',
  sticky = true,
  className = '',
}: AppHeaderProps) {
  const headerClass = [
    'border-b border-slate-800 px-4 md:px-6 py-4 bg-slate-950/90 backdrop-blur-sm z-20',
    sticky ? 'sticky top-0' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const containerClass = [`${maxWidthClassName} mx-auto flex items-center gap-4`, ''].join(' ').trim();

  return (
    <header className={headerClass}>
      <div className={containerClass}>
        <div className="shrink-0">{left ?? <BrandLogo />}</div>
        {center ? <div className="flex-1 min-w-0">{center}</div> : <div className="flex-1" />}
        {right ? <div className="shrink-0 flex items-center gap-2">{right}</div> : null}
      </div>
    </header>
  );
}