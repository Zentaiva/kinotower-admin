'use strict';
const http = require('http');
const crypto = require('crypto');

const PORT = 8000;
const SESSION_TTL = 1000 * 60 * 60 * 8;
const sessions = new Map();

// ─── helpers ────────────────────────────────────────────────────────────────

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, stored) {
  const idx = stored.indexOf(':');
  const salt = stored.slice(0, idx);
  const original = stored.slice(idx + 1);
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  if (hash.length !== original.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(original, 'hex'));
}

function nowIso() { return new Date().toISOString(); }

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function parseBody(req) {
  return new Promise(resolve => {
    let s = '';
    req.on('data', c => { s += c; });
    req.on('end', () => resolve(new URLSearchParams(s)));
  });
}

function fv(body, key, fallback) {
  const v = body.get(key);
  return (v && v.trim()) ? v.trim() : (fallback !== undefined ? fallback : '');
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '').split(';').filter(Boolean).map(p => {
      const [k, ...v] = p.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
}

function currentAdmin(req) {
  const sid = parseCookies(req).sid;
  if (!sid || !sessions.has(sid)) return null;
  const s = sessions.get(sid);
  if (Date.now() > s.expires) { sessions.delete(sid); return null; }
  s.expires = Date.now() + SESSION_TTL;
  return s.admin;
}

function send(res, status, html, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, extra || {}));
  res.end(html);
}

function redirect(res, loc) {
  res.writeHead(302, { Location: loc });
  res.end();
}

// ─── seed data ───────────────────────────────────────────────────────────────

function seedData() {
  return {
    counters: { admins: 2, countries: 7, categories: 8, films: 7, users: 7, reviews: 7, ratings: 7 },
    admins: [{
      id: 1, name: 'Administrator', email: 'admin@kinotower.local',
      password: hashPassword('password', 'kinotower-admin-salt'),
      created_at: nowIso()
    }],
    countries: [
      { id: 1, title: 'США' }, { id: 2, title: 'Казахстан' }, { id: 3, title: 'Франция' },
      { id: 4, title: 'Япония' }, { id: 5, title: 'Южная Корея' }, { id: 6, title: 'Великобритания' }
    ],
    categories: [
      { id: 1, title: 'Драма' }, { id: 2, title: 'Комедия' }, { id: 3, title: 'Боевик' },
      { id: 4, title: 'Фантастика' }, { id: 5, title: 'Триллер' }, { id: 6, title: 'Аниме' },
      { id: 7, title: 'Документальный' }
    ],
    films: [
      { id: 1, title: 'Башня времени',   description: 'Приключенческий фильм о городе будущего.', year: 2024, country_id: 2, duration: 118, deleted_at: null },
      { id: 2, title: 'Ночной сеанс',    description: 'Триллер про закрытый кинотеатр.',          year: 2023, country_id: 1, duration: 104, deleted_at: null },
      { id: 3, title: 'Парижский кадр',  description: 'Драма о режиссере и его первом фильме.',   year: 2022, country_id: 3, duration: 126, deleted_at: null },
      { id: 4, title: 'Станция Сакура',  description: 'Фантастическая история о путешествии.',    year: 2025, country_id: 4, duration: 132, deleted_at: null },
      { id: 5, title: 'Последний дубль', description: 'Комедия о съемочной группе.',              year: 2021, country_id: 6, duration:  98, deleted_at: null },
      { id: 6, title: 'Сеул 2049',       description: 'Киберпанк-боевик с расследованием.',       year: 2024, country_id: 5, duration: 121, deleted_at: null }
    ],
    film_categories: [
      { film_id: 1, category_id: 3 }, { film_id: 1, category_id: 4 },
      { film_id: 2, category_id: 5 }, { film_id: 2, category_id: 1 },
      { film_id: 3, category_id: 1 }, { film_id: 4, category_id: 4 },
      { film_id: 4, category_id: 6 }, { film_id: 5, category_id: 2 },
      { film_id: 6, category_id: 3 }, { film_id: 6, category_id: 4 }
    ],
    users: [
      { id: 1, name: 'Алия',   email: 'aliya@example.com',  deleted_at: null },
      { id: 2, name: 'Иван',   email: 'ivan@example.com',   deleted_at: null },
      { id: 3, name: 'Мария',  email: 'maria@example.com',  deleted_at: null },
      { id: 4, name: 'Даурен', email: 'dauren@example.com', deleted_at: nowIso() },
      { id: 5, name: 'Sofia',  email: 'sofia@example.com',  deleted_at: null },
      { id: 6, name: 'Kenji',  email: 'kenji@example.com',  deleted_at: null }
    ],
    reviews: [
      { id: 1, film_id: 1, user_id: 1, text: 'Красивый визуал и хороший темп.',    approved: true,  deleted_at: null },
      { id: 2, film_id: 1, user_id: 2, text: 'Нормально для вечернего просмотра.', approved: false, deleted_at: null },
      { id: 3, film_id: 2, user_id: 3, text: 'Атмосфера держит до финала.',        approved: false, deleted_at: null },
      { id: 4, film_id: 3, user_id: 5, text: 'Очень спокойная и сильная драма.',   approved: true,  deleted_at: null },
      { id: 5, film_id: 4, user_id: 6, text: 'Лучшие сцены на станции.',           approved: true,  deleted_at: null },
      { id: 6, film_id: 6, user_id: 4, text: 'Много экшена, мало пауз.',           approved: false, deleted_at: null }
    ],
    ratings: [
      { id: 1, film_id: 1, user_id: 1, score: 9  },
      { id: 2, film_id: 1, user_id: 2, score: 7  },
      { id: 3, film_id: 2, user_id: 3, score: 8  },
      { id: 4, film_id: 3, user_id: 5, score: 9  },
      { id: 5, film_id: 4, user_id: 6, score: 10 },
      { id: 6, film_id: 6, user_id: 4, score: 8  }
    ]
  };
}

