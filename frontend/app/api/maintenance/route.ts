import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  const secret=process.env.CRON_SECRET;
  const supplied=request.headers.get('authorization') || '';
  const expected='Bearer '+secret;
  if(!secret || Buffer.byteLength(supplied)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))
    return NextResponse.json({error:'Unauthorized'},{status:401});
  const backend=process.env.NEXT_PUBLIC_API_URL;
  if(!backend || !process.env.MAINTENANCE_SECRET) return NextResponse.json({error:'Maintenance is not configured'},{status:503});
  try {
    const response=await fetch(backend.replace(/\/$/,'')+'/monitoring/scheduled',{
      method:'POST',headers:{Authorization:'Bearer '+process.env.MAINTENANCE_SECRET},cache:'no-store',signal:AbortSignal.timeout(100000),
    });
    return NextResponse.json({accepted:response.status===202},{status:response.ok?200:503});
  } catch { return NextResponse.json({error:'Backend is unavailable'},{status:503}); }
}
