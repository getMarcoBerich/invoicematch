export default function SessionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-muted/30">
      <main className="w-full p-1">{children}</main>
    </div>
  );
}
