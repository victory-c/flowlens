import { FlowLensDashboard } from "@/features/dashboard/flowlens-dashboard";
import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading FlowLens...</div>}>
      <FlowLensDashboard />
    </Suspense>
  );
}
