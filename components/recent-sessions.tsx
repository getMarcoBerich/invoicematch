"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Clock, FileSpreadsheet, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { hr } from "@/lib/i18n/hr";
import { getSessionDisplayName } from "@/lib/session-name";
import { deleteAllSessions, listSessionSummaries } from "@/lib/services/session";
import { importSessionBundle } from "@/lib/services/session-bundle";
import { RenameSessionDialog } from "@/components/rename-session-dialog";

type SessionSummary = {
  id: string;
  filename: string;
  name: string;
  importedAt: string | Date;
  invoiceCount: number;
  paymentCount: number;
  matchedCount: number;
};

type RecentSessionsProps = {
  refreshToken?: number;
};

export function RecentSessions({ refreshToken = 0 }: RecentSessionsProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SessionSummary | null>(null);
  const [importing, setImporting] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const sessions = await listSessionSummaries();
      setSessions(sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : hr.upload.loadSessionsFailed);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteAllSessionsHandler = async () => {
    setDeleting(true);
    setError(null);

    try {
      await deleteAllSessions();
      setSessions([]);
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : hr.upload.deleteAllSessionsFailed);
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    void loadSessions();
  }, [loadSessions, refreshToken]);

  const importBundle = async (file: File) => {
    setImporting(true);
    setError(null);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const ids = await importSessionBundle(parsed);
      await loadSessions();
      if (ids.length === 1) router.push(`/session/?id=${ids[0]}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : hr.upload.importSessionFailed);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4" />
              {hr.upload.recentSessions}
            </CardTitle>
            <CardDescription>
              {loading ? "…" : sessions.length > 0 ? hr.upload.recentSessionsHint : null}
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={importing}
              onClick={() => document.getElementById("session-bundle-input")?.click()}
            >
              {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {hr.upload.importSession}
            </Button>
            <input
              id="session-bundle-input"
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importBundle(file);
              }}
            />
            {!loading && sessions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 text-destructive hover:text-destructive"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="size-4" />
                {hr.upload.deleteAllSessions}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{hr.upload.noRecentSessions}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {sessions.map((session) => {
                const displayName = getSessionDisplayName(session);
                return (
                <li key={session.id}>
                  <div className="flex items-center gap-1 px-2 py-1">
                    <button
                      type="button"
                      onClick={() => router.push(`/session/?id=${session.id}`)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/50"
                    >
                      <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(session.importedAt)} ·{" "}
                          {hr.upload.sessionSummary(
                            session.invoiceCount,
                            session.paymentCount,
                            session.matchedCount,
                          )}
                        </p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      aria-label={hr.workspace.renameSession}
                      onClick={() => setRenameTarget(session)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={(open) => !deleting && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hr.upload.deleteAllSessionsConfirmTitle}</DialogTitle>
            <DialogDescription>{hr.upload.deleteAllSessionsConfirmDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setConfirmOpen(false)}>
              {hr.upload.deleteAllSessionsCancel}
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void deleteAllSessionsHandler()}>
              {deleting ? hr.upload.deletingSessions : hr.upload.deleteAllSessionsConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {renameTarget ? (
        <RenameSessionDialog
          open={renameTarget !== null}
          onOpenChange={(open) => !open && setRenameTarget(null)}
          sessionId={renameTarget.id}
          currentName={renameTarget.name}
          filename={renameTarget.filename}
          onRenamed={(name) => {
            setSessions((current) =>
              current.map((session) =>
                session.id === renameTarget.id ? { ...session, name } : session,
              ),
            );
          }}
        />
      ) : null}
    </>
  );
}
