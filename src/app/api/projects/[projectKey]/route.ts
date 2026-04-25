import { analyticsJson } from "@/server/analytics/http";
import { parseFilters } from "@/server/analytics/query-params";
import { rateLimit } from "@/server/analytics/rate-limit";
import { getAnalyticsRepository } from "@/server/analytics/postgres-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, context: { params: Promise<{ projectKey: string }> }) {
  const limited = rateLimit(request);
  if (limited) return limited;
  return analyticsJson(async () => {
    const { projectKey } = await context.params;
    const filters = parseFilters(new URL(request.url).searchParams);
    return getAnalyticsRepository().getProjectDetail(decodeURIComponent(projectKey), filters);
  });
}
