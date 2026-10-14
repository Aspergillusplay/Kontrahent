import { BadRequestException } from '@nestjs/common';

export function validatePushSubscription(value: any) {
  let endpoint: URL;
  try { endpoint = new URL(value?.endpoint); } catch { throw new BadRequestException('Invalid push endpoint'); }
  const host = endpoint.hostname;
  const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' ||
    host.endsWith('.push.services.mozilla.com') || host === 'web.push.apple.com' ||
    host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
  if (!allowed || endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash ||
      (endpoint.port && endpoint.port !== '443')) throw new BadRequestException('Unsupported push endpoint');
  for (const [key, bytes] of [['p256dh', 65], ['auth', 16]] as const) {
    const encoded = value?.keys?.[key];
    if (typeof encoded !== 'string' || !/^[A-Za-z0-9_=-]+$/.test(encoded) || Buffer.from(encoded, 'base64url').length !== bytes)
      throw new BadRequestException('Invalid push encryption key');
  }
  return { endpoint: endpoint.toString(), keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}
