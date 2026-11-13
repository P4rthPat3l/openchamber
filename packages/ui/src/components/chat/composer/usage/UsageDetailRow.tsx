import React from 'react';

/**
 * One label and figure in a usage popover, on the readings' shared type scale:
 * the label muted at the start, the figure medium and tabular at the end.
 */
export const UsageDetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 typography-micro">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="tabular-nums font-medium">{value}</dd>
  </div>
);
