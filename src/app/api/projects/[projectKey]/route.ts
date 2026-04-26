import { analyticsJson } from "@/server/analytics/http";
import { parseCleanedFilters } from "@/server/analytics/cleaned-query-params";
import { rateLimit } from "@/server/analytics/rate-limit";
import { getCleanedAnalyticsRepository } from "@/server/analytics/cleaned-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, context: { params: Promise<{ projectKey: string }> }) {
  const limited = rateLimit(request);
  if (limited) return limited;
  return analyticsJson(async () => {
    const { projectKey } = await context.params;
    const filters = parseCleanedFilters(new URL(request.url).searchParams);
    return getCleanedAnalyticsRepository().getProjectDetail(decodeURIComponent(projectKey), filters);
  });
}
