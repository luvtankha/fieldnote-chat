import Head from 'next/head';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChartNoAxesColumnIncreasing, ChevronRight, LogOut, MessageCircle, PanelLeft, Plus, Settings2, X } from 'lucide-react';
import Analytics from '../components/analytics';
import { Composer, ConversationView, Welcome } from '../components/chat';
import { AuthModal, Mark, SettingsModal } from '../components/identity';
import { api } from '../services/api';
import { useWorkspace } from '../utils/workspace';

function Sidebar({ user, workspace, open, close, newChat, selectChat, preferences, analytics, logout, login }) {
  const [query, setQuery] = useState('');
  const chats = workspace.conversations.filter((chat) => chat.titled || chat.id === workspace.activeId);
  const initials = user?.name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toLocaleUpperCase();
  return <>
    {open && <button className="sidebar-shade" aria-label="Close sidebar" onClick={close} />}
    <aside className={`sidebar${open ? ' sidebar-open' : ''}`} aria-label="Chat history">
      <div className="sidebar-head">
        <button className="wordmark" onClick={newChat}><Mark /><span>Fieldnote</span></button>
        <button className="icon-button mobile-close" aria-label="Close navigation" onClick={close}><X size={19} /></button>
      </div>
      <button className="new-chat" onClick={newChat}><Plus size={20} /><span>New chat</span><ArrowRight size={15} className="new-arrow" /></button>
      <div className="history">
        <div className="history-heading"><h2>Recent chats</h2>{chats.length > 4 && <input className="history-search" aria-label="Filter recent chats" placeholder="Filter" value={query} onChange={(event) => setQuery(event.target.value)} />}</div>
        {chats.length > 0 ? <nav aria-label="Recent chats">
          {chats.filter((chat) => chat.title.toLowerCase().includes(query.trim().toLowerCase())).map((chat) => <button key={chat.id}
            aria-current={chat.id === workspace.activeId ? 'page' : undefined} className="history-item" onClick={() => selectChat(chat.id)} title={chat.title}>
            <MessageCircle size={16} /><span>{chat.title}</span>
          </button>)}
          {workspace.moreHistory && <button className="text-button history-more" onClick={workspace.moreHistory}>Load more</button>}
        </nav> : <div className="history-empty"><MessageCircle size={17} /><span>{user ? 'Your chats will appear here.' : 'Sign in to save and revisit chats.'}</span></div>}
      </div>
      <div className="sidebar-footer">
        {user?.role === 'admin' && <button className="nav-action" onClick={analytics}><ChartNoAxesColumnIncreasing size={17} /> Analytics</button>}
        <button className="nav-action" onClick={preferences}><Settings2 size={17} /> Preferences</button>
        {user ? <div className="account-row">
          <span className="avatar" aria-hidden="true">{initials}</span><span className="account-name" title={user.name}>{user.name}</span>
          <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={logout}><LogOut size={17} /></button>
        </div> : <button className="account-row guest-account" onClick={login}><span className="avatar guest-avatar" aria-hidden="true"><ChevronRight size={20} /></span><span className="account-name">Sign in to Fieldnote</span><ChevronRight size={16} /></button>}
      </div>
    </aside>
  </>;
}

