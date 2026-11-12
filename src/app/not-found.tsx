import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-3 py-10">
      <h1 className="text-xl font-semibold">Not here</h1>
      <p className="text-sm text-fg-muted">This page isn&apos;t available with the app&apos;s current permissions and installations.</p>
      <Link href="/">Back to the overview</Link>
    </div>
  );
}
