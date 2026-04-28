"use client";

import type { DashboardFilters } from "@/shared/contracts/dashboard-data";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

const DEFAULT_FILTERS: DashboardFilters = {
  viewMode: "project",
  includeDomestic: false,
  outlierOnly: false
};

const STRING_KEYS = [
  "year",
  "donorCountry",
  "recipientCountry",
  "region",
  "organization",
  "donor",
  "sector",
  "cause",
  "tableQ",
  "q"
] as const;

export function useDashboardFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<DashboardFilters>(() => {
    const next: DashboardFilters = {
      ...DEFAULT_FILTERS,
      viewMode: searchParams.get("viewMode") === "row" ? "row" : "project",
      includeDomestic: searchParams.get("includeDomestic") === "true",
      outlierOnly: searchParams.get("outlierOnly") === "true"
    };

    for (const key of STRING_KEYS) {
      const value = searchParams.get(key);
      if (!value) continue;
      if (key === "cause") {
        next.cause = value as DashboardFilters["cause"];
      } else {
        next[key] = value;
      }
    }

    const minAmount = searchParams.get("minAmount");
    if (minAmount) {
      const parsed = Number(minAmount);
      if (Number.isFinite(parsed)) next.minAmount = parsed;
    }

    return next;
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<DashboardFilters>) => {
      const latestQuery =
        typeof window === "undefined"
          ? searchParams.toString()
          : window.location.search.startsWith("?")
            ? window.location.search.slice(1)
            : window.location.search;
      const params = new URLSearchParams(latestQuery);

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
