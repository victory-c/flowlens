"use client";

import type { ChartDatum, DashboardFilters, YearTrendDatum } from "@/server/analytics/contracts";
import ReactECharts from "echarts-for-react";
import { cn, formatUsdMillions } from "@/lib/utils";

type BarChartCardProps = {
  title: string;
  data: ChartDatum[];
  color: string;
  onSelect?: (label: string) => void;
};

export function BarChartCard({ title, data, color, onSelect }: BarChartCardProps) {
  const option = {
    grid: { top: 12, right: 20, bottom: 20, left: 122 },
    tooltip: {
      trigger: "axis",
      formatter: (items: Array<{ name: string; value: number }>) => {
        const item = items[0];
        return `${item.name}<br/>${formatUsdMillions(item.value)}`;
      }
    },
    xAxis: {
      type: "value",
      axisLabel: { formatter: (value: number) => `$${value.toLocaleString()}M` }
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.label).reverse(),
      axisLabel: { width: 116, overflow: "truncate" }
    },
    series: [
      {
        type: "bar",
        data: data.map((item) => item.value).reverse(),
        itemStyle: { color, borderRadius: [0, 4, 4, 0] }
      }
    ]
  };

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <ReactECharts
        option={option}
        style={{ height: 260 }}
        onEvents={{
          click: (event: { name?: string }) => {
            if (event.name && onSelect) onSelect(event.name);
          }
        }}
      />
    </section>
  );
}

export function TrendChartCard({
  data,
  measure
}: {
  data: YearTrendDatum[];
  measure: DashboardFilters["measure"];
}) {
  const measureKey: "totalCommitment" | "totalDisbursement" =
    measure === "commitment" ? "totalCommitment" : "totalDisbursement";
  const option = {
    grid: { top: 20, right: 20, bottom: 26, left: 60 },
    tooltip: {
      trigger: "axis",
      formatter: (items: Array<{ name: string; value: number }>) => {
        const item = items[0];
        return `${item.name}<br/>${formatUsdMillions(item.value)}`;
      }
    },
    xAxis: { type: "category", data: data.map((item) => item.year) },
    yAxis: {
      type: "value",
      axisLabel: { formatter: (value: number) => `$${value.toLocaleString()}M` }
    },
    series: [
      {
        type: "line",
        smooth: true,
        symbolSize: 8,
        lineStyle: { width: 3, color: "#2364aa" },
        itemStyle: { color: "#2364aa" },
        areaStyle: { color: "rgba(35, 100, 170, 0.12)" },
        data: data.map((item) => item[measureKey])
      }
    ]
  };

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Yearly Funding Trend
        </h2>
        <span className={cn("rounded-full bg-panel px-2 py-1 text-xs text-slate-600")}>
          2020-2023 aggregate is labeled separately
        </span>
      </div>
      <ReactECharts option={option} style={{ height: 280 }} />
    </section>
  );
}
