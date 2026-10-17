// Sales reports (owner): date range, KPI tiles, revenue by day, top dishes
// and waiters. Served and paid orders count as revenue.

import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { BarChart } from '../components/BarChart.js';
import { Icon } from '../components/icons.js';
import { Avatar, Empty, ErrorState, PageHeader, Segmented, Skeleton } from '../components/ui.js';
import { api } from '../lib/api.js';
import { NOUNS, addDays, count, currency, dayLabel, int, isoDay, money, num } from '../lib/format.js';
import { useLocalPref } from '../lib/hooks.js';
import { onOrderEvent } from '../lib/store.js';

const PRESETS = [
  { value: 'today', label: 'اليوم' },
  { value: '7', label: '7 أيام' },
  { value: '30', label: '30 يوماً' },
  { value: 'month', label: 'هذا الشهر' },
  { value: 'custom', label: 'مخصص', icon: 'calendar' },
];

function rangeFor(preset) {
  const today = isoDay();
  if (preset === 'today') return { from: today, to: today };
  if (preset === '30') return { from: addDays(today, -29), to: today };
  if (preset === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  return { from: addDays(today, -6), to: today };
}

// Axis labels: "120 ألف", "1.2 مليون".
function compact(v) {
  if (v >= 1e6) return `${num(Math.round(v / 1e5) / 10)} مليون`;
  if (v >= 1e3) return `${num(Math.round(v / 100) / 10)} ألف`;
  return num(v);
}

export default function ReportsScreen() {
  const [preset, setPreset] = useLocalPref('reports-preset', '7');
  const [custom, setCustom] = useState(() => rangeFor('7'));
  const range = preset === 'custom' ? custom : rangeFor(preset);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState('chart');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .reports(range.from, range.to)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err));
    return () => {
      alive = false;
    };
  }, [range.from, range.to, tick]);

  // New revenue (an order served or paid) refreshes the numbers.
  useEffect(() => {
    let t;
    const off = onOrderEvent((o) => {
      if (o.status === 'served' || o.status === 'paid' || o.status === 'cancelled') {
        clearTimeout(t);
        t = setTimeout(() => setTick((n) => n + 1), 600);
      }
    });
    return () => (off(), clearTimeout(t));
  }, []);

  const loading = !data || data.from !== range.from || data.to !== range.to;
  const bestDay = data?.byDay.reduce((b, d) => (d.revenue > (b?.revenue ?? 0) ? d : b), null);
  const maxDish = Math.max(1, ...(data?.topDishes ?? []).map((d) => d.quantity));
  const totalRevenue = data?.totals.revenue || 1;

  return html`<div class="page reports-page">
    <${PageHeader}
      icon="chart"
      title="التقارير"
      subtitle=${`من ${dayLabel(range.from)} إلى ${dayLabel(range.to)} · الطلبات المقدَّمة والمدفوعة`}
      actions=${html`<${Segmented} options=${PRESETS} value=${preset} onChange=${setPreset} label="الفترة" />`}
    />
    ${preset === 'custom' &&
    html`<div class="range-row">
      <label class="date-field"><span>من</span><input type="date" class="input" value=${custom.from} max=${custom.to} onChange=${(e) => e.currentTarget.value && setCustom({ ...custom, from: e.currentTarget.value })} /></label>
      <label class="date-field"><span>إلى</span><input type="date" class="input" value=${custom.to} min=${custom.from} max=${isoDay()} onChange=${(e) => e.currentTarget.value && setCustom({ ...custom, to: e.currentTarget.value })} /></label>
    </div>`}

    ${error
      ? html`<${ErrorState} error=${error} onRetry=${() => setTick((n) => n + 1)} />`
      : html`
          <div class="kpi-grid">
            <${Kpi} icon="cash" label="الإيرادات" loading=${loading} value=${data && html`<span class="num">${num(data.totals.revenue)}</span> <small>${currency()}</small>`} />
            <${Kpi} icon="receipt" label="الطلبات" loading=${loading} value=${data && html`<span class="num">${int(data.totals.orders)}</span>`} sub=${data && data.byDay.length > 1 && data.totals.orders > 0 ? `≈ ${num(Math.round((data.totals.orders / data.byDay.length) * 10) / 10)} في اليوم` : null} />
            <${Kpi} icon="tag" label="متوسط الفاتورة" loading=${loading} value=${data && html`<span class="num">${num(Math.round(data.totals.avgTicket))}</span> <small>${currency()}</small>`} />
            <${Kpi}
              icon="star"
              label="أفضل يوم"
              loading=${loading}
              value=${data && html`<span class="kpi-text">${bestDay ? dayLabel(bestDay.day) : '—'}</span>`}
              sub=${bestDay ? money(bestDay.revenue) : 'لا توجد مبيعات بعد'}
            />
          </div>

          <section class="panel report-panel">
            <div class="panel-head">
              <div class="panel-title"><${Icon} name="chart" size=${18} /> الإيرادات اليومية</div>
              <div class="spacer"></div>
              <${Segmented}
                size="sm"
                label="طريقة العرض"
                value=${view}
                onChange=${setView}
                options=${[
                  { value: 'chart', label: 'رسم', icon: 'chart' },
                  { value: 'table', label: 'جدول', icon: 'list' },
                ]}
              />
            </div>
            <div class="panel-body">
              ${loading
                ? html`<${Skeleton} h=${240} r="12px" />`
                : data.totals.orders === 0
                  ? html`<${Empty} compact icon="chart" title="لا توجد مبيعات في هذه الفترة" text="تظهر هنا الطلبات بعد تقديمها أو دفعها." />`
                  : view === 'chart'
                    ? html`<${BarChart}
                        label="الإيرادات اليومية"
                        format=${compact}
                        data=${data.byDay.map((d) => ({
                          key: d.day,
                          label: `${Number(d.day.slice(8))}/${Number(d.day.slice(5, 7))}`,
                          tip: dayLabel(d.day),
                          value: d.revenue,
                          extra: count(d.orders, NOUNS.order),
                        }))}
                      />`
                    : html`<div class="table-wrap">
                        <table class="data-table">
                          <thead><tr><th>اليوم</th><th>الطلبات</th><th>الإيرادات</th></tr></thead>
                          <tbody>
                            ${[...data.byDay].reverse().map(
                              (d) => html`<tr key=${d.day}><td>${dayLabel(d.day)}</td><td class="num">${d.orders}</td><td class="num">${money(d.revenue)}</td></tr>`,
                            )}
                          </tbody>
                        </table>
                      </div>`}
            </div>
          </section>

          <div class="report-cols">
            <section class="panel report-panel">
              <div class="panel-head"><div class="panel-title"><${Icon} name="flame" size=${18} /> الأطباق الأكثر طلباً</div></div>
              <div class="panel-body">
                ${loading
                  ? html`<div class="stack-sm">${[0, 1, 2, 3].map((i) => html`<${Skeleton} key=${i} h=${40} />`)}</div>`
                  : data.topDishes.length === 0
                    ? html`<${Empty} compact icon="utensils" title="لا توجد بيانات" />`
                    : html`<ol class="rank-list">
                        ${data.topDishes.map(
                          (d, i) => html`<li key=${d.dish_id ?? d.name}>
                            <span class="rank-pos num">${i + 1}</span>
                            <div class="rank-main">
                              <div class="rank-line"><strong class="truncate">${d.name}</strong><span class="num">${money(d.revenue)}</span></div>
                              <div class="rank-bar"><span style=${{ width: `${(d.quantity / maxDish) * 100}%` }}></span></div>
                            </div>
                            <span class="rank-qty"><span class="num">${d.quantity}</span> <small>طلب</small></span>
                          </li>`,
                        )}
                      </ol>`}
              </div>
            </section>

            <section class="panel report-panel">
              <div class="panel-head"><div class="panel-title"><${Icon} name="users" size=${18} /> حسب الويتر</div></div>
              <div class="panel-body">
                ${loading
                  ? html`<div class="stack-sm">${[0, 1, 2].map((i) => html`<${Skeleton} key=${i} h=${52} />`)}</div>`
                  : data.byWaiter.length === 0
                    ? html`<${Empty} compact icon="users" title="لا توجد بيانات" />`
                    : html`<ul class="waiter-list">
                        ${data.byWaiter.map(
                          (w) => html`<li key=${w.waiter_id ?? w.name}>
                            <${Avatar} name=${w.name} size=${40} />
                            <div class="rank-main">
                              <div class="rank-line"><strong class="truncate">${w.name}</strong><span class="num">${money(w.revenue)}</span></div>
                              <div class="rank-bar"><span style=${{ width: `${(w.revenue / totalRevenue) * 100}%` }}></span></div>
                              <span class="muted waiter-sub">${count(w.orders, NOUNS.order)} · ${num(Math.round((w.revenue / totalRevenue) * 100))}% من الإيرادات</span>
                            </div>
                          </li>`,
                        )}
                      </ul>`}
              </div>
            </section>
          </div>
        `}
  </div>`;
}

function Kpi({ icon, label, value, sub, loading }) {
  return html`<div class="kpi">
    <div class="kpi-head"><span class="kpi-icon"><${Icon} name=${icon} size=${18} /></span>${label}</div>
    ${loading ? html`<${Skeleton} w="70%" h=${34} r="8px" />` : html`<div class="kpi-value">${value}</div>`}
    ${!loading && sub && html`<div class="kpi-sub">${sub}</div>`}
  </div>`;
}

