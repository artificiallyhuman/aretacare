import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminAPI } from '../../services/api';
import { formatLocalDateTime } from '../../utils/dateUtils';
import { apiErrorMessage } from '../../utils/requestUtils';

// Publishes the in-app notice every signed-in user sees: a banner on web and on iOS
// (2.0.0 and later; tapping it opens the full text). It is the second electronic channel for breach notifications; see
// docs/BREACH_RESPONSE.md for when and what to publish. Every notice is kept as a record.

const TITLE_MAX = 120;
const BODY_MAX = 2000;

const inputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm';
const card = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4';

function NoticePreview({ title, body, linkUrl, linkLabel }) {
  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-4 py-3">
      <p className="font-semibold text-gray-900 dark:text-white break-words">{title}</p>
      <p className="mt-1 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line break-words">{body}</p>
      {linkUrl && (
        <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-300 underline break-all">
          {linkLabel || 'Learn more'} ({linkUrl})
        </p>
      )}
    </div>
  );
}

function AdminNotice() {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmEndId, setConfirmEndId] = useState(null);

  const fetchNotices = async () => {
    try {
      const response = await adminAPI.listNotices();
      setNotices(response.data.notices);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load notices'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotices();
  }, []);

  const active = notices.find((n) => n.is_active);
  const canReview = title.trim() && body.trim();

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminAPI.publishNotice({ title: title.trim(), body: body.trim(), linkUrl: linkUrl.trim(), linkLabel: linkLabel.trim() });
      setSuccess('Notice published. Signed-in users will see it the next time the app loads or returns to the foreground.');
      setTitle('');
      setBody('');
      setLinkUrl('');
      setLinkLabel('');
      setReviewing(false);
      fetchNotices();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to publish the notice'));
    } finally {
      setBusy(false);
    }
  };

  const endNotice = async (noticeId) => {
    setBusy(true);
    setError(null);
    try {
      await adminAPI.endNotice(noticeId);
      setSuccess('Notice ended. Users will stop seeing it on their next load.');
      setConfirmEndId(null);
      fetchNotices();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to end the notice'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">In-App Notice</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
            A message every signed-in user sees: a banner on the web, and a banner that opens the full text in the iOS app (version 2.0.0 and later). Use it
            for breach notices alongside email (see <code className="text-xs">docs/BREACH_RESPONSE.md</code>). One notice is shown at a time; every notice is kept as a record.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg border border-green-200 dark:border-green-800">
            {success}
          </div>
        )}

        {/* Current notice */}
        <div className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Showing now</h2>
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          ) : active ? (
            <div className="space-y-3">
              <NoticePreview title={active.title} body={active.body} linkUrl={active.link_url} linkLabel={active.link_label} />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Published {formatLocalDateTime(active.created_at)} by {active.created_by_email}
              </p>
              {confirmEndId === active.id ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Stop showing this notice to everyone?</span>
                  <button
                    type="button"
                    onClick={() => endNotice(active.id)}
                    disabled={busy}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
                  >
                    {busy ? 'Ending…' : 'End notice'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmEndId(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmEndId(active.id)}
                  className="px-4 py-2 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-sm font-medium"
                >
                  End this notice
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No notice is showing.</p>
          )}
        </div>

        {/* Compose */}
        <div className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-1">New notice</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            {active ? 'Publishing replaces the notice showing now. ' : ''}
            Plain text only. Users can dismiss it; a new notice shows again even to people who dismissed the last one.
          </p>
          {reviewing ? (
            <div className="space-y-4">
              <NoticePreview title={title.trim()} body={body.trim()} linkUrl={linkUrl.trim()} linkLabel={linkLabel.trim()} />
              <p className="text-sm text-gray-700 dark:text-gray-300">This goes to every signed-in user on the web and in the iOS app.</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={publish}
                  disabled={busy}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
                >
                  {busy ? 'Publishing…' : 'Publish to all users'}
                </button>
                <button
                  type="button"
                  onClick={() => setReviewing(false)}
                  disabled={busy}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:underline"
                >
                  Edit
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canReview) setReviewing(true);
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="notice-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input id="notice-title" type="text" value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="Important notice about your AretaCare information" className={inputClass} />
              </div>
              <div>
                <label htmlFor="notice-body" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
                <textarea id="notice-body" value={body} maxLength={BODY_MAX} rows={6} onChange={(e) => setBody(e.target.value)} placeholder="What happened, what information was involved, what you can do, and how to reach us." className={inputClass} />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{body.length}/{BODY_MAX}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label htmlFor="notice-link" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Link (optional)</label>
                  <input id="notice-link" type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://aretacare.com/security-incident" className={inputClass} />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Must be an https:// page on aretacare.com.</p>
                </div>
                <div>
                  <label htmlFor="notice-link-label" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Link text</label>
                  <input id="notice-link-label" type="text" value={linkLabel} maxLength={60} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Learn more" className={inputClass} />
                </div>
              </div>
              <button
                type="submit"
                disabled={!canReview}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
              >
                Review
              </button>
            </form>
          )}
        </div>

        {/* History */}
        <div className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">History</h2>
          {notices.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No notices have been published.</p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {notices.map((n) => (
                <li key={n.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white break-words">{n.title}</span>
                    {n.is_active && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">Showing</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Published {formatLocalDateTime(n.created_at)} by {n.created_by_email}
                    {n.ended_at && ` · Ended ${formatLocalDateTime(n.ended_at)} by ${n.ended_by_email}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

export default AdminNotice;
