import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import RichTextEditor from '../../components/admin/RichTextEditor';
import { adminAPI } from '../../services/api';
import { formatLocalDate, formatLocalDateTime } from '../../utils/dateUtils';

// Steps: 'list' (history landing) -> 'select' -> 'compose' -> 'review' -> 'sending'
// One route + step state machine so AdminLayout's exact-pathname nav highlight works.

const TERMINAL_STATUSES = ['completed', 'completed_with_errors', 'failed', 'stalled'];

// Every metric is sortable via the "Sort by" control in the filter bar. The
// columns that remain visible (User, Last Login, Last Activity) can also be
// sorted by clicking their headers — both share the same `sort` state. The
// count metrics render as one compact Usage cluster instead of five columns
// so the table fits without horizontal scrolling.
const SORT_OPTIONS = [
  { key: 'last_login', label: 'Last login' },
  { key: 'last_activity', label: 'Last activity' },
  { key: 'name', label: 'Name' },
  { key: 'created_at', label: 'Date joined' },
  { key: 'session_count', label: 'Sessions' },
  { key: 'conversation_count', label: 'Messages' },
  { key: 'document_count', label: 'Documents' },
  { key: 'audio_count', label: 'Audio recordings' },
  { key: 'journal_count', label: 'Journal entries' },
];

const HEADER_SORT_COLUMNS = [
  { key: 'name', label: 'User' },
  { key: 'last_login', label: 'Last Login' },
  { key: 'last_activity', label: 'Last Activity' },
];

