import { useState, useEffect } from 'react';
import { Search, UserPlus, MessageSquare, X, Loader2, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

/**
 * Search users by username or mobile number.
 * Phone match → Message directly. Username → add friend or message if already friends.
 */
export function UserSearchDialog({ open, onClose, onStartChat, friends = [] }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const friendIds = new Set(friends.map((f) => f.id || f.userId));

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setError('');
      setMessage('');
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.searchUsers(query.trim());
        setResults(res.data || []);
      } catch (e) {
        setError(e.message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const handleAdd = async (user) => {
    setActionLoading(user.id);
    setMessage('');
    setError('');
    try {
      await api.sendFriendRequest(user.id);
      setMessage(`Friend request sent to ${user.displayName || user.username}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleChat = async (user) => {
    setActionLoading(user.id);
    setError('');
    try {
      const res = await api.getOrCreateDirect(user.id);
      onStartChat?.(res.data?.id || res.data);
      onClose?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[8vh]">
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-bambi-border bg-bambi-surface shadow-2xl"
        role="dialog"
        aria-label="Find people"
      >
        <div className="flex items-center justify-between border-b border-bambi-border px-4 py-3">
          <h2 className="text-lg font-semibold text-bambi-text">Find people</h2>
          <Button variant="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bambi-text-secondary" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Exact username (e.g. suraj)"
              className="pl-9"
              autoFocus
            />
          </div>
          <p className="mt-2 text-xs text-bambi-text-secondary">
            Type the exact username (after @). Add friend first, then you can chat.
          </p>

          {error && (
            <p className="mt-2 text-sm text-bambi-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="mt-2 text-sm text-bambi-success">{message}</p>
          )}

          <div className="mt-3 max-h-72 overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-bambi-primary" />
              </div>
            )}
            {!loading && query && results.length === 0 && (
              <p className="py-6 text-center text-sm text-bambi-text-secondary">
                No users found
              </p>
            )}
            {!loading &&
              results.map((user) => {
                const isFriend = friendIds.has(user.id);
                const byPhone = user.matchedBy === 'phone';
                return (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-bambi-background"
                  >
                    <Avatar
                      name={user.displayName || user.username}
                      src={user.avatarUrl}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-bambi-text">
                        {user.displayName || user.username}
                      </p>
                      <p className="truncate text-xs text-bambi-text-secondary">
                        @{user.username}
                        {byPhone && (
                          <span className="ml-2 inline-flex items-center gap-0.5 text-bambi-primary">
                            <Phone className="h-3 w-3" /> phone match
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {isFriend ? (
                        <Button
                          variant="secondary"
                          className="!px-2.5 !py-1.5 text-xs"
                          disabled={actionLoading === user.id}
                          onClick={() => handleChat(user)}
                          aria-label="Message"
                          title="Message"
                        >
                          {actionLoading === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MessageSquare className="h-4 w-4" />
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          className="!px-2.5 !py-1.5 text-xs"
                          disabled={actionLoading === user.id}
                          onClick={() => handleAdd(user)}
                          aria-label="Add friend"
                          title="Add friend first"
                        >
                          {actionLoading === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserPlus className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
