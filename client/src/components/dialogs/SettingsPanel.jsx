import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Camera, UserRound, ShieldCheck, Bell, Palette, MessageCircle, CircleHelp, LogOut,
  Check, Moon, Sun, Monitor, X, Smartphone, Info, Phone, Keyboard, Ban, Loader2,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { usePreferences, setPreferences } from '@/lib/preferences';
import { getThemePreference, setThemePreference } from '@/lib/theme';

const sections = [
  { id: 'profile', label: 'Profile', icon: UserRound, description: 'Your name and profile photo' },
  { id: 'account', label: 'Account', icon: Smartphone, description: 'Session and account information' },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck, description: 'Encryption and blocked contacts' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Alerts and sounds' },
  { id: 'calls', label: 'Calls', icon: Phone, description: 'Microphone, camera and speaker' },
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme and display' },
  { id: 'chats', label: 'Chats', icon: MessageCircle, description: 'Typing and sending' },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard, description: 'Keyboard shortcuts' },
  { id: 'help', label: 'Help', icon: CircleHelp, description: 'About Bambi' },
];

function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label className={`flex items-center justify-between gap-4 p-4 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-1 block text-sm text-bambi-text-secondary">{description}</span>}
      </span>
      <span className="relative inline-flex h-6 w-11 shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="absolute inset-0 rounded-full bg-bambi-border transition peer-checked:bg-bambi-primary peer-focus-visible:ring-2 peer-focus-visible:ring-bambi-primary peer-focus-visible:ring-offset-2" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function DeviceSelect({ label, value, devices, onChange, emptyLabel }) {
  return (
    <label className="block p-4">
      <span className="mb-2 block text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={devices.length === 0}
        className="bambi-input"
      >
        <option value="">{devices.length ? 'System default' : emptyLabel}</option>
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>{d.label || `${label} ${i + 1}`}</option>
        ))}
      </select>
    </label>
  );
}

function CallsSection() {
  const prefs = usePreferences();
  const [devices, setDevices] = useState({ mics: [], cams: [], speakers: [], labelled: true });
  const [error, setError] = useState('');
  const canPickSpeaker = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices({
      mics: all.filter((d) => d.kind === 'audioinput'),
      cams: all.filter((d) => d.kind === 'videoinput'),
      speakers: all.filter((d) => d.kind === 'audiooutput'),
      labelled: all.every((d) => d.label),
    });
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
  }, [refresh]);

  const allowAccess = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        setError('Access was blocked. Allow microphone and camera in your browser’s site settings.');
      }
    }
    refresh().catch(() => {});
  };

  if (!navigator.mediaDevices?.getUserMedia) {
    return (
      <div className="max-w-xl rounded-xl border p-4 text-sm leading-6 text-bambi-text-secondary">
        Calls need a browser that supports microphone access and a secure (HTTPS) connection.
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      {!devices.labelled && (
        <div className="flex items-center justify-between gap-3 rounded-xl border p-4">
          <p className="text-sm text-bambi-text-secondary">Allow access once to see your device names.</p>
          <Button variant="secondary" size="sm" onClick={allowAccess}>Allow access</Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-bambi-error">{error}</p>}
      <div className="divide-y rounded-xl border">
        <DeviceSelect label="Microphone" value={prefs.micId} devices={devices.mics} emptyLabel="No microphone found" onChange={(v) => setPreferences({ micId: v })} />
        <DeviceSelect label="Camera" value={prefs.cameraId} devices={devices.cams} emptyLabel="No camera found" onChange={(v) => setPreferences({ cameraId: v })} />
        {canPickSpeaker ? (
          <DeviceSelect label="Speaker" value={prefs.speakerId} devices={devices.speakers} emptyLabel="No speaker found" onChange={(v) => setPreferences({ speakerId: v })} />
        ) : (
          <p className="p-4 text-sm text-bambi-text-secondary">Your browser plays calls through the system default speaker.</p>
        )}
      </div>
      <div className="divide-y rounded-xl border">
        <Toggle label="Echo cancellation" description="Reduces your voice coming back through the speaker." checked={prefs.echoCancellation} onChange={(v) => setPreferences({ echoCancellation: v })} />
        <Toggle label="Noise suppression" description="Filters out background noise from your microphone." checked={prefs.noiseSuppression} onChange={(v) => setPreferences({ noiseSuppression: v })} />
        <Toggle label="Ringtone" description="Play a sound for incoming calls." checked={prefs.ringtone} onChange={(v) => setPreferences({ ringtone: v })} />
      </div>
      <p className="text-xs leading-5 text-bambi-text-secondary">Changes apply to your next call. Calls are one-to-one and peer-to-peer; group calls are not available.</p>
    </div>
  );
}

function BlockedSection() {
  const [blocked, setBlocked] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listBlocked();
      setBlocked(res.data || []);
    } catch (e) {
      setError(e.message || 'Could not load blocked contacts');
      setBlocked([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const unblock = async (id) => {
    setBusyId(id);
    setError('');
    try { await api.unblockUser(id); await load(); } catch (e) { setError(e.message || 'Could not unblock'); } finally { setBusyId(null); }
  };

  return (
    <div className="rounded-xl border">
      <div className="flex items-center gap-2 border-b p-4"><Ban className="h-4 w-4 text-bambi-text-secondary" /><p className="font-medium">Blocked contacts</p></div>
      {blocked === null ? (
        <div className="flex justify-center p-5"><Loader2 className="h-5 w-5 animate-spin text-bambi-primary" /></div>
      ) : blocked.length === 0 ? (
        <p className="p-4 text-sm text-bambi-text-secondary">You haven’t blocked anyone.</p>
      ) : (
        <ul className="divide-y">
          {blocked.map((b) => {
            const u = b.user || b;
            const id = u.id || b.userId;
            return (
              <li key={id} className="flex items-center gap-3 p-3">
                <Avatar name={u.displayName || u.username} src={u.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.displayName || u.username}</p>
                  {u.username && <p className="truncate text-xs text-bambi-text-secondary">@{u.username}</p>}
                </div>
                <Button variant="secondary" size="sm" disabled={busyId === id} onClick={() => unblock(id)}>Unblock</Button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="px-4 pb-3 text-sm text-bambi-error">{error}</p>}
    </div>
  );
}

const SHORTCUTS = [
  ['Enter', 'Send message (when “Enter to send” is on)'],
  ['Shift + Enter', 'New line'],
  ['Ctrl / ⌘ + Enter', 'Send message (when “Enter to send” is off)'],
  ['Esc', 'Close dialogs, panels and menus'],
];

export function SettingsPanel({ open, currentUser, onClose, onLogout, onProfileUpdated }) {
  const prefs = usePreferences();
  const [section, setSection] = useState('profile');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || '');
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [saved, setSaved] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [theme, setTheme] = useState(getThemePreference);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setAvatarUrl(currentUser?.avatarUrl || '');
    setDisplayName(currentUser?.displayName || '');
    setSaved(false);
    setAvatarError('');
  }, [open, currentUser?.avatarUrl, currentUser?.displayName]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const saveProfile = () => {
    const profile = { avatarUrl, displayName: displayName.trim() || currentUser?.username || 'Bambi user' };
    try {
      localStorage.setItem(`bambi-profile-${currentUser?.id}`, JSON.stringify(profile));
      onProfileUpdated?.(profile);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch {
      setAvatarError('Could not save — your browser storage may be full or disabled.');
    }
  };

  const changeAvatar = (file) => {
    if (!file) return;
    setAvatarError('');
    if (!file.type.startsWith('image/')) { setAvatarError('Please choose an image file.'); return; }
    if (file.size > 2 * 1024 * 1024) { setAvatarError('Please choose an image smaller than 2 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') { setAvatarUrl(reader.result); setSaved(false); }
    };
    reader.readAsDataURL(file);
  };

  const changeTheme = (value) => { setTheme(value); setThemePreference(value); };

  const changeNotifications = async (checked) => {
    if (checked && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* browser may block prompts */ }
    }
    setPreferences({ browserNotifications: checked });
    try { localStorage.setItem('bambi-notifications', checked ? 'on' : 'off'); } catch { /* ignore */ }
  };

  const selected = sections.find((item) => item.id === section) || sections[0];
  const SelectedIcon = selected.icon;
  const notifPermission = 'Notification' in window ? Notification.permission : 'unsupported';

  const themeOptions = [
    { id: 'light', label: 'Light', desc: 'Bright surfaces and soft borders', icon: Sun },
    { id: 'dark', label: 'Dark', desc: 'A darker, low-glare interface', icon: Moon },
    { id: 'system', label: 'System', desc: 'Match your device setting', icon: Monitor },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/45 p-0 sm:items-center sm:p-5" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close settings" />
      <section
        className="relative z-10 flex h-full w-full max-w-4xl flex-col overflow-hidden bg-bambi-surface shadow-2xl sm:h-[min(760px,90vh)] sm:rounded-3xl sm:border"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 pt-[env(safe-area-inset-top)] sm:px-6 sm:pt-0">
          <Button variant="icon" onClick={onClose} aria-label="Back to chat" title="Back to chat"><ArrowLeft className="h-5 w-5" /></Button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>
          <Button variant="icon" onClick={onClose} aria-label="Close settings" title="Close"><X className="h-5 w-5" /></Button>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav className="flex w-[68px] shrink-0 flex-col gap-1 overflow-y-auto border-r p-2 sm:w-60 sm:p-3" aria-label="Settings sections">
            {sections.map((item) => {
              const Icon = item.icon;
              const active = item.id === section;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex min-h-12 items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors sm:px-3 ${active ? 'bg-bambi-primary-light text-bambi-primary' : 'text-bambi-text-secondary hover:bg-bambi-background hover:text-bambi-text'}`}
                  aria-current={active ? 'page' : undefined}
                  title={item.label}
                >
                  <Icon className="mx-auto h-5 w-5 shrink-0 sm:mx-0" />
                  <span className="hidden min-w-0 sm:block">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[11px] opacity-75">{item.description}</span>
                  </span>
                </button>
              );
            })}
            <div className="mt-auto border-t pt-2">
              <button type="button" onClick={onLogout} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-2 text-sm font-medium text-bambi-error hover:bg-bambi-error/10 sm:justify-start sm:px-3">
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </div>
          </nav>

          <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-bambi-primary-light text-bambi-primary"><SelectedIcon className="h-5 w-5" /></div>
              <div>
                <h3 className="text-xl font-semibold">{selected.label}</h3>
                <p className="text-sm text-bambi-text-secondary">{selected.description}</p>
              </div>
            </div>

            {section === 'profile' && (
              <div className="max-w-xl space-y-6">
                <div className="flex flex-col items-center gap-3 rounded-2xl border bg-bambi-background/60 p-6 sm:flex-row">
                  <div className="relative">
                    <Avatar src={avatarUrl} name={displayName || currentUser?.username} size="xl" />
                    <button type="button" onClick={() => fileRef.current?.click()} className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-bambi-surface bg-bambi-primary text-white shadow" aria-label="Change profile photo" title="Change photo">
                      <Camera className="h-4 w-4" />
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => { changeAvatar(event.target.files?.[0]); event.target.value = ''; }} />
                  </div>
                  <div className="text-center sm:text-left">
                    <p className="font-semibold">{displayName || currentUser?.username || 'Your profile'}</p>
                    <p className="text-sm text-bambi-text-secondary">@{currentUser?.username || 'username'}</p>
                    <button type="button" className="mt-2 text-sm font-medium text-bambi-primary hover:underline" onClick={() => fileRef.current?.click()}>Change photo</button>
                  </div>
                </div>
                {avatarError && <p role="alert" className="text-sm text-bambi-error">{avatarError}</p>}
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">Display name</span>
                  <input value={displayName} maxLength={60} onChange={(event) => { setDisplayName(event.target.value); setSaved(false); }} className="bambi-input" placeholder="Your display name" />
                </label>
                <div className="rounded-xl border p-3 text-xs leading-5 text-bambi-text-secondary">
                  Your photo and display name are saved on this device only. The current API has no profile-update endpoint, so other people will not see these changes yet.
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="primary" onClick={saveProfile}>Save changes</Button>
                  {saved && <span className="inline-flex items-center gap-1 text-sm text-bambi-success"><Check className="h-4 w-4" /> Saved on this device</span>}
                </div>
              </div>
            )}

            {section === 'account' && (
              <div className="max-w-xl divide-y rounded-xl border">
                <div className="p-4"><p className="text-sm font-medium">Signed in as</p><p className="mt-1 text-sm text-bambi-text-secondary">@{currentUser?.username || 'Unknown user'}</p></div>
                <div className="p-4"><p className="text-sm font-medium">Account ID</p><p className="mt-1 break-all text-xs text-bambi-text-secondary">{currentUser?.id || 'Not available'}</p></div>
                <div className="p-4"><p className="text-sm font-medium">Session</p><p className="mt-1 text-sm text-bambi-text-secondary">Your session stays active until you log out or it expires.</p></div>
                <div className="p-4"><Button variant="secondary" onClick={onLogout}><LogOut className="h-4 w-4" /> Log out</Button></div>
              </div>
            )}

            {section === 'privacy' && (
              <div className="max-w-xl space-y-4">
                <div className="flex gap-3 rounded-xl border p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-bambi-success" /><div><p className="font-medium">End-to-end encryption</p><p className="mt-1 text-sm leading-6 text-bambi-text-secondary">Messages and files are encrypted on your device before they are sent. Audio and video calls use WebRTC’s built-in encryption between the two devices.</p></div></div>
                <BlockedSection />
                <p className="text-xs leading-5 text-bambi-text-secondary">Last-seen and read-receipt controls are not available because the current API does not support them.</p>
              </div>
            )}

            {section === 'notifications' && (
              <div className="max-w-xl space-y-3">
                <div className="divide-y rounded-xl border">
                  <Toggle label="Browser notifications" description="Show an alert for new messages and calls when this tab is in the background." checked={prefs.browserNotifications} onChange={changeNotifications} />
                  <Toggle label="Incoming call ringtone" description="Play a sound when someone calls you." checked={prefs.ringtone} onChange={(v) => setPreferences({ ringtone: v })} />
                </div>
                {notifPermission === 'denied' && <p className="text-sm text-bambi-error">Notifications are blocked in your browser. Allow them in the site settings to receive alerts.</p>}
                {notifPermission === 'unsupported' && <p className="text-sm text-bambi-text-secondary">This browser does not support notifications.</p>}
                <p className="text-xs leading-5 text-bambi-text-secondary">These preferences are saved on this device.</p>
              </div>
            )}

            {section === 'calls' && <CallsSection />}

            {section === 'appearance' && (
              <div className="max-w-xl space-y-3" role="radiogroup" aria-label="Theme">
                {themeOptions.map(({ id, label, desc, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={theme === id}
                    onClick={() => changeTheme(id)}
                    className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left ${theme === id ? 'border-bambi-primary bg-bambi-primary-light/50' : 'hover:bg-bambi-background'}`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="flex-1"><span className="block font-medium">{label}</span><span className="text-sm text-bambi-text-secondary">{desc}</span></span>
                    {theme === id && <Check className="h-5 w-5 text-bambi-primary" />}
                  </button>
                ))}
              </div>
            )}

            {section === 'chats' && (
              <div className="max-w-xl space-y-3">
                <div className="divide-y rounded-xl border">
                  <Toggle label="Enter to send" description="Press Enter to send and Shift + Enter for a new line. Turn off to send with Ctrl/⌘ + Enter instead." checked={prefs.enterToSend} onChange={(v) => setPreferences({ enterToSend: v })} />
                </div>
                <div className="rounded-xl border p-4"><p className="font-medium">Message status</p><p className="mt-1 text-sm leading-6 text-bambi-text-secondary">Sent, delivered and read indicators appear when the server reports them.</p></div>
                <div className="rounded-xl border p-4"><p className="font-medium">Attachments</p><p className="mt-1 text-sm leading-6 text-bambi-text-secondary">Images, video, PDF, text and Office files up to 15 MB. Files are encrypted before upload.</p></div>
              </div>
            )}

            {section === 'shortcuts' && (
              <ul className="max-w-xl divide-y rounded-xl border">
                {SHORTCUTS.map(([keys, action]) => (
                  <li key={keys} className="flex items-center justify-between gap-4 p-4">
                    <span className="text-sm text-bambi-text-secondary">{action}</span>
                    <kbd className="shrink-0 rounded-lg border bg-bambi-background px-2 py-1 text-xs font-medium">{keys}</kbd>
                  </li>
                ))}
              </ul>
            )}

            {section === 'help' && (
              <div className="max-w-xl space-y-3">
                <div className="rounded-xl border p-4"><p className="font-medium">Bambi Messenger</p><p className="mt-1 text-sm text-bambi-text-secondary">Encrypted messages, group chats, file sharing and one-to-one audio and video calls.</p></div>
                <div className="flex gap-3 rounded-xl border p-4"><Info className="mt-0.5 h-5 w-5 shrink-0 text-bambi-primary" /><p className="text-sm leading-6 text-bambi-text-secondary">Theme, sound, notification and device choices are stored on this device because the API has no endpoint to sync preferences.</p></div>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}