// Inline Heroicons path data, same convention as AdminLayout's navItems.
const USAGE_STATS = [
  { key: 'session_count', label: 'Care sessions', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { key: 'conversation_count', label: 'Messages', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { key: 'document_count', label: 'Documents', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'audio_count', label: 'Audio recordings', icon: 'M19 11a7 7 0 01-14 0m7 7v3m0 0H8m4 0h4m-4-3a7 7 0 007-7V9a7 7 0 10-14 0v2a7 7 0 007 7z' },
  { key: 'journal_count', label: 'Journal entries', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.523 5.754 18 7.5 18s3.332.523 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.523 18.247 18 16.5 18c-1.746 0-3.332.523-4.5 1.253' },
];

const DATE_KEYS = new Set(['last_login', 'last_activity', 'created_at']);

// Only active, verified, not-unsubscribed users can be emailed. Everyone else
// stays visible in the table (requirement) but greyed and unselectable.
const isSelectable = (u) => u.is_active && u.is_email_verified && !u.unsubscribed;

const prettyFeature = (f) => f.replace(/_/g, ' ');

function UserBadges({ user }) {
  const badges = [];
  if (!user.is_active) {
    badges.push(['Deactivated', 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300']);
  } else if (!user.is_email_verified) {
    badges.push(['Unverified', 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300']);
  }
  if (user.unsubscribed) {
    badges.push(['Unsubscribed', 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300']);
  }
  if (badges.length === 0) {
    badges.push(['Active', 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300']);
  }
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map(([label, classes]) => (
        <span
          key={label}
          title={label === 'Unsubscribed' && user.unsubscribed_at ? `Unsubscribed ${formatLocalDate(user.unsubscribed_at)}` : undefined}
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${classes}`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function CampaignStatusPill({ status }) {
  const classes = {
    completed: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
    completed_with_errors: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
    stalled: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
    sending: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
    pending: 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300',
  }[status] || 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${classes}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// Dropdown of checkboxes for the feature filters. No shared multiselect exists
// in the codebase; kept local to this page.
function FeatureMultiSelect({ label, hint, options, selected, onChange }) {
  const [open, setOpen] = useState(false);

  const toggle = (feature) => {
    onChange(
      selected.includes(feature)
        ? selected.filter((f) => f !== feature)
        : [...selected, feature]
    );
  };

  return (
    <div className="relative">
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm min-w-[110px] justify-between"
      >
        <span>{selected.length === 0 ? 'Any' : `${selected.length} selected`}</span>
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-30 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
            <p className="px-3 pt-2 pb-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
            <div className="max-h-56 overflow-y-auto px-1 pb-1">
              {options.length === 0 ? (
                <p className="px-2 py-2 text-sm text-gray-500 dark:text-gray-400">
                  No feature activity in the last 30 days
                </p>
              ) : (
                options.map((feature) => (
                  <label
                    key={feature}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(feature)}
                      onChange={() => toggle(feature)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    {prettyFeature(feature)}
                  </label>
                ))
              )}
            </div>
            {selected.length > 0 && (
              <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  Clear selection
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const RECIPIENT_ERROR_LABELS = {
  smtp_send_failed: 'Send failed',
  interrupted: 'Interrupted mid-send',
  unsubscribed: 'Unsubscribed before send',
  user_deleted: 'Account deleted',
  user_ineligible: 'No longer eligible',
  smtp_not_configured: 'SMTP not configured (dev mode)',
};

export default function AdminEmail() {
  const [step, setStep] = useState('list');

  // Recipient data
  const [users, setUsers] = useState([]);
  const [availableFeatures, setAvailableFeatures] = useState([]);
  const [smtpConfigured, setSmtpConfigured] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);

  // Select step
  const [filters, setFilters] = useState({
    search: '',
    lastLogin: 'any',
    featureUsed: [],     // match users who used ANY of these (last 30 days)
    featureNotUsed: [],  // match users who used NONE of these (last 30 days)
    hideUnsubscribed: false,
  });
  const [sort, setSort] = useState({ key: 'last_login', dir: 'desc' });
  const [selected, setSelected] = useState(() => new Set());
  const selectAllRef = useRef(null);

  // Compose step
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');

  // Send / status
  const [submitting, setSubmitting] = useState(false);
  const [campaignId, setCampaignId] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [pollNonce, setPollNonce] = useState(0);

  // History
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);

  const [error, setError] = useState('');

  const fetchCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    try {
      const response = await adminAPI.listEmailCampaigns();
      setCampaigns(response.data.campaigns);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load email history');
    } finally {
      setCampaignsLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const response = await adminAPI.getEmailRecipients();
      setUsers(response.data.users);
      setAvailableFeatures(response.data.available_features);
      setSmtpConfigured(response.data.smtp_configured);
      // Drop selections that are no longer selectable (e.g. user unsubscribed)
      const selectableIds = new Set(response.data.users.filter(isSelectable).map((u) => u.user_id));
      setSelected((prev) => new Set([...prev].filter((id) => selectableIds.has(id))));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // ---- Filtering + sorting (client-side over the full user set) ----

  const filteredSorted = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    let list = users.filter((u) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
      }
      if (filters.lastLogin !== 'any') {
        const ts = u.last_login ? new Date(u.last_login).getTime() : null;
        if (filters.lastLogin === 'within7' && !(ts && now - ts <= 7 * day)) return false;
        if (filters.lastLogin === 'within30' && !(ts && now - ts <= 30 * day)) return false;
        if (filters.lastLogin === 'over30' && ts && now - ts <= 30 * day) return false;
      }
      if (filters.featureUsed.length > 0 && !filters.featureUsed.some((f) => u.features_used.includes(f))) return false;
      if (filters.featureNotUsed.length > 0 && filters.featureNotUsed.some((f) => u.features_used.includes(f))) return false;
      if (filters.hideUnsubscribed && u.unsubscribed) return false;
      return true;
    });

    const { key, dir } = sort;
    const mul = dir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      let av = a[key];
      let bv = b[key];
      if (DATE_KEYS.has(key)) {
        av = av ? new Date(av).getTime() : null;
        bv = bv ? new Date(bv).getTime() : null;
      } else if (typeof av === 'string') {
        av = av.toLowerCase();
        bv = (bv || '').toLowerCase();
      }
      // Nulls always sort last, regardless of direction
      if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
      if (bv === null || bv === undefined) return -1;
      if (av < bv) return -1 * mul;
      if (av > bv) return 1 * mul;
      return 0;
    });
    return list;
  }, [users, filters, sort]);

  const selectableFiltered = useMemo(
    () => filteredSorted.filter(isSelectable),
    [filteredSorted]
  );

  const allFilteredSelected =
    selectableFiltered.length > 0 && selectableFiltered.every((u) => selected.has(u.user_id));
  const someFilteredSelected = selectableFiltered.some((u) => selected.has(u.user_id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredSelected && !allFilteredSelected;
    }
  }, [someFilteredSelected, allFilteredSelected]);

  const toggleUser = (userId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // Check-all applies to the current filtered result set only; selections made
  // under other filters are preserved.
  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        selectableFiltered.forEach((u) => next.delete(u.user_id));
      } else {
        selectableFiltered.forEach((u) => next.add(u.user_id));
      }
      return next;
    });
  };

  const handleSort = (key) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' }
    );
  };

  const selectedUsers = useMemo(
    () => users.filter((u) => selected.has(u.user_id)).sort((a, b) => a.name.localeCompare(b.name)),
    [users, selected]
  );

  const bodyIsEmpty = bodyHtml.replace(/<[^>]+>/g, '').trim() === '';

  // ---- Step transitions ----

  const startNewEmail = () => {
    setError('');
    setStep('select');
    fetchUsers();
  };

  const handleConfirmSend = async () => {
    setSubmitting(true);
    setError('');
    try {
      const response = await adminAPI.createEmailCampaign(
        subject.trim(),
        bodyHtml,
        [...selected]
      );
      setCampaignId(response.data.campaign_id);
      setCampaign(null);
      setPollNonce((n) => n + 1);
      setStep('sending');
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to send email';
      setError(detail);
      if (err.response?.status === 400 && detail.includes('no longer eligible')) {
        // Stale recipient list — refresh it and send the admin back to selection
        setStep('select');
        fetchUsers();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openCampaign = (row) => {
    setError('');
    setCampaignId(row.id);
    setCampaign(row);
    setPollNonce((n) => n + 1);
    setStep('sending');
  };

  const handleResume = async () => {
    setError('');
    try {
      await adminAPI.resumeEmailCampaign(campaignId);
      setPollNonce((n) => n + 1);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to resume campaign');
    }
  };

  const handleDone = () => {
    setStep('list');
    setCampaignId(null);
    setCampaign(null);
    setSelected(new Set());
    setSubject('');
    setBodyHtml('');
    setError('');
    fetchCampaigns();
  };

  // ---- Status polling (2s while sending; one recipients fetch on terminal) ----

  useEffect(() => {
    if (step !== 'sending' || !campaignId) return undefined;
    let cancelled = false;
    let timer = null;

    const poll = async () => {
      try {
        const response = await adminAPI.getEmailCampaign(campaignId);
        if (cancelled) return;
        const status = response.data;
        if (TERMINAL_STATUSES.includes(status.status)) {
          const full = await adminAPI.getEmailCampaign(campaignId, true);
          if (!cancelled) setCampaign(full.data);
        } else {
          setCampaign(status);
          timer = setTimeout(poll, 2000);
        }
      } catch (err) {
        if (!cancelled) {
          timer = setTimeout(poll, 4000);
        }
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [step, campaignId, pollNonce]);

  // ---- Renderers ----

  const renderDevBanner = () =>
    !smtpConfigured && (
      <div className="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-4 py-3 rounded-lg text-sm">
        SMTP is not configured — no emails will actually be sent. Recipients will be recorded
        as skipped and unsubscribe links logged to the backend logs.
      </div>
    );

  const renderList = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Previously sent product-update emails
        </p>
        <button
          onClick={startNewEmail}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
        >
          New Email
        </button>
      </div>

      {campaignsLoading ? (
        <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading...</div>
      ) : campaigns.length === 0 ? (
        <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-4 py-3 rounded-lg">
          No emails sent yet. Click "New Email" to get started.
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Sent By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Recipients</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {campaigns.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => openCampaign(c)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{c.subject}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{c.admin_email}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatLocalDateTime(c.created_at)}</td>
                    <td className="px-4 py-3"><CampaignStatusPill status={c.status} /></td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {c.sent_count} sent
                      {c.failed_count > 0 && `, ${c.failed_count} failed`}
                      {c.skipped_count > 0 && `, ${c.skipped_count} skipped`}
                      {' '}of {c.total_recipients}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  const renderSortHeader = (col) => (
    <th
      key={col.key}
      onClick={() => handleSort(col.key)}
      className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap"
    >
      {col.label}
      {sort.key === col.key && (
        <span className="ml-1">{sort.dir === 'asc' ? '▲' : '▼'}</span>
      )}
    </th>
  );

  const renderSelect = () => (
    <div className="space-y-4">
      {renderDevBanner()}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Name or email..."
              className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Last Login</label>
            <select
              value={filters.lastLogin}
              onChange={(e) => setFilters({ ...filters, lastLogin: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            >
              <option value="any">Any</option>
              <option value="within7">Within 7 days</option>
              <option value="within30">Within 30 days</option>
              <option value="over30">Over 30 days ago / never</option>
            </select>
          </div>
          <FeatureMultiSelect
            label="Feature Used"
            hint="Match users who used any of the selected features (last 30 days)"
            options={availableFeatures}
            selected={filters.featureUsed}
            onChange={(v) => setFilters({ ...filters, featureUsed: v })}
          />
          <FeatureMultiSelect
            label="Feature Not Used"
            hint="Match users who used none of the selected features (last 30 days)"
            options={availableFeatures}
            selected={filters.featureNotUsed}
            onChange={(v) => setFilters({ ...filters, featureNotUsed: v })}
          />
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Sort By</label>
            <div className="flex gap-1">
              <select
                value={sort.key}
                onChange={(e) => setSort({ ...sort, key: e.target.value })}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSort({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
                title={sort.dir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}
                className="px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                {sort.dir === 'asc' ? '▲' : '▼'}
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 pb-1.5">
            <input
              type="checkbox"
              checked={filters.hideUnsubscribed}
              onChange={(e) => setFilters({ ...filters, hideUnsubscribed: e.target.checked })}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            Hide unsubscribed
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Feature filters reflect the last 30 days of activity — "used" matches any selected
          feature, "not used" excludes anyone who used one. Deactivated, unverified, and
          unsubscribed users can't be selected.
        </p>
      </div>

      {usersLoading ? (
        <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading...</div>
      ) : (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-3 py-3 text-left">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleAllFiltered}
                        disabled={selectableFiltered.length === 0}
                        title="Select all eligible users matching the current filters"
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 disabled:opacity-40"
                      />
                    </th>
                    {HEADER_SORT_COLUMNS.map(renderSortHeader)}
                    <th
                      className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                      title="Care sessions · Messages · Documents · Audio recordings · Journal entries — sort via the Sort By control"
                    >
                      Usage
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap" title="From API activity in the last 30 days">
                      Features (30d)
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredSorted.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-gray-600 dark:text-gray-400">
                        No users match the current filters
                      </td>
                    </tr>
                  ) : (
                    filteredSorted.map((u) => {
                      const selectable = isSelectable(u);
                      return (
                        <tr
                          key={u.user_id}
                          onClick={selectable ? () => toggleUser(u.user_id) : undefined}
                          className={
                            selectable
                              ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer'
                              : 'opacity-50'
                          }
                        >
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(u.user_id)}
                              onChange={() => toggleUser(u.user_id)}
                              disabled={!selectable}
                              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 disabled:opacity-40 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-3 py-3" title={`Joined ${formatLocalDate(u.created_at)}`}>
                            <div className="max-w-[220px]">
                              <p className="font-medium text-gray-900 dark:text-white truncate">{u.name}</p>
                              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{u.email}</p>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {u.last_login ? formatLocalDate(u.last_login) : 'Never'}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {u.last_activity ? formatLocalDate(u.last_activity) : 'Never'}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                              {USAGE_STATS.map(({ key, label, icon }) => (
                                <span key={key} title={label} className="inline-flex items-center gap-1 whitespace-nowrap">
                                  <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                                  </svg>
                                  {u[key]}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {u.features_used.length === 0 ? (
                                <span className="text-xs text-gray-400 dark:text-gray-500">None</span>
                              ) : (
                                <>
                                  {u.features_used.slice(0, 2).map((f) => (
                                    <span
                                      key={f}
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 whitespace-nowrap"
                                    >
                                      {prettyFeature(f)}
                                    </span>
                                  ))}
                                  {u.features_used.length > 2 && (
                                    <span
                                      className="text-xs text-gray-500 dark:text-gray-400"
                                      title={u.features_used.slice(2).map(prettyFeature).join(', ')}
                                    >
                                      +{u.features_used.length - 2}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3"><UserBadges user={u} /></td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selection bar */}
          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-semibold text-gray-900 dark:text-white">{selected.size}</span>
              {' '}recipient{selected.size === 1 ? '' : 's'} selected
              <span className="text-gray-500 dark:text-gray-400">
                {' '}· {filteredSorted.length} shown, {selectableFiltered.length} eligible
              </span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDone}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => { setError(''); setStep('compose'); }}
                disabled={selected.size === 0}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
              >
                Compose Email →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const renderCompose = () => (
    <div className="space-y-4">
      {renderDevBanner()}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={150}
            placeholder="What's new in AretaCare..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Body
          </label>
          <RichTextEditor content={bodyHtml} onChange={setBodyHtml} />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            A greeting with each recipient's name, an unsubscribe link, and the AretaCare footer
            are added automatically.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep('select')}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm font-medium"
        >
          ← Back to Recipients
        </button>
        <button
          onClick={() => { setError(''); setStep('review'); }}
          disabled={!subject.trim() || bodyIsEmpty}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
        >
          Review →
        </button>
      </div>
    </div>
  );

  const renderReview = () => (
    <div className="space-y-4">
      {renderDevBanner()}

      {/* Recipients */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
          Sending to {selectedUsers.length} recipient{selectedUsers.length === 1 ? '' : 's'}
        </h2>
        <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
          {selectedUsers.map((u) => (
            <div key={u.user_id} className="py-1.5 flex items-baseline gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-white">{u.name}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{u.email}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Email preview — always rendered light, like a real email client */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">Subject:</span> {subject}
          </p>
        </div>
        <div className="p-4 sm:p-8 bg-gray-100 dark:bg-gray-900">
          <div className="max-w-[600px] mx-auto bg-white rounded-lg shadow overflow-hidden">
            <div className="px-8 pt-8 pb-4 text-center">
              <p className="text-3xl font-bold" style={{ color: '#059669' }}>
                AretaCare<span className="text-lg align-super">™</span>
              </p>
              <p className="mt-1 text-gray-500">Calm | Clarity | Confidence</p>
            </div>
            <div className="px-8 py-4 text-gray-700">
              <p className="mb-2">Hi [recipient's name],</p>
              <RichTextEditor content={bodyHtml} readOnly forceLight />
            </div>
            <div className="px-8 py-4 bg-gray-50 border-t border-gray-200 text-center">
              <p className="text-xs text-gray-500 leading-relaxed">
                You're receiving this email because you have an AretaCare account.<br />
                <span className="text-primary-600 underline">Unsubscribe</span> from product updates
                <span className="text-gray-400"> (link is unique to each recipient)</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep('compose')}
          disabled={submitting}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm font-medium disabled:opacity-50"
        >
          ← Edit
        </button>
        <button
          onClick={handleConfirmSend}
          disabled={submitting}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
        >
          {submitting ? 'Sending...' : `Confirm & Send to ${selectedUsers.length}`}
        </button>
      </div>
    </div>
  );

  const renderSending = () => {
    if (!campaign) {
      return <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading...</div>;
    }
    const processed = campaign.sent_count + campaign.failed_count + campaign.skipped_count;
    const pct = campaign.total_recipients > 0
      ? Math.round((processed / campaign.total_recipients) * 100)
      : 0;
    const isTerminal = TERMINAL_STATUSES.includes(campaign.status);
    const problemRecipients = (campaign.recipients || []).filter(
      (r) => r.status === 'failed' || r.status === 'skipped'
    );

    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{campaign.subject}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sent by {campaign.admin_email} · {formatLocalDateTime(campaign.created_at)}
              </p>
            </div>
            <CampaignStatusPill status={campaign.status} />
          </div>

          {/* Progress */}
          <div>
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
              <span>
                {campaign.sent_count} sent
                {campaign.failed_count > 0 && `, ${campaign.failed_count} failed`}
                {campaign.skipped_count > 0 && `, ${campaign.skipped_count} skipped`}
              </span>
              <span>{processed} of {campaign.total_recipients}</span>
            </div>
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  campaign.status === 'failed' ? 'bg-red-500' : 'bg-primary-600'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Completion banners */}
          {campaign.status === 'completed' && (
            <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg text-sm">
              Email sent to {campaign.sent_count} recipient{campaign.sent_count === 1 ? '' : 's'}.
            </div>
          )}
          {campaign.status === 'completed_with_errors' && (
            <div className="bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-4 py-3 rounded-lg text-sm">
              Finished with issues: {campaign.sent_count} sent, {campaign.failed_count} failed,{' '}
              {campaign.skipped_count} skipped. Details below.
            </div>
          )}
          {campaign.status === 'failed' && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
              The send failed — no emails were delivered. Check the backend logs.
            </div>
          )}
          {campaign.status === 'stalled' && (
            <div className="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-4 py-3 rounded-lg text-sm flex items-center justify-between gap-3">
              <span>
                The send was interrupted (for example by a deploy). Already-sent recipients will
                not be emailed again.
              </span>
              <button
                onClick={handleResume}
                className="px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium whitespace-nowrap"
              >
                Resume Send
              </button>
            </div>
          )}
          {!isTerminal && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Sending in the background — you can stay on this page to watch progress.
            </p>
          )}
        </div>

        {/* Failed / skipped recipients */}
        {isTerminal && problemRecipients.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Not delivered ({problemRecipients.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {problemRecipients.map((r) => (
                    <tr key={`${r.email}-${r.user_id || ''}`}>
                      <td className="px-4 py-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{r.name || '—'}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{r.email}</p>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                        {RECIPIENT_ERROR_LABELS[r.error] || r.error || r.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {isTerminal && (
          <div className="flex justify-end">
            <button
              onClick={handleDone}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
            >
              Done
            </button>
          </div>
        )}
      </div>
    );
  };

  const STEP_TITLES = {
    list: 'Email Users',
    select: 'Select Recipients',
    compose: 'Compose Email',
    review: 'Review & Send',
    sending: 'Email Status',
  };
  const STEP_SUBTITLES = {
    list: 'Send product updates and feature announcements to users',
    select: 'Filter and sort by activity, then choose who to email',
    compose: 'Write the email the way recipients will read it',
    review: 'Check the recipients and final email before sending',
    sending: 'Delivery progress and results',
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{STEP_TITLES[step]}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{STEP_SUBTITLES[step]}</p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {step === 'list' && renderList()}
        {step === 'select' && renderSelect()}
        {step === 'compose' && renderCompose()}
        {step === 'review' && renderReview()}
        {step === 'sending' && renderSending()}
      </div>
    </AdminLayout>
  );
}
