"use client";
import { Badge } from "@/components/ui/badge";
import { COVERAGE_LABELS, COVERAGE_VARIANTS, type CoverageStatus } from "@/lib/billing/types";

interface CoverageBadgeProps {
  status: CoverageStatus;
  reason?: string;
}

export function CoverageBadge({ status, reason }: CoverageBadgeProps) {
  return (
    <Badge variant={COVERAGE_VARIANTS[status]} title={reason}>
      {COVERAGE_LABELS[status]}
    </Badge>
  );
}
