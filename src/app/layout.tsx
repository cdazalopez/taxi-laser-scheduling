import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Taxi Laser — Scheduling",
  description: "Sistema de scheduling para dispatchers de Taxi Laser LLC",
};

const nav = [
  { href: "/", label: "Schedule" },
  { href: "/asignaciones", label: "En vivo" },
  { href: "/insights", label: "Insights" },
  { href: "/generar", label: "Generar" },
  { href: "/perfiles", label: "Perfiles" },
  { href: "/permisos", label: "Permisos" },
  { href: "/aprobaciones", label: "Aprobaciones" },
  { href: "/configuracion", label: "Config" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-[1920px] items-center gap-6 px-4 py-3 sm:px-6 lg:px-8">
            <Link href="/" className="flex items-center gap-2 font-bold">
              <span className="inline-block h-6 w-6 rounded bg-yellow-400" />
              Taxi Laser
            </Link>
            <nav className="flex gap-1 text-sm">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <a
              href="/api/logout"
              className="ml-auto rounded px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              Salir
            </a>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1920px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </body>
    </html>
  );
}
