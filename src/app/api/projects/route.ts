import { analyticsJson } from "@/server/analytics/http";
import { parseCleanedProjectPageQuery } from "@/server/analytics/cleaned-query-params";
import { rateLimit } from "@/server/analytics/rate-limit";
import { getCleanedAnalyticsRepository } from "@/server/analytics/cleaned-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;
  return analyticsJson(() =>
    getCleanedAnalyticsRepository().getProjectPage(parseCleanedProjectPageQuery(new URL(request.url).searchParams))
  );
}
