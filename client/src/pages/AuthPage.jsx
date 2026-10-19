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

/**
 * Auth (no OTP required for phone/username):
 *  Register: phone + username + display name
 *  Login: username OR phone
 * Email OTP remains available later; phone is primary for now.
 */
export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // login | register
  const [loginMethod, setLoginMethod] = useState('username'); // username | phone
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

  const switchMode = (next) => {
    setMode(next);
    setError('');
  };

  const digits = phone.replace(/\D/g, '');

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    const cleanUsername = username.trim().toLowerCase();

    if (mode === 'register') {
      if (digits.length < 8 || digits.length > 15) {
        setError('Enter a valid phone number (8–15 digits).');
        return;
      }
      if (!/^[a-z][a-z0-9_]{2,29}$/.test(cleanUsername)) {
        setError('Username must be 3–30 characters, start with a letter, use a–z, 0–9 or _.');
        return;
      }
      if (displayName.trim().length > 60) {
        setError('Display name must be 60 characters or fewer.');
        return;
      }
      setLoading(true);
      try {
        const response = await api.register(
          cleanUsername,
          displayName.trim() || cleanUsername,
          digits
        );
        setSession({ token: response.data.token, user: response.data.user });
        navigate('/', { replace: true });
      } catch (err) {
        setError(err.message || 'Could not create account.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Login
    if (loginMethod === 'username') {
      if (!/^[a-z][a-z0-9_]{2,29}$/.test(cleanUsername)) {
        setError('Enter a valid username.');
        return;
      }
    } else if (digits.length < 8 || digits.length > 15) {
      setError('Enter a valid phone number (8–15 digits).');
      return;
    }

    setLoading(true);
    try {
      const response = await api.login(
        loginMethod === 'username' ? cleanUsername : undefined,
        loginMethod === 'phone' ? digits : undefined
      );
      setSession({ token: response.data.token, user: response.data.user });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page relative flex min-h-[100dvh] items-center justify-center overflow-hidden p-4">
      <button
        type="button"
        onClick={toggleTheme}
        className="auth-theme-toggle absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="auth-layout relative z-10 grid w-full max-w-4xl overflow-hidden rounded-3xl border md:grid-cols-2">
        <div className="auth-brand-panel relative hidden flex-col justify-between p-10 md:flex">
          <div className="auth-orb auth-orb-one" />
          <div className="auth-orb auth-orb-two" />
          <div className="relative z-10">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <MessageCircle className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Bambi Chat</h1>
            <p className="mt-3 max-w-xs text-sm leading-6 text-white/75">
              Private messaging with end-to-end encryption. Sign up with your phone number.
            </p>
          </div>
          <ul className="relative z-10 space-y-3 text-sm text-white/80">
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0" /> One phone number = one account
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0" /> Encrypted messages &amp; calls
            </li>
          </ul>
        </div>

        <div className="auth-form-panel flex flex-col justify-center p-6 sm:p-10">
          <div className="mb-6 md:hidden">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-bambi-primary text-white">
              <MessageCircle className="h-5 w-5" />
            </div>
            <h1 className="auth-heading text-2xl font-semibold">Bambi Chat</h1>
          </div>

          <div className="auth-method-switch mb-6 grid grid-cols-2 gap-1 rounded-xl p-1">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={
                mode === 'login'
                  ? 'auth-method-active rounded-lg px-3 py-2 text-sm font-medium'
                  : 'rounded-lg px-3 py-2 text-sm text-bambi-text-secondary'
              }
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={
                mode === 'register'
                  ? 'auth-method-active rounded-lg px-3 py-2 text-sm font-medium'
                  : 'rounded-lg px-3 py-2 text-sm text-bambi-text-secondary'
              }
            >
              Create account
            </button>
          </div>

          <h2 className="auth-heading text-xl font-semibold">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="auth-sub mt-1 text-sm text-bambi-text-secondary">
            {mode === 'login'
              ? 'Log in with username or phone number (no OTP).'
              : 'Phone number, username and display name. No OTP for now.'}
          </p>

          {mode === 'login' && (
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-bambi-border p-1">
              <button
                type="button"
                onClick={() => setLoginMethod('username')}
                className={
                  loginMethod === 'username'
                    ? 'rounded-lg bg-bambi-primary px-2 py-2 text-xs font-semibold text-white'
                    : 'rounded-lg px-2 py-2 text-xs text-bambi-text-secondary'
                }
              >
                Username
              </button>
              <button
                type="button"
                onClick={() => setLoginMethod('phone')}
                className={
                  loginMethod === 'phone'
                    ? 'rounded-lg bg-bambi-primary px-2 py-2 text-xs font-semibold text-white'
                    : 'rounded-lg px-2 py-2 text-xs text-bambi-text-secondary'
                }
              >
                Phone
              </button>
            </div>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4">
            {mode === 'register' && (
              <>
                <label className="block">
                  <span className="auth-label mb-1.5 flex items-center gap-2 text-sm font-medium">
                    <Phone className="h-4 w-4" /> Phone number
                  </span>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9876543210"
                    className="auth-input"
                    required
                  />
                </label>
                <label className="block">
                  <span className="auth-label mb-1.5 flex items-center gap-2 text-sm font-medium">
                    <User className="h-4 w-4" /> Username
                  </span>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="yourname"
                    className="auth-input"
                    autoComplete="username"
                    required
                  />
                </label>
                <label className="block">
                  <span className="auth-label mb-1.5 block text-sm font-medium">Display name</span>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="How you appear in chats"
                    className="auth-input"
                    autoComplete="nickname"
                  />
                </label>
              </>
            )}

            {mode === 'login' && loginMethod === 'username' && (
              <label className="block">
                <span className="auth-label mb-1.5 flex items-center gap-2 text-sm font-medium">
                  <User className="h-4 w-4" /> Username
                </span>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="yourname"
                  className="auth-input"
                  autoComplete="username"
                  required
                />
              </label>
            )}

            {mode === 'login' && loginMethod === 'phone' && (
              <label className="block">
                <span className="auth-label mb-1.5 flex items-center gap-2 text-sm font-medium">
                  <Phone className="h-4 w-4" /> Phone number
                </span>
                <Input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210"
                  className="auth-input"
                  required
                />
              </label>
            )}

            {error && (
              <p className="auth-error rounded-xl border px-3 py-2 text-sm" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" className="auth-submit w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Log in' : 'Create account'} <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
