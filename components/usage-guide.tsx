import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hr } from "@/lib/i18n/hr";

export function UsageGuide() {
  const guide = hr.upload.usageGuide;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{guide.title}</CardTitle>
        <CardDescription>{guide.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-3">
          {guide.steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="font-medium">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          {guide.privacy}
        </p>
      </CardContent>
    </Card>
  );
}
