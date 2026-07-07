"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hr } from "@/lib/i18n/hr";
import { RecentSessions } from "@/components/recent-sessions";
import { FormatExample } from "@/components/format-example";
import { importExcelFile, renameSession } from "@/lib/services/session";

type ImportResult = {
  sessionId: string;
  filename: string;
  name: string;
  sheetName: string;
  invoiceCount: number;
  paymentCount: number;
  warnings: string[];
};

export function UploadZone() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [opening, setOpening] = useState(false);
  const [sessionsRefreshToken, setSessionsRefreshToken] = useState(0);

  const uploadFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSessionName("");

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError(hr.api.excelOnly);
      setLoading(false);
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const data = await importExcelFile(file.name, buffer);

      setResult(data);
      setSessionName(data.name);
      setSessionsRefreshToken((token) => token + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : hr.upload.uploadFailed);
    } finally {
      setLoading(false);
      const input = document.getElementById("file-input") as HTMLInputElement | null;
      if (input) input.value = "";
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleOpenWorkspace = async () => {
    if (!result) return;
    setOpening(true);
    setError(null);
    try {
      const trimmed = sessionName.trim();
      if (trimmed && trimmed !== result.name) {
        await renameSession(result.sessionId, trimmed);
        setSessionsRefreshToken((token) => token + 1);
      }
      router.push(`/session/?id=${result.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : hr.upload.uploadFailed);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        }`}
      >
        {loading ? (
          <Loader2 className="mb-4 size-10 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="mb-4 size-10 text-muted-foreground" />
        )}
        <p className="mb-2 text-lg font-medium">{hr.upload.dropHere}</p>
        <p className="mb-4 text-sm text-muted-foreground">{hr.upload.formatHint}</p>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          {hr.upload.browse}
        </Button>
        <input
          id="file-input"
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFileInput}
          disabled={loading}
        />
      </div>

      <FormatExample />

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-destructive">{error}</CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5" />
              {hr.upload.importComplete}
            </CardTitle>
            <CardDescription>
              {result.filename} — {hr.upload.sheet} &quot;{result.sheetName}&quot;
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="rounded-lg bg-muted p-4">
                <div className="text-2xl font-bold">{result.invoiceCount}</div>
                <div className="text-sm text-muted-foreground">{hr.upload.invoices}</div>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <div className="text-2xl font-bold">{result.paymentCount}</div>
                <div className="text-sm text-muted-foreground">{hr.upload.payments}</div>
              </div>
            </div>

            {result.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
                <p className="mb-2 text-sm font-medium">{hr.upload.parseWarnings}</p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="import-session-name">{hr.upload.sessionName}</Label>
              <Input
                id="import-session-name"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder={hr.workspace.sessionNamePlaceholder}
              />
              <p className="text-xs text-muted-foreground">{hr.upload.sessionNameHint}</p>
            </div>

            <Button
              className="w-full"
              disabled={opening || !sessionName.trim()}
              onClick={() => void handleOpenWorkspace()}
            >
              {opening ? <Loader2 className="size-4 animate-spin" /> : hr.upload.openWorkspace}
            </Button>
          </CardContent>
        </Card>
      )}

      <RecentSessions refreshToken={sessionsRefreshToken} />
    </div>
  );
}
