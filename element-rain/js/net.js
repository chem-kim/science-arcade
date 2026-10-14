/*
 * 통신 계층 — 교사 화면(진행자)과 학생 화면을 연결한다. (중첩 빙고의 net.js와 같은 구조)
 *
 * 데이터 구조 (element-rain/rooms/{방코드})
 *   meta      { createdAt }                       방 정보
 *   state     { status, settings, seed, ... }     진행자만 쓰고, 학생은 구독
 *   players   { [pid]: { name, score, lives, ... } }  학생이 쓰고, 진행자가 구독
 *
 * 백엔드
 *   firebase : 실제 수업용 (js/firebase-config.js 필요)
 *   local    : Firebase 없이 같은 브라우저의 여러 탭끼리 테스트 (주소에 ?net=local)
 */
(function (global) {
  'use strict';

  const ROOT = () => global.SB_DB_ROOT || 'rooms';

  // ---------- Firebase ----------

  class FirebaseBackend {
    constructor(config) {
      if (!firebase.apps.length) firebase.initializeApp(config);
      this.db = firebase.database();
      this.offset = 0;
      this.db.ref('.info/serverTimeOffset').on('value', s => { this.offset = s.val() || 0; });
    }
    now() { return Date.now() + this.offset; }
    room(code) { return new FirebaseRoom(this, code); }

    /** 12시간이 지난 방 정리 */
    async cleanup() {
      const old = await this.db.ref(ROOT()).orderByChild('meta/createdAt').endAt(this.now() - 12 * 3600e3).get();
      const updates = {};
      old.forEach(s => { updates[s.key] = null; });
      if (Object.keys(updates).length) await this.db.ref(ROOT()).update(updates);
    }
  }

  class FirebaseRoom {
    constructor(backend, code) {
      this.backend = backend;
      this.code = code;
      this.ref = backend.db.ref(`${ROOT()}/${code}`);
    }
    async exists() { return (await this.ref.child('meta').get()).exists(); }
    async getState() { return (await this.ref.child('state').get()).val(); }
    create(meta) { return this.ref.set({ meta }); }
    setState(state) { return this.ref.child('state').set(state); }
    onState(cb) {
      const h = this.ref.child('state').on('value', s => cb(s.val()));
      return () => this.ref.child('state').off('value', h);
    }
    async joinPlayer(pid, data) {
      const ref = this.ref.child(`players/${pid}`);
      this.playerRef = ref;
      await ref.update({ ...data, online: true });
      this.connHandler = this.backend.db.ref('.info/connected').on('value', s => {
        if (!s.val()) return;
        ref.child('online').onDisconnect().set(false);
        ref.child('online').set(true);
      });
    }
    leave() {
      if (!this.playerRef) return;
      this.playerRef.child('online').onDisconnect().cancel();
      this.backend.db.ref('.info/connected').off('value', this.connHandler);
      this.playerRef = null;
    }
    updatePlayer(pid, partial) { return this.ref.child(`players/${pid}`).update(partial); }
    onPlayers(cb) {
      const h = this.ref.child('players').on('value', s => cb(s.val() || {}));
      return () => this.ref.child('players').off('value', h);
    }
    removePlayer(pid) { return this.ref.child(`players/${pid}`).remove(); }
    destroy() { return this.ref.remove(); }
  }

  // ---------- 로컬 테스트 (localStorage + storage 이벤트) ----------

  class LocalBackend {
    constructor() {
      this.listeners = new Set();
      window.addEventListener('storage', e => {
        if (e.key && e.key.startsWith('sbdb:')) this.emit(e.key.slice(5));
      });
    }
    now() { return Date.now(); }
    room(code) { return new LocalRoom(this, code); }
    cleanup() { return Promise.resolve(); }

    get(path) { const v = localStorage.getItem('sbdb:' + path); return v == null ? null : JSON.parse(v); }
    set(path, val) {
      if (val == null) localStorage.removeItem('sbdb:' + path);
      else localStorage.setItem('sbdb:' + path, JSON.stringify(val));
      this.emit(path);
    }
    keys(prefix) {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith('sbdb:' + prefix)) out.push(k.slice(5));
      }
      return out;
    }
    emit(path) { this.listeners.forEach(l => { if (path.startsWith(l.prefix)) setTimeout(() => l.cb(path), 0); }); }
    on(prefix, cb) { const l = { prefix, cb }; this.listeners.add(l); return () => this.listeners.delete(l); }
  }

  class LocalRoom {
    constructor(backend, code) { this.b = backend; this.code = code; this.base = `${ROOT()}/${code}/`; }
    async exists() { return this.b.get(this.base + 'meta') != null; }
    async getState() { return this.b.get(this.base + 'state'); }
    async create(meta) { this.destroy(); this.b.set(this.base + 'meta', meta); }
    async setState(state) { this.b.set(this.base + 'state', state); }
    onState(cb) {
      cb(this.b.get(this.base + 'state'));
      return this.b.on(this.base + 'state', () => cb(this.b.get(this.base + 'state')));
    }
    players() {
      const out = {};
      this.b.keys(this.base + 'players/').forEach(k => { out[k.split('/').pop()] = this.b.get(k); });
      return out;
    }
    async joinPlayer(pid, data) {
      const path = this.base + 'players/' + pid;
      this.b.set(path, { ...(this.b.get(path) || {}), ...data, online: true });
      window.addEventListener('beforeunload', () => this.updatePlayer(pid, { online: false }));
    }
    async updatePlayer(pid, partial) {
      const path = this.base + 'players/' + pid;
      const cur = this.b.get(path);
      if (cur) this.b.set(path, { ...cur, ...partial });
    }
    onPlayers(cb) {
      cb(this.players());
      return this.b.on(this.base + 'players/', () => cb(this.players()));
    }
    async removePlayer(pid) { this.b.set(this.base + 'players/' + pid, null); }
    leave() {}
    async destroy() { this.b.keys(this.base).forEach(k => localStorage.removeItem('sbdb:' + k)); }
  }

  // ---------- 선택 ----------

  function connect() {
    const params = new URLSearchParams(location.search);
    if (params.get('net') === 'local') return new LocalBackend();
    const config = global.SB_FIREBASE_CONFIG;
    if (!config || !global.firebase) return null;
    return new FirebaseBackend(config);
  }

  /** 다른 화면으로 이동할 때 ?net=local 을 유지 */
  function keepNetParam(url) {
    const params = new URLSearchParams(location.search);
    if (params.get('net') !== 'local') return url;
    return url + (url.includes('?') ? '&' : '?') + 'net=local';
  }

  const randomId = () => Math.random().toString(36).slice(2, 10);

  global.SBNet = { connect, keepNetParam, randomId };
})(window);
