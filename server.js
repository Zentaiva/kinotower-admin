const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 8000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const SESSION_TTL = 1000 * 60 * 60 * 8;
const sessions = new Map();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, original] = stored.split(':');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(original, 'hex'));
}

function now() {
  return new Date().toISOString();
}

function seedData() {
  const password = hashPassword('password', 'kinotower-admin-salt');
  return {
    counters: { admins: 2, countries: 7, categories: 8, films: 7, users: 7, reviews: 7, ratings: 7 },
    admins: [{ id: 1, name: 'Administrator', email: 'admin@kinotower.local', password, created_at: now() }],
    countries: [
      { id: 1, title: 'США' },
      { id: 2, title: 'Казахстан' },
      { id: 3, title: 'Франция' },
      { id: 4, title: 'Япония' },
      { id: 5, title: 'Южная Корея' },
      { id: 6, title: 'Великобритания' }
    ],
    categories: [
      { id: 1, title: 'Драма' },
      { id: 2, title: 'Комедия' },
      { id: 3, title: 'Боевик' },
      { id: 4, title: 'Фантастика' },
      { id: 5, title: 'Триллер' },
      { id: 6, title: 'Аниме' },
      { id: 7, title: 'Документальный' }
    ],
    films: [
      { id: 1, title: 'Башня времени', description: 'Приключенческий фильм о городе будущего.', year: 2024, country_id: 2, duration: 118, deleted_at: null },
      { id: 2, title: 'Ночной сеанс', description: 'Триллер про закрытый кинотеатр.', year: 2023, country_id: 1, duration: 104, deleted_at: null },
      { id: 3, title: 'Парижский кадр', description: 'Драма о режиссере и его первом фильме.', year: 2022, country_id: 3, duration: 126, deleted_at: null },
      { id: 4, title: 'Станция Сакура', description: 'Фантастическая история о путешествии на орбите.', year: 2025, country_id: 4, duration: 132, deleted_at: null },
      { id: 5, title: 'Последний дубль', description: 'Комедия о съемочной группе.', year: 2021, country_id: 6, duration: 98, deleted_at: null },
      { id: 6, title: 'Сеул 2049', description: 'Киберпанк-боевик с расследованием.', year: 2024, country_id: 5, duration: 121, deleted_at: null }
    ],
    film_categories: [
      { film_id: 1, category_id: 3 }, { film_id: 1, category_id: 4 },
      { film_id: 2, category_id: 5 }, { film_id: 2, category_id: 1 },
      { film_id: 3, category_id: 1 }, { film_id: 4, category_id: 4 },
      { film_id: 4, category_id: 6 }, { film_id: 5, category_id: 2 },
      { film_id: 6, category_id: 3 }, { film_id: 6, category_id: 4 }
    ],
    users: [
      { id: 1, name: 'Алия', email: 'aliya@example.com', deleted_at: null },
      { id: 2, name: 'Иван', email: 'ivan@example.com', deleted_at: null },
      { id: 3, name: 'Мария', email: 'maria@example.com', deleted_at: null },
      { id: 4, name: 'Даурен', email: 'dauren@example.com', deleted_at: now() },
      { id: 5, name: 'Sofia', email: 'sofia@example.com', deleted_at: null },
      { id: 6, name: 'Kenji', email: 'kenji@example.com', deleted_at: null }
    ],
    reviews: [
      { id: 1, film_id: 1, user_id: 1, text: 'Красивый визуал и хороший темп.', approved: true, deleted_at: null },
      { id: 2, film_id: 1, user_id: 2, text: 'Нормально для вечернего просмотра.', approved: false, deleted_at: null },
      { id: 3, film_id: 2, user_id: 3, text: 'Атмосфера держит до финала.', approved: false, deleted_at: null },
      { id: 4, film_id: 3, user_id: 5, text: 'Очень спокойная и сильная драма.', approved: true, deleted_at: null },
      { id: 5, film_id: 4, user_id: 6, text: 'Лучшие сцены на станции.', approved: true, deleted_at: null },
      { id: 6, film_id: 6, user_id: 4, text: 'Много экшена, мало пауз.', approved: false, deleted_at: null }
    ],
    ratings: [
      { id: 1, film_id: 1, user_id: 1, score: 9 },
      { id: 2, film_id: 1, user_id: 2, score: 7 },
      { id: 3, film_id: 2, user_id: 3, score: 8 },
      { id: 4, film_id: 3, user_id: 5, score: 9 },
      { id: 5, film_id: 4, user_id: 6, score: 10 },
      { id: 6, film_id: 6, user_id: 4, score: 8 }
    ]
  };
}