let DATA = seedData();
function readData() { return DATA; }
function writeData(d) { DATA = d; }

function nextId(data, table) {
  const id = data.counters[table] || 1;
  data.counters[table] = id + 1;
  return id;
}

// ─── lookups ─────────────────────────────────────────────────────────────────

function countryName(data, id) {
  return (data.countries.find(c => c.id === Number(id)) || {}).title || '—';
}
function categoryName(data, id) {
  return (data.categories.find(c => c.id === Number(id)) || {}).title || '—';
}
function filmTitle(data, id) {
  return (data.films.find(f => f.id === Number(id)) || {}).title || 'Фильм удалён';
}
function userName(data, id) {
  return (data.users.find(u => u.id === Number(id)) || {}).name || 'Пользователь удалён';
}
function filmCats(data, filmId) {
  return data.film_categories
    .filter(r => r.film_id === Number(filmId))
    .map(r => categoryName(data, r.category_id));
}

// ─── CSS & layout ─────────────────────────────────────────────────────────────

function css() {
  return `
:root{--bg:#f4f6f9;--panel:#fff;--text:#1e2229;--muted:#6c757d;--line:#dee2e8;--brand:#2364aa;--danger:#dc3545;--ok:#28a745;}
*{box-sizing:border-box;}
body{margin:0;font-family:Inter,Arial,sans-serif;color:var(--text);background:var(--bg);font-size:15px;}
a{color:var(--brand);text-decoration:none;}a:hover{text-decoration:underline;}
.login{min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#e8eef6,#d4e4f0);}
.login-card{width:min(400px,100%);background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:32px;box-shadow:0 8px 32px rgba(0,0,0,.10);}
.login-card h1{margin:0 0 4px;font-size:24px;}.login-card p{margin:0 0 20px;color:var(--muted);}
.app{display:grid;grid-template-columns:220px 1fr;min-height:100vh;}
.side{background:#1a2535;color:#fff;padding:18px 12px;display:flex;flex-direction:column;gap:4px;}
.brand{font-weight:700;font-size:20px;padding:6px 10px 18px;letter-spacing:.5px;}
.nav a{display:block;color:#c8d6e8;padding:9px 12px;border-radius:6px;transition:background .15s;}
.nav a:hover,.nav a.active{background:#2c3e55;color:#fff;text-decoration:none;}
.main{padding:24px;overflow:auto;}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px;}
h1{margin:0;font-size:26px;}h2{margin:0 0 14px;font-size:18px;}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:18px;margin-bottom:18px;}
.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;}
label{display:block;font-weight:600;margin-bottom:5px;font-size:14px;}
input,select,textarea{width:100%;border:1px solid #ced4da;border-radius:6px;padding:8px 10px;font:inherit;background:#fff;min-height:38px;}
textarea{min-height:100px;resize:vertical;}
.row{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;}
.w200{max-width:200px;}
.btn,button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;border:1px solid transparent;border-radius:6px;padding:7px 14px;background:var(--brand);color:#fff;font:inherit;font-size:14px;cursor:pointer;white-space:nowrap;}
.btn:hover,button:hover{filter:brightness(.93);text-decoration:none;}
.btn.sec{background:#e9ecef;color:#343a40;border-color:#ced4da;}
.btn.danger,button.danger{background:var(--danger);}
.btn.ok,button.ok{background:var(--ok);}
.actions{display:flex;gap:6px;flex-wrap:wrap;}
table{width:100%;border-collapse:collapse;}
th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;}
th{background:#f8f9fa;font-size:13px;color:#495057;font-weight:600;}
.muted{color:var(--muted);}
.badge{display:inline-block;padding:3px 9px;border-radius:20px;font-size:12px;font-weight:600;background:#e9ecef;}
.badge.ok{background:#d4edda;color:#155724;}.badge.bad{background:#f8d7da;color:#721c24;}
.flash{border-left:4px solid var(--ok);background:#d4edda;color:#155724;padding:10px 14px;border-radius:6px;margin-bottom:16px;}
.flash.err{border-color:var(--danger);background:#f8d7da;color:#721c24;}
.pager{display:flex;gap:8px;align-items:center;margin-top:14px;}
form.inline{display:inline;}
@media(max-width:800px){.app{grid-template-columns:1fr;}.grid2{grid-template-columns:1fr;}.side{flex-direction:row;flex-wrap:wrap;padding:10px;}.brand{padding-bottom:0;}}
`;
}

