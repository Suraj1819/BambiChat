import { MessageCircle, ShieldCheck, Users, Paperclip, Sparkles } from 'lucide-react';

export function NoConversationSelected() {
  return (
    <section className="chat-welcome flex h-full min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-10 md:px-10">
      <div className="w-full max-w-2xl text-center">
        <div className="welcome-illustration relative mx-auto mb-8 flex h-28 w-28 items-center justify-center rounded-[32px]">
          <div className="welcome-orbit welcome-orbit-one" />
          <div className="welcome-orbit welcome-orbit-two" />
          <div className="relative z-10 flex h-[72px] w-[72px] items-center justify-center rounded-[24px] bg-bambi-primary text-white shadow-xl"><MessageCircle className="h-8 w-8" /></div>
          <span className="welcome-sparkle absolute right-0 top-1 z-20 flex h-8 w-8 items-center justify-center rounded-xl"><Sparkles className="h-4 w-4" /></span>
        </div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[.24em] text-bambi-primary">Your private space</p>
        <h1 className="text-3xl font-semibold tracking-tight text-bambi-text sm:text-4xl">Good conversations start here.</h1>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-bambi-text-secondary sm:text-base">Select a conversation from the left, find a friend, or create a group. Your messages are encrypted on your device before they are sent.</p>

        <div className="welcome-feature-grid mt-10 grid gap-3 text-left sm:grid-cols-3">
          <div className="welcome-feature-card"><span className="welcome-feature-icon"><ShieldCheck className="h-5 w-5" /></span><p className="mt-4 text-sm font-semibold text-bambi-text">Private by design</p><p className="mt-1.5 text-xs leading-5 text-bambi-text-secondary">Client-side encryption for supported messages and files.</p></div>
          <div className="welcome-feature-card"><span className="welcome-feature-icon"><Users className="h-5 w-5" /></span><p className="mt-4 text-sm font-semibold text-bambi-text">People & groups</p><p className="mt-1.5 text-xs leading-5 text-bambi-text-secondary">Keep one-to-one and group conversations together.</p></div>
          <div className="welcome-feature-card"><span className="welcome-feature-icon"><Paperclip className="h-5 w-5" /></span><p className="mt-4 text-sm font-semibold text-bambi-text">Share files</p><p className="mt-1.5 text-xs leading-5 text-bambi-text-secondary">Send supported attachments with encryption.</p></div>
        </div>
        <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-bambi-border bg-bambi-surface/70 px-4 py-2 text-xs text-bambi-text-secondary"><span className="h-2 w-2 rounded-full bg-bambi-success" /> Choose a chat to get started</div>
      </div>
    </section>
  );
}
