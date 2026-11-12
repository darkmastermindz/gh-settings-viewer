'use client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl space-y-3 py-10">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p role="alert" className="rounded-md border border-danger px-3 py-2 text-sm text-danger">
        {error.digest ? `Error ${error.digest}. See the terminal running gh-settings-viewer for details.` : error.message}
      </p>
      <button type="button" onClick={reset} className="rounded-md border border-border px-3 py-1.5 text-sm">
        Try again
      </button>
    </div>
  );
}