let DATA = seedData();

function readData() {
  return DATA;
}

function writeData(data) {
  DATA = data;
}

function nextId(data, table) {
  const id = data.counters[table] || 1;
  data.counters[table] = id + 1;
  return id;
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((item) => {
    const [key, ...value] = item.trim().split('=');
    return [key, decodeURIComponent(value.join('='))];
  }));
}

function currentAdmin(req) {
  const sid = parseCookies(req).sid;
  if (!sid || !sessions.has(sid)) return null;
  const session = sessions.get(sid);
  if (Date.now() > session.expires) {
    sessions.delete(sid);
    return null;
  }
  session.expires = Date.now() + SESSION_TTL;
  return session.admin;
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function send(res, status, html, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(html);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function formValue(body, key, fallback = '') {
  return body.get(key)?.trim() || fallback;
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(new URLSearchParams(body)));
  });
}

function css() {
  return `
    :root { --bg:#f5f6f8; --panel:#fff; --text:#20242a; --muted:#69707d; --line:#dfe3ea; --brand:#2364aa; --danger:#b3261e; --ok:#287d3c; }
    * { box-sizing: border-box; } body { margin:0; font-family: Inter, Arial, sans-serif; color:var(--text); background:var(--bg); }
    a { color:var(--brand); text-decoration:none; } a:hover { text-decoration:underline; }
    .login { min-height:100vh; display:grid; place-items:center; padding:24px; background:linear-gradient(135deg,#eef2f7,#dce8ef); }
    .login-card { width:min(420px,100%); background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:28px; box-shadow:0 16px 40px rgba(30,40,60,.12); }
    .app { display:grid; grid-template-columns:240px 1fr; min-height:100vh; }
    .side { background:#1f2937; color:#fff; padding:20px 14px; }
    .brand { font-weight:700; font-size:22px; margin:4px 10px 22px; }
    .nav a { display:block; color:#d9e2ef; padding:10px 12px; border-radius:6px; margin:3px 0; }
    .nav a:hover, .nav .active { background:#314154; color:#fff; text-decoration:none; }
    .main { padding:24px; } .top { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px; }
    h1 { margin:0; font-size:28px; } h2 { margin:0 0 14px; font-size:20px; }
    .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:18px; margin-bottom:18px; }
    .grid { display:grid; gap:14px; } .grid.two { grid-template-columns:repeat(2,minmax(0,1fr)); }
    label { display:block; font-weight:600; margin-bottom:6px; }
    input, select, textarea { width:100%; min-height:40px; border:1px solid #cfd5df; border-radius:6px; padding:9px 10px; font:inherit; background:#fff; }
    textarea { min-height:110px; resize:vertical; } .row { display:flex; align-items:end; gap:10px; flex-wrap:wrap; }
    .btn, button { display:inline-flex; align-items:center; justify-content:center; min-height:38px; border:1px solid transparent; border-radius:6px; padding:8px 12px; background:var(--brand); color:#fff; font:inherit; cursor:pointer; }
    .btn:hover, button:hover { text-decoration:none; filter:brightness(.95); } .btn.secondary { background:#eef2f7; color:#263342; border-color:#cfd5df; }
    .btn.danger, button.danger { background:var(--danger); } .btn.ok, button.ok { background:var(--ok); }
    .actions { display:flex; gap:8px; flex-wrap:wrap; }
    table { width:100%; border-collapse:collapse; } th,td { border-bottom:1px solid var(--line); padding:10px; text-align:left; vertical-align:top; }
    th { background:#f8fafc; font-size:13px; color:#465160; } .muted { color:var(--muted); } .badge { display:inline-block; padding:3px 8px; border-radius:999px; background:#edf2f7; font-size:12px; }
    .badge.ok { background:#e7f5eb; color:#1e6d32; } .badge.bad { background:#fdeceb; color:#9c1f18; }
    .flash { border-left:4px solid var(--ok); background:#edf8f0; padding:10px 12px; border-radius:6px; margin-bottom:14px; }
    .pagination { display:flex; gap:8px; margin-top:14px; } .w-sm { max-width:220px; } .inline { display:inline; }
    @media (max-width: 820px) { .app { grid-template-columns:1fr; } .side { position:static; } .grid.two { grid-template-columns:1fr; } .top { align-items:flex-start; flex-direction:column; } }
  `;
}

