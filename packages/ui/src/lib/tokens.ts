/**
 * Token counts at reading scale: 789, 78.9K, 1.0M. Shared by the context
 * tooltip and the composer's context popover so both round the same way.
 */
export const formatTokens = (tokens: number): string => {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
};
