import { Fragment } from 'react';
import { cn, formatMessageTime } from '@/lib/utils';
import { Check, CheckCheck, Clock, AlertCircle, Phone, Video, PhoneMissed, PhoneOff } from 'lucide-react';
import { AttachmentCard } from '@/features/attachments/AttachmentCard';
import { Avatar } from '@/components/ui/Avatar';

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

function renderText(text, highlight) {
  return text.split(URL_RE).map((part, i) => {
    if (i % 2 === 1) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="underline underline-offset-2 [overflow-wrap:anywhere]"
        >
          {part}
        </a>
      );
    }
    if (!highlight) return <Fragment key={i}>{part}</Fragment>;
    const lower = part.toLowerCase();
    const needle = highlight.toLowerCase();
    const out = [];
    let from = 0;
    let idx = lower.indexOf(needle, from);
    while (idx !== -1) {
      if (idx > from) out.push(part.slice(from, idx));
      out.push(
        <mark key={`${i}-${idx}`} className="rounded bg-yellow-300/80 px-0.5 text-black">
          {part.slice(idx, idx + needle.length)}
        </mark>
      );
      from = idx + needle.length;
      idx = lower.indexOf(needle, from);
    }
    out.push(part.slice(from));
    return <Fragment key={i}>{out}</Fragment>;
  });
}

export function MessageBubble({
  message,
  isOwn = false,
  highlight = '',
  onDownloadAttachment,
  showSender = false,
  senderName = '',
  senderAvatar,
  className,
}) {
  const { body, createdAt, status = 'sent', isDeleted, attachment, messageType, call } = message;
  const hasText = body && body !== '[attachment]';

  if (messageType === 'system' || message.system) {
    return (
      <div className="flex w-full justify-center py-1.5">
        <span className="max-w-[90%] rounded-full bg-bambi-surface/90 px-3 py-1 text-center text-[12px] text-bambi-text-secondary shadow-sm backdrop-blur-sm">
          {body || message.systemMeta?.text || 'Update'}
        </span>
      </div>
    );
  }

  if (messageType === 'call' || call) {
    return (
      <CallLogBubble
        call={call}
        createdAt={createdAt}
        isOwn={isOwn}
        currentUserId={null}
      />
    );
  }

  const meta = (
    <span className="msg-meta inline-flex items-center gap-1 text-[11px] leading-none">
      {formatMessageTime(createdAt)}
      {isOwn && <StatusIcon status={status} />}
    </span>
  );

  return (
    <div className={cn('flex w-full gap-2', isOwn ? 'justify-end' : 'justify-start', className)}>
      {showSender && !isOwn && (
        <Avatar
          src={senderAvatar}
          name={senderName || '?'}
          size="xs"
          className="mt-1 self-end"
        />
      )}
      <div
        className={cn(
          'message-bubble relative min-w-0 max-w-[88%] rounded-[18px] px-3.5 py-2 text-[15px] leading-[22px] sm:max-w-[72%] md:max-w-[65%]',
          isOwn
            ? 'message-bubble-own rounded-br-md'
            : 'message-bubble-peer rounded-bl-md border border-bambi-border/60'
        )}
      >
        {showSender && !isOwn && senderName && (
          <p className="mb-0.5 text-[12px] font-semibold text-bambi-primary">
            {senderName}
          </p>
        )}
        {isDeleted ? (
          <p className="italic opacity-70">This message was deleted</p>
        ) : (
          <>
            {attachment && (
              <AttachmentCard
                filename={attachment.filename}
                mime={attachment.mime}
                size={attachment.size}
                isOwn={isOwn}
                onDownloadDecrypt={() => onDownloadAttachment?.(attachment)}
              />
            )}
            {hasText && (
              <div className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
                {renderText(body, highlight)}
                <span className="float-right ml-3 mt-[7px]">{meta}</span>
              </div>
            )}
          </>
        )}
        {(!hasText || isDeleted) && <div className="mt-1 flex justify-end">{meta}</div>}
      </div>
    </div>
  );
}

function formatDuration(ms) {
  if (!ms || ms < 1000) return '';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m > 0) return `${m}:${String(r).padStart(2, '0')}`;
  return `0:${String(r).padStart(2, '0')}`;
}

function CallLogBubble({ call, createdAt, isOwn }) {
  const kind = call?.kind === 'video' ? 'video' : 'audio';
  const st = call?.status || 'ended';
  const duration = formatDuration(call?.durationMs);
  let label = kind === 'video' ? 'Video call' : 'Voice call';
  let Icon = kind === 'video' ? Video : Phone;
  let tone = 'text-bambi-text-secondary';

  if (st === 'missed' || st === 'declined') {
    label = kind === 'video' ? 'Missed video call' : 'Missed voice call';
    Icon = PhoneMissed;
    tone = 'text-bambi-error';
  } else if (st === 'cancelled' || st === 'busy') {
    label = kind === 'video' ? 'Cancelled video call' : 'Cancelled voice call';
    Icon = PhoneOff;
  } else if (st === 'ended' && duration) {
    label = `${kind === 'video' ? 'Video' : 'Voice'} call · ${duration}`;
  }

  return (
    <div className="flex w-full justify-center py-1">
      <div
        className={cn(
          'inline-flex max-w-[90%] items-center gap-2 rounded-full border border-bambi-border bg-bambi-surface/90 px-3.5 py-1.5 text-xs shadow-sm backdrop-blur-sm',
          tone
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium text-bambi-text">{label}</span>
        <span className="text-bambi-text-secondary">{formatMessageTime(createdAt)}</span>
      </div>
    </div>
  );
}

function StatusIcon({ status }) {
  const iconClass = 'h-3.5 w-3.5';
  switch (status) {
    case 'pending':
    case 'sending':
      return <Clock className={iconClass} aria-label="Sending" />;
    case 'sent':
      return <Check className={iconClass} aria-label="Sent" />;
    case 'delivered':
      return <CheckCheck className={iconClass} aria-label="Delivered" />;
    case 'read':
      return <CheckCheck className={cn(iconClass, 'text-sky-400')} aria-label="Read" />;
    case 'failed':
      return <AlertCircle className={cn(iconClass, 'text-red-400')} aria-label="Failed to send" />;
    default:
      return null;
  }
}