function layout(req, title, content, flash = '') {
  const pathName = new URL(req.url, `http://${req.headers.host}`).pathname;
  const item = (href, label) => `<a class="${pathName.startsWith(href) ? 'active' : ''}" href="${href}">${label}</a>`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} - Kinotower</title><style>${css()}</style></head><body><div class="app"><aside class="side"><div class="brand">Kinotower</div><nav class="nav">
    ${item('/admin/dashboard', 'Главная')}
    ${item('/admin/countries', 'Страны')}
    ${item('/admin/categories', 'Жанры')}
    ${item('/admin/films', 'Фильмы')}
    ${item('/admin/users', 'Пользователи')}
    ${item('/admin/reviews', 'Отзывы')}
    ${item('/admin/ratings', 'Рейтинги')}
    <a href="/admin/logout">Выход</a>
  </nav></aside><main class="main"><div class="top"><h1>${escapeHtml(title)}</h1><span class="muted">Админ-панель онлайн-кинотеатра</span></div>${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ''}${content}</main></div></body></html>`;
}

function loginPage(error = '') {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Вход - Kinotower</title><style>${css()}</style></head><body><div class="login"><form class="login-card" method="post" action="/admin/login"><h1>Kinotower Admin</h1><p class="muted">Вход для администратора</p>${error ? `<div class="flash">${escapeHtml(error)}</div>` : ''}<label>Email</label><input name="email" type="email" value="admin@kinotower.local" required><label>Пароль</label><input name="password" type="password" value="password" required><p><button type="submit">Войти</button></p></form></div></body></html>`;
}

function csrf() {
  return '';
}

function countryName(data, id) {
  return data.countries.find((country) => country.id === Number(id))?.title || 'Не указана';
}

function categoryName(data, id) {
  return data.categories.find((category) => category.id === Number(id))?.title || 'Не указан';
}

function filmName(data, id) {
  return data.films.find((film) => film.id === Number(id))?.title || 'Фильм удален';
}

function userName(data, id) {
  return data.users.find((user) => user.id === Number(id))?.name || 'Пользователь удален';
}

function filmCategories(data, filmId) {
  return data.film_categories
    .filter((item) => item.film_id === Number(filmId))
    .map((item) => categoryName(data, item.category_id));
}

function dashboard(req, data) {
  const activeFilms = data.films.filter((film) => !film.deleted_at).length;
  const pendingReviews = data.reviews.filter((review) => !review.deleted_at && !review.approved).length;
  const content = `<div class="grid two">
    <div class="panel"><h2>База данных и модели</h2><p>Созданы сущности: админы, страны, жанры, фильмы, пользователи, отзывы, рейтинги и связь фильмов с жанрами.</p></div>
    <div class="panel"><h2>Статистика</h2><p>Фильмов: <b>${activeFilms}</b></p><p>Пользователей: <b>${data.users.length}</b></p><p>Отзывы на модерации: <b>${pendingReviews}</b></p></div>
    <div class="panel"><h2>CRUD</h2><p>Доступны разделы стран, жанров, фильмов, пользователей, отзывов и рейтингов.</p></div>
    <div class="panel"><h2>Авторизация</h2><p>Используется отдельная модель администратора и session-cookie.</p></div>
  </div>`;
  return layout(req, 'Главная', content);
}

