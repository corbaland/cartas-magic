/*
 * Cartas Magic · sección «Jugar»
 * Salas, invitaciones y mesa de juego de Commander en tiempo real (Supabase).
 *
 * Es una mesa virtual: la página no impone las reglas; cada jugador mueve sus
 * cartas como en una mesa de verdad y la página automatiza lo repetitivo
 * (barajar, robar, enderezar al empezar el turno, impuesto de comandante…).
 *
 * Cada jugador solo escribe su propia mesa:
 *   game_public  → lo que ven todos (campo, cementerio, exilio, mando, vida…)
 *   game_private → lo que solo ve él (mano, orden de la biblioteca, boca abajo)
 */
(function () {
  'use strict';

  var CM = window.CartasMagic;
  if (!CM || !CM.sb) return;
  var sb = CM.sb;
  var el = CM.el;

  var root = document.getElementById('jugarRoot');
  var navJugar = document.getElementById('navJugar');
  var IMG_OK = /^https:\/\/cards\.scryfall\.io\//;
  var START_LIFE = 40;
  var HAND_SIZE = 7;
  var FROM = {
    hand: 'de la mano',
    library: 'de la biblioteca',
    battlefield: 'del campo de batalla',
    graveyard: 'del cementerio',
    exile: 'del exilio',
    command: 'de la zona de mando'
  };
  var TO = {
    hand: 'a la mano',
    library: 'a la parte de arriba de la biblioteca',
    battlefield: 'al campo de batalla',
    graveyard: 'al cementerio',
    exile: 'al exilio',
    command: 'a la zona de mando'
  };

  var S = {
    screen: 'home',      // home | room | table
    visible: false,
    rooms: [],
    invites: [],
    homeMsg: '',
    room: null,
    players: [],
    practice: false,
    pub: null,           // mi mesa pública
    priv: null,          // mi parte oculta
    others: {},          // id de usuario → mesa pública
    log: [],
    logIds: {},
    localLog: 0,
    channel: null,
    homeChannel: null,
    homeUser: null,
    poll: null,
    lastTurnKey: null,
    tableError: '',
    saveState: '',
    view: null,          // id del jugador cuya mesa se mira (null = la mía)
    sideHidden: false,   // registro y chat ocultos
    unread: 0            // mensajes de chat llegados con el chat oculto
  };

  /* ---------- Utilidades ---------- */

  function randInt(n) {
    var a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    return list;
  }

  function newIid() {
    var a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return a[0].toString(36) + a[1].toString(36);
  }

  function myId() {
    var u = CM.user();
    return u ? u.id : null;
  }

  function myName() {
    var p = CM.profile();
    return p ? p.username : 'yo';
  }

  function safeImg(url) {
    return typeof url === 'string' && IMG_OK.test(url) ? url : null;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function button(text, cls, fn, title) {
    var b = el('button', cls || 'plain small', text);
    b.type = 'button';
    if (title) {
      b.title = title;
      b.setAttribute('aria-label', title);
    }
    if (fn) b.addEventListener('click', fn);
    return b;
  }

  function field(label, input) {
    var l = el('label', 'field', label);
    l.appendChild(input);
    return l;
  }

  function input(type, placeholder, max) {
    var i = el('input', 'pinput');
    i.type = type;
    if (placeholder) i.placeholder = placeholder;
    if (max) i.maxLength = max;
    return i;
  }

  function errText(err) {
    var m = (err && err.message) || 'error desconocido';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'No hay conexión con el servidor.';
    return m;
  }

  var toastTimer;
  function toast(msg, bad) {
    var t = document.getElementById('gtoast');
    if (!t) {
      t = el('div', 'gtoast');
      t.id = 'gtoast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.toggle('bad', !!bad);
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 3500);
  }

  function askNumber(msg, def, max) {
    var v = window.prompt(msg, String(def));
    if (v === null) return 0;
    var n = parseInt(v, 10);
    if (!(n > 0)) return 0;
    return Math.min(n, max || 99);
  }

  function plural(n, one, many) {
    return n === 1 ? '1 ' + one : n + ' ' + many;
  }

  /* ---------- Acceso a la sección ---------- */

  // De momento: el administrador y quien tenga una invitación o esté en una sala.
  function allowed() {
    return !!myId() && (CM.isAdmin() || S.rooms.length > 0 || S.invites.length > 0);
  }

  function updateNav() {
    navJugar.hidden = !allowed();
    var view = document.getElementById('view-jugar');
    if (location.hash === '#jugar' && allowed() === view.hidden) CM.route();
  }

  document.addEventListener('cm:auth', function () {
    if (!myId()) {
      stopRoom();
      if (S.homeChannel) { sb.removeChannel(S.homeChannel); S.homeChannel = null; }
      S.homeUser = null;
      S.rooms = [];
      S.invites = [];
      S.screen = 'home';
      updateNav();
      return;
    }
    if (S.homeUser !== myId()) {
      S.homeUser = myId();
      subscribeHome();
    }
    loadHome();
  });

  function subscribeHome() {
    if (S.homeChannel) sb.removeChannel(S.homeChannel);
    S.homeChannel = sb.channel('invitaciones-' + myId())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_invites', filter: 'user_id=eq.' + myId() }, function () {
        loadHome();
      })
      .subscribe();
  }

  async function loadHome() {
    var id = myId();
    if (!id) return;
    var res = await Promise.all([
      sb.from('room_players').select('room_id, rooms(id, code, name, status, host_id, max_players, created_at)').eq('user_id', id),
      sb.from('room_invites').select('room_id, invited_by_name, created_at, rooms(id, code, name, status, max_players)').eq('user_id', id)
    ]);
    if (res[0].error || res[1].error) {
      console.error(res[0].error || res[1].error);
      S.homeMsg = 'No se han podido cargar tus salas.';
    } else {
      S.rooms = res[0].data.map(function (r) { return r.rooms; }).filter(Boolean)
        .sort(function (a, b) { return b.created_at.localeCompare(a.created_at); });
      S.invites = res[1].data.filter(function (i) { return i.rooms; });
      S.homeMsg = '';
    }
    updateNav();
    if (S.visible && S.screen === 'home') render();
  }

  /* ---------- Pantallas ---------- */

  function show() {
    S.visible = true;
    document.body.classList.toggle('in-table', S.screen === 'table');
    if (S.screen === 'home') loadHome();
    render();
  }

  function hide() {
    S.visible = false;
    document.body.classList.remove('in-table');
    closeMenu();
  }

  function render() {
    if (!S.visible) return;
    document.body.classList.toggle('in-table', S.screen === 'table');
    if (S.screen === 'room') renderRoom();
    else if (S.screen === 'table') buildTable();
    else renderHome();
  }

  function renderHome() {
    root.textContent = '';
    var page = el('div', 'page play-home');
    page.appendChild(el('h1', 'admin-title', 'Jugar'));
    page.appendChild(el('p', 'note', 'Partidas de Commander en tiempo real con tus amigos. De momento solo ven esta sección el administrador y quien reciba una invitación.'));
    if (S.homeMsg) page.appendChild(el('p', 'note bad', S.homeMsg));

    var grid = el('div', 'play-grid');

    // Crear sala
    var create = el('section', 'play-box');
    create.appendChild(el('h2', null, 'Crear sala'));
    var name = input('text', 'Sala de ' + myName(), 60);
    var max = el('select', 'pinput');
    [2, 3, 4, 5, 6].forEach(function (n) {
      var o = el('option', null, n + ' jugadores');
      o.value = String(n);
      if (n === 4) o.selected = true;
      max.appendChild(o);
    });
    create.appendChild(field('Nombre', name));
    create.appendChild(field('Máximo de jugadores', max));
    create.appendChild(button('Crear sala', 'plain primary', async function (ev) {
      ev.currentTarget.disabled = true;
      var r = await sb.rpc('create_room', { room_name: name.value, max_p: parseInt(max.value, 10) });
      if (r.error) {
        toast(errText(r.error), true);
        ev.currentTarget.disabled = false;
        return;
      }
      openRoom(r.data);
    }));
    grid.appendChild(create);

    // Unirse
    var join = el('section', 'play-box');
    join.appendChild(el('h2', null, 'Unirse con código'));
    var code = input('text', 'ABC123', 6);
    code.autocapitalize = 'characters';
    code.spellcheck = false;
    join.appendChild(field('Código de la sala', code));
    var joinBtn = button('Unirse', 'plain primary', async function () {
      if (code.value.trim().length < 6) { toast('El código tiene 6 caracteres.', true); return; }
      var r = await sb.rpc('join_room', { room_code: code.value });
      if (r.error) { toast(errText(r.error), true); return; }
      openRoom(r.data);
    });
    code.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') joinBtn.click(); });
    join.appendChild(joinBtn);
    grid.appendChild(join);

    // Práctica
    var solo = el('section', 'play-box');
    solo.appendChild(el('h2', null, 'Práctica en solitario'));
    solo.appendChild(el('p', 'note', 'Prueba un mazo en la mesa sin nadie más. No se guarda.'));
    var pick = deckSelect(null);
    solo.appendChild(field('Mazo', pick));
    solo.appendChild(button('Empezar', 'plain primary', function () {
      var deck = CM.decks().find(function (d) { return d.id === pick.value; });
      if (!deck) { toast('Elige un mazo. Si no tienes, créalo en la sección Mazos.', true); return; }
      practice(deck);
    }));
    grid.appendChild(solo);
    page.appendChild(grid);

    // Invitaciones
    if (S.invites.length) {
      page.appendChild(el('h2', 'play-h2', 'Invitaciones'));
      var inv = el('div', 'play-list');
      S.invites.forEach(function (i) {
        var row = el('div', 'play-row');
        var txt = el('div');
        txt.appendChild(el('strong', null, i.rooms.name));
        txt.appendChild(el('span', 'note', ' · te invita ' + (i.invited_by_name || 'alguien')
          + (i.rooms.status === 'playing' ? ' · la partida ya ha empezado' : '')));
        row.appendChild(txt);
        var btns = el('div', 'play-btns');
        btns.appendChild(button('Aceptar', 'plain small primary', async function () {
          var r = await sb.rpc('join_room', { room_code: i.rooms.code });
          if (r.error) { toast(errText(r.error), true); return; }
          openRoom(r.data);
        }));
        btns.appendChild(button('Rechazar', 'plain small', async function () {
          var r = await sb.from('room_invites').delete().eq('room_id', i.room_id).eq('user_id', myId());
          if (r.error) toast(errText(r.error), true);
          loadHome();
        }));
        row.appendChild(btns);
        inv.appendChild(row);
      });
      page.appendChild(inv);
    }

    // Mis salas
    page.appendChild(el('h2', 'play-h2', 'Mis salas'));
    if (!S.rooms.length) {
      page.appendChild(el('p', 'note', 'Aún no estás en ninguna sala.'));
    } else {
      var list = el('div', 'play-list');
      S.rooms.forEach(function (r) {
        var row = el('div', 'play-row');
        var txt = el('div');
        txt.appendChild(el('strong', null, r.name));
        txt.appendChild(el('span', 'note', ' · código ' + r.code + ' · '
          + (r.status === 'playing' ? 'partida en curso' : 'esperando jugadores')
          + (r.host_id === myId() ? ' · eres el anfitrión' : '')));
        row.appendChild(txt);
        var btns = el('div', 'play-btns');
        btns.appendChild(button(r.status === 'playing' ? 'Volver a la partida' : 'Entrar', 'plain small primary', function () { openRoom(r.id); }));
        row.appendChild(btns);
        list.appendChild(row);
      });
      page.appendChild(list);
    }
    root.appendChild(page);
  }

  function deckSelect(selected) {
    var s = el('select', 'pinput');
    var decks = CM.decks();
    var none = el('option', null, decks.length ? 'Elige un mazo…' : 'No tienes mazos');
    none.value = '';
    s.appendChild(none);
    decks.forEach(function (d) {
      var n = d.cards.reduce(function (t, c) { return c.sec === 'tokens' ? t : t + c.qty; }, 0);
      var o = el('option', null, (d.name || 'Mazo sin nombre') + ' (' + n + ' cartas)');
      o.value = d.id;
      if (d.id === selected) o.selected = true;
      s.appendChild(o);
    });
    return s;
  }

  /* ---------- Sala (antes de la partida) ---------- */

  async function openRoom(rid) {
    stopRoom();
    S.practice = false;
    var ok = await refreshRoom(rid);
    if (!ok) { S.screen = 'home'; render(); loadHome(); return; }
    subscribeRoom(rid);
    if (S.room.status === 'playing') await enterTable();
    else { S.screen = 'room'; render(); }
    loadHome();
  }

  async function refreshRoom(rid) {
    var res = await Promise.all([
      sb.from('rooms').select('*').eq('id', rid).maybeSingle(),
      sb.from('room_players').select('*').eq('room_id', rid).order('seat')
    ]);
    if (res[0].error || res[1].error) {
      toast('No se ha podido cargar la sala.', true);
      return false;
    }
    if (!res[0].data || !res[1].data.some(function (p) { return p.user_id === myId(); })) {
      toast('Ya no estás en esa sala.', true);
      return false;
    }
    S.room = res[0].data;
    S.players = res[1].data;
    return true;
  }

  function subscribeRoom(rid) {
    S.channel = sb.channel('sala-' + rid)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'id=eq.' + rid }, function (p) {
        onRoomUpdate(p.new);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: 'room_id=eq.' + rid }, function () {
        reloadRoom();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_public', filter: 'room_id=eq.' + rid }, function (p) {
        if (p.new && p.new.user_id) onPublic(p.new);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_log', filter: 'room_id=eq.' + rid }, function (p) {
        pushLog(p.new);
      })
      .subscribe();
    // Por si se pierde algún aviso (por ejemplo, alguien sale de la sala)
    S.poll = setInterval(reloadRoom, 10000);
  }

  function stopRoom() {
    if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
    clearInterval(S.poll);
    S.poll = null;
  }

  async function reloadRoom() {
    if (!S.room || S.practice) return;
    var rid = S.room.id;
    var prev = S.room;
    var res = await Promise.all([
      sb.from('rooms').select('*').eq('id', rid).maybeSingle(),
      sb.from('room_players').select('*').eq('room_id', rid).order('seat')
    ]);
    if (!S.room || S.room.id !== rid || res[0].error || res[1].error) return;
    if (!res[0].data || !res[1].data.some(function (p) { return p.user_id === myId(); })) {
      leaveScreens('La sala ya no existe o ya no estás en ella.');
      return;
    }
    S.players = res[1].data;
    if (res[0].data.updated_at !== prev.updated_at) onRoomUpdate(res[0].data);
    else if (S.screen === 'room') render();
    else if (S.screen === 'table') renderOpps();
    if (S.screen === 'table' && S.room.status === 'playing') refreshOthers();
  }

  // Red de seguridad: recarga las mesas de los rivales por si se perdió algún aviso.
  async function refreshOthers() {
    var rid = S.room && S.room.id;
    if (!rid) return;
    var r = await sb.from('game_public').select('user_id, state').eq('room_id', rid).neq('user_id', myId());
    if (r.error || !S.room || S.room.id !== rid) return;
    var changed = false;
    r.data.forEach(function (row) {
      if (JSON.stringify(S.others[row.user_id]) !== JSON.stringify(row.state)) {
        S.others[row.user_id] = row.state;
        changed = true;
      }
    });
    if (changed && S.screen === 'table') {
      renderOpps();
      renderViewer();
    }
  }

  function onRoomUpdate(r) {
    if (!S.room || r.id !== S.room.id) return;
    var prev = S.room;
    S.room = r;
    if (prev.status !== r.status) {
      if (r.status === 'playing') { enterTable(); return; }
      if (S.screen === 'table') {
        S.screen = 'room';
        S.pub = S.priv = null;
        closeViewer();
        toast('El anfitrión ha terminado la partida.');
        reloadRoom().then(render);
        return;
      }
    }
    if (S.screen === 'table') {
      checkTurn();
      renderMine();
      renderOpps();
    } else if (S.screen === 'room') {
      render();
    }
  }

  function leaveScreens(msg) {
    stopRoom();
    S.room = null;
    S.players = [];
    S.pub = S.priv = null;
    S.practice = false;
    S.screen = 'home';
    closeViewer();
    if (msg) toast(msg, true);
    render();
    loadHome();
  }

  function renderRoom() {
    root.textContent = '';
    var r = S.room;
    var meId = myId();
    var host = r.host_id === meId;
    var mine = S.players.find(function (p) { return p.user_id === meId; }) || {};
    var page = el('div', 'page play-room');

    var top = el('div', 'play-head');
    top.appendChild(button('← Salas', 'plain small', function () { stopRoom(); S.room = null; S.screen = 'home'; render(); loadHome(); }));
    top.appendChild(el('h1', 'admin-title', r.name));
    page.appendChild(top);

    var codeRow = el('p', 'play-code');
    codeRow.appendChild(document.createTextNode('Código de la sala: '));
    codeRow.appendChild(el('strong', null, r.code));
    codeRow.appendChild(button('Copiar', 'plain small', async function () {
      try { await navigator.clipboard.writeText(r.code); toast('Código copiado.'); } catch (e) { toast('No se ha podido copiar.', true); }
    }));
    page.appendChild(codeRow);

    // Jugadores
    page.appendChild(el('h2', 'play-h2', 'Jugadores (' + S.players.length + '/' + r.max_players + ')'));
    var list = el('div', 'play-list');
    S.players.forEach(function (p) {
      var row = el('div', 'play-row');
      var txt = el('div');
      txt.appendChild(el('strong', null, p.username));
      if (p.user_id === r.host_id) txt.appendChild(el('span', 'badge-admin', 'Anfitrión'));
      txt.appendChild(el('span', 'note', ' · ' + (p.deck_name ? 'mazo «' + p.deck_name + '»' : 'sin mazo elegido')));
      row.appendChild(txt);
      row.appendChild(el('span', 'play-ready' + (p.ready ? ' on' : ''), p.ready ? '✓ Listo' : 'Esperando'));
      list.appendChild(row);
    });
    page.appendChild(list);

    // Mi mazo
    var box = el('section', 'play-box');
    box.appendChild(el('h2', null, 'Tu mazo'));
    var sel = deckSelect(mine.deck_id);
    box.appendChild(field('Mazo para esta partida', sel));
    sel.addEventListener('change', async function () {
      var deck = CM.decks().find(function (d) { return d.id === sel.value; });
      var r2 = await sb.from('room_players')
        .update({ deck_id: deck ? deck.id : null, deck_name: deck ? (deck.name || 'Mazo sin nombre') : null, ready: false })
        .eq('room_id', r.id).eq('user_id', meId);
      if (r2.error) toast(errText(r2.error), true);
      reloadRoom();
    });
    box.appendChild(button(mine.ready ? 'Ya no estoy listo' : 'Estoy listo', mine.ready ? 'plain' : 'plain primary', async function () {
      if (!mine.deck_id) { toast('Elige antes un mazo.', true); return; }
      var r3 = await sb.from('room_players').update({ ready: !mine.ready }).eq('room_id', r.id).eq('user_id', meId);
      if (r3.error) toast(errText(r3.error), true);
      reloadRoom();
    }));
    page.appendChild(box);

    // Invitar
    var invBox = el('section', 'play-box');
    invBox.appendChild(el('h2', null, 'Invitar'));
    var who = input('text', 'nombre de usuario', 20);
    who.autocapitalize = 'none';
    who.spellcheck = false;
    invBox.appendChild(field('Usuario', who));
    var invBtn = button('Invitar', 'plain primary', async function () {
      if (!who.value.trim()) return;
      var r4 = await sb.rpc('invite_user', { rid: r.id, uname: who.value });
      if (r4.error) { toast(errText(r4.error), true); return; }
      toast('Invitación enviada a ' + who.value.trim() + '.');
      who.value = '';
    });
    who.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') invBtn.click(); });
    invBox.appendChild(invBtn);
    invBox.appendChild(el('p', 'note', 'También pueden unirse con el código de la sala.'));
    page.appendChild(invBox);

    // Acciones
    var acts = el('div', 'play-actions');
    if (host) {
      var missing = S.players.filter(function (p) { return !p.deck_id; }).length;
      var start = button('Empezar partida', 'plain primary', async function () {
        var r5 = await sb.rpc('start_game', { rid: r.id });
        if (r5.error) toast(errText(r5.error), true);
      });
      if (missing) {
        start.disabled = true;
        start.title = 'Todos los jugadores tienen que elegir mazo';
      }
      acts.appendChild(start);
    } else {
      acts.appendChild(el('p', 'note', 'El anfitrión empezará la partida cuando estéis listos.'));
    }
    acts.appendChild(button('Salir de la sala', 'plain', async function () {
      if (!confirm('¿Salir de la sala «' + r.name + '»?')) return;
      var r6 = await sb.rpc('leave_room', { rid: r.id });
      if (r6.error) { toast(errText(r6.error), true); return; }
      leaveScreens();
    }));
    if (host) {
      acts.appendChild(button('Eliminar sala', 'plain danger', async function () {
        if (!confirm('¿Eliminar la sala «' + r.name + '» para todos? No se puede deshacer.')) return;
        var r7 = await sb.rpc('delete_room', { rid: r.id });
        if (r7.error) { toast(errText(r7.error), true); return; }
        leaveScreens();
      }));
    }
    page.appendChild(acts);
    root.appendChild(page);
  }

  /* ---------- Entrar a la mesa ---------- */

  async function enterTable() {
    S.screen = 'table';
    S.others = {};
    S.log = [];
    S.logIds = {};
    S.view = null;
    S.unread = 0;
    S.pub = S.priv = null;
    S.tableError = '';
    render();
    var rid = S.room.id;
    var meId = myId();
    var res = await Promise.all([
      sb.from('game_public').select('user_id, state').eq('room_id', rid),
      sb.from('game_private').select('state').eq('room_id', rid).eq('user_id', meId).maybeSingle(),
      sb.from('game_log').select('*').eq('room_id', rid).order('id', { ascending: false }).limit(200),
      sb.from('room_players').select('*').eq('room_id', rid).order('seat')
    ]);
    if (!S.room || S.room.id !== rid) return;
    var err = res[0].error || res[1].error || res[2].error || res[3].error;
    if (err) {
      S.tableError = 'No se ha podido cargar la partida: ' + errText(err);
      render();
      return;
    }
    S.players = res[3].data;
    res[0].data.forEach(function (row) {
      if (row.user_id === meId) S.pub = row.state;
      else S.others[row.user_id] = row.state;
    });
    S.priv = res[1].data ? res[1].data.state : null;
    res[2].data.reverse().forEach(function (e) { pushLog(e, true); });
    S.lastTurnKey = turnKey();

    if (!S.pub || !S.priv || !S.pub.zones) {
      var me = S.players.find(function (p) { return p.user_id === meId; });
      var deck = CM.decks().find(function (d) { return me && d.id === me.deck_id; });
      if (!deck) {
        S.tableError = 'No encuentro tu mazo «' + ((me && me.deck_name) || '?') + '». ¿Lo has borrado? El anfitrión puede terminar la partida para elegir otro.';
        render();
        return;
      }
      setupGame(deck);
    }
    buildTable();
  }

  function practice(deck) {
    stopRoom();
    S.practice = true;
    S.room = { id: null, name: 'Práctica', host_id: myId(), status: 'playing', turn_user: myId(), turn_number: 1 };
    S.players = [{ user_id: myId(), username: myName(), seat: 0 }];
    S.others = {};
    S.log = [];
    S.logIds = {};
    S.view = null;
    S.unread = 0;
    S.tableError = '';
    S.screen = 'table';
    S.lastTurnKey = turnKey();
    setupGame(deck);
    render();
  }

  function setupGame(deck) {
    var lib = [];
    var cmd = [];
    var tokens = [];
    (deck.cards || []).forEach(function (c) {
      var base = { id: c.id, name: c.name, img: safeImg(c.img), type: c.type || '' };
      if (c.sec === 'tokens') { tokens.push(base); return; }
      for (var i = 0; i < (c.qty || 1); i++) {
        var card = Object.assign({ iid: newIid() }, base);
        if (c.sec === 'comandante') { card.cmd = true; cmd.push(card); } else lib.push(card);
      }
    });
    S.pub = {
      deckName: deck.name || 'Mazo sin nombre',
      life: START_LIFE,
      poison: 0,
      cmdDmg: {},
      casts: {},
      mulligans: 0,
      tokens: tokens,
      zones: { battlefield: [], graveyard: [], exile: [], command: cmd },
      handCount: 0,
      libCount: 0
    };
    S.priv = { library: shuffle(lib), hand: [], hidden: {} };
    drawCards(HAND_SIZE);
    commit('se sienta a la mesa con «' + S.pub.deckName + '» y roba ' + HAND_SIZE + ' cartas.');
  }

  function turnKey() {
    return S.room ? S.room.turn_number + ':' + S.room.turn_user : '';
  }

  // Al empezar mi turno: enderezar y robar (menos el primer turno de la partida).
  function checkTurn() {
    var k = turnKey();
    if (k === S.lastTurnKey) return;
    S.lastTurnKey = k;
    if (!S.room || S.room.turn_user !== myId() || !S.pub || !S.priv) return;
    untapAll();
    var drew = S.room.turn_number > 1 ? drawCards(1) : 0;
    commit('empieza su turno: endereza sus permanentes' + (drew ? ' y roba una carta' : '') + '.');
  }

  /* ---------- Guardar y sincronizar ---------- */

  var saveTimer = null;
  var saving = false;
  var saveAgain = false;

  function commit(text, data) {
    if (!S.pub || !S.priv) return;
    S.pub.handCount = S.priv.hand.length;
    S.pub.libCount = S.priv.library.length;
    renderMine();
    renderViewer();
    if (text) addLog(text, data);
    if (!S.practice) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 150);
    }
  }

  async function save() {
    if (saving) { saveAgain = true; return; }
    if (!S.room || S.practice || !S.pub) return;
    saving = true;
    setSave('Guardando…');
    var now = new Date().toISOString();
    var row = { room_id: S.room.id, user_id: myId(), updated_at: now };
    var res = await Promise.all([
      sb.from('game_public').upsert(Object.assign({ state: S.pub }, row)),
      sb.from('game_private').upsert(Object.assign({ state: S.priv }, row))
    ]);
    saving = false;
    var err = res[0].error || res[1].error;
    if (err) {
      console.error(err);
      setSave('Error al guardar', true);
    } else {
      setSave('');
    }
    if (saveAgain) { saveAgain = false; save(); }
  }

  function setSave(text, bad) {
    S.saveState = text;
    var n = document.getElementById('gSave');
    if (!n) return;
    n.textContent = text;
    n.classList.toggle('bad', !!bad);
  }

  function onPublic(row) {
    if (row.user_id === myId()) return;
    if (!row.state) { refreshOthers(); return; }
    S.others[row.user_id] = row.state;
    if (S.screen === 'table') {
      renderOpps();
      renderViewer();
    }
  }

  async function addLog(text, data, kind) {
    kind = kind || 'action';
    if (S.practice) {
      pushLog({ id: 'p' + (++S.localLog), kind: kind, username: myName(), text: text, data: data || null });
      return;
    }
    var r = await sb.from('game_log').insert({ room_id: S.room.id, kind: kind, text: text.slice(0, 500), data: data || null }).select().single();
    if (r.error) { console.error(r.error); return; }
    pushLog(r.data);
  }

  function pushLog(e, quiet) {
    if (!e || S.logIds[e.id]) return;
    S.logIds[e.id] = true;
    var last = S.log[S.log.length - 1];
    S.log.push(e);
    var outOfOrder = last && typeof e.id === 'number' && typeof last.id === 'number' && e.id < last.id;
    if (outOfOrder) S.log.sort(function (a, b) { return a.id - b.id; });
    if (S.log.length > 300) S.log.splice(0, S.log.length - 300);
    if (quiet) return;
    if (S.sideHidden && e.kind === 'chat' && e.user_id && e.user_id !== myId()) {
      S.unread++;
      renderSeats();
    }
    if (outOfOrder) renderLog();
    else appendLog(e);
  }

  /* ---------- Cartas y zonas ---------- */

  function zoneList(z) {
    if (z === 'hand') return S.priv.hand;
    if (z === 'library') return S.priv.library;
    return S.pub.zones[z];
  }

  function locate(iid) {
    var zs = ['hand', 'battlefield', 'command', 'graveyard', 'exile', 'library'];
    for (var i = 0; i < zs.length; i++) {
      var list = zoneList(zs[i]);
      for (var j = 0; j < list.length; j++) {
        if (list[j].iid === iid) return { zone: zs[i], list: list, index: j, card: list[j] };
      }
    }
    return null;
  }

  // Una carta boca abajo solo guarda en lo público su posición; el resto va en lo oculto.
  function realCard(c) {
    return c.fd ? Object.assign({}, c, S.priv.hidden[c.iid] || {}) : c;
  }

  function autoPos(card) {
    var t = card.type || '';
    var y = /\bLand\b/.test(t) ? 64 : /\bCreature\b/.test(t) ? 4 : 34;
    var row = S.pub.zones.battlefield.filter(function (c) { return c.y >= y && c.y < y + 20; });
    var slot = row.length;
    return { x: 3 + (slot % 9) * 10.5, y: y + Math.floor(slot / 9) * 6 };
  }

  function moveCard(iid, to, opts) {
    opts = opts || {};
    var loc = locate(iid);
    if (!loc) return null;
    var card = realCard(loc.card);
    loc.list.splice(loc.index, 1);
    delete S.priv.hidden[iid];
    var from = loc.zone;
    // Las fichas dejan de existir al salir del campo de batalla.
    if (card.token && to !== 'battlefield') return { card: card, from: from, gone: true };

    var clean = { iid: card.iid, id: card.id, name: card.name, img: card.img, type: card.type };
    if (card.cmd) clean.cmd = true;
    if (card.token) clean.token = true;
    if (card.imgBack) clean.imgBack = card.imgBack;
    if (to === 'battlefield') {
      var pos = opts.x != null ? { x: opts.x, y: opts.y } : autoPos(clean);
      if (opts.faceDown) {
        S.priv.hidden[clean.iid] = clean;
        clean = { iid: clean.iid, fd: true };
      }
      clean.x = pos.x;
      clean.y = pos.y;
      clean.tapped = false;
      clean.counters = {};
    }
    var list = zoneList(to);
    if (to === 'library' && !opts.bottom) list.unshift(clean);
    else list.push(clean);
    return { card: card, from: from };
  }

  function describeMove(res, to, opts) {
    var hidden = opts.faceDown
      || ((res.from === 'hand' || res.from === 'library') && (to === 'hand' || to === 'library'));
    var what = hidden ? 'una carta' : '«' + res.card.name + '»';
    if (res.gone) return 'la ficha ' + what + ' deja de existir';
    if (to === 'battlefield' && res.from === 'hand') return (opts.faceDown ? 'juega una carta boca abajo' : 'juega ' + what);
    if (to === 'battlefield' && res.from === 'command') return 'lanza a su comandante ' + what;
    if (to === 'graveyard' && res.from === 'hand') return 'descarta ' + what;
    if (to === 'hand' && res.from === 'library') return 'pone una carta de su biblioteca en la mano';
    var dest = to === 'library' && opts.bottom ? 'al fondo de la biblioteca' : TO[to];
    return 'mueve ' + what + ' ' + FROM[res.from] + ' ' + dest;
  }

  function doMove(iid, to, opts) {
    opts = opts || {};
    var loc = locate(iid);
    if (!loc) return;
    var real = realCard(loc.card);
    if (real.cmd && loc.zone !== 'command' && to !== 'command' && to !== 'battlefield' && !opts.noAsk) {
      if (confirm('«' + real.name + '» es tu comandante. ¿Lo devuelves a la zona de mando en lugar de moverlo ' + (to === 'library' && opts.bottom ? 'al fondo de la biblioteca' : TO[to]) + '?')) to = 'command';
    }
    var res = moveCard(iid, to, opts);
    if (!res) return;
    var extra = '';
    if (res.from === 'command' && to === 'battlefield' && real.cmd) {
      var n = (S.pub.casts[iid] || 0);
      extra = n ? ' (impuesto de comandante: +' + (2 * n) + ')' : '';
      S.pub.casts[iid] = n + 1;
    }
    commit(describeMove(res, to, opts) + extra + '.');
  }

  function drawCards(n) {
    var got = 0;
    while (got < n && S.priv.library.length) {
      S.priv.hand.push(S.priv.library.shift());
      got++;
    }
    if (got < n) toast('Tu biblioteca está vacía.', true);
    return got;
  }

  function untapAll() {
    var n = 0;
    S.pub.zones.battlefield.forEach(function (c) { if (c.tapped) { c.tapped = false; n++; } });
    return n;
  }

  function cardOnField(iid) {
    return S.pub.zones.battlefield.find(function (c) { return c.iid === iid; }) || null;
  }

  function toggleTap(iid) {
    var c = cardOnField(iid);
    if (!c) return;
    c.tapped = !c.tapped;
    commit((c.tapped ? 'gira ' : 'endereza ') + (c.fd ? 'una carta boca abajo' : '«' + c.name + '»') + '.');
  }

  function setCounter(iid, kind, delta) {
    var c = cardOnField(iid);
    if (!c) return 0;
    c.counters = c.counters || {};
    var v = Math.max(0, (c.counters[kind] || 0) + delta);
    if (v) c.counters[kind] = v;
    else delete c.counters[kind];
    commit(null);
    counterLog(c, kind);
    return v;
  }

  var ctrLogTimer = null;
  var ctrLogs = {};
  function counterLog(c, kind) {
    ctrLogs[c.iid + '|' + kind] = { name: c.fd ? 'una carta boca abajo' : '«' + c.name + '»', kind: kind, iid: c.iid };
    clearTimeout(ctrLogTimer);
    ctrLogTimer = setTimeout(function () {
      Object.keys(ctrLogs).forEach(function (k) {
        var e = ctrLogs[k];
        var card = cardOnField(e.iid);
        var n = card && card.counters ? (card.counters[e.kind] || 0) : 0;
        addLog('deja ' + e.name + ' con ' + n + ' contador' + (n === 1 ? '' : 'es') + ' ' + e.kind + '.');
      });
      ctrLogs = {};
    }, 1500);
  }

  function toggleFaceDown(iid) {
    var c = cardOnField(iid);
    if (!c) return;
    var i = S.pub.zones.battlefield.indexOf(c);
    if (c.fd) {
      var real = realCard(c);
      delete S.priv.hidden[iid];
      delete real.fd;
      S.pub.zones.battlefield[i] = real;
      commit('pone boca arriba «' + real.name + '».');
    } else {
      S.priv.hidden[iid] = { id: c.id, name: c.name, img: c.img, type: c.type, cmd: c.cmd, imgBack: c.imgBack };
      S.pub.zones.battlefield[i] = { iid: iid, fd: true, x: c.x, y: c.y, tapped: c.tapped, counters: c.counters || {} };
      commit('pone boca abajo «' + c.name + '».');
    }
  }

  async function transform(iid) {
    var c = cardOnField(iid);
    if (!c || c.fd) return;
    if (!c.imgBack) {
      try {
        var res = await fetch('https://api.scryfall.com/cards/' + encodeURIComponent(c.id));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var card = await res.json();
        var back = card.card_faces && card.card_faces[1] && card.card_faces[1].image_uris
          ? safeImg(card.card_faces[1].image_uris.small) : null;
        if (!back) { toast('«' + c.name + '» no tiene otra cara.', true); return; }
        c = cardOnField(iid);
        if (!c) return;
        c.imgBack = back;
      } catch (err) {
        toast('No se ha podido cargar la otra cara.', true);
        return;
      }
    }
    c.flipped = !c.flipped;
    commit('transforma «' + c.name + '».');
  }

  function copyAsToken(iid) {
    var c = cardOnField(iid);
    if (!c || c.fd) return;
    var t = { iid: newIid(), id: c.id, name: c.name, img: c.img, type: c.type, token: true, x: clamp(c.x + 3, 0, 94), y: clamp(c.y + 4, 0, 88), tapped: false, counters: {} };
    S.pub.zones.battlefield.push(t);
    commit('crea una ficha copia de «' + c.name + '».');
  }

  function createToken(base) {
    var t = { iid: newIid(), id: base.id, name: base.name, img: safeImg(base.img), type: base.type || 'Token', token: true, tapped: false, counters: {} };
    var pos = autoPos(t);
    t.x = pos.x;
    t.y = pos.y;
    S.pub.zones.battlefield.push(t);
    commit('crea una ficha «' + t.name + '».');
  }

  /* ---------- Vida, veneno y daño de comandante ---------- */

  var statTimer = null;
  var statFrom = null;

  function statGet(key) {
    if (key === 'life') return S.pub.life;
    if (key === 'poison') return S.pub.poison || 0;
    return S.pub.cmdDmg[key.slice(4)] || 0;
  }

  function statSet(key, v) {
    if (key === 'life') S.pub.life = v;
    else if (key === 'poison') S.pub.poison = Math.max(0, v);
    else S.pub.cmdDmg[key.slice(4)] = Math.max(0, v);
  }

  function statLabel(key) {
    if (key === 'life') return 'vida';
    if (key === 'poison') return 'veneno';
    var p = S.players.find(function (x) { return x.user_id === key.slice(4); });
    return 'daño de comandante de ' + (p ? p.username : '?');
  }

  function changeStat(key, delta) {
    statFrom = statFrom || {};
    if (!(key in statFrom)) statFrom[key] = statGet(key);
    var before = statGet(key);
    statSet(key, before + delta);
    // El daño de comandante también es daño normal: resta vida.
    if (key.indexOf('cmd:') === 0) {
      var real = statGet(key) - before;
      if (real) {
        if (!('life' in statFrom)) statFrom.life = S.pub.life;
        S.pub.life -= real;
      }
    }
    commit(null);
    clearTimeout(statTimer);
    statTimer = setTimeout(flushStats, 1500);
  }

  function flushStats() {
    if (!statFrom || !S.pub) { statFrom = null; return; }
    var parts = [];
    Object.keys(statFrom).forEach(function (k) {
      var now = statGet(k);
      if (now !== statFrom[k]) parts.push(statLabel(k) + ' ' + statFrom[k] + ' → ' + now);
    });
    statFrom = null;
    if (parts.length) addLog('cambia su ' + parts.join(', ') + '.');
  }

  /* ---------- Acciones de la biblioteca y del jugador ---------- */

  function libraryMenu(x, y) {
    var n = S.priv.library.length;
    openMenu([
      { title: 'Biblioteca (' + plural(n, 'carta', 'cartas') + ')' },
      { label: 'Robar una carta', fn: function () { if (drawCards(1)) commit('roba una carta.'); } },
      { label: 'Robar varias…', fn: function () {
        var k = askNumber('¿Cuántas cartas robas?', 2, n);
        var got = k ? drawCards(k) : 0;
        if (got) commit('roba ' + plural(got, 'carta', 'cartas') + '.');
      } },
      { label: 'Barajar', fn: function () { shuffle(S.priv.library); commit('baraja su biblioteca.'); } },
      '-',
      { label: 'Mirar las de arriba…', fn: lookTop },
      { label: 'Buscar en la biblioteca…', fn: searchLibrary },
      { label: 'Revelar la de arriba', fn: function () {
        var c = S.priv.library[0];
        if (!c) return;
        addLog('revela la carta de arriba de su biblioteca: «' + c.name + '».', { cards: [{ name: c.name, img: c.img }] });
      } },
      '-',
      { label: 'Moler (al cementerio)…', fn: function () {
        var k = askNumber('¿Cuántas cartas mueles?', 1, n);
        if (!k) return;
        var names = [];
        for (var i = 0; i < k && S.priv.library.length; i++) {
          var c = S.priv.library.shift();
          S.pub.zones.graveyard.push(c);
          names.push({ name: c.name, img: c.img });
        }
        commit('muele ' + plural(names.length, 'carta', 'cartas') + '.', { cards: names });
      } },
      { label: 'Exiliar la de arriba', fn: function () {
        var c = S.priv.library.shift();
        if (!c) return;
        S.pub.zones.exile.push(c);
        commit('exilia la carta de arriba de su biblioteca: «' + c.name + '».');
      } },
      { label: 'Exiliar la de arriba boca abajo', fn: function () {
        var c = S.priv.library.shift();
        if (!c) return;
        S.priv.hidden[c.iid] = c;
        S.pub.zones.exile.push({ iid: c.iid, fd: true });
        commit('exilia boca abajo la carta de arriba de su biblioteca.');
      } }
    ], x, y);
  }

  function lookTop() {
    var k = askNumber('¿Cuántas cartas de arriba quieres mirar?', 3, S.priv.library.length);
    if (!k) return;
    var ids = S.priv.library.slice(0, k).map(function (c) { return c.iid; });
    addLog('mira las ' + plural(ids.length, 'carta', 'cartas') + ' de arriba de su biblioteca.');
    openViewer({
      title: 'Arriba de tu biblioteca',
      hint: 'La primera es la de arriba. Usa «Arriba de la biblioteca» para reordenarlas.',
      zone: 'library',
      owner: true,
      // Solo las que siguen arriba (las que mandas al fondo o a otra zona desaparecen del visor).
      get: function () {
        var top = S.priv.library.slice(0, ids.length);
        return top.filter(function (c) { return ids.indexOf(c.iid) >= 0; });
      }
    });
  }

  function searchLibrary() {
    addLog('busca en su biblioteca.');
    openViewer({
      title: 'Tu biblioteca',
      hint: 'Al cerrar se baraja automáticamente.',
      zone: 'library',
      owner: true,
      get: function () {
        return S.priv.library.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
      },
      onClose: function () {
        if (!S.priv) return;
        shuffle(S.priv.library);
        commit('baraja su biblioteca.');
      }
    });
  }

  function mulligan() {
    var n = (S.pub.mulligans || 0) + 1;
    if (!confirm('¿Hacer mulligan? Tu mano vuelve a la biblioteca, se baraja y robas ' + HAND_SIZE + '.\n'
      + 'En Commander el primero es gratis; después pon en el fondo una carta por cada mulligan extra.')) return;
    S.priv.library = shuffle(S.priv.library.concat(S.priv.hand));
    S.priv.hand = [];
    drawCards(HAND_SIZE);
    S.pub.mulligans = n;
    commit('hace mulligan (' + n + ') y roba ' + HAND_SIZE + ' cartas.');
  }

  function revealHand() {
    if (!S.priv.hand.length) { toast('No tienes cartas en la mano.'); return; }
    addLog('enseña su mano.', { cards: S.priv.hand.slice(0, 20).map(function (c) { return { name: c.name, img: c.img }; }) });
  }

  function diceMenu(x, y) {
    function roll(label, sides) {
      return {
        label: label,
        fn: function () {
          var v = randInt(sides) + 1;
          addLog(sides === 2 ? 'lanza una moneda: ' + (v === 1 ? 'cara' : 'cruz') + '.' : 'lanza un d' + sides + ': ' + v + '.');
        }
      };
    }
    openMenu([{ title: 'Lanzar' }, roll('Moneda', 2), roll('Dado de 6', 6), roll('Dado de 20', 20)], x, y);
  }

  async function passTurn() {
    flushStats();
    if (S.practice) {
      S.room.turn_number++;
      addLog('pasa el turno.');
      checkTurn();
      renderMine();
      return;
    }
    var r = await sb.rpc('pass_turn', { rid: S.room.id });
    if (r.error) toast(errText(r.error), true);
  }

  async function endGame() {
    if (S.practice) {
      if (!confirm('¿Terminar la práctica?')) return;
      S.practice = false;
      S.room = null;
      S.pub = S.priv = null;
      S.screen = 'home';
      closeViewer();
      render();
      return;
    }
    if (!confirm('¿Terminar la partida para todos? Volveréis a la sala y se borrará la mesa.')) return;
    var r = await sb.rpc('end_game', { rid: S.room.id });
    if (r.error) toast(errText(r.error), true);
  }

  /* ---------- Fichas ---------- */

  function openTokens() {
    closeViewer();
    var dlg = el('dialog', 'gviewer');
    var head = el('div', 'gv-head');
    head.appendChild(el('h2', null, 'Crear ficha'));
    head.appendChild(button('Cerrar', 'plain small', function () { dlg.close(); }));
    dlg.appendChild(head);

    var body = el('div', 'gv-body');
    if (S.pub.tokens && S.pub.tokens.length) {
      body.appendChild(el('h3', 'gv-h3', 'Fichas de tu mazo'));
      var quick = el('div', 'gv-grid');
      S.pub.tokens.forEach(function (t) { quick.appendChild(tokenPick(t, dlg)); });
      body.appendChild(quick);
    }
    body.appendChild(el('h3', 'gv-h3', 'Buscar ficha'));
    var q = input('search', 'Treasure, Soldier, Zombie…', 40);
    body.appendChild(q);
    var results = el('div', 'gv-grid');
    var msg = el('p', 'note');
    body.appendChild(msg);
    body.appendChild(results);
    dlg.appendChild(body);

    var timer;
    var token = 0;
    q.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(async function () {
        var text = q.value.trim();
        var mine = ++token;
        results.textContent = '';
        if (text.length < 2) { msg.textContent = ''; return; }
        msg.textContent = 'Buscando…';
        try {
          var params = new URLSearchParams({ q: text + ' t:token', include_extras: 'true', unique: 'art', order: 'name' });
          var res = await fetch('https://api.scryfall.com/cards/search?' + params.toString());
          if (mine !== token) return;
          if (res.status === 404) { msg.textContent = 'Sin resultados.'; return; }
          var data = await res.json();
          if (mine !== token) return;
          msg.textContent = '';
          // Primero las que se llaman exactamente así, luego las que empiezan así.
          var low = text.toLowerCase();
          function rank(c) {
            var n = c.name.toLowerCase();
            return n === low ? 0 : n.indexOf(low) === 0 ? 1 : 2;
          }
          data.data.sort(function (a, b) { return rank(a) - rank(b) || a.name.localeCompare(b.name); });
          data.data.slice(0, 24).forEach(function (c) {
            var img = c.image_uris ? c.image_uris.small : (c.card_faces && c.card_faces[0].image_uris ? c.card_faces[0].image_uris.small : null);
            results.appendChild(tokenPick({ id: c.id, name: c.name, img: img, type: c.type_line }, dlg));
          });
        } catch (err) {
          if (mine === token) msg.textContent = 'No se ha podido buscar.';
        }
      }, 350);
    });

    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    q.focus();
  }

  function tokenPick(t, dlg) {
    var b = el('button', 'gv-pick');
    b.type = 'button';
    var src = safeImg(t.img);
    if (src) {
      var im = el('img');
      im.src = src;
      im.alt = '';
      im.loading = 'lazy';
      b.appendChild(im);
    }
    b.appendChild(el('span', null, t.name));
    b.addEventListener('click', function () {
      createToken(t);
      dlg.close();
    });
    return b;
  }

  /* ---------- Dibujo de la mesa ---------- */

  function buildTable() {
    root.textContent = '';
    if (S.tableError) {
      var page = el('div', 'page');
      page.appendChild(el('p', 'note bad', S.tableError));
      page.appendChild(button('Volver a la sala', 'plain', function () { S.screen = S.practice ? 'home' : 'room'; render(); }));
      root.appendChild(page);
      return;
    }
    if (!S.pub) {
      root.appendChild(el('div', 'page note', 'Preparando la mesa…'));
      return;
    }
    var t = el('div', 'gtable' + (S.sideHidden ? ' noside' : ''));
    t.id = 'gTable';
    var main = el('div', 'gmain');
    var board = el('div', 'gboard');
    board.id = 'gBoard';
    var mine = el('div', 'gme');
    mine.id = 'gMine';
    main.appendChild(board);
    main.appendChild(mine);
    t.appendChild(main);

    var seats = el('div', 'gseats');
    seats.id = 'gSeats';
    seats.setAttribute('role', 'navigation');
    seats.setAttribute('aria-label', 'Mesas de los jugadores');
    t.appendChild(seats);

    var side = el('aside', 'gside');
    side.id = 'gSide';
    var sh = el('div', 'gside-head');
    sh.appendChild(el('strong', null, S.room.name));
    var save = el('span', 'gsave');
    save.id = 'gSave';
    save.setAttribute('role', 'status');
    sh.appendChild(save);
    sh.appendChild(button('✕', 'gside-x', toggleSide, 'Ocultar el registro y el chat'));
    side.appendChild(sh);
    var log = el('ol', 'glog');
    log.id = 'gLog';
    log.setAttribute('aria-live', 'polite');
    side.appendChild(log);
    var form = el('form', 'gchat');
    var chat = input('text', 'Escribe un mensaje…', 300);
    chat.setAttribute('aria-label', 'Mensaje para la mesa');
    form.appendChild(chat);
    form.appendChild(button('Enviar', 'plain small'));
    form.lastChild.type = 'submit';
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var text = chat.value.trim();
      if (!text) return;
      chat.value = '';
      addLog(text, null, 'chat');
    });
    side.appendChild(form);
    t.appendChild(side);
    root.appendChild(t);

    renderMine();
    renderOpps();
    renderLog();
    setSave(S.saveState);
  }

  /* ---------- Qué mesa se está mirando y el chat ---------- */

  try { S.sideHidden = localStorage.getItem('cm-juego-chat') === 'oculto'; } catch (e) { S.sideHidden = false; }

  function viewingMe() {
    return !S.view || S.view === myId() || !S.players.some(function (p) { return p.user_id === S.view; });
  }

  function setView(uid) {
    S.view = uid === myId() ? null : uid;
    closeMenu();
    renderBoard();
    renderSeats();
  }

  function toggleSide() {
    S.sideHidden = !S.sideHidden;
    S.unread = 0;
    try { localStorage.setItem('cm-juego-chat', S.sideHidden ? 'oculto' : 'visible'); } catch (e) { /* sin almacenamiento */ }
    var t = document.getElementById('gTable');
    if (t) t.classList.toggle('noside', S.sideHidden);
    renderSeats();
    if (!S.sideHidden) {
      var list = document.getElementById('gLog');
      if (list) list.scrollTop = list.scrollHeight;
    }
  }

  // Columna de la derecha: una entrada por jugador con un mini plano de su campo.
  function renderSeats() {
    var box = document.getElementById('gSeats');
    if (!box || !S.pub) return;
    box.textContent = '';
    var meId = myId();
    var meRow = S.players.find(function (p) { return p.user_id === meId; }) || { user_id: meId, username: myName() };
    box.appendChild(el('span', 'gseats-h', 'Mesas'));
    [meRow].concat(opponents()).forEach(function (p) {
      var me = p.user_id === meId;
      var st = me ? S.pub : S.others[p.user_id];
      var active = me ? viewingMe() : S.view === p.user_id;
      var turn = S.room.turn_user === p.user_id;
      var b = button(null, 'gseat' + (active ? ' on' : '') + (turn ? ' turn' : ''), function () { setView(p.user_id); },
        me ? 'Ver tu mesa' : 'Ver la mesa de ' + p.username);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
      var top = el('span', 'gseat-top');
      top.appendChild(el('strong', null, me ? 'Tu mesa' : p.username));
      if (turn) top.appendChild(el('span', 'gturn', 'Turno'));
      b.appendChild(top);
      var mini = el('span', 'gmini');
      ((st && st.zones && st.zones.battlefield) || []).forEach(function (c) {
        var t = c.type || '';
        var kind = c.fd ? 'fd' : /\bLand\b/.test(t) ? 'land' : /\bCreature\b/.test(t) ? 'crea' : 'other';
        var m = el('i', 'gm-' + kind + (c.tapped ? ' tap' : ''));
        m.style.left = clamp(Number(c.x) || 0, 0, 96) + '%';
        m.style.top = clamp(Number(c.y) || 0, 0, 92) + '%';
        mini.appendChild(m);
      });
      b.appendChild(mini);
      var stats = el('span', 'gseat-st');
      if (st && st.zones) {
        stats.appendChild(el('span', 'glife' + (st.life <= 0 ? ' dead' : ''), '♥ ' + st.life));
        if (st.poison) stats.appendChild(el('span', 'gpois', '☠ ' + st.poison));
        stats.appendChild(el('span', 'gcount', 'Mano ' + (me ? S.priv.hand.length : (st.handCount || 0))));
      } else {
        stats.appendChild(el('span', 'gcount', 'Preparando…'));
      }
      b.appendChild(stats);
      box.appendChild(b);
    });
    var chat = button(S.sideHidden ? 'Mostrar chat' : 'Ocultar chat', 'plain small gseat-chat', toggleSide,
      S.sideHidden ? 'Mostrar el registro y el chat' : 'Ocultar el registro y el chat');
    if (S.sideHidden && S.unread) chat.appendChild(el('span', 'gunread', String(S.unread)));
    box.appendChild(chat);
  }

  // Zona grande: el campo de batalla de la mesa elegida.
  function renderBoard() {
    var box = document.getElementById('gBoard');
    if (!box || !S.pub) return;
    box.textContent = '';
    if (viewingMe()) {
      box.className = 'gboard';
      var bf = el('div', 'gbf mine');
      bf.dataset.drop = 'battlefield';
      S.pub.zones.battlefield.forEach(function (c) { bf.appendChild(cardNode(c, { zone: 'battlefield', owner: true })); });
      if (!S.pub.zones.battlefield.length) bf.appendChild(el('p', 'gbf-empty', 'Arrastra aquí cartas de tu mano para jugarlas'));
      box.appendChild(bf);
      return;
    }
    var p = S.players.find(function (x) { return x.user_id === S.view; });
    var st = S.others[p.user_id];
    var turn = S.room.turn_user === p.user_id;
    box.className = 'gboard other' + (turn ? ' turn' : '');
    var head = el('div', 'gopp-head');
    head.appendChild(el('strong', null, 'Mesa de ' + p.username));
    if (turn) head.appendChild(el('span', 'gturn', 'Su turno'));
    if (st && st.zones) {
      head.appendChild(el('span', 'glife' + (st.life <= 0 ? ' dead' : ''), '♥ ' + st.life));
      if (st.poison) head.appendChild(el('span', 'gpois', '☠ ' + st.poison));
      head.appendChild(el('span', 'gcount', 'Mano ' + (st.handCount || 0) + ' · Biblioteca ' + (st.libCount || 0)));
      head.appendChild(zoneButton('Cementerio', p, 'graveyard'));
      head.appendChild(zoneButton('Exilio', p, 'exile'));
    }
    head.appendChild(button('Volver a mi mesa', 'plain small gback-me', function () { setView(myId()); }));
    box.appendChild(head);
    if (!st || !st.zones) {
      box.appendChild(el('p', 'note', 'Preparando su mesa…'));
      return;
    }
    var body = el('div', 'gopp-body');
    var cmd = el('div', 'gopp-cmd');
    (st.zones.command || []).forEach(function (c) { cmd.appendChild(cardNode(c, { zone: 'command', uid: p.user_id })); });
    if (st.zones.command && st.zones.command.length) body.appendChild(cmd);
    var obf = el('div', 'gbf opp');
    (st.zones.battlefield || []).forEach(function (c) { obf.appendChild(cardNode(c, { zone: 'battlefield', uid: p.user_id })); });
    if (!(st.zones.battlefield || []).length) obf.appendChild(el('p', 'gbf-empty', 'Todavía no tiene cartas en el campo'));
    body.appendChild(obf);
    box.appendChild(body);
  }

  function opponents() {
    var meId = myId();
    var seats = S.players.slice().sort(function (a, b) { return a.seat - b.seat; });
    var i = seats.findIndex(function (p) { return p.user_id === meId; });
    return seats.slice(i + 1).concat(seats.slice(0, Math.max(i, 0))).filter(function (p) { return p.user_id !== meId; });
  }

  function cardNode(c, o) {
    var own = !!o.owner;
    var real = own && c.fd ? realCard(c) : c;
    var n = el('div', 'gcard' + (c.tapped ? ' tapped' : '') + (c.fd ? ' fd' : '') + (c.token ? ' token' : '') + (c.cmd ? ' cmdr' : ''));
    n.dataset.iid = c.iid;
    n.dataset.zone = o.zone;
    if (own) n.dataset.own = '1';
    if (o.uid) n.dataset.uid = o.uid;
    if (o.zone === 'battlefield' && !o.flat) {
      n.style.left = clamp(Number(c.x) || 0, 0, 96) + '%';
      n.style.top = clamp(Number(c.y) || 0, 0, 92) + '%';
    }
    var src = c.fd && !own ? null : safeImg(real.flipped && real.imgBack ? real.imgBack : real.img);
    if (src) {
      var im = el('img');
      im.src = src;
      im.alt = real.name || '';
      im.draggable = false;
      n.appendChild(im);
    } else if (c.fd) {
      n.appendChild(el('div', 'gback'));
    } else {
      n.appendChild(el('div', 'gnoimg', real.name || '?'));
    }
    if (c.fd && own) n.appendChild(el('span', 'gtag', 'Boca abajo'));
    if (c.token) n.appendChild(el('span', 'gtag gtok', 'Ficha'));
    var ctr = c.counters || {};
    var keys = Object.keys(ctr);
    if (keys.length) {
      var box = el('div', 'gctrs');
      keys.forEach(function (k) { box.appendChild(el('span', 'gctr', (k === 'Contador' ? '●' : k) + ' ×' + ctr[k])); });
      n.appendChild(box);
    }
    n.title = c.fd && !own ? 'Carta boca abajo' : (real.name || '');
    return n;
  }

  // Cambios en las mesas de los demás: la columna de mesas y, si se está mirando una, esa mesa.
  function renderOpps() {
    renderSeats();
    if (!viewingMe()) renderBoard();
  }

  function zoneButton(label, p, zone) {
    var st = S.others[p.user_id];
    var cards = (st && st.zones && st.zones[zone]) || [];
    return button(label + ' ' + cards.length, 'plain small', function () {
      openViewer({
        title: label + ' de ' + p.username,
        zone: zone,
        owner: false,
        uid: p.user_id,
        get: function () {
          var s = S.others[p.user_id];
          return ((s && s.zones && s.zones[zone]) || []).slice().reverse();
        }
      });
    });
  }

  function renderMine() {
    var box = document.getElementById('gMine');
    if (!box || !S.pub) return;
    box.textContent = '';
    var myTurn = S.room.turn_user === myId();
    var host = S.room.host_id === myId();

    if (viewingMe()) renderBoard();
    renderSeats();

    // Panel del jugador
    var panel = el('div', 'gpanel');
    var who = el('div', 'gwho');
    who.appendChild(el('strong', null, myName()));
    who.appendChild(el('span', myTurn ? 'gturn' : 'note', myTurn ? 'Tu turno · ' + S.room.turn_number : 'Turno ' + S.room.turn_number));
    panel.appendChild(who);

    panel.appendChild(statBox('Vida', 'life', S.pub.life, [-5, -1, 1, 5], S.pub.life <= 0));
    panel.appendChild(statBox('Veneno', 'poison', S.pub.poison || 0, [-1, 1], (S.pub.poison || 0) >= 10));
    opponents().forEach(function (p) {
      var v = S.pub.cmdDmg[p.user_id] || 0;
      panel.appendChild(statBox('Comandante de ' + p.username, 'cmd:' + p.user_id, v, [-1, 1], v >= 21));
    });

    var acts = el('div', 'gacts');
    var pass = button('Pasar turno', 'plain small primary', passTurn);
    if (!myTurn && !host) {
      pass.disabled = true;
      pass.title = 'No es tu turno';
    }
    acts.appendChild(pass);
    acts.appendChild(button('Enderezar todo', 'plain small', function () {
      if (untapAll()) commit('endereza sus permanentes.');
    }));
    acts.appendChild(button('Ficha…', 'plain small', openTokens));
    acts.appendChild(button('Dado', 'plain small', function (ev) {
      var r = ev.currentTarget.getBoundingClientRect();
      diceMenu(r.left, r.bottom);
    }));
    acts.appendChild(button('Mulligan', 'plain small', mulligan));
    acts.appendChild(button('Enseñar mano', 'plain small', revealHand));
    acts.appendChild(button(S.practice ? 'Terminar práctica' : 'Salas', 'plain small', function () {
      if (S.practice) { endGame(); return; }
      S.screen = 'home';
      render();
      loadHome();
    }, S.practice ? null : 'Volver a la lista de salas (la partida sigue)'));
    if (host && !S.practice) acts.appendChild(button('Terminar partida', 'plain small danger', endGame));
    panel.appendChild(acts);
    box.appendChild(panel);

    // Zonas: clic en la biblioteca roba; clic derecho (o mantener pulsado) abre sus opciones.
    var bottom = el('div', 'gbottom');
    var zones = el('div', 'gzones');
    var lib = el('button', 'gzone glib');
    lib.type = 'button';
    lib.dataset.drop = 'library';
    lib.title = 'Clic: robar una carta · Clic derecho: más opciones';
    lib.setAttribute('aria-label', 'Biblioteca, ' + plural(S.priv.library.length, 'carta', 'cartas') + '. Pulsa para robar; clic derecho para más opciones');
    lib.appendChild(el('div', 'gback'));
    lib.appendChild(el('span', 'gzone-n', String(S.priv.library.length)));
    lib.appendChild(el('span', 'gzone-l', 'Biblioteca'));
    lib.addEventListener('click', function () {
      if (drawCards(1)) commit('roba una carta.');
    });
    lib.addEventListener('contextmenu', function (ev) {
      ev.preventDefault();
      libraryMenu(ev.clientX, ev.clientY);
    });
    lib.addEventListener('keydown', function (ev) {
      if (ev.key === 'ContextMenu' || (ev.shiftKey && ev.key === 'F10')) {
        ev.preventDefault();
        var r = lib.getBoundingClientRect();
        libraryMenu(r.left, r.top);
      }
    });
    zones.appendChild(lib);
    zones.appendChild(pileZone('graveyard', 'Cementerio'));
    zones.appendChild(pileZone('exile', 'Exilio'));

    var cmd = el('div', 'gzone gcmdz');
    cmd.dataset.drop = 'command';
    S.pub.zones.command.forEach(function (c) {
      var n = cardNode(c, { zone: 'command', owner: true });
      var casts = S.pub.casts[c.iid] || 0;
      if (casts) n.appendChild(el('span', 'gtag gtax', '+' + (2 * casts)));
      cmd.appendChild(n);
    });
    cmd.appendChild(el('span', 'gzone-l', 'Mando'));
    zones.appendChild(cmd);
    bottom.appendChild(zones);

    // Mano (se puede reordenar arrastrando)
    var hand = el('div', 'ghand');
    hand.dataset.drop = 'hand';
    hand.id = 'gHand';
    S.priv.hand.forEach(function (c) { hand.appendChild(cardNode(c, { zone: 'hand', owner: true })); });
    if (!S.priv.hand.length) hand.appendChild(el('p', 'gbf-empty', 'Mano vacía'));
    bottom.appendChild(hand);
    box.appendChild(bottom);
  }

  function statBox(label, key, value, steps, alert) {
    var box = el('div', 'gstat' + (alert ? ' alert' : ''));
    box.appendChild(el('span', 'gstat-l', label));
    var row = el('div', 'gstat-row');
    steps.filter(function (s) { return s < 0; }).forEach(function (s) {
      row.appendChild(button(String(s), 'gstep', function () { changeStat(key, s); }, label + ' ' + s));
    });
    row.appendChild(el('strong', 'gstat-v', String(value)));
    steps.filter(function (s) { return s > 0; }).forEach(function (s) {
      row.appendChild(button('+' + s, 'gstep', function () { changeStat(key, s); }, label + ' +' + s));
    });
    box.appendChild(row);
    return box;
  }

  function pileZone(zone, label) {
    var list = S.pub.zones[zone];
    var box = el('div', 'gzone gpile');
    box.dataset.drop = zone;
    box.dataset.pile = zone;
    if (list.length) box.appendChild(cardNode(list[list.length - 1], { zone: zone, owner: true }));
    else box.appendChild(el('div', 'gpile-empty'));
    box.appendChild(el('span', 'gzone-n', String(list.length)));
    box.appendChild(el('span', 'gzone-l', label));
    return box;
  }

  function logNode(e) {
    var li = el('li', 'glog-' + (e.kind || 'action'));
    if (e.kind === 'system') {
      li.textContent = e.text;
    } else {
      li.appendChild(el('strong', null, e.username || '?'));
      li.appendChild(document.createTextNode(e.kind === 'chat' ? ': ' + e.text : ' ' + e.text));
    }
    if (e.data && Array.isArray(e.data.cards)) {
      var row = el('div', 'glog-cards');
      e.data.cards.slice(0, 20).forEach(function (c) {
        var src = c && safeImg(c.img);
        if (!src) return;
        var im = el('img');
        im.src = src;
        im.alt = c.name || '';
        im.title = c.name || '';
        im.loading = 'lazy';
        row.appendChild(im);
      });
      if (row.children.length) li.appendChild(row);
    }
    return li;
  }

  function renderLog() {
    var list = document.getElementById('gLog');
    if (!list) return;
    list.textContent = '';
    S.log.forEach(function (e) { list.appendChild(logNode(e)); });
    list.scrollTop = list.scrollHeight;
  }

  function appendLog(e) {
    var list = document.getElementById('gLog');
    if (!list) return;
    var atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    list.appendChild(logNode(e));
    while (list.children.length > 300) list.removeChild(list.firstChild);
    if (atEnd) list.scrollTop = list.scrollHeight;
  }

  /* ---------- Visor de zonas ---------- */

  var viewer = null;

  function openViewer(v) {
    closeViewer();
    var dlg = el('dialog', 'gviewer');
    var head = el('div', 'gv-head');
    head.appendChild(el('h2', null, v.title));
    var count = el('span', 'note gv-count');
    head.appendChild(count);
    head.appendChild(button('Cerrar', 'plain small', function () { dlg.close(); }));
    dlg.appendChild(head);
    if (v.hint) dlg.appendChild(el('p', 'note gv-hint', v.hint));
    var grid = el('div', 'gv-grid');
    dlg.appendChild(grid);
    v.dlg = dlg;
    v.grid = grid;
    v.count = count;
    viewer = v;
    dlg.addEventListener('close', function () {
      closeMenu();
      dlg.remove();
      if (viewer === v) viewer = null;
      if (v.onClose) v.onClose();
    });
    document.body.appendChild(dlg);
    renderViewer();
    dlg.showModal();
  }

  function renderViewer() {
    if (!viewer) return;
    var cards = viewer.get() || [];
    viewer.count.textContent = plural(cards.length, 'carta', 'cartas');
    viewer.grid.textContent = '';
    cards.forEach(function (c) {
      viewer.grid.appendChild(cardNode(c, { zone: viewer.zone, owner: viewer.owner, uid: viewer.uid, flat: true }));
    });
    if (!cards.length) viewer.grid.appendChild(el('p', 'note', 'No hay cartas.'));
  }

  function closeViewer() {
    if (viewer && viewer.dlg.open) viewer.dlg.close();
    viewer = null;
  }

  /* ---------- Menús ---------- */

  var menuEl = null;

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
  }

  function openMenu(items, x, y) {
    closeMenu();
    var m = el('div', 'gmenu');
    m.setAttribute('role', 'menu');
    items.forEach(function (it) {
      if (!it) return;
      if (it === '-') { m.appendChild(el('div', 'gsep')); return; }
      if (it.title) { m.appendChild(el('div', 'gmtitle', it.title)); return; }
      if (it.counter) { m.appendChild(counterRow(it.iid, it.counter)); return; }
      var b = button(it.label, 'gmi', function () { closeMenu(); it.fn(); });
      b.setAttribute('role', 'menuitem');
      m.appendChild(b);
    });
    // Dentro de un visor abierto, el menú tiene que ir dentro del diálogo para poder usarse.
    var host = viewer && viewer.dlg.open ? viewer.dlg : document.body;
    host.appendChild(m);
    var w = m.offsetWidth;
    var h = m.offsetHeight;
    m.style.left = clamp(x, 8, window.innerWidth - w - 8) + 'px';
    m.style.top = clamp(y, 8, window.innerHeight - h - 8) + 'px';
    menuEl = m;
    var first = m.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }

  function counterRow(iid, kind) {
    var row = el('div', 'gmctr');
    row.appendChild(el('span', null, kind === 'Contador' ? 'Otros contadores' : 'Contadores ' + kind));
    var c = cardOnField(iid);
    var val = el('strong', null, String((c && c.counters && c.counters[kind]) || 0));
    row.appendChild(button('−', 'gstep', function () { val.textContent = String(setCounter(iid, kind, -1)); }, 'Quitar contador ' + kind));
    row.appendChild(val);
    row.appendChild(button('+', 'gstep', function () { val.textContent = String(setCounter(iid, kind, 1)); }, 'Poner contador ' + kind));
    return row;
  }

  document.addEventListener('pointerdown', function (ev) {
    if (menuEl && !menuEl.contains(ev.target)) closeMenu();
  }, true);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && menuEl) { ev.preventDefault(); closeMenu(); }
  });

  function cardMenu(iid, zone, x, y) {
    var loc = locate(iid);
    if (!loc) return;
    var c = loc.card;
    var real = realCard(c);
    zone = loc.zone;
    function to(z, opts) { return function () { doMove(iid, z, opts); }; }
    var items = [{ title: (real.name || 'Carta') + (c.fd ? ' (boca abajo)' : '') + (c.token ? ' · ficha' : '') }];

    if (zone === 'battlefield') {
      items.push({ label: c.tapped ? 'Enderezar' : 'Girar', fn: function () { toggleTap(iid); } });
      items.push({ counter: '+1/+1', iid: iid }, { counter: '-1/-1', iid: iid }, { counter: 'Contador', iid: iid });
      items.push({ label: c.fd ? 'Poner boca arriba' : 'Poner boca abajo', fn: function () { toggleFaceDown(iid); } });
      if (!c.fd) items.push({ label: 'Transformar (otra cara)', fn: function () { transform(iid); } });
      if (!c.fd) items.push({ label: 'Copiar (crear ficha)', fn: function () { copyAsToken(iid); } });
      items.push('-');
      items.push({ label: 'A la mano', fn: to('hand') });
      items.push({ label: 'Al cementerio', fn: to('graveyard') });
      items.push({ label: 'Al exilio', fn: to('exile') });
      items.push({ label: 'Arriba de la biblioteca', fn: to('library') });
      items.push({ label: 'Fondo de la biblioteca', fn: to('library', { bottom: true }) });
      if (real.cmd) items.push({ label: 'A la zona de mando', fn: to('command') });
    } else if (zone === 'hand') {
      items.push({ label: 'Jugar', fn: to('battlefield') });
      items.push({ label: 'Jugar boca abajo', fn: to('battlefield', { faceDown: true }) });
      items.push({ label: 'Revelar', fn: function () { addLog('revela «' + real.name + '» de su mano.', { cards: [{ name: real.name, img: real.img }] }); } });
      items.push('-');
      items.push({ label: 'Descartar', fn: to('graveyard') });
      items.push({ label: 'Al exilio', fn: to('exile') });
      items.push({ label: 'Arriba de la biblioteca', fn: to('library') });
      items.push({ label: 'Fondo de la biblioteca', fn: to('library', { bottom: true }) });
      if (real.cmd) items.push({ label: 'A la zona de mando', fn: to('command') });
    } else if (zone === 'command') {
      var n = S.pub.casts[iid] || 0;
      items.push({ label: 'Lanzar' + (n ? ' (impuesto +' + (2 * n) + ')' : ''), fn: to('battlefield') });
      items.push('-');
      items.push({ label: 'A la mano', fn: to('hand', { noAsk: true }) });
      items.push({ label: 'Al cementerio', fn: to('graveyard', { noAsk: true }) });
      items.push({ label: 'Al exilio', fn: to('exile', { noAsk: true }) });
    } else {
      items.push({ label: 'Al campo de batalla', fn: to('battlefield') });
      if (zone !== 'hand') items.push({ label: 'A la mano', fn: to('hand') });
      if (zone !== 'graveyard') items.push({ label: 'Al cementerio', fn: to('graveyard') });
      if (zone !== 'exile') items.push({ label: 'Al exilio', fn: to('exile') });
      items.push({ label: 'Arriba de la biblioteca', fn: to('library') });
      items.push({ label: 'Fondo de la biblioteca', fn: to('library', { bottom: true }) });
      if (real.cmd) items.push({ label: 'A la zona de mando', fn: to('command') });
    }
    if (real.id) {
      items.push('-');
      items.push({ label: 'Ver carta', fn: function () { CM.openById(real.id); } });
    }
    openMenu(items, x, y);
  }

  /* ---------- Ratón y táctil: clic, arrastrar y menú ---------- */

  var drag = null;

  function cardFromEvent(ev) {
    var n = ev.target.closest && ev.target.closest('.gcard');
    if (!n) return null;
    if (!n.closest('#jugarRoot') && !n.closest('.gviewer')) return null;
    return n;
  }

  document.addEventListener('pointerdown', function (ev) {
    if (S.screen !== 'table' || ev.button !== 0) return;
    var n = cardFromEvent(ev);
    if (!n || n.dataset.own !== '1') return;
    ev.preventDefault();
    var r = n.getBoundingClientRect();
    drag = {
      iid: n.dataset.iid,
      zone: n.dataset.zone,
      node: n,
      inViewer: !!n.closest('.gviewer'),
      x0: ev.clientX,
      y0: ev.clientY,
      offX: ev.clientX - r.left,
      offY: ev.clientY - r.top,
      w: r.width,
      h: r.height,
      moved: false,
      ghost: null
    };
    // Mantener pulsado abre el menú (útil en móvil).
    drag.long = setTimeout(function () {
      if (drag && !drag.moved) {
        var d = drag;
        drag = null;
        cardMenu(d.iid, d.zone, d.x0, d.y0);
      }
    }, 550);
  });

  document.addEventListener('pointermove', function (ev) {
    if (!drag || drag.inViewer) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      clearTimeout(drag.long);
      var g = drag.node.cloneNode(true);
      g.classList.add('gghost');
      g.style.width = drag.w + 'px';
      g.style.height = drag.h + 'px';
      g.style.left = '0';
      g.style.top = '0';
      document.body.appendChild(g);
      drag.ghost = g;
      drag.node.classList.add('dragging');
      document.body.classList.add('gdragging');
    }
    drag.ghost.style.transform = 'translate(' + (ev.clientX - drag.offX) + 'px,' + (ev.clientY - drag.offY) + 'px)';
    var under = document.elementFromPoint(ev.clientX, ev.clientY);
    var target = under && under.closest('[data-drop]');
    document.querySelectorAll('.drop-over').forEach(function (x) { if (x !== target) x.classList.remove('drop-over'); });
    if (target) target.classList.add('drop-over');
    markHandSlot(target && target.dataset.drop === 'hand' ? handSlot(ev.clientX) : -1);
  });

  // Posición de la mano en la que caería la carta (sin contar la que se arrastra).
  function handCards() {
    var hand = document.getElementById('gHand');
    return hand ? Array.prototype.filter.call(hand.querySelectorAll('.gcard'), function (n) { return !n.classList.contains('dragging'); }) : [];
  }

  function handSlot(x) {
    var nodes = handCards();
    var i = 0;
    while (i < nodes.length) {
      var r = nodes[i].getBoundingClientRect();
      if (x < r.left + r.width / 2) break;
      i++;
    }
    return i;
  }

  function markHandSlot(i) {
    document.querySelectorAll('.gins-before, .gins-after').forEach(function (n) { n.classList.remove('gins-before', 'gins-after'); });
    if (i < 0) return;
    var nodes = handCards();
    if (!nodes.length) return;
    if (i < nodes.length) nodes[i].classList.add('gins-before');
    else nodes[nodes.length - 1].classList.add('gins-after');
  }

  function placeInHand(iid, slot) {
    var hand = S.priv.hand;
    var from = hand.findIndex(function (c) { return c.iid === iid; });
    if (from < 0) return false;
    var card = hand.splice(from, 1)[0];
    hand.splice(clamp(slot, 0, hand.length), 0, card);
    return from !== slot;
  }

  function endDrag(d) {
    document.body.classList.remove('gdragging');
    markHandSlot(-1);
    document.querySelectorAll('.drop-over').forEach(function (x) { x.classList.remove('drop-over'); });
    if (d && d.ghost) d.ghost.remove();
    if (d && d.node.isConnected) d.node.classList.remove('dragging');
  }

  document.addEventListener('pointerup', function (ev) {
    if (!drag) return;
    var d = drag;
    drag = null;
    clearTimeout(d.long);
    if (!d.moved) { endDrag(null); cardClick(d, ev); return; }
    var under = document.elementFromPoint(ev.clientX, ev.clientY);
    var target = under && under.closest('[data-drop]');
    var slot = target && target.dataset.drop === 'hand' ? handSlot(ev.clientX) : -1;
    endDrag(d);
    if (!target) return;
    var to = target.dataset.drop;
    if (to === 'hand') {
      if (d.zone === 'hand') {
        if (placeInHand(d.iid, slot)) commit(null);
      } else {
        doMove(d.iid, 'hand');
        placeInHand(d.iid, slot);
        commit(null);
      }
    } else if (to === 'battlefield') {
      var r = target.getBoundingClientRect();
      var x = clamp((ev.clientX - d.offX - r.left) / r.width * 100, 0, 94);
      var y = clamp((ev.clientY - d.offY - r.top) / r.height * 100, 0, 88);
      if (d.zone === 'battlefield') {
        var c = cardOnField(d.iid);
        if (c) { c.x = Math.round(x * 10) / 10; c.y = Math.round(y * 10) / 10; commit(null); }
      } else {
        doMove(d.iid, 'battlefield', { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
      }
    } else if (to !== d.zone) {
      doMove(d.iid, to);
    }
  });

  document.addEventListener('pointercancel', function () {
    if (!drag) return;
    clearTimeout(drag.long);
    endDrag(drag);
    drag = null;
  });

  // Doble clic: girar/enderezar en el campo, jugar desde la mano, lanzar el comandante.
  var lastClick = { iid: null, t: 0 };

  function cardClick(d, ev) {
    if (d.inViewer) { cardMenu(d.iid, d.zone, ev.clientX, ev.clientY); return; }
    var now = Date.now();
    var dbl = lastClick.iid === d.iid && now - lastClick.t < 400;
    lastClick = dbl ? { iid: null, t: 0 } : { iid: d.iid, t: now };
    if (d.zone === 'battlefield' || d.zone === 'hand' || d.zone === 'command') {
      if (!dbl) return;
      if (d.zone === 'battlefield') toggleTap(d.iid);
      else doMove(d.iid, 'battlefield');
      return;
    }
    if (d.zone === 'graveyard' || d.zone === 'exile') {
      var zone = d.zone;
      openViewer({
        title: zone === 'graveyard' ? 'Tu cementerio' : 'Tu exilio',
        zone: zone,
        owner: true,
        get: function () { return S.pub ? S.pub.zones[zone].slice().reverse() : []; }
      });
      return;
    }
    cardMenu(d.iid, d.zone, ev.clientX, ev.clientY);
  }

  // Cementerio y exilio vacíos también se pueden abrir
  document.addEventListener('click', function (ev) {
    if (S.screen !== 'table') return;
    var pile = ev.target.closest && ev.target.closest('.gpile');
    if (pile && !ev.target.closest('.gcard')) {
      var zone = pile.dataset.pile;
      openViewer({
        title: zone === 'graveyard' ? 'Tu cementerio' : 'Tu exilio',
        zone: zone,
        owner: true,
        get: function () { return S.pub ? S.pub.zones[zone].slice().reverse() : []; }
      });
      return;
    }
    // Cartas de los demás: ver la ficha de la carta
    var n = cardFromEvent(ev);
    if (n && n.dataset.own !== '1' && !n.classList.contains('fd')) {
      var uidOwner = n.dataset.uid;
      var st = S.others[uidOwner];
      if (!st || !st.zones) return;
      var all = [].concat(st.zones.battlefield || [], st.zones.graveyard || [], st.zones.exile || [], st.zones.command || []);
      var c = all.find(function (x) { return x.iid === n.dataset.iid; });
      if (c && c.id) CM.openById(c.id);
    }
  });

  document.addEventListener('contextmenu', function (ev) {
    if (S.screen !== 'table') return;
    var n = cardFromEvent(ev);
    if (!n || n.dataset.own !== '1') return;
    ev.preventDefault();
    if (drag) { clearTimeout(drag.long); drag = null; }
    cardMenu(n.dataset.iid, n.dataset.zone, ev.clientX, ev.clientY);
  });

  window.Juego = { allowed: allowed, show: show, hide: hide, practice: practice };  if (!document.getElementById('view-jugar').hidden) show();
})();