function Workspace({ user, onUser, expire, initialError, carryDraft }) {
  const [modal, setModal] = useState(null);
  const [analytics, setAnalytics] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [category, setCategory] = useState(carryDraft?.category || 'casual');
  const [draft, setDraft] = useState(carryDraft?.draft || '');
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const selection = useRef(0);
  const input = useRef(null);
  const workspace = useWorkspace(user?.id, expire);
  const active = workspace.conversations.find((chat) => chat.id === workspace.activeId);
  const name = user?.settings.assistantName || 'Fieldnote';
  const busy = sending || workspace.pending;

  function selectChat(id) {
    selection.current++;
    workspace.select(id);
    setAnalytics(false);
    setSidebar(false);
    setDraft('');
    if (!id) setCategory('casual');
  }

  function fillPrompt(text, nextCategory) {
    setDraft(text);
    setCategory(nextCategory);
    input.current?.focus();
  }

  async function send(turn) {
    if (!user) { setModal('signup'); return; }
    if (inFlight.current || workspace.pending) return;
    const text = turn?.input || draft.trim();
    if (!text) return;
    const startedFrom = selection.current;
    inFlight.current = true;
    setSending(true);
    if (!turn) setDraft('');
    try {
      await workspace.send(text, category, turn);
    } catch (err) {
      if (!turn && startedFrom === selection.current) setDraft((current) => current || text);
      workspace.handleError(err);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      expire();
    } catch (err) {
      workspace.handleError(err);
    }
  }

  return <div className="app-shell" data-theme={user?.settings.theme || 'system'}>
    <Sidebar user={user} workspace={workspace} open={sidebar} close={() => setSidebar(false)} newChat={() => selectChat(null)} selectChat={selectChat}
      preferences={() => { setSidebar(false); setModal(user ? 'settings' : 'login'); }} analytics={() => { setSidebar(false); setAnalytics(true); }} logout={logout} login={() => { setSidebar(false); setModal('login'); }} />
    <main className="main-pane">
      <header className="topbar">
        <div className="topbar-title"><button className="icon-button sidebar-toggle" aria-label="Open navigation" aria-expanded={sidebar} onClick={() => setSidebar(true)}><PanelLeft size={20} /></button>
          <span className="topbar-divider" /><span className="section-label">{analytics ? 'Analytics' : 'Workspace'}</span>
          {active && !analytics && <><ChevronRight size={14} className="topbar-chevron" /><span className="thread-title">{active.title}</span></>}
        </div>
        {user ? <div className="connection" title={workspace.connection === 'offline' ? 'Messages can still use the REST API.' : undefined} role="status">
          <span className={`connection-dot ${workspace.connection}`} />{workspace.connection === 'connected' ? 'Live' : workspace.connection === 'offline' ? 'Reconnecting' : 'Connecting'}
        </div> : <div className="topbar-auth"><button className="text-button signin-button" onClick={() => setModal('login')}>Sign in</button>
          <button className="primary-button signup-button" onClick={() => setModal('signup')}>Create account<ArrowRight size={16} /></button></div>}
      </header>
      {analytics ? <Analytics close={() => setAnalytics(false)} expire={expire} /> : <div className={`chat-pane${workspace.activeId ? ' has-conversation' : ''}`}>
        {workspace.activeId ? <ConversationView activeId={workspace.activeId} turns={workspace.turns} streams={workspace.streams} name={name}
          retry={send} rate={workspace.rate} more={workspace.moreTurns} onError={workspace.handleError} blocked={busy} /> : <div className="welcome-wrap"><Welcome name={name} onPrompt={fillPrompt} /></div>}
        <div className="composer-wrap">
          {(workspace.error || initialError) && <div className="inline-error" role="alert">{workspace.error || initialError}</div>}
          <Composer value={draft} setValue={setDraft} category={active?.category || category} setCategory={setCategory}
            existing={active} send={send} blocked={busy} busy={busy} input={input} />
          <p className="composer-note">AI can make mistakes. Check important information.</p>
        </div>
      </div>}
    </main>
    {(modal === 'login' || modal === 'signup') && <AuthModal initial={modal} onClose={() => setModal(null)} onUser={(next) => onUser(next, { draft, category })} />}
    {user && modal === 'settings' && <SettingsModal user={user} onClose={() => setModal(null)} onUser={onUser} onExpire={expire} />}
  </div>;
}

export default function Home() {
  const [user, setUser] = useState(null);
  const [initialError, setInitialError] = useState('');
  const [ready, setReady] = useState(false);
  const [carryDraft, setCarryDraft] = useState(null);
  const expire = useCallback(() => { setCarryDraft(null); setUser(null); }, []);
  const onUser = useCallback((next, draft) => {
    if (draft) setCarryDraft(draft);
    setInitialError('');
    setUser(next);
  }, []);
  useEffect(() => {
    let live = true;
    api('/me').then(({ user }) => { if (live) setUser(user); }).catch((err) => {
      if (live && err.status !== 401) setInitialError(err.message);
    }).finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  return <>
    <Head><title>Fieldnote – AI workspace</title><meta name="description" content="A workspace for thinking, writing, and working with AI." />
      <meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="icon" href="/favicon.svg" /></Head>
    {ready ? <Workspace key={user?.id || 'guest'} user={user} onUser={onUser} expire={expire} initialError={initialError} carryDraft={carryDraft} />
      : <div className="app-loading" role="status"><Mark /><span>Loading Fieldnote…</span></div>}
  </>;
}
