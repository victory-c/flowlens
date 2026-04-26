import { NextResponse } from "next/server";
import { rateLimit } from "@/server/analytics/rate-limit";
import { getCleanedAnalyticsRepository } from "@/server/analytics/cleaned-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;
  return NextResponse.json(getCleanedAnalyticsRepository().getFlowUnavailable(), {
    status: 410,
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800"
    }
  });
}