function listSimple(req, data, table, title, label) {
  const rows = data[table].map((item) => `<tr><td>${item.id}</td><td>${escapeHtml(item.title)}</td><td class="actions"><a class="btn secondary" href="/admin/${table}/${item.id}/edit">Изменить</a><form class="inline" method="post" action="/admin/${table}/${item.id}/delete">${csrf()}<button class="danger" type="submit">Удалить</button></form></td></tr>`).join('');
  const content = `<div class="panel"><div class="top"><h2>Список</h2><a class="btn" href="/admin/${table}/create">Добавить</a></div><table><thead><tr><th>ID</th><th>${label}</th><th>Действия</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Записей нет</td></tr>'}</tbody></table></div>`;
  return layout(req, title, content);
}

function simpleForm(req, data, table, title, item = null) {
  const action = item ? `/admin/${table}/${item.id}` : `/admin/${table}`;
  const content = `<div class="panel"><form method="post" action="${action}">${csrf()}<label>Название</label><input name="title" value="${escapeHtml(item?.title || '')}" required><p class="actions"><button type="submit">Сохранить</button><a class="btn secondary" href="/admin/${table}">Назад</a></p></form></div>`;
  return layout(req, title, content);
}

function filmForm(req, data, item = null) {
  const action = item ? `/admin/films/${item.id}` : '/admin/films';
  const countryOptions = data.countries.map((country) => `<option value="${country.id}" ${Number(item?.country_id) === country.id ? 'selected' : ''}>${escapeHtml(country.title)}</option>`).join('');
  const content = `<div class="panel"><form method="post" action="${action}">
    <div class="grid two"><div><label>Название</label><input name="title" value="${escapeHtml(item?.title || '')}" required></div><div><label>Страна</label><select name="country_id" required>${countryOptions}</select></div><div><label>Год</label><input name="year" type="number" min="1900" max="2100" value="${escapeHtml(item?.year || new Date().getFullYear())}" required></div><div><label>Длительность, мин</label><input name="duration" type="number" min="1" value="${escapeHtml(item?.duration || 90)}" required></div></div>
    <label>Описание</label><textarea name="description" required>${escapeHtml(item?.description || '')}</textarea>
    <p class="actions"><button type="submit">Сохранить</button><a class="btn secondary" href="/admin/films">Назад</a></p>
  </form></div>`;
  return layout(req, item ? 'Изменить фильм' : 'Добавить фильм', content);
}

function listFilms(req, data) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const countryId = Number(url.searchParams.get('country_id') || 0);
  const categoryId = Number(url.searchParams.get('category_id') || 0);
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const perPage = 5;
  let films = data.films.filter((film) => !film.deleted_at);
  if (countryId) films = films.filter((film) => film.country_id === countryId);
  if (categoryId) {
    const filmIds = new Set(data.film_categories.filter((item) => item.category_id === categoryId).map((item) => item.film_id));
    films = films.filter((film) => filmIds.has(film.id));
  }
  const totalPages = Math.max(1, Math.ceil(films.length / perPage));
  const pageItems = films.slice((page - 1) * perPage, page * perPage);
  const countries = `<option value="">Все страны</option>` + data.countries.map((country) => `<option value="${country.id}" ${countryId === country.id ? 'selected' : ''}>${escapeHtml(country.title)}</option>`).join('');
  const categories = `<option value="">Все жанры</option>` + data.categories.map((category) => `<option value="${category.id}" ${categoryId === category.id ? 'selected' : ''}>${escapeHtml(category.title)}</option>`).join('');
  const rows = pageItems.map((film) => `<tr><td>${film.id}</td><td><b>${escapeHtml(film.title)}</b><br><span class="muted">${escapeHtml(film.description)}</span></td><td>${film.year}</td><td>${escapeHtml(countryName(data, film.country_id))}</td><td>${escapeHtml(filmCategories(data, film.id).join(', ') || 'Жанры не выбраны')}</td><td class="actions"><a class="btn secondary" href="/admin/films/${film.id}/categories">Жанры</a><a class="btn secondary" href="/admin/films/${film.id}/reviews">Отзывы</a><a class="btn secondary" href="/admin/films/${film.id}/ratings">Оценки</a><a class="btn secondary" href="/admin/films/${film.id}/edit">Изменить</a><form class="inline" method="post" action="/admin/films/${film.id}/delete"><button class="danger" type="submit">Удалить</button></form></td></tr>`).join('');
  const pagination = `<div class="pagination">${page > 1 ? `<a class="btn secondary" href="/admin/films?country_id=${countryId || ''}&category_id=${categoryId || ''}&page=${page - 1}">Назад</a>` : ''}<span class="badge">Страница ${page} из ${totalPages}</span>${page < totalPages ? `<a class="btn secondary" href="/admin/films?country_id=${countryId || ''}&category_id=${categoryId || ''}&page=${page + 1}">Вперед</a>` : ''}</div>`;
  const content = `<div class="panel"><form class="row" method="get" action="/admin/films"><div class="w-sm"><label>Страна</label><select name="country_id">${countries}</select></div><div class="w-sm"><label>Жанр</label><select name="category_id">${categories}</select></div><button type="submit">Фильтровать</button><a class="btn secondary" href="/admin/films">Сбросить</a><a class="btn" href="/admin/films/create">Добавить</a></form></div><div class="panel"><table><thead><tr><th>ID</th><th>Фильм</th><th>Год</th><th>Страна</th><th>Жанры</th><th>Действия</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Фильмы не найдены</td></tr>'}</tbody></table>${pagination}</div>`;
  return layout(req, 'Фильмы', content);
}

