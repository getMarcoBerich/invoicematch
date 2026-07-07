"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hr } from "@/lib/i18n/hr";
import { renameSession } from "@/lib/services/session";

type RenameSessionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  currentName: string;
  filename: string;
  onRenamed: (name: string) => void;
};

export function RenameSessionDialog({
  open,
  onOpenChange,
  sessionId,
  currentName,
  filename,
  onRenamed,
}: RenameSessionDialogProps) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setError(null);
    }
  }, [open, currentName]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await renameSession(sessionId, name);
      onRenamed(saved);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : hr.workspace.renameSessionFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{hr.workspace.renameSession}</DialogTitle>
          <DialogDescription>{hr.workspace.sourceFile(filename)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="session-name">{hr.workspace.sessionName}</Label>
          <Input
            id="session-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={hr.workspace.sessionNamePlaceholder}
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSave();
            }}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            {hr.workspace.cancelSessionName}
          </Button>
          <Button disabled={saving || !name.trim()} onClick={() => void handleSave()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : hr.workspace.saveSessionName}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
