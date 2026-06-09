import { cn } from "@/lib/utils";

/** Centered page column with consistent gutters and max width. */
export function PageContainer({
  children,
  className,
  width = "default",
}: {
  children: React.ReactNode;
  className?: string;
  width?: "default" | "wide" | "narrow";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-6 lg:py-10",
        width === "default" && "max-w-5xl",
        width === "wide" && "max-w-6xl",
        width === "narrow" && "max-w-2xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Broadsheet-style page heading with an eyebrow label and optional actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-7 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1.5">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-prose text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
