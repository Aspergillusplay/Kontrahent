'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n/provider';
export default function TelegramBotLink() {
  const {locale}=useI18n();
  const [username,setUsername]=useState<string|null>(null);
  useEffect(()=>{let active=true;api.notifications.telegramBot().then(info=>{if(active)setUsername(info.username);}).catch(()=>{});return()=>{active=false;};},[]);
  return <p className="text-xs text-slate-400 mb-4 leading-relaxed">
    {locale==='sk'?'Najprv otvorte bota Kontrahent a stlačte Start. Potom získajte svoje Chat ID cez @userinfobot a vložte ho nižšie.':'First open the Kontrahent bot and press Start. Then get your Chat ID from @userinfobot and enter it below.'}
    {username && <a className="block mt-2 text-brand-400 underline" href={'https://t.me/'+username} target="_blank" rel="noreferrer">@{username}</a>}
  </p>;
}
