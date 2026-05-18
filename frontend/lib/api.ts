import { getSupabase } from './supabase';
import { CompanyDetails, CompanyHistoryItem, CompanySearchResult } from './company-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type BasicApiResult = {
  success: boolean;
  message?: string;
};

type NotificationTestResult = BasicApiResult & {
  results?: {
    telegram: boolean;
    push: boolean;
  };
};

type AlertItem = {
  id: string;
  message: string;
  sent_at: string;
  is_read: boolean;
  severity?: 'info' | 'warning' | 'critical';
  type?: string;
  title?: string;
  company_name?: string;
};

async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {}),
  };
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Server error' }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  // Handle empty responses (like 204 No Content for DELETE)
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return {} as T;
  }

  const text = await res.text();
  if (!text) return {} as T;

  return JSON.parse(text);
}

// ── Companies ────────────────────────────────────────────────
export const api = {
  companies: {
    search: (q: string, page = 1) =>
      apiFetch<CompanySearchResult[]>(`/companies/search?q=${encodeURIComponent(q)}&page=${page}`),
    browse: (params: {
      page?: number;
      sort?: string;
      activity?: string;
      region?: string;
      legalForm?: string;
      employees?: string;
      salesFrom?: string;
      q?: string;
    }) => {
      const searchParams = new URLSearchParams();
      if (params.page && params.page > 1) searchParams.set('page', String(params.page));
      if (params.sort) searchParams.set('sort', params.sort);
      if (params.activity) searchParams.set('activity', params.activity);
      if (params.region) searchParams.set('region', params.region);
      if (params.legalForm) searchParams.set('legalForm', params.legalForm);
      if (params.employees) searchParams.set('employees', params.employees);
      if (params.salesFrom) searchParams.set('salesFrom', params.salesFrom);
      if (params.q) searchParams.set('q', params.q);
      return apiFetch<any>(`/companies/browse?${searchParams.toString()}`);
    },
    get: (ico: string) => apiFetch<CompanyDetails>(`/companies/${ico}`),
    history: (ico: string) => apiFetch<CompanyHistoryItem[]>(`/companies/${ico}/history`),
    refresh: (ico: string) => apiFetch<CompanyDetails>(`/companies/${ico}/refresh`),
  },

  watchlist: {
    list: <T = any[]>() => apiFetch<T>('/watchlist'),
    add: (ico: string, alias?: string) =>
      apiFetch<BasicApiResult>('/watchlist', {
        method: 'POST',
        body: JSON.stringify({ ico, alias }),
      }),
    update: (ico: string, data: object) =>
      apiFetch<BasicApiResult>(`/watchlist/${ico}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (ico: string) =>
      apiFetch<BasicApiResult>(`/watchlist/${ico}`, { method: 'DELETE' }),
  },

  notifications: {
    alerts: () => apiFetch<AlertItem[]>('/notifications/alerts'),
    markAllRead: () =>
      apiFetch<BasicApiResult>('/notifications/alerts/read-all', { method: 'POST' }),
    subscribePush: (subscription: object) =>
      apiFetch<BasicApiResult>('/notifications/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ subscription }),
      }),
    connectTelegram: (chat_id: string) =>
      apiFetch<BasicApiResult>('/notifications/telegram/connect', {
        method: 'POST',
        body: JSON.stringify({ chat_id }),
      }),
    getVapidKey: () =>
      apiFetch<{ key: string }>('/notifications/vapid-public-key'),
    sendTest: () =>
      apiFetch<NotificationTestResult>('/notifications/test-all', { method: 'POST' }),
  },
};

// ── Push Notifications ──────────────────────────────────────
export async function registerPushNotifications(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    // Wait for service worker to be ready with a timeout
    let registration;
    try {
      registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for SW')), 3000))
      ]) as ServiceWorkerRegistration;
    } catch (err) {
      console.warn('SW ready timed out, attempting manual registration...');
      registration = await navigator.serviceWorker.register('/sw.js');
      // Wait a bit for it to install
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!registration) return false;

    const { key } = await api.notifications.getVapidKey();

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    await api.notifications.subscribePush(subscription);
    return true;
  } catch (err) {
    console.error('Push registration failed:', err);
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
