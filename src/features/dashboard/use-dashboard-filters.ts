"use client";

import type { DashboardFilters } from "@/server/analytics/contracts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

const DEFAULT_FILTERS: DashboardFilters = {
  measure: "disbursement",
  viewMode: "project",
  outlierOnly: false
};

const STRING_KEYS = [
  "flowType",
  "donorCountry",
  "regionMacro",
  "region",
  "recipientCountry",
  "year",
  "organization",
  "sector",
  "subsector",
  "keyword"
] as const;

export function useDashboardFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<DashboardFilters>(() => {
    const next: DashboardFilters = {
      ...DEFAULT_FILTERS,
      measure: searchParams.get("measure") === "commitment" ? "commitment" : "disbursement",
      viewMode: searchParams.get("viewMode") === "raw" ? "raw" : "project",
      outlierOnly: searchParams.get("outlierOnly") === "true"
    };

    for (const key of STRING_KEYS) {
      const value = searchParams.get(key);
      if (value) next[key] = value;
    }

    const amountMin = searchParams.get("amountMin");
    const amountMax = searchParams.get("amountMax");
    if (amountMin) next.amountMin = Number(amountMin);
    if (amountMax) next.amountMax = Number(amountMax);
    return next;
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<DashboardFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === "" || value === false) {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const clearFilter = useCallback(
    (key: keyof DashboardFilters) => {
      setFilters({ [key]: undefined } as Partial<DashboardFilters>);
    },
    [setFilters]
  );

  const resetFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  return { filters, setFilters, clearFilter, resetFilters };
}
