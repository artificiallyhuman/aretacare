import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminAPI } from '../../services/api';
import { formatLocalDate } from '../../utils/dateUtils';

function AdminInvitations() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [newEmail, setNewEmail] = useState('');
  const [addingEntry, setAddingEntry] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(null);
  const [deletingEntry, setDeletingEntry] = useState(null);
  const [entryToDelete, setEntryToDelete] = useState(null);
  const [editingNotes, setEditingNotes] = useState(null);
  const [notesText, setNotesText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getWaitlist();
      setEntries(response.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load waitlist');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  // Clear success message after 5 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleSendInvite = async (entryId, email) => {
    setSendingInvite(entryId);
    setError(null);
    try {
      await adminAPI.sendWaitlistInvite(entryId);
      setSuccess(`Invitation sent to ${email}`);
      fetchEntries();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send invitation');
    } finally {
      setSendingInvite(null);
    }
  };

  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setAddingEntry(true);
    setError(null);
    try {
      await adminAPI.addToWaitlist(newEmail.trim());
      setSuccess(`Added ${newEmail} to waitlist`);
      setNewEmail('');
      fetchEntries();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add entry');
    } finally {
      setAddingEntry(false);
    }
  };

  const handleDeleteEntry = (entry) => {
    setEntryToDelete(entry);
  };

  const confirmDeleteEntry = async () => {
    if (!entryToDelete) return;

    setDeletingEntry(entryToDelete.id);
    setError(null);
    try {
      await adminAPI.deleteWaitlistEntry(entryToDelete.id);
      setSuccess(`Removed ${entryToDelete.email} from waitlist`);
      setEntryToDelete(null);
      fetchEntries();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove entry');
    } finally {
      setDeletingEntry(null);
    }
  };

  const handleEditNotes = (entry) => {
    setEditingNotes(entry.id);
    setNotesText(entry.notes || '');
  };

  const handleSaveNotes = async (entryId) => {
    try {
      await adminAPI.updateWaitlistEntry(entryId, { notes: notesText });
      setSuccess('Notes updated');
      setEditingNotes(null);
      fetchEntries();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update notes');
    }
  };

  const pendingCount = entries.filter(e => !e.has_invitation).length;
  const invitedCount = entries.filter(e => e.has_invitation).length;

  // Filter entries based on search query
  const filteredEntries = entries.filter(entry => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    // Search in email, notes, added_by_email, and referrer emails
    if (entry.email.toLowerCase().includes(query)) return true;
    if (entry.notes && entry.notes.toLowerCase().includes(query)) return true;
    if (entry.added_by_email && entry.added_by_email.toLowerCase().includes(query)) return true;
    if (entry.referrers && entry.referrers.some(r => r.user_email.toLowerCase().includes(query))) return true;
    return false;
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Invitations & Waitlist</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
            Manage waitlist entries and send invitations to new users
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{pendingCount}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Pending on Waitlist</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{invitedCount}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Invited (Awaiting Registration)</div>
          </div>
        </div>

        {/* Messages */}
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

        {/* Add to waitlist form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Add to Waitlist</h2>
          <form onSubmit={handleAddEntry} className="flex gap-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@example.com"
              required
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
            <button
              type="submit"
              disabled={addingEntry}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
            >
              {addingEntry ? 'Adding...' : 'Add'}
            </button>
          </form>
        </div>

        {/* Waitlist entries */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Waitlist ({entries.length})
              </h2>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by email..."
                  className="w-full sm:w-64 pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">No entries in waitlist</div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">No matching entries for "{searchQuery}"</div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredEntries.map((entry) => (
                <div key={entry.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 dark:text-white">{entry.email}</span>
                        {entry.has_invitation ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300">
                            Invited
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300">
                            Pending
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Joined {formatLocalDate(entry.created_at)}
                        {entry.invited_at && (
                          <span className="ml-2 text-green-600 dark:text-green-400">
                            - Invited {formatLocalDate(entry.invited_at)}
                          </span>
                        )}
                      </div>
                      {entry.added_by_email && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Added by: {entry.added_by_email}
                        </div>
                      )}
                      {entry.referrers && entry.referrers.length > 0 && (
                        <div className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                          Referred by: {entry.referrers.map(r => `${r.user_email} (${r.session_name})`).join(', ')}
                        </div>
                      )}

                      {/* Notes section */}
                      {editingNotes === entry.id ? (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            value={notesText}
                            onChange={(e) => setNotesText(e.target.value)}
                            placeholder="Add notes..."
                            className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                          <button
                            onClick={() => handleSaveNotes(entry.id)}
                            className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingNotes(null)}
                            className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="mt-1">
                          {entry.notes ? (
                            <div className="text-sm text-gray-600 dark:text-gray-300">
                              <span className="font-medium">Notes:</span> {entry.notes}
                              <button
                                onClick={() => handleEditNotes(entry)}
                                className="ml-2 text-primary-600 dark:text-primary-400 hover:underline text-xs"
                              >
                                Edit
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleEditNotes(entry)}
                              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            >
                              + Add notes
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleSendInvite(entry.id, entry.email)}
                        disabled={sendingInvite === entry.id}
                        className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                      >
                        {sendingInvite === entry.id ? 'Sending...' : entry.has_invitation ? 'Resend' : 'Invite'}
                      </button>
                      <button
                        onClick={() => handleDeleteEntry(entry)}
                        disabled={deletingEntry === entry.id}
                        className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 border border-red-600 dark:border-red-400 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                      >
                        {deletingEntry === entry.id ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Remove from Waitlist Confirmation Modal */}
      {entryToDelete && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Remove from Waitlist</h2>
                <button
                  onClick={() => setEntryToDelete(null)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Remove {entryToDelete.email}?
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    This will remove them from the waitlist. They will need to sign up again to rejoin.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEntryToDelete(null)}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteEntry}
                  disabled={deletingEntry === entryToDelete.id}
                  className="flex-1 px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded-lg hover:bg-orange-700 dark:hover:bg-orange-600 disabled:opacity-50 text-sm font-medium"
                >
                  {deletingEntry === entryToDelete.id ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </AdminLayout>
  );
}

export default AdminInvitations;
