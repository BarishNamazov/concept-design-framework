import { cn } from "@/lib/utils";

/**
 * Renders the backend's already-sanitized post HTML (produced by the Formatting
 * concept via `marked` + `sanitize-html`). We trust it because it is sanitized
 * server-side; we only style it with the editorial `.prose-forum` rules.
 */
export function RenderedMarkdown({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  return (
    <div
      className={cn("prose-forum", className)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitized server-side by Formatting.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
