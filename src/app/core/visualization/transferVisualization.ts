/** A new file has a new assembly, overlay and track registry. Only portable
 * visualization expressions can be restored without rebinding these inputs. */
export function pipelineTransferIssues(
  config: Record<string, unknown>
): string[] {
  const issues = new Set<string>();
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    if (
      String(node.type).toLowerCase() === "source" &&
      String(node.source).toUpperCase() === "SECONDARY"
    )
      issues.add("the previous secondary map");
    if (
      String(node.type).toLowerCase() === "track1d" &&
      node.trackId !== "__builtin_cooler_weights__"
    )
      issues.add("tracks belonging to the previous map");
    Object.values(node).forEach(visit);
  }
  visit(config.upperExpression);
  visit(config.lowerExpression);
  return [...issues];
}
