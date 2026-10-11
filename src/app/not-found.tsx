import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-4 text-center">
      <div className="space-y-3">
        <p className="text-5xl font-bold">404</p>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The page you are looking for doesn&rsquo;t exist or has moved.
        </p>
        <Link
          href="/assistant"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Go to Assistant
        </Link>
      </div>
    </div>
  );
}
