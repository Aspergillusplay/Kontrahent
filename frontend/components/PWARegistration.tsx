'use client';
import { useEffect } from 'react';

export default function PWARegistration() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const registerSW = async () => {
        try {
          if (process.env.NODE_ENV === 'development') {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((registration) => registration.unregister()));
            return;
          }

          for (const name of await caches.keys()) {
            if (name === 'api-data' || name === 'start-url') await caches.delete(name);
          }
          const registration = await navigator.serviceWorker.register('/service-worker.js');
          console.log('SW registered successfully:', registration.scope);
        } catch (error) {
          console.log('SW registration failed:', error);
        }
      };

      registerSW();
    }
  }, []);

  return null;
}
