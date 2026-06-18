import React from 'react';
import { API_BASE } from '@/config/api';
import { withCsrf } from '@/lib/csrf';
import Button from '@/components/ui/Button';
import PageContainer from '@/components/ui/PageContainer';
import { useMe } from '@/contexts/MeContext';

type ReportItem = {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  contribution: {
    id: string;
    text: string;
    sourceUrl: string | null;
    status: string;
    article: { id: string; slug: string; title: string };
    user: { id: string; name: string | null; username: string | null; email: string };
  };
  reporter: { id: string; name: string | null; username: string | null; email: string };
};

export default function AdminContributionReports() {
  const { me, loading } = useMe();
  const [reports, setReports] = React.useState<ReportItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadReports = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/contribution-reports?status=PENDING`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReports(data.reports || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load reports');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!loading && me?.role === 'ADMIN') {
      loadReports();
    }
  }, [loading, me?.role, loadReports]);

  const act = async (reportId: string, action: 'DISMISS' | 'HIDE_CONTRIBUTION' | 'MARK_REVIEWED') => {
    const res = await fetch(
      `${API_BASE}/api/admin/contribution-reports/${reportId}/action`,
      await withCsrf({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }),
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || `HTTP ${res.status}`);
      return;
    }
    setReports((current) => current.filter((report) => report.id !== reportId));
  };

  if (loading || isLoading) {
    return <PageContainer><p className="text-sm text-black/60 dark:text-white/60">Loading...</p></PageContainer>;
  }

  if (!me || me.role !== 'ADMIN') {
    return <PageContainer><p className="text-sm text-red-600">Forbidden.</p></PageContainer>;
  }

  return (
    <PageContainer>
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase text-black/45 dark:text-white/45">Admin</p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-950 dark:text-neutral-50">Contribution reports</h1>
        </div>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </p>
        )}

        {reports.length === 0 ? (
          <p className="rounded-xl border border-black/10 px-4 py-6 text-sm text-black/60 dark:border-white/10 dark:text-white/60">
            No pending contribution reports.
          </p>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <article key={report.id} className="rounded-xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-300">{report.reason}</p>
                    <h2 className="mt-1 text-sm font-semibold text-neutral-950 dark:text-neutral-50">
                      {report.contribution.article.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-neutral-800 dark:text-neutral-100">
                      {report.contribution.text}
                    </p>
                    {report.details && (
                      <p className="mt-2 rounded-lg bg-black/[0.03] px-3 py-2 text-xs text-black/60 dark:bg-white/[0.04] dark:text-white/60">
                        {report.details}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-black/45 dark:text-white/45">
                      Reported by {report.reporter.email} on {new Date(report.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button type="button" variant="secondary" onClick={() => act(report.id, 'DISMISS')}>Dismiss</Button>
                    <Button type="button" variant="secondary" onClick={() => act(report.id, 'MARK_REVIEWED')}>Review</Button>
                    <Button type="button" onClick={() => act(report.id, 'HIDE_CONTRIBUTION')}>Hide</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
