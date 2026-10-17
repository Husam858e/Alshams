// First run (create the owner account) and login.

import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { BrandMark, Icon } from '../components/icons.js';
import { Button, Field } from '../components/ui.js';
import { api } from '../lib/api.js';
import { lastUsername, login, setupOwner } from '../lib/session.js';

function useRestaurantName() {
  const [name, setName] = useState('');
  useEffect(() => {
    api
      .info()
      .then((info) => setName(info.restaurantName ?? ''))
      .catch(() => {});
  }, []);
  return name;
}

function AuthLayout({ restaurantName, children }) {
  return html`<div class="auth-page">
    <section class="auth-visual" aria-hidden="true">
      <div class="auth-beam"></div>
      <div class="auth-table">
        <div class="auth-ring auth-ring-1"></div>
        <div class="auth-ring auth-ring-2"></div>
        <div class="auth-plate">
          <${BrandMark} size=${76} />
        </div>
      </div>
      <div class="auth-tagline">
        <div class="auth-eyebrow">المنيو الضوئي</div>
        <h2>${restaurantName || 'مطعمك'}</h2>
        <p>منيو كامل يُعرض بالضوء على سطح كل طاولة — تتحكم به من التابلت مع الطلبات.</p>
      </div>
    </section>
    <section class="auth-side">
      <div class="auth-card">${children}</div>
      <p class="auth-foot">تطبيق الموظفين · مالك · مصمم · ويتر</p>
    </section>
  </div>`;
}

function PasswordInput({ id, value, onInput, autocomplete, placeholder }) {
  const [shown, setShown] = useState(false);
  return html`<div class="input-affix">
    <input
      id=${id}
      class="input"
      type=${shown ? 'text' : 'password'}
      autocomplete=${autocomplete}
      value=${value}
      placeholder=${placeholder}
      onInput=${(e) => onInput(e.currentTarget.value)}
      required
      dir="ltr"
    />
    <button
      type="button"
      class="icon-btn icon-btn-sm affix-btn"
      aria-label=${shown ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
      aria-pressed=${shown ? 'true' : 'false'}
      onClick=${() => setShown(!shown)}
    >
      <${Icon} name=${shown ? 'eye-off' : 'eye'} size=${18} />
    </button>
  </div>`;
}

export function LoginScreen() {
  const restaurantName = useRestaurantName();
  const [username, setUsername] = useState(lastUsername);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const target = username ? document.getElementById('login-password') : document.getElementById('login-username');
    target?.focus();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message);
      setPassword('');
      document.getElementById('login-password')?.focus();
    } finally {
      setBusy(false);
    }
  };

  return html`<${AuthLayout} restaurantName=${restaurantName}>
    <div class="auth-head">
      <${BrandMark} size=${48} />
      <div>
        <h1>تسجيل الدخول</h1>
        <p>${restaurantName ? `أهلاً بك في ${restaurantName}` : 'أهلاً بك'}</p>
      </div>
    </div>
    <form class="stack" onSubmit=${submit} novalidate>
      <${Field} label="اسم المستخدم">
        ${() => html`<div class="input-icon">
          <${Icon} name="user" size=${18} />
          <input
            id="login-username"
            class="input"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            dir="ltr"
            value=${username}
            onInput=${(e) => setUsername(e.currentTarget.value)}
            required
          />
        </div>`}
      <//>
      <${Field} label="كلمة المرور">
        ${() => html`<${PasswordInput} id="login-password" value=${password} onInput=${setPassword} autocomplete="current-password" />`}
      <//>
      ${error && html`<div class="auth-error" role="alert"><${Icon} name="alert" size=${18} /><span>${error}</span></div>`}
      <${Button} type="submit" variant="primary" size="lg" block loading=${busy} disabled=${!username.trim() || !password}>دخول<//>
      <p class="auth-hint"><${Icon} name="shield" size=${15} /> يبقى الدخول محفوظاً على هذا الجهاز حتى تسجيل الخروج.</p>
    </form>
  <//>`;
}

export function SetupScreen() {
  const restaurantName = useRestaurantName();
  const [form, setForm] = useState({ name: '', username: '', password: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError('كلمتا المرور غير متطابقتين');
    setBusy(true);
    setError(null);
    try {
      await setupOwner({ name: form.name.trim(), username: form.username.trim(), password: form.password });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const ready = form.name.trim() && form.username.trim() && form.password && form.confirm;
  return html`<${AuthLayout} restaurantName=${restaurantName}>
    <div class="auth-head">
      <${BrandMark} size=${48} />
      <div>
        <h1>إعداد النظام</h1>
        <p>أنشئ حساب المالك للبدء. يمكنك إضافة المصممين والويترية لاحقاً.</p>
      </div>
    </div>
    <ol class="auth-steps" aria-label="خطوات البدء">
      <li class="is-active"><span>1</span>حساب المالك</li>
      <li><span>2</span>الأقسام والطاولات</li>
      <li><span>3</span>المنيو والتصميم</li>
    </ol>
    <form class="stack" onSubmit=${submit} novalidate>
      <${Field} label="الاسم الكامل">
        ${(id) => html`<input id=${id} class="input" autocomplete="name" value=${form.name} onInput=${(e) => set('name')(e.currentTarget.value)} placeholder="مثال: أحمد الكاظمي" required />`}
      <//>
      <${Field} label="اسم المستخدم" hint="بالإنجليزية أو العربية، بدون مسافات">
        ${(id) => html`<input id=${id} class="input" dir="ltr" autocapitalize="none" spellcheck="false" autocomplete="username" value=${form.username} onInput=${(e) => set('username')(e.currentTarget.value)} required />`}
      <//>
      <div class="form-grid">
        <${Field} label="كلمة المرور" hint="4 أحرف على الأقل">
          ${(id) => html`<${PasswordInput} id=${id} value=${form.password} onInput=${set('password')} autocomplete="new-password" />`}
        <//>
        <${Field} label="تأكيد كلمة المرور">
          ${(id) => html`<${PasswordInput} id=${id} value=${form.confirm} onInput=${set('confirm')} autocomplete="new-password" />`}
        <//>
      </div>
      ${error && html`<div class="auth-error" role="alert"><${Icon} name="alert" size=${18} /><span>${error}</span></div>`}
      <${Button} type="submit" variant="primary" size="lg" block loading=${busy} disabled=${!ready} icon="crown">إنشاء حساب المالك والبدء<//>
    </form>
  <//>`;
}
