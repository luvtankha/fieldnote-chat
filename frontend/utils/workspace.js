import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, pagePath } from '../services/api';

const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:4000';

function merge(records, items, key) {
  const indexed = new Map(records.map((row) => [row[key], row]));
  for (const item of items) {
    const old = indexed.get(item[key]);
    if (!old || old.updatedAt <= item.updatedAt) indexed.set(item[key], item);
  }
  return [...indexed.values()];
}

export function useWorkspace(userId, expire) {
  const [conversations, setConversations] = useState([]);
  const [historyCursor, setHistoryCursor] = useState(null);
  const [turnsByChat, setTurnsByChat] = useState({});
  const [turnCursors, setTurnCursors] = useState({});
  const [streams, setStreams] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState('');
  const socket = useRef(null);
  const active = useRef(null);
  const epoch = useRef(0);

  const addConversations = useCallback((rows) => {
    setConversations((old) => merge(old, rows, 'id').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)));
  }, []);

  const addTurns = useCallback((chatId, rows) => {
    setTurnsByChat((old) => ({
      ...old, [chatId]: merge(old[chatId] || [], rows, 'requestId').sort((a, b) => a.id.localeCompare(b.id))
    }));
    const finished = rows.filter((row) => row.status !== 'pending');
    if (finished.length) setStreams((old) => {
      const next = { ...old };
      for (const row of finished) delete next[row.requestId];
      return next;
    });
  }, []);

  const handleError = useCallback((err) => {
    if (err.status === 401) expire();
    else setError(err.message);
  }, [expire]);

  const loadHistory = useCallback(async (cursor) => {
    const run = epoch.current;
    const { items, nextCursor } = await api(pagePath('/conversations', cursor));
    if (run !== epoch.current) return;
    addConversations(items);
    setHistoryCursor(nextCursor);
  }, [addConversations]);

  const loadTurns = useCallback(async (id, cursor) => {
    const run = epoch.current;
    const data = await api(pagePath(`/conversations/${id}`, cursor));
    if (run !== epoch.current) return;
    addConversations([data.conversation]);
    addTurns(id, data.items);
    setTurnCursors((old) => ({ ...old, [id]: data.nextCursor }));
  }, [addConversations, addTurns]);

  useEffect(() => {
    if (!userId) return;
    setConnection('connecting');
    const run = ++epoch.current;
    let rejoinTimer;
    const connectionSocket = io(socketUrl, {
      autoConnect: false, transports: ['websocket'], timeout: 10000,
      auth: (done) => {
        api('/socket-token').then(({ token }) => done({ token })).catch((err) => {
          done({});
          if (err.status === 401 && run === epoch.current) expire();
        });
      }
    });
    const refresh = () => {
      loadHistory().catch(handleError);
      if (active.current) loadTurns(active.current).catch(handleError);
    };
    connectionSocket.on('connect', () => {
      setConnection('connected');
      clearTimeout(rejoinTimer);
      refresh();
    });
    connectionSocket.on('disconnect', (reason) => {
      setConnection('offline');
      if (reason === 'io server disconnect') connectionSocket.connect();
    });
    connectionSocket.on('connect_error', () => {
      setConnection('offline');
      if (!connectionSocket.active) {
        clearTimeout(rejoinTimer);
        rejoinTimer = setTimeout(() => connectionSocket.connect(), 5000);
      }
    });
    connectionSocket.on('conversation:update', (item) => addConversations([item]));
    connectionSocket.on('turn:update', (item) => addTurns(item.conversationId, [item]));
    connectionSocket.on('turn:delta', ({ requestId, answer }) => setStreams((old) => ({ ...old, [requestId]: answer })));
    socket.current = connectionSocket.connect();
    refresh();
    return () => {
      epoch.current++;
      clearTimeout(rejoinTimer);
      connectionSocket.removeAllListeners();
      connectionSocket.disconnect();
      socket.current = null;
    };
  }, [userId, expire, addConversations, addTurns, loadHistory, loadTurns, handleError]);

  const select = useCallback((id) => {
    active.current = id;
    setActiveId(id);
    setError('');
    if (id) loadTurns(id).catch(handleError);
  }, [loadTurns, handleError]);

  const turns = turnsByChat[activeId];
  const pending = Boolean(turns?.some((turn) => turn.status === 'pending'));
  useEffect(() => {
    if (!activeId || !pending) return;
    const timer = setInterval(() => loadTurns(activeId).catch(handleError), 6000);
    return () => clearInterval(timer);
  }, [activeId, pending, loadTurns, handleError]);

  async function send(text, category, retry) {
    let id = retry?.conversationId || active.current;
    const run = epoch.current;
    setError('');
    if (!id) {
      const created = await api('/conversations', { method: 'POST', body: { category } });
      if (run !== epoch.current) return;
      addConversations([created]);
      id = created.id;
      if (!active.current) select(id);
    }
    const payload = { conversationId: id, text, requestId: retry?.requestId || crypto.randomUUID() };
    let turn;
    if (socket.current?.connected) {
      const result = await socket.current.timeout(55000).emitWithAck('chat:send', payload).catch(() => null);
      if (run !== epoch.current) return;
      if (result?.error) {
        const err = new Error(result.error);
        err.status = result.status;
        throw err;
      }
      turn = result?.turn;
      if (!result) {
        await loadTurns(id);
        throw new Error('The connection was interrupted. Check your conversation before sending again.');
      }
    } else {
      try {
        turn = await api('/messages', { method: 'POST', body: payload });
      } catch (err) {
        if (err.status !== 502) throw err;
        await loadTurns(id);
        return;
      }
    }
    if (turn && run === epoch.current) addTurns(id, [turn]);
  }

  async function rate(turn, rating, feedback) {
    const run = epoch.current;
    const data = await api(`/messages/${turn.id}/feedback`, { method: 'PATCH', body: { rating, feedback } });
    if (run === epoch.current) addTurns(turn.conversationId, [data]);
  }

  return {
    activeId, conversations, turns, streams, connection, error, setError, handleError, select, send, pending, rate,
    moreHistory: historyCursor && (() => loadHistory(historyCursor).catch(handleError)),
    moreTurns: turnCursors[activeId] && (() => loadTurns(activeId, turnCursors[activeId]).catch(handleError))
  };
}
