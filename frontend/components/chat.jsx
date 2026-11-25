import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, Check, ChevronDown, Copy, Lightbulb, ListTodo, MessageCircle, MessageSquareText,
  PenLine, RotateCcw, SlidersHorizontal, ThumbsDown, ThumbsUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Mark, Modal } from './identity';

const prompts = [
  { icon: PenLine, color: 'mint', title: 'Help me write', detail: 'Find the right words', prompt: 'Help me draft a short, friendly follow-up email after a meeting.', category: 'professional' },
  { icon: Lightbulb, color: 'gold', title: 'Brainstorm ideas', detail: 'See a new angle', prompt: 'Brainstorm five unusual ideas for a small weekend project.', category: 'creative' },
  { icon: ListTodo, color: 'lilac', title: 'Make a plan', detail: 'Break it into steps', prompt: 'Help me make a practical plan for learning a new skill over the next month.', category: 'professional' },
  { icon: MessageCircle, color: 'blue', title: 'Explain something', detail: 'Make a topic click', prompt: 'Explain a useful idea from psychology using an everyday example.', category: 'casual' }
];

export function Welcome({ name, onPrompt }) {
  return <div className="welcome">
    <Mark large />
    <h1>What’s on your mind?</h1>
    <p>Talk things through with {name}, from first drafts to big ideas.</p>
    <div className="prompt-grid" aria-label="Starter prompts">
      {prompts.map(({ icon: Icon, color, title, detail, prompt, category }) => <button className="prompt-card" key={title} onClick={() => onPrompt(prompt, category)}>
        <span className={`prompt-icon ${color}`}><Icon size={17} /></span>
        <span className="prompt-label"><strong>{title}</strong><small>{detail}</small></span>
        <ArrowUpRight size={15} className="prompt-arrow" />
      </button>)}
    </div>
  </div>;
}

const labels = { casual: 'Casual', professional: 'Professional', creative: 'Creative' };
export function Composer({ value, setValue, category, setCategory, existing, send, blocked, busy, input }) {
  function submit(event) {
    event.preventDefault();
    if (!blocked && value.trim()) send();
  }
  return <form className="composer" onSubmit={submit} aria-label="Send a message">
    <textarea ref={input} aria-label="Message" placeholder="Ask anything…" rows={2} maxLength={4000} value={value}
      onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
      }} />
    <div className="composer-footer">
      {existing ? <span className="category-static"><SlidersHorizontal size={14} />{labels[category]}</span>
        : <label className="category-control"><SlidersHorizontal size={14} /><span className="sr-only">Chat category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Chat category">
            {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select><ChevronDown size={13} aria-hidden="true" />
        </label>}
      <button className="send-button" type="submit" aria-label="Send message" disabled={!value.trim() || blocked}>
        {busy ? <span className="spinner" aria-hidden="true" /> : <ArrowUp size={22} />}
      </button>
    </div>
  </form>;
}

function Feedback({ turn, onClose, onRate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const feedback = new FormData(event.currentTarget).get('feedback');
    setBusy(true);
    setError('');
    try {
      await onRate(turn, turn.rating ?? null, feedback);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <Modal title="Reply feedback" description="Help improve Fieldnote by sharing what worked or what fell short." onClose={onClose}>
    <form className="form-stack" onSubmit={submit}>
      <label>Your feedback<textarea name="feedback" rows={4} maxLength={500} defaultValue={turn.feedback || ''} /></label>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="submit" className="primary-button full-button" disabled={busy}>{busy ? 'Saving…' : 'Save feedback'}<Check size={17} /></button>
    </form>
  </Modal>;
}

export function ConversationView({ activeId, turns, streams, name, retry, rate, more, onError, blocked }) {
  const end = useRef(null);
  const scroller = useRef(null);
  const stick = useRef(true);
  const [copied, setCopied] = useState(null);
  const [feedbackId, setFeedbackId] = useState(null);
  const feedbackTurn = turns?.find((turn) => turn.id === feedbackId);
  const last = turns?.at(-1);
  const latest = last && streams[last.requestId];
  useEffect(() => { stick.current = true; setFeedbackId(null); }, [activeId]);
  useEffect(() => { if (stick.current) end.current?.scrollIntoView({ block: 'end' }); }, [activeId, last, latest]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  return <div className="conversation-scroll" ref={scroller} onScroll={() => {
    const el = scroller.current;
    stick.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }}>
    <div className="conversation-content" aria-label="Conversation" role="region">
      {!turns && <p className="subtle-status" role="status">Loading conversation…</p>}
      {turns?.length === 0 && <p className="subtle-status">Send a message to start this conversation.</p>}
      {more && <button className="secondary-button older-button" onClick={async () => {
        const el = scroller.current;
        const fromBottom = el.scrollHeight - el.scrollTop;
        stick.current = false;
        await more();
        requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - fromBottom; });
      }}>Load earlier messages</button>}
      {turns?.map((turn) => <div className="turn" key={turn.id}>
        <p className="user-message" aria-label="Your message">{turn.input}</p>
        <div className="assistant-message">
          <Mark />
          <div className="assistant-body">
            <strong className="assistant-name">{name}</strong>
            {turn.status === 'pending' && (streams[turn.requestId]
              ? <p className="stream-text">{streams[turn.requestId]}<span className="stream-caret" /></p>
              : <p className="thinking" role="status"><span className="spinner" />Thinking…</p>)}
            {turn.status === 'failed' && <div className="turn-error" role="status"><p>{turn.error}</p>
              <button className="secondary-button" disabled={blocked} onClick={() => retry(turn)}><RotateCcw size={14} /> Try again</button></div>}
            {turn.status === 'complete' && <>
              <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
                a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
                img: ({ alt }) => alt ? <span>[Image: {alt}]</span> : null
              }}>{turn.answer}</ReactMarkdown></div>
              <div className="reply-actions">
                <button className="icon-button" aria-label={copied === turn.id ? 'Copied' : 'Copy reply'} title="Copy reply" onClick={async () => {
                  try { await navigator.clipboard.writeText(turn.answer); setCopied(turn.id); }
                  catch { onError(new Error('Clipboard access is unavailable.')); }
                }}>{copied === turn.id ? <Check size={16} /> : <Copy size={16} />}</button>
                <button className="icon-button" aria-label="Helpful" aria-pressed={turn.rating === 1} title="Helpful" onClick={() => rate(turn, turn.rating === 1 ? null : 1, turn.feedback || '').catch(onError)}><ThumbsUp size={16} /></button>
                <button className="icon-button" aria-label="Unhelpful" aria-pressed={turn.rating === -1} title="Unhelpful" onClick={() => rate(turn, turn.rating === -1 ? null : -1, turn.feedback || '').catch(onError)}><ThumbsDown size={16} /></button>
                <button className="icon-button" aria-label="Give feedback" title="Give feedback" onClick={() => setFeedbackId(turn.id)}><MessageSquareText size={16} /></button>
              </div>
            </>}
          </div>
        </div>
      </div>)}
      <div ref={end} />
    </div>
    {feedbackTurn && <Feedback turn={feedbackTurn} onClose={() => setFeedbackId(null)} onRate={rate} />}
  </div>;
}