function filmCategoryPage(req, data, film) {
  const selectedIds = new Set(data.film_categories.filter((item) => item.film_id === film.id).map((item) => item.category_id));
  const currentRows = [...selectedIds].map((categoryId) => `<tr><td>${categoryId}</td><td>${escapeHtml(categoryName(data, categoryId))}</td><td><form method="post" action="/admin/films/${film.id}/categories/${categoryId}/delete"><button class="danger" type="submit">Удалить</button></form></td></tr>`).join('');
  const options = data.categories.filter((category) => !selectedIds.has(category.id)).map((category) => `<option value="${category.id}">${escapeHtml(category.title)}</option>`).join('');
  const content = `<div class="panel"><h2>${escapeHtml(film.title)}</h2><form class="row" method="post" action="/admin/films/${film.id}/categories"><div class="w-sm"><label>Жанр</label><select name="category_id" required>${options || '<option value="">Нет доступных жанров</option>'}</select></div><button type="submit" ${options ? '' : 'disabled'}>Добавить жанр</button><a class="btn secondary" href="/admin/films">К фильмам</a></form></div><div class="panel"><table><thead><tr><th>ID</th><th>Жанр</th><th>Действия</th></tr></thead><tbody>${currentRows || '<tr><td colspan="3">Жанры не выбраны</td></tr>'}</tbody></table></div>`;
  return layout(req, 'Жанры фильма', content);
}

