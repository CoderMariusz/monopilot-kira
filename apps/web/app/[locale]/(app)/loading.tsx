export default function AppRouteGroupLoading() {
  return (
    <div
      data-testid="app-shell"
      className="grid min-h-screen bg-shell-bg text-shell-fg"
      style={{
        minHeight: '100vh',
        gridTemplateColumns: 'var(--shell-sidebar-w) minmax(0, 1fr)',
        gridTemplateRows: 'var(--shell-topbar-h) minmax(0, 1fr)',
      }}
      aria-busy="true"
    >
      <header
        data-testid="app-topbar"
        role="banner"
        className="flex shrink-0 items-center gap-4 border-b border-shell-border bg-shell-surface px-6 text-shell-fg"
        style={{ height: 'var(--shell-topbar-h)', gridColumn: '1 / -1', gridRow: '1 / 2' }}
      >
        <div className="h-5 w-36 rounded bg-shell-active" />
        <div className="h-9 max-w-md flex-1 rounded-full border border-shell-border bg-shell-bg" />
        <div className="ml-auto h-10 w-10 rounded-full bg-shell-active" />
      </header>
      <aside
        data-testid="app-sidebar"
        role="navigation"
        aria-label="Primary"
        className="w-sidebar shrink-0 border-r border-shell-border bg-shell-bg px-4 py-5 text-shell-fg"
        style={{ width: 'var(--shell-sidebar-w)' }}
      >
        <div className="space-y-5">
          {[0, 1, 2, 3].map((group) => (
            <div key={group} className="space-y-2">
              <div className="h-3 w-20 rounded bg-shell-active" />
              <div className="h-10 rounded-xl bg-shell-active" />
              <div className="h-10 rounded-xl border border-shell-border bg-shell-surface" />
            </div>
          ))}
        </div>
      </aside>
      <main data-testid="app-shell-main" className="min-w-0 overflow-auto bg-slate-50 p-6">
        <div className="mx-auto max-w-3xl rounded-xl border border-shell-border bg-white p-8 shadow-sm">
          <div className="mb-6 h-7 w-36 rounded-full bg-shell-active" />
          <div className="mb-3 h-9 w-64 rounded bg-shell-active" />
          <div className="h-5 w-full rounded bg-shell-active" />
          <div className="mt-3 h-5 w-2/3 rounded bg-shell-active" />
        </div>
      </main>
    </div>
  );
}
