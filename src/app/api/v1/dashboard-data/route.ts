import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { parseDashboardDataRequest } from "@/server/analytics/cleaned-query-params";
import { getCleanedAnalyticsRepository } from "@/server/analytics/cleaned-repository";
import { rateLimit } from "@/server/analytics/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800"
};

export async function GET(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;

  try {
    const params = new URL(request.url).searchParams;
    const parsed = parseDashboardDataRequest(params);
    const result = await getCleanedAnalyticsRepository().getCleanedView(parsed);
    return NextResponse.json(result, { headers: CACHE_HEADERS });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Unexpected cleaned analytics error.";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 500 });
  }
}
