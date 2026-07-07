import { FileSpreadsheet } from "lucide-react";
import { UploadZone } from "@/components/upload-zone";
import { hr } from "@/lib/i18n/hr";

export default function HomePage() {
  return (
    <div className="min-h-full bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex items-center gap-2 px-2 py-2">
          <FileSpreadsheet className="size-6 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">{hr.app.title}</h1>
            <p className="text-xs text-muted-foreground">{hr.app.description}</p>
          </div>
        </div>
      </header>

      <main className="p-2">
        <UploadZone />
      </main>
    </div>
  );
}
