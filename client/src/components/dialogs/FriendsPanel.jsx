import { useState, useEffect, useCallback } from 'react';
import {
  X,
  UserPlus,
  Check,
  XCircle,
  MessageSquare,
  UserMinus,
  ShieldBan,
  Loader2,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

/**
 * Friends list + incoming/outgoing requests + block actions.
 */
export function FriendsPanel({ open, onClose, onStartChat, onOpenSearch, initialTab = 'friends', onRequestsChanged }) {
  const [tab, setTab] = useState(initialTab); // friends | requests
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [fRes, rRes] = await Promise.all([
        api.listFriends(),
        api.listFriendRequests(),
      ]);
      setFriends(fRes.data || []);
      setIncoming(rRes.data?.incoming || []);
      setOutgoing(rRes.data?.outgoing || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      load();
    }
  }, [open, load, initialTab]);

  const run = async (id, fn) => {
    setActionId(id);
    setError('');
    setSuccess('');
    try {
      await fn();
      setSuccess('Request updated successfully.');
      await load();
      onRequestsChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionId(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]">
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col animate-slide-up rounded-bambi-xl border border-bambi-border bg-bambi-surface shadow-bambi-lg"
        role="dialog"
        aria-label="Friends"
      >
        <div className="flex items-center justify-between border-b border-bambi-border px-4 py-3">
          <h2 className="text-heading-3 text-bambi-text">Friends</h2>
          <div className="flex items-center gap-1">
            <Button variant="icon" onClick={onOpenSearch} aria-label="Find people">
              <UserPlus className="h-5 w-5" />
            </Button>
            <Button variant="icon" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-bambi-border">
          <button
            type="button"
            className={cn(
              'flex-1 py-2.5 text-label transition-colors',
              tab === 'friends'
                ? 'border-b-2 border-bambi-primary text-bambi-primary'
                : 'text-bambi-text-secondary hover:text-bambi-text'
            )}
            onClick={() => setTab('friends')}
          >
            Friends ({friends.length})
          </button>
          <button
            type="button"
            className={cn(
              'flex-1 py-2.5 text-label transition-colors',
              tab === 'requests'
                ? 'border-b-2 border-bambi-primary text-bambi-primary'
                : 'text-bambi-text-secondary hover:text-bambi-text'
            )}
            onClick={() => setTab('requests')}
          >
            Requests
            {incoming.length > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-bambi-primary px-1 text-[11px] text-white">
                {incoming.length}
              </span>
            )}
          </button>
        </div>

        {error && (
          <p className="px-4 pt-2 text-body-sm text-bambi-error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="px-4 pt-2 text-body-sm text-bambi-success" role="status">
            {success}
          </p>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-bambi-primary" />
            </div>
          ) : tab === 'friends' ? (
            friends.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No friends yet"
                description="Search for people by username to send friend requests."
                action={
                  <Button variant="secondary" size="sm" onClick={onOpenSearch}>
                    Find people
                  </Button>
                }
              />
            ) : (
              friends.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 rounded-bambi px-3 py-2.5 hover:bg-bambi-background"
                >
                  <Avatar name={f.displayName || f.username} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label">{f.displayName || f.username}</p>
                    <p className="truncate text-caption text-bambi-text-secondary">
                      @{f.username}
                    </p>
                  </div>
                  <Button
                    variant="icon"
                    title="Chat"
                    disabled={actionId === f.id}
                    onClick={async () => {
                      setActionId(f.id);
                      try {
                        const res = await api.getOrCreateDirect(f.id);
                        onStartChat?.(res.data.id);
                        onClose?.();
                      } catch (e) {
                        setError(e.message);
                      } finally {
                        setActionId(null);
                      }
                    }}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="icon"
                    title="Remove friend"
                    disabled={actionId === f.id}
                    onClick={() =>
                      run(f.id, () => api.removeFriend(f.id))
                    }
                  >
                    <UserMinus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="icon"
                    title="Block"
                    disabled={actionId === f.id}
                    onClick={() => run(f.id, () => api.blockUser(f.id))}
                  >
                    <ShieldBan className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="px-3 py-1 text-caption font-medium uppercase tracking-wide text-bambi-text-secondary">
                  Incoming
                </h3>
                {incoming.length === 0 ? (
                  <p className="px-3 py-2 text-body-sm text-bambi-text-secondary">
                    No pending requests
                  </p>
                ) : (
                  incoming.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 rounded-bambi px-3 py-2.5"
                    >
                      <Avatar
                        name={r.from?.displayName || r.from?.username}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-label">
                          {r.from?.displayName || r.from?.username}
                        </p>
                        <p className="text-caption text-bambi-text-secondary">
                          @{r.from?.username}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        title="Accept friend request"
                        aria-label={`Accept request from ${r.from?.displayName || r.from?.username || 'user'}`}
                        disabled={actionId === r.id}
                        onClick={() =>
                          run(r.id, () => api.acceptFriendRequest(r.id))
                        }
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Reject friend request"
                        aria-label={`Reject request from ${r.from?.displayName || r.from?.username || 'user'}`}
                        disabled={actionId === r.id}
                        onClick={() =>
                          run(r.id, () => api.rejectFriendRequest(r.id))
                        }
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
              <div>
                <h3 className="px-3 py-1 text-caption font-medium uppercase tracking-wide text-bambi-text-secondary">
                  Outgoing
                </h3>
                {outgoing.length === 0 ? (
                  <p className="px-3 py-2 text-body-sm text-bambi-text-secondary">
                    No outgoing requests
                  </p>
                ) : (
                  outgoing.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 rounded-bambi px-3 py-2.5"
                    >
                      <Avatar
                        name={r.to?.displayName || r.to?.username}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-label">
                          {r.to?.displayName || r.to?.username}
                        </p>
                        <p className="text-caption text-bambi-text-secondary">
                          Pending
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actionId === r.id}
                        onClick={() =>
                          run(r.id, () => api.cancelFriendRequest(r.id))
                        }
                      >
                        Cancel
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        className="absolute inset-0 -z-10 cursor-default"
        onClick={onClose}
        aria-label="Close"
      />
    </div>
  );
}
