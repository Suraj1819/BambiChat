import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Loader2, ShieldCheck, LockKeyhole,
  MessageCircle, Zap, Check, Moon, Sun
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { setSession } from '@/lib/session';
import { getThemePreference, resolveTheme, setThemePreference } from '@/lib/theme';

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState(() => resolveTheme(getThemePreference()));

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemePreference(next);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
      setError('Username must be 3–30 characters using letters, numbers, or underscores.');
      return;
    }
    if (mode === 'register' && displayName.trim().length > 60) {
      setError('Display name must be 60 characters or fewer.');
      return;
    }
    setLoading(true);
    try {
      const response = mode === 'register'
        ? await api.register(cleanUsername, displayName.trim() || cleanUsername)
        : await api.login(cleanUsername);
      setSession({ token: response.data.token, user: response.data.user });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page relative flex min-h-full w-full items-center justify-center overflow-y-auto p-4 sm:p-6 lg:p-10">
      <button
        type="button"
        onClick={toggleTheme}
        className="auth-theme-toggle absolute right-5 top-5 z-10 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition sm:right-8 sm:top-8"
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
      </button>

      <div className="auth-layout grid w-full max-w-6xl overflow-hidden rounded-[28px] border shadow-2xl lg:min-h-[690px] lg:grid-cols-[1.04fr_.96fr]">
        <section className="auth-brand-panel relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-14">
          <div className="auth-orb auth-orb-one" />
          <div className="auth-orb auth-orb-two" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-lg backdrop-blur">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">Bambi</p>
              <p className="text-xs text-white/60">PRIVATE MESSAGING</p>
            </div>
          </div>

          <div className="relative z-10 max-w-lg py-12">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Your conversations, your space
            </div>
            <h1 className="text-4xl font-semibold leading-[1.12] tracking-tight xl:text-5xl">
              Conversations that feel <span className="auth-gradient-text">closer.</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-white/65">
              A focused place to message friends, share files, and stay connected — with privacy built into the experience.
            </p>

            <div className="mt-9 space-y-4">
              <div className="auth-feature-row"><span className="auth-feature-icon"><ShieldCheck className="h-5 w-5" /></span><span><strong>End-to-end encrypted</strong><small>Your message content is encrypted on your device.</small></span><Check className="ml-auto h-4 w-4 text-emerald-300" /></div>
              <div className="auth-feature-row"><span className="auth-feature-icon"><Zap className="h-5 w-5" /></span><span><strong>Instant conversations</strong><small>Real-time messaging and group chats.</small></span><Check className="ml-auto h-4 w-4 text-emerald-300" /></div>
              <div className="auth-feature-row"><span className="auth-feature-icon"><LockKeyhole className="h-5 w-5" /></span><span><strong>Your account, your control</strong><small>Simple access with a clean, distraction-free UI.</small></span><Check className="ml-auto h-4 w-4 text-emerald-300" /></div>
            </div>
          </div>
          <div className="relative z-10 flex items-center justify-between text-xs text-white/45"><span>© {new Date().getFullYear()} Bambi Messenger</span><span>Private by design</span></div>
        </section>

        <section className="auth-form-panel flex items-center justify-center p-5 sm:p-9 lg:p-12">
          <div className="w-full max-w-md py-8 lg:py-0">
            <div className="mb-8 lg:hidden">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-bambi-primary text-white shadow-lg"><MessageCircle className="h-6 w-6" /></div>
              <p className="text-2xl font-bold tracking-tight text-bambi-text">Bambi</p>
              <p className="mt-1 text-sm text-bambi-text-secondary">Private messaging, made simple.</p>
            </div>

            <div className="mb-8">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-bambi-primary">Welcome to Bambi</p>
              <h2 className="text-3xl font-semibold tracking-tight text-bambi-text sm:text-[34px]">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
              <p className="mt-2 text-sm leading-6 text-bambi-text-secondary">{mode === 'login' ? 'Sign in with your username to pick up where you left off.' : 'Choose a username and set up your Bambi profile.'}</p>
            </div>

            <div className="auth-mode-switch mb-6 grid grid-cols-2 rounded-xl p-1">
              <button type="button" onClick={() => { setMode('login'); setError(''); }} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${mode === 'login' ? 'auth-mode-active' : 'text-bambi-text-secondary'}`}>Sign in</button>
              <button type="button" onClick={() => { setMode('register'); setError(''); }} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${mode === 'register' ? 'auth-mode-active' : 'text-bambi-text-secondary'}`}>Create account</button>
            </div>

            <form onSubmit={submit} className="space-y-5">
              {mode === 'register' && <div><label htmlFor="displayName" className="mb-2 block text-sm font-medium text-bambi-text">Display name <span className="font-normal text-bambi-text-secondary">(optional)</span></label><Input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="How people see you" autoComplete="name" maxLength={60} className="auth-input h-12 rounded-xl px-4" /></div>}
              <div>
                <label htmlFor="username" className="mb-2 block text-sm font-medium text-bambi-text">Username</label>
                <div className="relative"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-bambi-text-secondary">@</span><Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="your_username" autoComplete="username" autoFocus className="auth-input h-12 rounded-xl pl-9 pr-4" /></div>
                <p className="mt-2 text-xs text-bambi-text-secondary">3–30 characters · letters, numbers, underscore</p>
              </div>

              {error && <div role="alert" className="auth-error rounded-xl border px-4 py-3 text-sm leading-5">{error}</div>}

              <Button type="submit" variant="primary" className="auth-submit h-12 w-full rounded-xl text-sm font-semibold" disabled={loading}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Please wait…</> : <>{mode === 'register' ? 'Create account' : 'Sign in'}<ArrowRight className="ml-auto h-4 w-4" /></>}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-bambi-text-secondary">{mode === 'login' ? 'New to Bambi?' : 'Already have an account?'}{' '}<button type="button" className="font-semibold text-bambi-primary hover:underline" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Create an account' : 'Sign in instead'}</button></p>

            <div className="auth-security-note mt-8 flex gap-3 rounded-xl border p-3.5"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-bambi-success" /><p className="text-xs leading-5 text-bambi-text-secondary">Message content is encrypted on the client before it is sent. Never share your account access with anyone.</p></div>
            <p className="mt-6 text-center text-[11px] text-bambi-text-secondary/70">By continuing, you agree to use Bambi responsibly.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