function usersPage(req, data) {
  const rows = data.users.map((user) => `<tr><td>${user.id}</td><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.email)}</td><td>${user.deleted_at ? `<span class="badge bad">Удален</span>` : '<span class="badge ok">Активен</span>'}</td><td>${user.deleted_at ? `<form method="post" action="/admin/users/${user.id}/restore"><button class="ok" type="submit">Восстановить</button></form>` : `<form method="post" action="/admin/users/${user.id}/delete"><button class="danger" type="submit">Удалить</button></form>`}</td></tr>`).join('');
  const content = `<div class="panel"><table><thead><tr><th>ID</th><th>Имя</th><th>Email</th><th>Статус</th><th>Действия</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return layout(req, 'Пользователи', content);
}

function reviewsPage(req, data, film = null) {
  const reviews = data.reviews.filter((review) => !review.deleted_at && (!film || review.film_id === film.id));
  const filmOptions = `<option value="/admin/reviews">Все фильмы</option>` + data.films.filter((item) => !item.deleted_at).map((item) => `<option value="/admin/films/${item.id}/reviews" ${film?.id === item.id ? 'selected' : ''}>${escapeHtml(item.title)}</option>`).join('');
  const rows = reviews.map((review) => `<tr><td>${review.id}</td><td>${escapeHtml(filmName(data, review.film_id))}</td><td>${escapeHtml(userName(data, review.user_id))}</td><td>${escapeHtml(review.text)}</td><td>${review.approved ? '<span class="badge ok">Одобрен</span>' : '<span class="badge bad">Ожидает</span>'}</td><td class="actions">${review.approved ? '' : `<form class="inline" method="post" action="/admin/reviews/${review.id}/approve"><button class="ok" type="submit">Одобрить</button></form>`}<form class="inline" method="post" action="/admin/reviews/${review.id}/delete"><button class="danger" type="submit">Удалить</button></form></td></tr>`).join('');
  const content = `<div class="panel"><label>Показать отзывы</label><select onchange="location.href=this.value">${filmOptions}</select></div><div class="panel"><table><thead><tr><th>ID</th><th>Фильм</th><th>Пользователь</th><th>Отзыв</th><th>Статус</th><th>Действия</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Отзывов нет</td></tr>'}</tbody></table></div>`;
  return layout(req, film ? `Отзывы: ${film.title}` : 'Отзывы', content);
}

function ratingsPage(req, data, film = null) {
  const ratings = data.ratings.filter((rating) => !film || rating.film_id === film.id);
  const filmOptions = `<option value="/admin/ratings">Все фильмы</option>` + data.films.filter((item) => !item.deleted_at).map((item) => `<option value="/admin/films/${item.id}/ratings" ${film?.id === item.id ? 'selected' : ''}>${escapeHtml(item.title)}</option>`).join('');
  const rows = ratings.map((rating) => `<tr><td>${rating.id}</td><td>${escapeHtml(filmName(data, rating.film_id))}</td><td>${escapeHtml(userName(data, rating.user_id))}</td><td><b>${rating.score}</b> / 10</td><td><form method="post" action="/admin/ratings/${rating.id}/delete"><button class="danger" type="submit">Удалить</button></form></td></tr>`).join('');
  const content = `<div class="panel"><label>Показать оценки</label><select onchange="location.href=this.value">${filmOptions}</select></div><div class="panel"><table><thead><tr><th>ID</th><th>Фильм</th><th>Пользователь</th><th>Оценка</th><th>Действия</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Оценок нет</td></tr>'}</tbody></table></div>`;
  return layout(req, film ? `Оценки: ${film.title}` : 'Рейтинги', content);
}

function notFound(req, res) {
  send(res, 404, layout(req, '404', '<div class="panel">Страница не найдена</div>'));
}

