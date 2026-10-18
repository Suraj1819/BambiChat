import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Loader2,
  MessageCircle,
  Moon,
  Sun,
  User,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { setSession } from '@/lib/session';
import { getThemePreference, resolveTheme, setThemePreference } from '@/lib/theme';

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // login | register
  const [method, setMethod] = useState('username'); // username | phone
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
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
    const digits = phone.replace(/\D/g, '');

    if (method === 'username') {
      if (!/^[a-z][a-z0-9_]{2,29}$/.test(cleanUsername)) {
        setError('Username must be 3–30 characters, start with a letter, use a–z, 0–9 or _.');
        return;
      }
    } else {
      if (digits.length < 8 || digits.length > 15) {
        setError('Enter a valid phone number (8–15 digits).');
        return;
      }
    }

    if (mode === 'register' && displayName.trim().length > 60) {
      setError('Display name must be 60 characters or fewer.');
      return;
    }

    setLoading(true);
    try {
      const response =
        mode === 'register'
          ? await api.register(
              method === 'username' ? cleanUsername : undefined,
              displayName.trim() || undefined,
              method === 'phone' ? digits : undefined
            )
          : await api.login(
              method === 'username' ? cleanUsername : undefined,
              method === 'phone' ? digits : undefined
            );
      setSession({ token: response.data.token, user: response.data.user });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page flex min-h-full w-full items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        onClick={toggleTheme}
        className="auth-theme-toggle absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm sm:right-6 sm:top-6"
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
      </button>

      <div className="auth-layout grid w-full max-w-5xl overflow-hidden rounded-3xl border lg:min-h-[560px] lg:grid-cols-2">
        {/* Form — minimal, reference-style */}
        <section className="auth-form-panel order-2 flex items-center justify-center p-6 sm:p-10 lg:order-1 lg:p-12">
          <div className="w-full max-w-[360px]">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bambi-primary text-white">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-semibold text-bambi-text">Bambi</p>
                <p className="text-xs text-bambi-text-secondary">Private messaging</p>
              </div>
            </div>

            <h1 className="auth-heading text-2xl font-semibold tracking-tight sm:text-[28px]">
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h1>
            <p className="auth-sub mt-1.5 text-sm leading-6 text-bambi-text-secondary">
              {mode === 'login'
                ? 'Sign in to continue your conversations.'
                : 'Set up your Bambi profile in a few seconds.'}
            </p>

            {/* Username / Phone */}
            <div className="auth-method-switch mt-6 mb-5 grid grid-cols-2 gap-1 rounded-xl p-1">
              <button
                type="button"
                onClick={() => { setMethod('username'); setError(''); }}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  method === 'username' ? 'auth-method-active' : 'text-bambi-text-secondary'
                }`}
              >
                <User className="h-3.5 w-3.5" />
                Username
              </button>
              <button
                type="button"
                onClick={() => { setMethod('phone'); setError(''); }}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  method === 'phone' ? 'auth-method-active' : 'text-bambi-text-secondary'
                }`}
              >
                <Phone className="h-3.5 w-3.5" />
                Phone
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label htmlFor="displayName" className="auth-label mb-1.5 block text-sm font-medium">
                    Display name <span className="font-normal text-bambi-text-secondary">(optional)</span>
                  </label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="How friends see you"
                    autoComplete="name"
                    maxLength={60}
                    className="auth-input h-11 rounded-xl"
                  />
                </div>
              )}

              {method === 'username' ? (
                <div>
                  <label htmlFor="username" className="auth-label mb-1.5 block text-sm font-medium">
                    Username
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-bambi-text-secondary">
                      @
                    </span>
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="your_username"
                      autoComplete="username"
                      autoFocus
                      className="auth-input h-11 rounded-xl pl-8"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label htmlFor="phone" className="auth-label mb-1.5 block text-sm font-medium">
                    Phone number
                  </label>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    autoComplete="tel"
                    autoFocus
                    className="auth-input h-11 rounded-xl"
                  />
                  <p className="mt-1.5 text-xs text-bambi-text-secondary">
                    Include country code. 8–15 digits.
                  </p>
                </div>
              )}

              {error && (
                <div role="alert" className="auth-error rounded-xl border px-3.5 py-2.5 text-sm">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                className="auth-submit h-11 w-full rounded-xl text-sm font-semibold"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Please wait…
                  </>
                ) : (
                  <>
                    {mode === 'register' ? 'Create account' : 'Sign in'}
                    <ArrowRight className="ml-auto h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-bambi-text-secondary">
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button
                type="button"
                className="font-semibold text-bambi-primary hover:underline"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setError('');
                }}
              >
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>

            <div className="auth-security-note mt-8 flex gap-2.5 rounded-xl border p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-bambi-success" />
              <p className="text-xs leading-5 text-bambi-text-secondary">
                Messages are encrypted on your device before they are sent.
              </p>
            </div>
          </div>
        </section>

        {/* Brand panel — simple, not overloaded */}
        <section className="auth-brand-panel relative order-1 hidden overflow-hidden lg:order-2 lg:flex lg:flex-col lg:justify-between lg:p-10">
          <div className="auth-orb auth-orb-one" />
          <div className="auth-orb auth-orb-two" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 backdrop-blur">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight text-white">Bambi</p>
              <p className="text-[11px] uppercase tracking-wider text-white/50">Private messaging</p>
            </div>
          </div>

          <div className="relative z-10 max-w-sm py-8">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
              Conversations that feel closer.
            </h2>
            <p className="mt-4 text-sm leading-6 text-white/60">
              Real-time messaging with end-to-end encryption, calls, and a calm interface.
            </p>
          </div>

          <p className="relative z-10 text-xs text-white/40">
            © {new Date().getFullYear()} Bambi · Private by design
          </p>
        </section>
      </div>
    </main>
  );
}
