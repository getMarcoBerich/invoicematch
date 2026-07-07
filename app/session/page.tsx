"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { SessionWorkspace } from "@/components/session-workspace";
import Link from "next/link";
import { hr } from "@/lib/i18n/hr";

function SessionPageContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("id");

  if (!sessionId) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">{hr.api.sessionNotFound}</p>
        <Link
          href="/"
          className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm hover:bg-muted"
        >
          {hr.workspace.back}
        </Link>
      </div>
    );
  }

  return <SessionWorkspace sessionId={sessionId} />;
}

export default function SessionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SessionPageContent />
    </Suspense>
  );
}