function layout(req, title, body, flash) {
  const p = new URL(req.url, 'http://x').pathname;
  const nav = (href, label) =>
    `<a class="${p.startsWith(href) ? 'active' : ''}" href="${href}">${label}</a>`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Kinotower</title>
<style>${css()}</style></head><body>
<div class="app">
<aside class="side">
  <div class="brand">🎬 Kinotower</div>
  <nav class="nav">
    ${nav('/admin/dashboard','Главная')}
    ${nav('/admin/countries','Страны')}
    ${nav('/admin/categories','Жанры')}
    ${nav('/admin/films','Фильмы')}
    ${nav('/admin/users','Пользователи')}
    ${nav('/admin/reviews','Отзывы')}
    ${nav('/admin/ratings','Рейтинги')}
    <a href="/admin/logout">Выход</a>
  </nav>
</aside>
<main class="main">
  <div class="top"><h1>${esc(title)}</h1><span class="muted">Админ-панель</span></div>
  ${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
  ${body}
</main>
</div></body></html>`;
}

function loginPage(err) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Вход — Kinotower</title><style>${css()}</style></head><body>
<div class="login"><form class="login-card" method="post" action="/admin/login">
  <h1>Kinotower Admin</h1><p>Вход для администратора</p>
  ${err ? `<div class="flash err">${esc(err)}</div>` : ''}
  <label>Email</label>
  <input name="email" type="email" value="admin@kinotower.local" required autocomplete="email">
  <label style="margin-top:12px">Пароль</label>
  <input name="password" type="password" value="password" required autocomplete="current-password">
  <p style="margin-top:16px"><button type="submit" style="width:100%">Войти</button></p>
</form></div></body></html>`;
}

// ─── page builders ────────────────────────────────────────────────────────────

function dashboardPage(req, data) {
  const activeFilms = data.films.filter(f => !f.deleted_at).length;
  const pending = data.reviews.filter(r => !r.deleted_at && !r.approved).length;
  const activeUsers = data.users.filter(u => !u.deleted_at).length;
  return layout(req, 'Главная', `
<div class="grid2">
  <div class="panel"><h2>📊 Статистика</h2>
    <p>Фильмов: <b>${activeFilms}</b></p>
    <p>Активных пользователей: <b>${activeUsers}</b></p>
    <p>Отзывов на модерации: <b>${pending}</b></p>
    <p>Рейтингов: <b>${data.ratings.length}</b></p>
  </div>
  <div class="panel"><h2>🗂 Модели</h2>
    <p>Страны, жанры, фильмы, пользователи, отзывы, рейтинги и связь жанров с фильмами.</p>
  </div>
  <div class="panel"><h2>🔧 CRUD</h2>
    <p>Полный набор операций: создание, просмотр, редактирование, удаление (с soft delete).</p>
  </div>
  <div class="panel"><h2>🔒 Авторизация</h2>
    <p>Отдельная модель Admin, session-cookie, безопасное хранение паролей через scrypt.</p>
  </div>
</div>`);
}

function simpleList(req, data, table, title, label) {
  const rows = data[table].map(item => `
<tr>
  <td>${item.id}</td>
  <td>${esc(item.title)}</td>
  <td class="actions">
    <a class="btn sec" href="/admin/${table}/${item.id}/edit">Изменить</a>
    <form class="inline" method="post" action="/admin/${table}/${item.id}/delete">
      <button class="danger" type="submit">Удалить</button>
    </form>
  </td>
</tr>`).join('');
  return layout(req, title, `
<div class="panel">
  <div class="top"><h2>Список</h2><a class="btn" href="/admin/${table}/create">+ Добавить</a></div>
  <table><thead><tr><th>ID</th><th>${esc(label)}</th><th>Действия</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="3" class="muted">Нет записей</td></tr>'}</tbody></table>
</div>`);
}

function simpleForm(req, data, table, title, item) {
  const action = item ? `/admin/${table}/${item.id}` : `/admin/${table}`;
  return layout(req, title, `
<div class="panel" style="max-width:500px">
  <form method="post" action="${action}">
    <label>Название</label>
    <input name="title" value="${esc(item ? item.title : '')}" required>
    <div class="actions" style="margin-top:14px">
      <button type="submit">Сохранить</button>
      <a class="btn sec" href="/admin/${table}">Назад</a>
    </div>
  </form>
</div>`);
}

function filmsListPage(req, data) {
  const url = new URL(req.url, 'http://x');
  const cid = Number(url.searchParams.get('country_id') || 0);
  const gid = Number(url.searchParams.get('category_id') || 0);
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const per = 5;

  let films = data.films.filter(f => !f.deleted_at);
  if (cid) films = films.filter(f => f.country_id === cid);
  if (gid) {
    const ids = new Set(data.film_categories.filter(r => r.category_id === gid).map(r => r.film_id));
    films = films.filter(f => ids.has(f.id));
  }
  const total = Math.max(1, Math.ceil(films.length / per));
  const items = films.slice((page - 1) * per, page * per);

  const cOpts = `<option value="">Все страны</option>` +
    data.countries.map(c => `<option value="${c.id}" ${cid === c.id ? 'selected' : ''}>${esc(c.title)}</option>`).join('');
  const gOpts = `<option value="">Все жанры</option>` +
    data.categories.map(c => `<option value="${c.id}" ${gid === c.id ? 'selected' : ''}>${esc(c.title)}</option>`).join('');

  const rows = items.map(f => `
<tr>
  <td>${f.id}</td>
  <td><b>${esc(f.title)}</b><br><span class="muted">${esc(f.description)}</span></td>
  <td>${f.year}</td>
  <td>${esc(countryName(data, f.country_id))}</td>
  <td>${esc(filmCats(data, f.id).join(', ') || '—')}</td>
  <td class="actions">
    <a class="btn sec" href="/admin/films/${f.id}/categories">Жанры</a>
    <a class="btn sec" href="/admin/films/${f.id}/reviews">Отзывы</a>
    <a class="btn sec" href="/admin/films/${f.id}/ratings">Оценки</a>
    <a class="btn sec" href="/admin/films/${f.id}/edit">Изменить</a>
    <form class="inline" method="post" action="/admin/films/${f.id}/delete">
      <button class="danger">Удалить</button>
    </form>
  </td>
</tr>`).join('');

  const pager = `<div class="pager">
    ${page > 1 ? `<a class="btn sec" href="/admin/films?country_id=${cid}&category_id=${gid}&page=${page-1}">← Назад</a>` : ''}
    <span class="badge">Стр. ${page} / ${total}</span>
    ${page < total ? `<a class="btn sec" href="/admin/films?country_id=${cid}&category_id=${gid}&page=${page+1}">Вперёд →</a>` : ''}
  </div>`;

  return layout(req, 'Фильмы', `
<div class="panel">
  <form class="row" method="get" action="/admin/films">
    <div class="w200"><label>Страна</label><select name="country_id">${cOpts}</select></div>
    <div class="w200"><label>Жанр</label><select name="category_id">${gOpts}</select></div>
    <button type="submit">Фильтровать</button>
    <a class="btn sec" href="/admin/films">Сбросить</a>
    <a class="btn" href="/admin/films/create">+ Добавить</a>
  </form>
</div>
<div class="panel">
  <table><thead><tr><th>ID</th><th>Фильм</th><th>Год</th><th>Страна</th><th>Жанры</th><th>Действия</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="6" class="muted">Фильмы не найдены</td></tr>'}</tbody></table>
  ${pager}
</div>`);
}

function filmFormPage(req, data, item) {
  const action = item ? `/admin/films/${item.id}` : '/admin/films';
  const cOpts = data.countries.map(c =>
    `<option value="${c.id}" ${item && Number(item.country_id) === c.id ? 'selected' : ''}>${esc(c.title)}</option>`
  ).join('');
  return layout(req, item ? 'Изменить фильм' : 'Добавить фильм', `
<div class="panel" style="max-width:700px">
  <form method="post" action="${action}">
    <div class="grid2">
      <div><label>Название</label><input name="title" value="${esc(item ? item.title : '')}" required></div>
      <div><label>Страна</label><select name="country_id" required>${cOpts}</select></div>
      <div><label>Год</label><input name="year" type="number" min="1900" max="2100" value="${esc(item ? item.year : new Date().getFullYear())}" required></div>
      <div><label>Длительность (мин)</label><input name="duration" type="number" min="1" value="${esc(item ? item.duration : 90)}" required></div>
    </div>
    <label style="margin-top:12px">Описание</label>
    <textarea name="description" required>${esc(item ? item.description : '')}</textarea>
    <div class="actions" style="margin-top:14px">
      <button type="submit">Сохранить</button>
      <a class="btn sec" href="/admin/films">Назад</a>
    </div>
  </form>
</div>`);
}

function filmCatsPage(req, data, film) {
  const selIds = new Set(data.film_categories.filter(r => r.film_id === film.id).map(r => r.category_id));
  const rows = [...selIds].map(cid => `
<tr>
  <td>${cid}</td><td>${esc(categoryName(data, cid))}</td>
  <td><form method="post" action="/admin/films/${film.id}/categories/${cid}/delete">
    <button class="danger">Удалить</button>
  </form></td>
</tr>`).join('');
  const opts = data.categories.filter(c => !selIds.has(c.id))
    .map(c => `<option value="${c.id}">${esc(c.title)}</option>`).join('');
  return layout(req, 'Жанры фильма', `
<div class="panel">
  <h2>${esc(film.title)}</h2>
  <form class="row" method="post" action="/admin/films/${film.id}/categories">
    <div class="w200"><label>Жанр</label>
      <select name="category_id" required>${opts || '<option value="">Все жанры добавлены</option>'}</select>
    </div>
    <button type="submit" ${opts ? '' : 'disabled'}>Добавить</button>
    <a class="btn sec" href="/admin/films">К фильмам</a>
  </form>
</div>
<div class="panel">
  <table><thead><tr><th>ID</th><th>Жанр</th><th>Действия</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="3" class="muted">Жанры не выбраны</td></tr>'}</tbody></table>
</div>`);
}

function usersPage(req, data) {
  const rows = data.users.map(u => `
<tr>
  <td>${u.id}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td>
  <td>${u.deleted_at ? '<span class="badge bad">Удалён</span>' : '<span class="badge ok">Активен</span>'}</td>
  <td>${u.deleted_at
    ? `<form class="inline" method="post" action="/admin/users/${u.id}/restore"><button class="ok">Восстановить</button></form>`
    : `<form class="inline" method="post" action="/admin/users/${u.id}/delete"><button class="danger">Удалить</button></form>`
  }</td>
</tr>`).join('');
  return layout(req, 'Пользователи', `
<div class="panel">
  <table><thead><tr><th>ID</th><th>Имя</th><th>Email</th><th>Статус</th><th>Действия</th></tr></thead>
  <tbody>${rows}</tbody></table>
</div>`);
}

function reviewsPage(req, data, film) {
  const list = data.reviews.filter(r => !r.deleted_at && (!film || r.film_id === film.id));
  const opts = `<option value="/admin/reviews">Все фильмы</option>` +
    data.films.filter(f => !f.deleted_at).map(f =>
      `<option value="/admin/films/${f.id}/reviews" ${film && film.id === f.id ? 'selected' : ''}>${esc(f.title)}</option>`
    ).join('');
  const rows = list.map(r => `
<tr>
  <td>${r.id}</td>
  <td>${esc(filmTitle(data, r.film_id))}</td>
  <td>${esc(userName(data, r.user_id))}</td>
  <td>${esc(r.text)}</td>
  <td>${r.approved ? '<span class="badge ok">Одобрен</span>' : '<span class="badge bad">Ожидает</span>'}</td>
  <td class="actions">
    ${!r.approved ? `<form class="inline" method="post" action="/admin/reviews/${r.id}/approve"><button class="ok">Одобрить</button></form>` : ''}
    <form class="inline" method="post" action="/admin/reviews/${r.id}/delete"><button class="danger">Удалить</button></form>
  </td>
</tr>`).join('');
  return layout(req, film ? `Отзывы: ${film.title}` : 'Отзывы', `
<div class="panel">
  <label>Показать отзывы</label>
  <select style="max-width:300px;margin-top:6px" onchange="location.href=this.value">${opts}</select>
</div>
<div class="panel">
  <table><thead><tr><th>ID</th><th>Фильм</th><th>Пользователь</th><th>Отзыв</th><th>Статус</th><th>Действия</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="6" class="muted">Отзывов нет</td></tr>'}</tbody></table>
</div>`);
}

function ratingsPage(req, data, film) {
  const list = data.ratings.filter(r => !film || r.film_id === film.id);
  const opts = `<option value="/admin/ratings">Все фильмы</option>` +
    data.films.filter(f => !f.deleted_at).map(f =>
      `<option value="/admin/films/${f.id}/ratings" ${film && film.id === f.id ? 'selected' : ''}>${esc(f.title)}</option>`
    ).join('');
  const rows = list.map(r => `
<tr>
  <td>${r.id}</td>
  <td>${esc(filmTitle(data, r.film_id))}</td>
  <td>${esc(userName(data, r.user_id))}</td>
  <td><b>${r.score}</b> / 10</td>
  <td><form method="post" action="/admin/ratings/${r.id}/delete"><button class="danger">Удалить</button></form></td>
</tr>`).join('');
  return layout(req, film ? `Рейтинги: ${film.title}` : 'Рейтинги', `
<div class="panel">
  <label>Показать оценки</label>
  <select style="max-width:300px;margin-top:6px" onchange="location.href=this.value">${opts}</select>
</div>
<div class="panel">
  <table><thead><tr><th>ID</th><th>Фильм</th><th>Пользователь</th><th>Оценка</th><th>Действия</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="5" class="muted">Оценок нет</td></tr>'}</tbody></table>
</div>`);
}

function page404(req, res) {
  send(res, 404, layout(req, '404', '<div class="panel">Страница не найдена.</div>'));
}

// ─── router ───────────────────────────────────────────────────────────────────

async function handle(req, res) {
  try {
    const data = readData();
    const url = new URL(req.url, 'http://x');
    const path = url.pathname.replace(/\/$/, '') || '/';
    const method = req.method.toUpperCase();
    const admin = currentAdmin(req);

    // root redirect
    if (path === '/' || path === '/admin') {
      return redirect(res, admin ? '/admin/dashboard' : '/admin/login');
    }

    // login
    if (path === '/admin/login' && method === 'GET') return send(res, 200, loginPage());
    if (path === '/admin/login' && method === 'POST') {
      const body = await parseBody(req);
      const found = data.admins.find(a => a.email === fv(body, 'email'));
      if (!found || !verifyPassword(fv(body, 'password'), found.password)) {
        return send(res, 422, loginPage('Неверный email или пароль'));
      }
      const sid = crypto.randomBytes(24).toString('hex');
      sessions.set(sid, { admin: { id: found.id, name: found.name }, expires: Date.now() + SESSION_TTL });
      return send(res, 302, '', { Location: '/admin/dashboard', 'Set-Cookie': `sid=${sid}; HttpOnly; Path=/; SameSite=Lax` });
    }

    // logout
    if (path === '/admin/logout') {
      const sid = parseCookies(req).sid;
      if (sid) sessions.delete(sid);
      return send(res, 302, '', { Location: '/admin/login', 'Set-Cookie': 'sid=; Max-Age=0; Path=/' });
    }

    // guard
    if (!admin) return redirect(res, '/admin/login');

    // dashboard
    if (path === '/admin/dashboard') return send(res, 200, dashboardPage(req, data));

    // countries & categories (simple CRUD)
    for (const table of ['countries', 'categories']) {
      const label = table === 'countries' ? 'страну' : 'жанр';
      const titleMap = { countries: 'Страны', categories: 'Жанры' };

      if (path === `/admin/${table}` && method === 'GET')
        return send(res, 200, simpleList(req, data, table, titleMap[table], table === 'countries' ? 'Страна' : 'Жанр'));

      if (path === `/admin/${table}/create` && method === 'GET')
        return send(res, 200, simpleForm(req, data, table, `Добавить ${label}`, null));

      const mEdit = path.match(new RegExp(`^/admin/${table}/(\\d+)/edit$`));
      if (mEdit && method === 'GET') {
        const item = data[table].find(x => x.id === Number(mEdit[1]));
        if (!item) return page404(req, res);
        return send(res, 200, simpleForm(req, data, table, `Изменить ${label}`, item));
      }

      if (path === `/admin/${table}` && method === 'POST') {
        const body = await parseBody(req);
        const title = fv(body, 'title');
        if (!title) return redirect(res, `/admin/${table}/create`);
        data[table].push({ id: nextId(data, table), title });
        writeData(data);
        return redirect(res, `/admin/${table}`);
      }

      const mUpdate = path.match(new RegExp(`^/admin/${table}/(\\d+)$`));
      if (mUpdate && method === 'POST') {
        const item = data[table].find(x => x.id === Number(mUpdate[1]));
        if (!item) return page404(req, res);
        const body = await parseBody(req);
        item.title = fv(body, 'title', item.title);
        writeData(data);
        return redirect(res, `/admin/${table}`);
      }

      const mDel = path.match(new RegExp(`^/admin/${table}/(\\d+)/delete$`));
      if (mDel && method === 'POST') {
        data[table] = data[table].filter(x => x.id !== Number(mDel[1]));
        if (table === 'categories')
          data.film_categories = data.film_categories.filter(x => x.category_id !== Number(mDel[1]));
        writeData(data);
        return redirect(res, `/admin/${table}`);
      }
    }

    // films list
    if (path === '/admin/films' && method === 'GET') return send(res, 200, filmsListPage(req, data));
    if (path === '/admin/films/create' && method === 'GET') return send(res, 200, filmFormPage(req, data, null));

    if (path === '/admin/films' && method === 'POST') {
      const body = await parseBody(req);
      data.films.push({
        id: nextId(data, 'films'),
        title: fv(body, 'title'), description: fv(body, 'description'),
        year: Number(fv(body, 'year')), country_id: Number(fv(body, 'country_id')),
        duration: Number(fv(body, 'duration')), deleted_at: null
      });
      writeData(data);
      return redirect(res, '/admin/films');
    }

    let m;

    m = path.match(/^\/admin\/films\/(\d+)\/edit$/);
    if (m && method === 'GET') {
      const film = data.films.find(f => f.id === Number(m[1]));
      if (!film) return page404(req, res);
      return send(res, 200, filmFormPage(req, data, film));
    }

    m = path.match(/^\/admin\/films\/(\d+)$/);
    if (m && method === 'POST') {
      const film = data.films.find(f => f.id === Number(m[1]));
      if (!film) return page404(req, res);
      const body = await parseBody(req);
      Object.assign(film, {
        title: fv(body, 'title', film.title), description: fv(body, 'description', film.description),
        year: Number(fv(body, 'year', film.year)), country_id: Number(fv(body, 'country_id', film.country_id)),
        duration: Number(fv(body, 'duration', film.duration))
      });
      writeData(data);
      return redirect(res, '/admin/films');
    }

    m = path.match(/^\/admin\/films\/(\d+)\/delete$/);
    if (m && method === 'POST') {
      const film = data.films.find(f => f.id === Number(m[1]));
      if (film) film.deleted_at = nowIso();
      writeData(data);
      return redirect(res, '/admin/films');
    }

    // film categories
    m = path.match(/^\/admin\/films\/(\d+)\/categories$/);
    if (m) {
      const film = data.films.find(f => f.id === Number(m[1]));
      if (!film) return page404(req, res);
      if (method === 'GET') return send(res, 200, filmCatsPage(req, data, film));
      if (method === 'POST') {
        const body = await parseBody(req);
        const cid = Number(fv(body, 'category_id'));
        if (cid && !data.film_categories.some(r => r.film_id === film.id && r.category_id === cid))
          data.film_categories.push({ film_id: film.id, category_id: cid });
        writeData(data);
        return redirect(res, `/admin/films/${film.id}/categories`);
      }
    }

    m = path.match(/^\/admin\/films\/(\d+)\/categories\/(\d+)\/delete$/);
    if (m && method === 'POST') {
      data.film_categories = data.film_categories.filter(r => !(r.film_id === Number(m[1]) && r.category_id === Number(m[2])));
      writeData(data);
      return redirect(res, `/admin/films/${m[1]}/categories`);
    }

    // users
    if (path === '/admin/users' && method === 'GET') return send(res, 200, usersPage(req, data));

    m = path.match(/^\/admin\/users\/(\d+)\/delete$/);
    if (m && method === 'POST') {
      const u = data.users.find(x => x.id === Number(m[1]));
      if (u) u.deleted_at = nowIso();
      writeData(data);
      return redirect(res, '/admin/users');
    }

    m = path.match(/^\/admin\/users\/(\d+)\/restore$/);
    if (m && method === 'POST') {
      const u = data.users.find(x => x.id === Number(m[1]));
      if (u) u.deleted_at = null;
      writeData(data);
      return redirect(res, '/admin/users');
    }

    // reviews
    if (path === '/admin/reviews' && method === 'GET') return send(res, 200, reviewsPage(req, data, null));

    m = path.match(/^\/admin\/films\/(\d+)\/reviews$/);
    if (m && method === 'GET') {
      const film = data.films.find(f => f.id === Number(m[1]));
      if (!film) return page404(req, res);
      return send(res, 200, reviewsPage(req, data, film));
    }

    m = path.match(/^\/admin\/reviews\/(\d+)\/approve$/);
    if (m && method === 'POST') {
      const r = data.reviews.find(x => x.id === Number(m[1]));
      if (r) r.approved = true;
      writeData(data);
      return redirect(res, '/admin/reviews');
    }

    m = path.match(/^\/admin\/reviews\/(\d+)\/delete$/);
    if (m && method === 'POST') {
      const r = data.reviews.find(x => x.id === Number(m[1]));
      if (r) r.deleted_at = nowIso();
      writeData(data);
      return redirect(res, '/admin/reviews');
    }

    // ratings
    if (path === '/admin/ratings' && method === 'GET') return send(res, 200, ratingsPage(req, data, null));

    m = path.match(/^\/admin\/films\/(\d+)\/ratings$/);
    if (m && method === 'GET') {
      const film = data.films.find(f => f.id === Number(m[1]));
      if (!film) return page404(req, res);
      return send(res, 200, ratingsPage(req, data, film));
    }

    m = path.match(/^\/admin\/ratings\/(\d+)\/delete$/);
    if (m && method === 'POST') {
      data.ratings = data.ratings.filter(x => x.id !== Number(m[1]));
      writeData(data);
      return redirect(res, '/admin/ratings');
    }

    return page404(req, res);

  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error: ' + err.message);
  }
}

// ─── local dev server (only when run directly) ────────────────────────────────

if (require.main === module) {
  const server = http.createServer(async (req, res) => {
    await handle(req, res);
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log('Kinotower Admin: http://127.0.0.1:' + PORT);
  });
}

module.exports = { handle, readData, writeData, seedData };
