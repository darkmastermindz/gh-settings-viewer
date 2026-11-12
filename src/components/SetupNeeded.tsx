export function SetupNeeded({ error }: { error: string }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-10">
      <h1 className="text-xl font-semibold">Can&apos;t reach your GitHub App</h1>
      <p role="alert" className="rounded-md border border-danger px-3 py-2 text-sm text-danger">
        {error}
      </p>
      <p className="text-sm">Run these in a terminal, then restart the viewer:</p>
      <pre className="rounded-md border border-border bg-subtle p-3 text-sm font-mono">npx gh-settings-viewer init{'\n'}npx gh-settings-viewer doctor</pre>
    </div>
  );
}
