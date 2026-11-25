import { useEffect, useState } from 'react';
import { Activity, ArrowLeft, BarChart3, Clock3, MessagesSquare, ThumbsUp, UsersRound } from 'lucide-react';
import { api } from '../services/api';

const format = new Intl.NumberFormat('en');
const number = (value) => format.format(value || 0);
const count = (value, label) => `${number(value)} ${label}${value === 1 ? '' : 's'}`;
const dateLabel = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function Analytics({ close, expire }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    setError('');
    setData(null);
    api(`/admin/analytics?days=${days}`).then((result) => { if (live) setData(result); }).catch((err) => {
      if (!live) return;
      if (err.status === 401) expire();
      else setError(err.message);
    });
    return () => { live = false; };
  }, [days, expire, refresh]);

  const totals = data?.totals || {};
  const ratings = (totals.positive || 0) + (totals.negative || 0);
  const resolved = (totals.completed || 0) + (totals.failures || 0);
  const metrics = data && [
    [UsersRound, 'Active users', number(data.activeUsers), `${count(data.users, 'total account')} · ${number(data.newUsers)} new`],
    [MessagesSquare, 'Messages sent', number(totals.requests), `${count(data.chats, 'conversation')} started`],
    [Activity, 'Replies completed', resolved ? `${Math.round(100 * totals.completed / resolved)}%` : '—', `${number(totals.failures)} failed · ${count(totals.cached, 'cache hit')}`],
    [Clock3, 'Average response', totals.averageLatencyMs == null ? '—' : `${(totals.averageLatencyMs / 1000).toFixed(1)}s`, 'Completed, uncached replies'],
    [ThumbsUp, 'Helpful ratings', ratings ? `${Math.round(100 * totals.positive / ratings)}%` : '—', `${count(ratings, 'rating')} · ${count(totals.feedbackCount, 'comment')}`]
  ];

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const byDate = new Map(data?.daily.map((item) => [item._id, item.requests]));
  const trend = Array.from({ length: days }, (_, i) => {
    const date = new Date(today.getTime() - (days - i - 1) * 86400000);
    return { label: dateLabel.format(date), count: byDate.get(date.toISOString().slice(0, 10)) || 0 };
  });
  const max = Math.max(1, ...trend.map((day) => day.count));
  return <section className="analytics-scroll" aria-label="Analytics">
    <div className="analytics-content">
      <button className="text-button back-button" onClick={close}><ArrowLeft size={17} /> Back to chat</button>
      <div className="analytics-heading"><div><h1>Workspace analytics</h1><p>Chat activity, engagement, and response performance.</p></div>
        <label className="date-select"><span className="sr-only">Analytics period</span><select value={days} onChange={(event) => setDays(Number(event.target.value))}>
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select></label>
      </div>
      {error && <div className="inline-error" role="alert">{error} <button className="text-button" onClick={() => setRefresh(refresh + 1)}>Try again</button></div>}
      {!data && !error && <p role="status" className="subtle-status">Loading analytics…</p>}
      {data && <>
        <div className="metric-grid">{metrics.map(([Icon, label, value, note]) => <div className="metric" key={label}>
          <p><Icon size={16} />{label}</p><strong>{value}</strong><small>{note}</small>
        </div>)}</div>
        <div className="chart-card"><h2><BarChart3 size={20} /> Messages by day (UTC)</h2>
          <div className="chart" role="img" aria-label={trend.map((day) => `${day.label}: ${day.count}`).join(', ')}>
            {trend.map((day) => <div key={day.label} title={`${day.label}: ${day.count}`} className="bar-column">
              <span className="chart-bar" style={{ height: `${Math.max(2, day.count / max * 100)}%` }} />
            </div>)}
          </div>
          <div className="chart-labels"><span>{trend[0].label}</span><span>{trend.at(-1).label}</span></div>
        </div>
        <div className="chart-card"><h2>Recent feedback</h2>
          {data.feedback.length ? <ul className="feedback-list">{data.feedback.map((row) => <li key={row._id}>
            <p>{row.feedback}</p><small>{dateLabel.format(new Date(row.updatedAt))} · {row.rating === 1 ? 'Helpful' : row.rating === -1 ? 'Unhelpful' : 'Comment'}</small>
          </li>)}</ul> : <p className="muted">No written feedback in this period.</p>}
        </div>
      </>}
    </div>
  </section>;
}
