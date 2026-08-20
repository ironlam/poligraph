import type { ReactNode } from "react";
import { AdminBreadcrumb } from "@/components/admin/AdminBreadcrumb";

export function AdminPageHeader({
  title,
  description,
  action,
  help,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  help?: string;
}) {
  return (
    <header className="space-y-2">
      <AdminBreadcrumb />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          {help && <p className="text-xs text-muted-foreground mt-2">{help}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}
