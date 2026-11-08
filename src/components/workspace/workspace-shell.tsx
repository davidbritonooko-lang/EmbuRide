import type { ReactNode } from "react";
import { signOutAction } from "@/app/auth/actions";

export function WorkspaceShell({ title, fullName, children }: {
  title: string;
  fullName: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-teal-800">EMBURIDE</p>
            <p className="mt-1 text-sm text-slate-600">{title} workspace</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden max-w-48 truncate text-sm font-medium text-slate-700 sm:block">{fullName}</p>
            <form action={signOutAction}>
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