async function handle(req, res) {
  const data = readData();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname.replace(/\/$/, '') || '/';
  const method = req.method;
  const admin = currentAdmin(req);

  if (pathname === '/') return redirect(res, '/admin');
  if (pathname === '/admin' && !admin) return redirect(res, '/admin/login');
  if (pathname === '/admin' && admin) return redirect(res, '/admin/dashboard');
  if (pathname === '/admin/login' && method === 'GET') return send(res, 200, loginPage());
  if (pathname === '/admin/login' && method === 'POST') {
    const body = await parseBody(req);
    const found = data.admins.find((item) => item.email === formValue(body, 'email'));
    if (!found || !verifyPassword(formValue(body, 'password'), found.password)) {
      return send(res, 422, loginPage('Неверный email или пароль'));
    }
    const sid = crypto.randomBytes(24).toString('hex');
    sessions.set(sid, { admin: { id: found.id, name: found.name, email: found.email }, expires: Date.now() + SESSION_TTL });
    return send(res, 302, '', { Location: '/admin/dashboard', 'Set-Cookie': `sid=${sid}; HttpOnly; Path=/; SameSite=Lax` });
  }
  if (pathname === '/admin/logout') {
    const sid = parseCookies(req).sid;
    if (sid) sessions.delete(sid);
    return send(res, 302, '', { Location: '/admin/login', 'Set-Cookie': 'sid=; Max-Age=0; Path=/' });
  }
  if (!admin) return redirect(res, '/admin/login');

  if (pathname === '/admin/dashboard') return send(res, 200, dashboard(req, data));
  if (pathname === '/admin/countries' && method === 'GET') return send(res, 200, listSimple(req, data, 'countries', 'Страны', 'Страна'));
  if (pathname === '/admin/categories' && method === 'GET') return send(res, 200, listSimple(req, data, 'categories', 'Жанры', 'Жанр'));
  if (pathname === '/admin/countries/create' && method === 'GET') return send(res, 200, simpleForm(req, data, 'countries', 'Добавить страну'));
  if (pathname === '/admin/categories/create' && method === 'GET') return send(res, 200, simpleForm(req, data, 'categories', 'Добавить жанр'));

  let match = pathname.match(/^\/admin\/(countries|categories)\/(\d+)\/edit$/);
  if (match && method === 'GET') {
    const item = data[match[1]].find((entry) => entry.id === Number(match[2]));
    if (!item) return notFound(req, res);
    return send(res, 200, simpleForm(req, data, match[1], match[1] === 'countries' ? 'Изменить страну' : 'Изменить жанр', item));
  }

  match = pathname.match(/^\/admin\/(countries|categories)$/);
  if (match && method === 'POST') {
    const body = await parseBody(req);
    data[match[1]].push({ id: nextId(data, match[1]), title: formValue(body, 'title') });
    writeData(data);
    return redirect(res, `/admin/${match[1]}`);
  }

  match = pathname.match(/^\/admin\/(countries|categories)\/(\d+)$/);
  if (match && method === 'POST') {
    const item = data[match[1]].find((entry) => entry.id === Number(match[2]));
    if (!item) return notFound(req, res);
    const body = await parseBody(req);
    item.title = formValue(body, 'title', item.title);
    writeData(data);
    return redirect(res, `/admin/${match[1]}`);
  }

  match = pathname.match(/^\/admin\/(countries|categories)\/(\d+)\/delete$/);
  if (match && method === 'POST') {
    data[match[1]] = data[match[1]].filter((entry) => entry.id !== Number(match[2]));
    if (match[1] === 'categories') data.film_categories = data.film_categories.filter((entry) => entry.category_id !== Number(match[2]));
    writeData(data);
    return redirect(res, `/admin/${match[1]}`);
  }

  if (pathname === '/admin/films' && method === 'GET') return send(res, 200, listFilms(req, data));
  if (pathname === '/admin/films/create' && method === 'GET') return send(res, 200, filmForm(req, data));
  if (pathname === '/admin/films' && method === 'POST') {
    const body = await parseBody(req);
    data.films.push({ id: nextId(data, 'films'), title: formValue(body, 'title'), description: formValue(body, 'description'), year: Number(formValue(body, 'year')), country_id: Number(formValue(body, 'country_id')), duration: Number(formValue(body, 'duration')), deleted_at: null });
    writeData(data);
    return redirect(res, '/admin/films');
  }

  match = pathname.match(/^\/admin\/films\/(\d+)\/edit$/);
  if (match && method === 'GET') {
    const film = data.films.find((item) => item.id === Number(match[1]));
    if (!film) return notFound(req, res);
    return send(res, 200, filmForm(req, data, film));
  }

  match = pathname.match(/^\/admin\/films\/(\d+)$/);
  if (match && method === 'POST') {
    const film = data.films.find((item) => item.id === Number(match[1]));
    if (!film) return notFound(req, res);
    const body = await parseBody(req);
    Object.assign(film, { title: formValue(body, 'title', film.title), description: formValue(body, 'description', film.description), year: Number(formValue(body, 'year', film.year)), country_id: Number(formValue(body, 'country_id', film.country_id)), duration: Number(formValue(body, 'duration', film.duration)) });
    writeData(data);
    return redirect(res, '/admin/films');
  }

  match = pathname.match(/^\/admin\/films\/(\d+)\/delete$/);
  if (match && method === 'POST') {
    const film = data.films.find((item) => item.id === Number(match[1]));
    if (film) film.deleted_at = now();
    writeData(data);
    return redirect(res, '/admin/films');
  }

  match = pathname.match(/^\/admin\/films\/(\d+)\/categories$/);
  if (match && method === 'GET') {
    const film = data.films.find((item) => item.id === Number(match[1]));
    if (!film) return notFound(req, res);
    return send(res, 200, filmCategoryPage(req, data, film));
  }
  if (match && method === 'POST') {
    const film = data.films.find((item) => item.id === Number(match[1]));
    if (!film) return notFound(req, res);
    const body = await parseBody(req);
    const categoryId = Number(formValue(body, 'category_id'));
    if (categoryId && !data.film_categories.some((item) => item.film_id === film.id && item.category_id === categoryId)) {
      data.film_categories.push({ film_id: film.id, category_id: categoryId });
    }
    writeData(data);
    return redirect(res, `/admin/films/${film.id}/categories`);
  }

  match = pathname.match(/^\/admin\/films\/(\d+)\/categories\/(\d+)\/delete$/);
  if (match && method === 'POST') {
    data.film_categories = data.film_categories.filter((item) => !(item.film_id === Number(match[1]) && item.category_id === Number(match[2])));
    writeData(data);
    return redirect(res, `/admin/films/${match[1]}/categories`);
  }

  if (pathname === '/admin/users' && method === 'GET') return send(res, 200, usersPage(req, data));
  match = pathname.match(/^\/admin\/users\/(\d+)\/delete$/);
  if (match && method === 'POST') {
    const user = data.users.find((item) => item.id === Number(match[1]));
    if (user) user.deleted_at = now();
    writeData(data);
    return redirect(res, '/admin/users');
  }
  match = pathname.match(/^\/admin\/users\/(\d+)\/restore$/);
  if (match && method === 'POST') {
    const user = data.users.find((item) => item.id === Number(match[1]));
    if (user) user.deleted_at = null;
    writeData(data);
    return redirect(res, '/admin/users');
  }

  if (pathname === '/admin/reviews' && method === 'GET') return send(res, 200, reviewsPage(req, data));
  match = pathname.match(/^\/admin\/films\/(\d+)\/reviews$/);
  if (match && method === 'GET') {
    const film = data.films.find((item) => item.id === Number(match[1]));
    if (!film) return notFound(req, res);
    return send(res, 200, reviewsPage(req, data, film));
  }
  match = pathname.match(/^\/admin\/reviews\/(\d+)\/approve$/);
  if (match && method === 'POST') {
    const review = data.reviews.find((item) => item.id === Number(match[1]));
    if (review) review.approved = true;
    writeData(data);
    return redirect(res, '/admin/reviews');
  }
  match = pathname.match(/^\/admin\/reviews\/(\d+)\/delete$/);
  if (match && method === 'POST') {
    const review = data.reviews.find((item) => item.id === Number(match[1]));
    if (review) review.deleted_at = now();
    writeData(data);
    return redirect(res, '/admin/reviews');
  }

  if (pathname === '/admin/ratings' && method === 'GET') return send(res, 200, ratingsPage(req, data));
  match = pathname.match(/^\/admin\/films\/(\d+)\/ratings$/);
  if (match && method === 'GET') {
    const film = data.films.find((item) => item.id === Number(match[1]));
    if (!film) return notFound(req, res);
    return send(res, 200, ratingsPage(req, data, film));
  }
  match = pathname.match(/^\/admin\/ratings\/(\d+)\/delete$/);
  if (match && method === 'POST') {
    data.ratings = data.ratings.filter((item) => item.id !== Number(match[1]));
    writeData(data);
    return redirect(res, '/admin/ratings');
  }

  return notFound(req, res);
}

module.exports = { handle };

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Порт ${PORT} уже занят. Освободите порт или измените PORT в server.js.`);
    process.exit(1);
  }
  if (error.code === 'EPERM') {
    console.error(`Система запретила открыть порт ${PORT}. Запустите приложение в обычном терминале пользователя.`);
    process.exit(1);
  }
  throw error;
});

module.exports = { handle, readData, writeData, seedData };
