import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center px-5 py-16 sm:px-8">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
          Embu County, Kenya
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 sm:text-6xl">
          Your ride, connected.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
          Discover private and shared rides across Embu County. The EmbuRide
          platform is being prepared for launch.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800">
            Create account
          </Link>
          <Link href="/login" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-800 hover:bg-slate-50">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
