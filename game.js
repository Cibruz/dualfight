(function () {

  // ══════════════════════════════════════════════════════════════
  //  SUPABASE CONFIG
  //  1. supabase.com → New project
  //  2. Project Settings → API → copy URL and anon key below
  // ══════════════════════════════════════════════════════════════
  var SB_URL = 'https://xjzdldatxwkdxsrrftky.supabase.co';
  var SB_KEY = 'sb_publishable_-pPxb2kFGiRFi9fdw8BRUw_KoQT6qoR';

  var sb              = null;   // Supabase client
  var realtimeChannel = null;
  var currentCode     = null;
  var myRole          = null;   // 'host' | 'guest'
  var resolving       = false;

  function sbReady() {
    if (sb) return true;
    if (!window.supabase) return false;
    sb = window.supabase.createClient(SB_URL, SB_KEY);
    return true;
  }

  function cleanupChannel() {
    if (realtimeChannel && sb) {
      sb.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  AUDIO ENGINE  (Web Audio API — no files needed)
  // ══════════════════════════════════════════════════════════════
  var _audioCtx = null;
  function _getAudioCtx() {
    if (!_audioCtx) {
      try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    return _audioCtx;
  }

  function playSound(type) {
    var ctx = _getAudioCtx();
    if (!ctx) return;
    try {
      var g = ctx.createGain();
      g.connect(ctx.destination);
      var now = ctx.currentTime;

      if (type === 'shoot') {
        // Gunshot: noise burst shaped like an impulse
        var buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.18), ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/d.length, 1.5);
        var src = ctx.createBufferSource(); src.buffer = buf;
        var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
        src.connect(f); f.connect(g);
        g.gain.setValueAtTime(0.7, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        src.start(now);

      } else if (type === 'reload') {
        // Metallic click-clunk
        [800, 500].forEach(function(freq, i) {
          var o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
          o.connect(g);
          o.start(now + i * 0.07); o.stop(now + i * 0.07 + 0.04);
        });
        g.gain.setValueAtTime(0.25, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      } else if (type === 'defend') {
        // Shield clang: two sine tones decay
        [320, 520].forEach(function(freq) {
          var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
          o.connect(g); o.start(now); o.stop(now + 0.35);
        });
        g.gain.setValueAtTime(0.35, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      } else if (type === 'hit') {
        // Thud: pitch drops fast
        var o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(220, now);
        o.frequency.exponentialRampToValueAtTime(40, now + 0.22);
        o.connect(g); o.start(now); o.stop(now + 0.22);
        g.gain.setValueAtTime(0.5, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      } else if (type === 'win') {
        // Rising fanfare
        [523, 659, 784, 1047].forEach(function(freq, i) {
          var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
          o.connect(g); o.start(now + i * 0.13); o.stop(now + i * 0.13 + 0.18);
        });
        g.gain.setValueAtTime(0.28, now); g.gain.setValueAtTime(0.001, now + 0.7);

      } else if (type === 'empty') {
        // Dry click (empty gun)
        var o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 900;
        o.connect(g); o.start(now); o.stop(now + 0.03);
        g.gain.setValueAtTime(0.15, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      } else if (type === 'go') {
        // Sharp bell ding — signals both players to act
        var o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 1047;
        var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 1319;
        o1.connect(g); o2.connect(g);
        o1.start(now); o1.stop(now + 0.25);
        o2.start(now); o2.stop(now + 0.2);
        g.gain.setValueAtTime(0.35, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      }
    } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════════
  //  CONFETTI
  // ══════════════════════════════════════════════════════════════
  function showConfetti(duration) {
    var canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';
    var ctx2 = canvas.getContext('2d');
    var cols  = ['#f5c542','#e74c3c','#3498db','#2ecc71','#e67e22','#9b59b6','#ffffff'];
    var parts = [];
    for (var i = 0; i < 160; i++) {
      parts.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        w: Math.random() * 11 + 5, h: Math.random() * 6 + 3,
        color: cols[Math.floor(Math.random() * cols.length)],
        speed: Math.random() * 3 + 2,
        angle: Math.random() * 360,
        spin:  Math.random() * 8 - 4
      });
    }
    var end = Date.now() + duration;
    var raf;
    function drawC() {
      ctx2.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach(function(p) {
        p.y += p.speed; p.angle += p.spin;
        if (p.y > canvas.height) p.y = -20;
        ctx2.save();
        ctx2.translate(p.x, p.y);
        ctx2.rotate(p.angle * Math.PI / 180);
        ctx2.fillStyle = p.color;
        ctx2.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx2.restore();
      });
      if (Date.now() < end) raf = requestAnimationFrame(drawC);
      else canvas.style.display = 'none';
    }
    drawC();
  }

  // ══════════════════════════════════════════════════════════════
  //  COPY LOBBY CODE
  // ══════════════════════════════════════════════════════════════
  function copyLobbyCode(elementId) {
    var el = document.getElementById(elementId);
    if (!el) return;
    var code = el.innerText.trim();
    var origText = code;
    var origClass = el.className;

    function flash() {
      el.innerText = '✓ Copied!';
      el.classList.add('copied');
      setTimeout(function() {
        el.innerText = origText;
        el.className = origClass;
      }, 1600);
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(flash).catch(flash);
    } else {
      var ta = document.createElement('textarea');
      ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      flash();
    }
  }

  // ── HP hearts renderer ─────────────────────────────────────────
  function renderHearts(lives, max) {
    max = max || 3;
    var html = '';
    for (var i = 0; i < max; i++) {
      html += i < lives
        ? '<span class="hp-heart hp-full">❤️</span>'
        : '<span class="hp-heart hp-empty">🖤</span>';
    }
    return html;
  }

  // ══════════════════════════════════════════════════════════════
  //  MOVE ANIMATIONS  (bullet fly, +1 float, shield pop)
  // ══════════════════════════════════════════════════════════════
  function animateMoves(p1Move, p2Move, p1CanFire, p2CanFire) {
    var av1 = document.getElementById('p1Avatar');
    var av2 = document.getElementById('p2Avatar');
    var b1  = document.getElementById('p1Bullets');
    var b2  = document.getElementById('p2Bullets');
    if (!av1 || !av2) return;

    var r1 = av1.getBoundingClientRect();
    var r2 = av2.getBoundingClientRect();

    if (p1Move === 'shoot' && p1CanFire)
      spawnBullet(r1.right, r1.top + r1.height / 2, r2.left, r2.top + r2.height / 2);
    if (p2Move === 'shoot' && p2CanFire)
      spawnBullet(r2.left, r2.top + r2.height / 2, r1.right, r1.top + r1.height / 2);

    if (p1Move === 'reload' && b1) {
      var rb1 = b1.getBoundingClientRect();
      spawnFloat(rb1.right + 6, rb1.top - 2, '+1 🔫');
    }
    if (p2Move === 'reload' && b2) {
      var rb2 = b2.getBoundingClientRect();
      spawnFloat(rb2.right + 6, rb2.top - 2, '+1 🔫');
    }

    if (p1Move === 'defend') spawnShield(r1.left + r1.width / 2, r1.top + r1.height / 2);
    if (p2Move === 'defend') spawnShield(r2.left + r2.width / 2, r2.top + r2.height / 2);
  }

  function spawnBullet(fromX, fromY, toX, toY) {
    var el = document.createElement('span');
    el.style.cssText =
      'position:fixed;font-size:2rem;pointer-events:none;z-index:150;line-height:1;' +
      'color:#f5c542;text-shadow:0 0 10px rgba(255,200,0,1),0 0 24px rgba(255,140,0,0.8);' +
      'left:' + Math.round(fromX) + 'px;top:' + Math.round(fromY - 16) + 'px;';
    el.innerText = '●';
    document.body.appendChild(el);

    var dx = Math.round(toX - fromX);
    var dy = Math.round(toY - fromY);
    var anim = el.animate([
      { transform: 'translate(0,0) scale(1)',   opacity: 1   },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.5)', opacity: 0.6 }
    ], { duration: 520, easing: 'ease-in', fill: 'forwards' });
    anim.onfinish = function () { if (el.parentNode) el.remove(); };
  }

  function spawnFloat(x, y, text) {
    var el = document.createElement('span');
    el.style.cssText =
      'position:fixed;font-size:1.4rem;font-weight:bold;pointer-events:none;z-index:150;' +
      'color:#2980b9;text-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;' +
      'left:' + Math.round(x) + 'px;top:' + Math.round(y) + 'px;';
    el.innerText = text;
    document.body.appendChild(el);

    var anim = el.animate([
      { transform: 'translateY(0)     scale(1)',    opacity: 1 },
      { transform: 'translateY(-70px) scale(1.15)', opacity: 0 }
    ], { duration: 1100, easing: 'ease-out', fill: 'forwards' });
    anim.onfinish = function () { if (el.parentNode) el.remove(); };
  }

  function spawnShield(cx, cy) {
    var el = document.createElement('span');
    el.style.cssText =
      'position:fixed;font-size:3.5rem;pointer-events:none;z-index:150;line-height:1;' +
      'left:' + Math.round(cx - 28) + 'px;top:' + Math.round(cy - 36) + 'px;';
    el.innerText = '🛡';
    document.body.appendChild(el);

    var anim = el.animate([
      { transform: 'scale(0) rotate(-25deg)', opacity: 1,   offset: 0   },
      { transform: 'scale(1.5) rotate(8deg)', opacity: 1,   offset: 0.5 },
      { transform: 'scale(1.2) rotate(0deg)', opacity: 0.9, offset: 0.7 },
      { transform: 'scale(0.9) rotate(0deg)', opacity: 0,   offset: 1   }
    ], { duration: 1000, easing: 'cubic-bezier(0.34,1.56,0.64,1)', fill: 'forwards' });
    anim.onfinish = function () { if (el.parentNode) el.remove(); };
  }

  // ── Constants ─────────────────────────────────────────────────
  var TOURNAMENT_OPPONENTS = [
    { name: 'Dusty Pete',   difficulty: 'easy'   },
    { name: 'Sheriff Kane', difficulty: 'medium' },
    { name: 'El Diablo',    difficulty: 'hard'   }
  ];

  // ── Game State ────────────────────────────────────────────────
  var mode            = '';
  var player1         = null;
  var player2         = null;
  var player1Move     = null;
  var player2Move     = null;
  var countdownTimer  = null;
  var tournamentIndex = 0;

  // Network-specific
  var netRoundNum   = 0;
  var moveSubmitted = false;

  // ── Player Factory ────────────────────────────────────────────
  function createPlayer(name, avatar) {
    return { name: name, avatar: avatar || '🤠', lives: 3, bullets: 3, shields: 3, lastMove: null };
  }

  // ══════════════════════════════════════════════════════════════
  //  PROFILE  (one per browser, stored in localStorage)
  // ══════════════════════════════════════════════════════════════
  var PROFILE_KEY = 'cowboy_profile_v1';

  function getProfile() {
    var raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  var selectedAvatar = '🤠';

  function selectAvatar(emoji) {
    selectedAvatar = emoji;
    document.querySelectorAll('.avatar-opt').forEach(function (btn) {
      btn.classList.toggle('selected', btn.innerText === emoji);
    });
  }

  function createProfile() {
    var input = document.getElementById('profileNameInput');
    var err   = document.getElementById('profileError');
    var name  = input.value.trim();
    if (!name) { err.innerText = 'Enter a name first!'; return; }
    err.innerText = '';
    var existing = getProfile();
    var profile = {
      id:     existing ? existing.id : '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      name:   name.slice(0, 16),
      avatar: selectedAvatar
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    // Reset page title/button in case it was opened as "edit"
    var sub = document.querySelector('#page-profile-create .subtitle');
    var btn = document.querySelector('#page-profile-create .btn-start');
    if (sub) sub.innerText = 'Create your profile to get started';
    if (btn) btn.innerText = 'Create Profile';
    goToMenu();
  }

  function openProfileEdit() {
    var profile = getProfile();
    if (!profile) return;
    var input = document.getElementById('profileNameInput');
    if (input) input.value = profile.name;
    selectedAvatar = profile.avatar || '🤠';
    document.querySelectorAll('.avatar-opt').forEach(function (btn) {
      btn.classList.toggle('selected', btn.innerText.trim() === selectedAvatar);
    });
    // Update page labels for edit mode
    var sub = document.querySelector('#page-profile-create .subtitle');
    var btn = document.querySelector('#page-profile-create .btn-start');
    if (sub) sub.innerText = 'Update your name and avatar';
    if (btn) btn.innerText = 'Save Changes';
    var err = document.getElementById('profileError');
    if (err) err.innerText = '';
    showPage('page-profile-create');
  }

  // ══════════════════════════════════════════════════════════════
  //  PAGE NAVIGATION
  // ══════════════════════════════════════════════════════════════
  var ALL_PAGES = ['page-profile-create', 'page-menu', 'page-vsai', 'page-lobby', 'page-waiting',
                   'page-tournament', 'page-tournament-lobby', 'page-tournament-spectate',
                   'page-tournament-wait', 'game'];

  function showPage(id) {
    ALL_PAGES.forEach(function (p) {
      var el = document.getElementById(p);
      if (el) el.style.display = 'none';
    });
    var target = document.getElementById(id);
    target.style.display = 'block';
    target.classList.remove('page-fade-in');
    void target.offsetWidth; // reflow to restart animation
    target.classList.add('page-fade-in');
    document.getElementById('overlay').style.display = 'none';
  }

  function goToMenu() {
    if (countdownTimer) clearInterval(countdownTimer);

    // Notify opponent before we disconnect
    if (sb) {
      if (mode === 'network' && currentCode) {
        sb.from('lobbies').update({status: 'abandoned'}).eq('code', currentCode).then(function () {});
        currentCode = null;
      }
      if ((mode === 'tournament-ai' || mode === 'tournament-net') &&
          tCode && tMyMatchRole && tMyMatchRole !== 'spectator' &&
          tActiveMatch && !tActiveMatch.winner) {
        var _prof = getProfile();
        if (_prof) {
          sb.from('tournaments').update({
            active_match: Object.assign({}, tActiveMatch, {abandoned_by: _prof.id})
          }).eq('code', tCode).then(function () {});
        }
      }
    }

    cleanupChannel();
    var profile = getProfile();
    if (!profile) {
      showPage('page-profile-create');
      return;
    }
    var badge = document.getElementById('menuProfileBadge');
    if (badge) badge.innerText = (profile.avatar || '🤠') + ' ' + profile.name;
    showPage('page-menu');
  }

  function showGame() {
    ALL_PAGES.forEach(function (p) {
      var el = document.getElementById(p);
      if (el) el.style.display = 'none';
    });
    document.getElementById('game').style.display = 'block';
  }

  function showMenu() { goToMenu(); }

  // ══════════════════════════════════════════════════════════════
  //  LOBBY
  // ══════════════════════════════════════════════════════════════
  function openLobbyPage() {
    document.getElementById('lobbyCodeInput').value = '';
    document.getElementById('lobbyError').innerText = '';
    showPage('page-lobby');
  }

  function generateCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code  = '';
    for (var i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  function setLobbyError(msg) {
    var el = document.getElementById('lobbyError');
    if (el) el.innerText = msg;
  }

  function createLobby() {
    if (!sbReady()) { setLobbyError('Supabase not configured — add your keys in game.js'); return; }
    var profile = getProfile();
    if (!profile) return;

    var code = generateCode();

    sb.from('lobbies').insert({
      code:        code,
      host_id:     profile.id,
      host_name:   profile.name,
      host_avatar: profile.avatar || '🤠',
      status:      'waiting',
      round_num:   0
    }).then(function (res) {
      if (res.error) { setLobbyError('Could not create lobby: ' + res.error.message); return; }

      myRole      = 'host';
      currentCode = code;
      document.getElementById('waitingCode').innerText   = code;
      document.getElementById('waitingStatus').innerText = 'Waiting for opponent to join…';
      showPage('page-waiting');

      // Watch for guest joining
      subscribeToLobby(code, function (row) {
        if (row.status === 'ready' && row.guest_name) {
          startNetworkGame(row);
        }
      });
    });
  }

  function joinLobby() {
    if (!sbReady()) { setLobbyError('Supabase not configured — add your keys in game.js'); return; }
    var profile = getProfile();
    if (!profile) return;

    var code = (document.getElementById('lobbyCodeInput').value || '').trim().toUpperCase();
    if (!code) { setLobbyError('Enter a lobby code!'); return; }

    sb.from('lobbies').select('*').eq('code', code).single().then(function (res) {
      if (res.error || !res.data)   { setLobbyError('Lobby not found!');              return; }
      var d = res.data;
      if (d.status !== 'waiting')   { setLobbyError('This lobby is no longer open.'); return; }
      if (d.host_id === profile.id) { setLobbyError("That's your own lobby!");         return; }

      sb.from('lobbies').update({
        guest_id:     profile.id,
        guest_name:   profile.name,
        guest_avatar: profile.avatar || '🤠',
        status:       'ready'
      }).eq('code', code).then(function (upd) {
        if (upd.error) { setLobbyError('Could not join: ' + upd.error.message); return; }

        myRole      = 'guest';
        currentCode = code;

        sb.from('lobbies').select('*').eq('code', code).single().then(function (r) {
          startNetworkGame(r.data);
        });
      });
    });
  }

  function cancelLobby() {
    if (currentCode && sb) sb.from('lobbies').delete().eq('code', currentCode).then(function () {});
    cleanupChannel();
    currentCode = null;
    goToMenu();
  }

  function subscribeToLobby(code, callback) {
    cleanupChannel();
    realtimeChannel = sb
      .channel('lobby-' + code)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'lobbies',
        filter: 'code=eq.' + code
      }, function (payload) {
        if (payload.new) callback(payload.new);
      })
      .subscribe();
  }

  // ══════════════════════════════════════════════════════════════
  //  NETWORK GAME
  // ══════════════════════════════════════════════════════════════
  function startNetworkGame(row) {
    cleanupChannel();
    mode          = 'network';
    player1Move   = null;
    player2Move   = null;
    netRoundNum   = 0;
    moveSubmitted = false;
    resolving     = false;

    var profile   = getProfile();
    var myName    = profile.name;
    var myAvatar  = profile.avatar || '🤠';
    var theirName   = (myRole === 'host') ? row.guest_name   : row.host_name;
    var theirAvatar = (myRole === 'host') ? (row.guest_avatar || '🤠') : (row.host_avatar || '🤠');

    player1 = createPlayer(myName, myAvatar);
    player2 = createPlayer(theirName, theirAvatar);

    document.getElementById('player1Title').innerText = myName + ' (You)';
    document.getElementById('enemyTitle').innerText   = theirName;
    hideTournamentUI();
    showGame();
    updateUI();

    subscribeToLobby(currentCode, onNetworkUpdate);

    // Both players start round 1 locally via timer — no Supabase event needed.
    // This avoids the race where one player's subscription isn't ready yet.
    setTimeout(function () {
      if (netRoundNum !== 0) return; // already started (shouldn't happen, but safe)
      netRoundNum   = 1;
      moveSubmitted = false;
      resolving     = false;
      startNetworkCountdown();

      // Host writes initial state to DB so move resolution works correctly
      if (myRole === 'host') {
        sb.from('lobbies').update({
          state:      { host: { lives:3, bullets:3, shields:3 }, guest: { lives:3, bullets:3, shields:3 } },
          host_move:  null,
          guest_move: null,
          result:     '',
          winner:     null,
          round_num:  1
        }).eq('code', currentCode).then(function () {});
      }
    }, 1200);
  }

  function onNetworkUpdate(row) {
    // Opponent left
    if (row.status === 'abandoned') {
      clearInterval(countdownTimer);
      cleanupChannel();
      mode = '';
      showOverlay('🚪 Opponent left the match!', goToMenu);
      return;
    }

    // Host: both moves in → resolve round
    if (myRole === 'host' && !resolving && row.host_move && row.guest_move && row.round_num === netRoundNum) {
      resolving = true;
      resolveNetworkRound(row);
      return;
    }

    // New round started (round 2+ only — round 1 is started locally via timer)
    if (row.round_num && row.round_num > 1 && row.round_num !== netRoundNum) {
      netRoundNum   = row.round_num;
      moveSubmitted = false;
      resolving     = false;
      player1Move   = null;

      if (row.state) { syncFromRow(row.state); updateUI(); }
      if (row.result) showResult(row.result);
      if (!row.winner) startNetworkCountdown();
    }

    // Game over
    if (row.winner) {
      clearInterval(countdownTimer);
      if (row.state) { syncFromRow(row.state); updateUI(); }

      var iWon = (row.winner === myRole);
      var msg  = row.winner === 'draw' ? "🤝 It's a draw!"
               : iWon               ? '🎉 You win!'
                                    : '💀 You lost!';

      if (row.result) showResult(row.result);

      setTimeout(function () {
        cleanupChannel();
        if (myRole === 'host' && currentCode) {
          sb.from('lobbies').delete().eq('code', currentCode).then(function () {});
        }
        currentCode = null;
        showOverlay(msg, goToMenu);
      }, 800);
    }
  }

  function syncFromRow(state) {
    var me   = state[myRole];
    var them = (myRole === 'host') ? state.guest : state.host;
    player1.lives   = me.lives;   player1.bullets = me.bullets;   player1.shields = me.shields;
    player2.lives   = them.lives; player2.bullets = them.bullets; player2.shields = them.shields;
  }

  function startNetworkCountdown() {
    document.getElementById('result').innerText = '';
    setButtonsLocked(true);
    showReadyGo(function () {
      setButtonsLocked(false);
      updateActionButtons();
      runCountdown(function () {
        if (!moveSubmitted) submitNetworkMove('idle');
      });
    });
  }

  function submitNetworkMove(move) {
    if (moveSubmitted) return;
    if (move === 'shoot' && player1.bullets <= 0) {
      showResult('🚫 No bullets — reload first!');
      return;
    }
    moveSubmitted = true;
    player1Move   = move;
    showResult('Locked in — waiting for opponent…');
    updateActionButtons();

    var field = (myRole === 'host') ? { host_move: move } : { guest_move: move };
    sb.from('lobbies').update(field).eq('code', currentCode).then(function () {});
  }

  function resolveNetworkRound(row) {
    var hS = Object.assign({}, row.state.host);
    var gS = Object.assign({}, row.state.guest);

    var result = applyNetworkRules(row.host_move, row.guest_move, hS, gS, row.host_name, row.guest_name);

    var winner = null;
    if (hS.lives <= 0 && gS.lives <= 0) winner = 'draw';
    else if (hS.lives <= 0)              winner = 'guest';
    else if (gS.lives <= 0)              winner = 'host';

    var update = { state: { host: hS, guest: gS }, result: result, host_move: null, guest_move: null };
    if (winner) update.winner   = winner;
    else        update.round_num = row.round_num + 1;

    sb.from('lobbies').update(update).eq('code', currentCode).then(function () {});
  }

  function applyNetworkRules(hMove, gMove, hS, gS, hName, gName) {
    if (hMove === 'reload') hS.bullets = Math.min(5, hS.bullets + 1);
    if (gMove === 'reload') gS.bullets = Math.min(5, gS.bullets + 1);
    // 'idle' gains no bullet

    var hFired    = (hMove === 'shoot' && hS.bullets > 0);
    var gFired    = (gMove === 'shoot' && gS.bullets > 0);
    if (hFired) hS.bullets--;
    if (gFired) gS.bullets--;

    // Defend always costs 1 shield upfront — whether or not it blocks a shot
    var hShielded = false, gShielded = false;
    if (hMove === 'defend' && hS.shields > 0) { hS.shields--; hShielded = true; }
    if (gMove === 'defend' && gS.shields > 0) { gS.shields--; gShielded = true; }

    var hExposed = (hMove === 'reload' || hMove === 'idle');
    var gExposed = (gMove === 'reload' || gMove === 'idle');

    if (hFired && gFired)    { hS.lives--; gS.lives--; return '💥 Both got shot!'; }
    if (hFired && gExposed)  { gS.lives--; return gMove === 'idle' ? '🎯 ' + gName + ' wasn\'t ready!' : '🎯 ' + gName + ' got shot while reloading!'; }
    if (gFired && hExposed)  { hS.lives--; return hMove === 'idle' ? '🎯 ' + hName + ' wasn\'t ready!' : '🎯 ' + hName + ' got shot while reloading!'; }
    if (hFired && gMove === 'defend') {
      if (gShielded) return '🛡 ' + gName + ' blocked the shot! (-1 🛡)';
      gS.lives--; return '💥 ' + gName + ' had no shields left!';
    }
    if (gFired && hMove === 'defend') {
      if (hShielded) return '🛡 ' + hName + ' blocked the shot! (-1 🛡)';
      hS.lives--; return '💥 ' + hName + ' had no shields left!';
    }
    var parts = [];
    if (hMove === 'defend') parts.push(hName + ' raised shield');
    if (gMove === 'defend') parts.push(gName + ' raised shield');
    if (parts.length) return '🛡 ' + parts.join(' & ') + (hShielded || gShielded ? ' (-1 🛡)' : '');
    return '🤠 Standoff — nothing happened.';
  }

  // ══════════════════════════════════════════════════════════════
  //  LOCAL / AI / TOURNAMENT GAME
  // ══════════════════════════════════════════════════════════════
  var AI_OPPONENTS = {
    easy:   { name: 'Dusty Pete',   avatar: '🤠' },
    medium: { name: 'Sheriff Kane', avatar: '🐺' },
    hard:   { name: 'El Diablo',    avatar: '💀' }
  };

  function startVsAI(difficulty) {
    var opp     = AI_OPPONENTS[difficulty] || AI_OPPONENTS.easy;
    var profile = getProfile();
    mode    = 'ai';
    player1 = createPlayer(profile ? profile.name : 'Player 1', profile ? profile.avatar : '🤠');
    player2 = createPlayer(opp.name, opp.avatar);
    player2.difficulty = difficulty;

    document.getElementById('player1Title').innerText = player1.name;
    document.getElementById('enemyTitle').innerText   = opp.name + ' (' + capitalize(difficulty) + ')';
    hideTournamentUI();
    showGame();
    updateUI();
    startRound();
  }

  function startGame(selectedMode, p1Name, p2Name) {
    mode = selectedMode;

    if (mode === 'tournament') {
      tournamentIndex = 0;
      startTournamentMatch();
      return;
    }

    var profile = getProfile();
    player1 = createPlayer(p1Name || (profile ? profile.name : 'Player 1'), profile ? profile.avatar : '🤠');
    player2 = createPlayer(p2Name || (mode === 'local' ? 'Player 2' : 'AI'), '👤');
    document.getElementById('player1Title').innerText = player1.name;
    document.getElementById('enemyTitle').innerText   = player2.name;
    hideTournamentUI();
    showGame();
    updateUI();
    startRound();
  }

  function startTournamentMatch() {
    var opp     = TOURNAMENT_OPPONENTS[tournamentIndex];
    var profile = getProfile();
    player1 = createPlayer(profile ? profile.name : 'Player 1', profile ? profile.avatar : '🤠');
    player2 = createPlayer(opp.name, ['💀','🐺','👹'][tournamentIndex] || '💀');
    player2.difficulty = opp.difficulty;
    player1Move = null;
    player2Move = null;

    document.getElementById('player1Title').innerText = player1.name;
    document.getElementById('enemyTitle').innerText   = opp.name + ' (' + capitalize(opp.difficulty) + ')';

    showTournamentUI();
    showGame();
    updateUI();
    startRound();
  }

  // ── Tournament UI ─────────────────────────────────────────────
  function showTournamentUI() {
    var el = document.getElementById('tournamentProgress');
    if (!el) return;
    el.style.display = 'block';
    el.querySelectorAll('.t-step').forEach(function (s, i) {
      s.classList.remove('active', 'done');
      if (i < tournamentIndex) s.classList.add('done');
      if (i === tournamentIndex) s.classList.add('active');
    });
  }

  function hideTournamentUI() {
    var el  = document.getElementById('tournamentProgress');
    var tbb = document.getElementById('tBracketBtn');
    if (el)  el.style.display  = 'none';
    if (tbb) tbb.style.display = 'none';
  }

  // ── Round Logic ───────────────────────────────────────────────
  function setButtonsLocked(locked) {
    ['btnShoot', 'btnReload', 'btnDefend'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.disabled = locked;
    });
  }

  function startRound() {
    player1Move = null;
    player2Move = null;
    // Clear any stale countdown state from the previous round
    var cdEl = document.getElementById('countdown');
    if (cdEl) { cdEl.innerText = ''; cdEl.removeAttribute('data-count'); cdEl.removeAttribute('data-phase'); }
    document.getElementById('result').innerText = '';
    setButtonsLocked(true);
    showReadyGo(function () {
      setButtonsLocked(false);
      updateActionButtons();
      runCountdown(resolveRound);
    });
  }

  function showReadyGo(onDone) {
    var el = document.getElementById('countdown');
    el.removeAttribute('data-count');
    el.setAttribute('data-phase', 'ready');
    el.innerText = 'READY';

    setTimeout(function () {
      el.setAttribute('data-phase', 'go');
      el.innerText = 'GO!';
      playSound('go');
      setTimeout(function () {
        el.removeAttribute('data-phase');
        onDone();
      }, 500);
    }, 700);
  }

  function runCountdown(onExpire) {
    var count = 3;
    var el    = document.getElementById('countdown');
    el.innerText = count;
    el.setAttribute('data-count', count);
    if (countdownTimer) clearInterval(countdownTimer);

    countdownTimer = setInterval(function () {
      count--;
      if (count > 0) {
        el.innerText = count;
        el.setAttribute('data-count', count);
      } else {
        clearInterval(countdownTimer);
        el.innerText = '';
        el.removeAttribute('data-count');
        onExpire();
      }
    }, 1000);
  }

  function chooseMove(move) {
    if (mode === 'network') {
      submitNetworkMove(move);
      return;
    }

    if (mode === 'tournament-net') {
      submitTNetMove(move);
      return;
    }

    if (move === 'shoot' && player1.bullets <= 0) {
      playSound('empty');
      showResult('🚫 No bullets — reload first!');
      return;
    }

    if (mode === 'ai' || mode === 'tournament' || mode === 'tournament-ai') {
      if (player1Move !== null) return;   // already chose this round
      player1Move = move;
      clearInterval(countdownTimer);      // don't wait — resolve now
      var _cd = document.getElementById('countdown');
      if (_cd) { _cd.innerText = ''; _cd.removeAttribute('data-count'); }
      resolveRound();

    } else if (mode === 'local') {
      if (player1Move === null) {
        player1Move = move;
        showResult(player1.name + ' locked in — ' + player2.name + ' choose!');
      } else if (player2Move === null) {
        if (move === 'shoot' && player2.bullets <= 0) {
          showResult('🚫 ' + player2.name + ' has no bullets — reload first!');
          return;
        }
        player2Move = move;
        clearInterval(countdownTimer);    // both chose — resolve now
        var _cd2 = document.getElementById('countdown');
        if (_cd2) { _cd2.innerText = ''; _cd2.removeAttribute('data-count'); }
        resolveRound();
      }
    }
  }

  // ── AI Logic ──────────────────────────────────────────────────
  function aiMove(ai, opponent) {
    var d = ai.difficulty || 'easy';
    if (d === 'easy')   return easyAI();
    if (d === 'medium') return mediumAI(ai, opponent);
    if (d === 'hard')   return hardAI(ai, opponent);
    return easyAI();
  }

  function easyAI() {
    var moves = ['shoot', 'reload', 'defend'];
    return moves[Math.floor(Math.random() * 3)];
  }

  function mediumAI(ai, opp) {
    if (ai.bullets === 0)
      return (ai.shields > 0 && opp.bullets > 0 && Math.random() < 0.4) ? 'defend' : 'reload';
    var r = Math.random();
    if (opp.bullets > 0 && ai.shields > 0 && r < 0.35) return 'defend';
    if (ai.bullets > 0 && r < 0.65) return 'shoot';
    return 'reload';
  }

  function hardAI(ai, opp) {
    if (ai.bullets === 0)
      return (opp.bullets > 0 && ai.shields > 0 && Math.random() < 0.55) ? 'defend' : 'reload';
    if (opp.lastMove === 'reload') return 'shoot';
    if (opp.lastMove === 'shoot')  return ai.shields > 0 ? 'defend' : 'reload';
    if (opp.lastMove === 'defend') return 'reload';
    if (ai.lives === 1) return ai.bullets > 0 ? 'shoot' : 'reload';
    var r = Math.random();
    if (r < 0.45) return 'shoot';
    if (r < 0.70) return 'reload';
    return 'defend';
  }

  // ── Resolve Round ─────────────────────────────────────────────
  function resolveRound() {
    // If player didn't choose → idle (no action, still vulnerable)
    if (player1Move === null) player1Move = 'idle';
    // AI always decides fresh at resolve time
    if (mode === 'ai' || mode === 'tournament' || mode === 'tournament-ai') player2Move = aiMove(player2, player1);
    if (player2Move === null) player2Move = 'idle';

    player1.lastMove = player1Move;
    player2.lastMove = player2Move;

    var p1CanFire = player1.bullets > 0;
    var p2CanFire = player2.bullets > 0;
    animateMoves(player1Move, player2Move, p1CanFire, p2CanFire);

    // Play sound at resolve time — matches what actually happens on screen
    if      ((player1Move === 'shoot' && p1CanFire) || (player2Move === 'shoot' && p2CanFire)) playSound('shoot');
    else if (player1Move === 'reload' || player2Move === 'reload') playSound('reload');
    else if (player1Move === 'defend' || player2Move === 'defend') playSound('defend');

    applyRules(player1Move, player2Move);
    updateUI();

    // Real-time HP in bracket for tournament-ai
    if (mode === 'tournament-ai' && tActiveMatch && tCode) {
      var _p1 = (tMyMatchRole === 'p1');
      var _mS = {lives: player1.lives, bullets: player1.bullets, shields: player1.shields};
      var _tS = {lives: player2.lives, bullets: player2.bullets, shields: player2.shields};
      tActiveMatch = Object.assign({}, tActiveMatch, {
        p1_state: _p1 ? _mS : _tS,
        p2_state: _p1 ? _tS : _mS
      });
      sb.from('tournaments').update({active_match: tActiveMatch}).eq('code', tCode).then(function () {});
    }

    if (!checkWinner()) setTimeout(startRound, 1500);
  }

  function applyRules(p1, p2) {
    if (p1 === 'reload') player1.bullets = Math.min(5, player1.bullets + 1);
    if (p2 === 'reload') player2.bullets = Math.min(5, player2.bullets + 1);

    // Defend always costs 1 shield upfront — whether or not it blocks a shot
    var p1Shielded = false, p2Shielded = false;
    if (p1 === 'defend' && player1.shields > 0) { player1.shields--; p1Shielded = true; }
    if (p2 === 'defend' && player2.shields > 0) { player2.shields--; p2Shielded = true; }

    var p1Fired = (p1 === 'shoot' && player1.bullets > 0);
    var p2Fired = (p2 === 'shoot' && player2.bullets > 0);
    if (p1Fired) player1.bullets--;
    if (p2Fired) player2.bullets--;

    var p1Exposed = (p1 === 'reload' || p1 === 'idle');
    var p2Exposed = (p2 === 'reload' || p2 === 'idle');

    var text = '';
    if (p1Fired && p2Fired) {
      player1.lives--; player2.lives--;
      text = '💥 Both got shot!';
    } else if (p1Fired && p2Exposed) {
      player2.lives--;
      text = p2 === 'idle'
        ? '🎯 ' + player2.name + ' wasn\'t ready and got shot!'
        : '🎯 ' + player2.name + ' got shot while reloading!';
    } else if (p2Fired && p1Exposed) {
      player1.lives--;
      text = p1 === 'idle'
        ? '🎯 ' + player1.name + ' wasn\'t ready and got shot!'
        : '🎯 ' + player1.name + ' got shot while reloading!';
    } else if (p1Fired && p2 === 'defend') {
      if (p2Shielded) { text = '🛡 ' + player2.name + ' blocked the shot!'; }
      else { player2.lives--; text = '💥 ' + player2.name + ' had no shields left!'; }
    } else if (p2Fired && p1 === 'defend') {
      if (p1Shielded) { text = '🛡 ' + player1.name + ' blocked the shot!'; }
      else { player1.lives--; text = '💥 ' + player1.name + ' had no shields left!'; }
    } else if (p1 === 'shoot' && !p1Fired) {
      text = '🔫 ' + player1.name + ' pulled the trigger — no bullets!';
    } else if (p2 === 'shoot' && !p2Fired) {
      text = '🔫 ' + player2.name + ' pulled the trigger — no bullets!';
    } else if (p1 === 'defend' || p2 === 'defend') {
      // Defend used against a non-shot — shield consumed but nothing to block
      var parts = [];
      if (p1 === 'defend') parts.push(player1.name + (p1Shielded ? ' raised shield' : ' has no shields!'));
      if (p2 === 'defend') parts.push(player2.name + (p2Shielded ? ' raised shield' : ' has no shields!'));
      text = '🛡 ' + parts.join(' & ') + (p1Shielded || p2Shielded ? ' (-1 🛡)' : '');
    } else {
      text = '🤠 Standoff — nothing happened.';
    }
    showResult(text);
  }

  // ── UI Helpers ────────────────────────────────────────────────
  function updateUI() {
    document.getElementById('p1Avatar').innerText  = player1.avatar || '🤠';
    document.getElementById('p2Avatar').innerText  = player2.avatar || '🤠';
    document.getElementById('p1Bullets').innerText = player1.bullets;
    document.getElementById('p2Bullets').innerText = player2.bullets;
    document.getElementById('p1Shields').innerText = player1.shields;
    document.getElementById('p2Shields').innerText = player2.shields;

    var p1LivesEl = document.getElementById('p1Lives');
    var p2LivesEl = document.getElementById('p2Lives');

    // Damage flash on player card
    var p1Hit = (player1._prevLives !== undefined && player1.lives < player1._prevLives);
    var p2Hit = (player2._prevLives !== undefined && player2.lives < player2._prevLives);
    if (p1Hit) {
      var c1 = p1LivesEl ? p1LivesEl.closest('.player-card') : null;
      if (c1) { c1.classList.remove('player-hit'); void c1.offsetWidth; c1.classList.add('player-hit'); }
      playSound('hit');
    }
    if (p2Hit) {
      var c2 = p2LivesEl ? p2LivesEl.closest('.player-card') : null;
      if (c2) { c2.classList.remove('player-hit'); void c2.offsetWidth; c2.classList.add('player-hit'); }
      if (!p1Hit) playSound('hit');
    }
    player1._prevLives = player1.lives;
    player2._prevLives = player2.lives;

    if (p1LivesEl) p1LivesEl.innerHTML = renderHearts(Math.max(0, player1.lives), 3);
    if (p2LivesEl) p2LivesEl.innerHTML = renderHearts(Math.max(0, player2.lives), 3);

    updateActionButtons();
  }

  function updateActionButtons() {
    var shoot  = document.getElementById('btnShoot');
    var reload = document.getElementById('btnReload');
    var defend = document.getElementById('btnDefend');
    if (!shoot) return;
    var noAmmo    = !player1 || player1.bullets <= 0;
    var noShields = !player1 || player1.shields <= 0;
    var locked    = (mode === 'network' && moveSubmitted) || (mode === 'tournament-net' && tMoveSubmitted);
    shoot.disabled  = noAmmo || locked;
    reload.disabled = locked;
    defend.disabled = noShields || locked;
    shoot.title  = noAmmo    ? 'No bullets — reload first!' : 'Costs 1 bullet';
    defend.title = noShields ? 'No shields left!'           : 'Costs 1 shield (3 total)';
  }

  function showResult(text) {
    var el = document.getElementById('result');
    if (!el) return;
    el.innerText = text;
    el.classList.remove('result-new');
    void el.offsetWidth;
    el.classList.add('result-new');
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ── Winner Check ──────────────────────────────────────────────
  function checkWinner() {
    var p1Dead = player1.lives <= 0;
    var p2Dead = player2.lives <= 0;
    if (!p1Dead && !p2Dead) return false;

    clearInterval(countdownTimer);
    var winner = (p1Dead && p2Dead) ? 'draw' : (p2Dead ? 'player1' : 'player2');
    setTimeout(function () { handleWinner(winner); }, 600);
    return true;
  }

  function handleWinner(winner) {
    if (mode === 'tournament-ai') {
      if (!tActiveMatch || !tCode) { goToMenu(); return; }
      var amP1 = (tMyMatchRole === 'p1');
      var mW, mWP;
      if (winner === 'player1') {
        mW = amP1 ? 'p1' : 'p2'; mWP = amP1 ? tActiveMatch.p1 : tActiveMatch.p2;
      } else if (winner === 'player2') {
        mW = amP1 ? 'p2' : 'p1'; mWP = amP1 ? tActiveMatch.p2 : tActiveMatch.p1;
      } else { // draw → p1 wins
        mW = 'p1'; mWP = tActiveMatch.p1;
      }
      sb.from('tournaments').update({
        active_match: Object.assign({}, tActiveMatch, {winner: mW, winner_player: mWP})
      }).eq('code', tCode).then(function () {});
      return; // overlay shown via DB event → handleTMatchEnd
    }

    if (mode === 'tournament') {
      if (winner === 'player1') {
        tournamentIndex++;
        if (tournamentIndex >= TOURNAMENT_OPPONENTS.length) {
          showOverlay('🏆 Tournament Champion! You beat them all!', goToMenu);
        } else {
          showOverlay('✅ You won! Next: ' + TOURNAMENT_OPPONENTS[tournamentIndex].name + '…', startTournamentMatch);
        }
      } else if (winner === 'draw') {
        showOverlay('🤝 Draw! Tournament over.', goToMenu);
      } else {
        showOverlay('💀 You lost! Tournament over.', goToMenu);
      }
      return;
    }

    var msg = '';
    if (winner === 'draw')         msg = "🤝 It's a draw!";
    else if (winner === 'player1') msg = mode === 'ai' ? '🎉 You beat the AI!' : '🎉 ' + player1.name + ' Wins!';
    else                           msg = mode === 'ai' ? '🤖 AI wins! Better luck next time.' : '🤠 ' + player2.name + ' Wins!';
    showOverlay(msg, goToMenu);
  }

  function showOverlay(message, callback) {
    var overlay = document.getElementById('overlay');
    overlay.style.display = 'flex';
    document.getElementById('overlayMsg').innerText = message;

    var isWin = /🏆|🎉/.test(message);
    if (isWin) {
      playSound('win');
      showConfetti(2800);
    }

    setTimeout(function () {
      overlay.style.display = 'none';
      callback();
    }, 2800);
  }

  // ══════════════════════════════════════════════════════════════
  //  MULTIPLAYER TOURNAMENT
  // ══════════════════════════════════════════════════════════════
  var AI_FILLER = [
    {name: 'Quick Draw Quinn', avatar: '🤠'},
    {name: 'Dead-Eye Danny',   avatar: '💀'},
    {name: 'Trigger Hank',     avatar: '🔫'},
    {name: 'Outlaw Ollie',     avatar: '🦁'},
    {name: 'Bandit Bill',      avatar: '🐺'},
    {name: 'Gunslinger Gus',   avatar: '🦅'},
    {name: 'Iron Hand Iris',   avatar: '⚡'},
    {name: 'Shadow Sam',       avatar: '🦊'},
  ];

  var tCode           = null;
  var tChannel        = null;
  var tIsHost         = false;
  var tPlayers        = [];
  var tMatches        = [];
  var tMyMatchRole    = null;   // 'p1' | 'p2' | 'spectator'
  var tIsResolver     = false;
  var tMoveSubmitted  = false;
  var tActiveMatch    = null;
  var tRoundNum_t     = 0;
  var tMatchIdx_t     = -1;
  var tLastHandledEnd = -1;

  // ── Page helpers ──────────────────────────────────────────────
  function openTournamentPage() {
    var inp = document.getElementById('tCodeInput');
    var err = document.getElementById('tError');
    if (inp) inp.value = '';
    if (err) err.innerText = '';
    showPage('page-tournament');
  }

  function setTError(msg) {
    var el1 = document.getElementById('tError');
    var el2 = document.getElementById('tLobbyError');
    if (el1) el1.innerText = msg;
    if (el2) el2.innerText = msg;
  }

  // ── Create / Join ─────────────────────────────────────────────
  function createTournament() {
    if (!sbReady()) { setTError('Supabase not configured.'); return; }
    var profile = getProfile();
    if (!profile) return;

    var code = generateCode();
    var me = {id: profile.id, name: profile.name, avatar: profile.avatar || '🤠', isAI: false};

    sb.from('tournaments').insert({
      code: code, host_id: profile.id, status: 'lobby',
      players: [me], matches: [], current_match_idx: -1, bracket_size: 0
    }).then(function (res) {
      if (res.error) { setTError('Could not create: ' + res.error.message); return; }
      tCode = code; tIsHost = true; tPlayers = [me]; tLastHandledEnd = -1;
      showTournamentLobbyPage(code, true);
      subscribeTournament(code, onTournamentLobbyUpdate);
    });
  }

  function joinTournament() {
    if (!sbReady()) { setTError('Supabase not configured.'); return; }
    var profile = getProfile();
    if (!profile) return;

    var code = (document.getElementById('tCodeInput').value || '').trim().toUpperCase();
    if (!code) { setTError('Enter a tournament code!'); return; }

    sb.from('tournaments').select('*').eq('code', code).single().then(function (res) {
      if (res.error || !res.data) { setTError('Tournament not found!'); return; }
      var row = res.data;
      if (row.status !== 'lobby') { setTError('Tournament already started.'); return; }
      if (row.host_id === profile.id) { setTError("That's your own tournament!"); return; }

      var players = (row.players || []).slice();
      if (players.some(function (p) { return p.id === profile.id; })) {
        setTError('Already in this tournament!'); return;
      }

      var me = {id: profile.id, name: profile.name, avatar: profile.avatar || '🤠', isAI: false};
      players.push(me);

      sb.from('tournaments').update({players: players}).eq('code', code).then(function (upd) {
        if (upd.error) { setTError('Could not join: ' + upd.error.message); return; }
        tCode = code; tIsHost = false; tPlayers = players; tLastHandledEnd = -1;
        showTournamentLobbyPage(code, false);
        subscribeTournament(code, onTournamentLobbyUpdate);
      });
    });
  }

  function showTournamentLobbyPage(code, isHost) {
    document.getElementById('tWaitingCode').innerText  = code;
    document.getElementById('tLobbyStatus').innerText  = isHost
      ? 'Share this code with your opponents, then click Start!'
      : 'Waiting for the host to start the tournament…';
    var startBtn = document.getElementById('tStartBtn');
    if (startBtn) startBtn.style.display = isHost ? 'inline-block' : 'none';
    var botCtrl = document.getElementById('tBotControls');
    if (botCtrl) botCtrl.style.display = isHost ? 'block' : 'none';
    renderTPlayerList(tPlayers);
    updateBotCount();
    showPage('page-tournament-lobby');
  }

  function addTournamentBot() {
    if (!tIsHost || !tCode) return;
    var aiCount = tPlayers.filter(function (p) { return p.isAI; }).length;
    if (aiCount >= 5) {
      var el = document.getElementById('tBotCount');
      if (el) el.innerText = 'Maximum 5 AI bots reached.';
      return;
    }
    var diff = (document.getElementById('tBotDiff') || {}).value || 'medium';
    var usedNames = tPlayers.filter(function (p) { return p.isAI; }).map(function (p) { return p.name; });
    var pool = AI_FILLER.filter(function (a) { return usedNames.indexOf(a.name) === -1; });
    if (!pool.length) pool = AI_FILLER;
    var ai = pool[Math.floor(Math.random() * pool.length)];
    var newBot = {
      id: 'ai_' + Math.random().toString(36).slice(2, 8),
      name: ai.name, avatar: ai.avatar, isAI: true, difficulty: diff
    };
    var players = tPlayers.concat([newBot]);
    sb.from('tournaments').update({players: players}).eq('code', tCode).then(function (res) {
      if (res.error) return;
      tPlayers = players;
      renderTPlayerList(tPlayers);
      updateBotCount();
    });
  }

  function updateBotCount() {
    var aiCount = tPlayers.filter(function (p) { return p.isAI; }).length;
    var el = document.getElementById('tBotCount');
    if (!el) return;
    el.innerText = aiCount > 0
      ? aiCount + ' AI bot' + (aiCount > 1 ? 's' : '') + ' added (max 5)'
      : 'No AI bots added yet.';
  }

  function renderTPlayerList(players) {
    var el  = document.getElementById('tPlayerList');
    var cnt = document.getElementById('tPlayerCount');
    if (el) {
      el.innerHTML = (players || []).map(function (p) {
        var badge = p.isAI
          ? ' <span class="t-ai-badge">' + (p.difficulty || 'medium') + '</span>'
          : '';
        return '<div class="t-player-item">' + (p.avatar || '🤠') + ' ' + p.name + badge + '</div>';
      }).join('');
    }
    var realCount = (players || []).filter(function (p) { return !p.isAI; }).length;
    var aiCount   = (players || []).filter(function (p) { return p.isAI; }).length;
    if (cnt) {
      cnt.innerText = realCount + ' real player' + (realCount !== 1 ? 's' : '') +
                      (aiCount > 0 ? ', ' + aiCount + ' bot' + (aiCount !== 1 ? 's' : '') : '');
    }
  }

  function subscribeTournament(code, callback) {
    if (tChannel && sb) { sb.removeChannel(tChannel); tChannel = null; }
    tChannel = sb
      .channel('tourn-' + code)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tournaments', filter: 'code=eq.' + code
      }, function (payload) {
        if (payload.new) callback(payload.new);
      })
      .subscribe();
  }

  function leaveTournament() {
    if (sb && tCode && tMyMatchRole && tMyMatchRole !== 'spectator' &&
        tActiveMatch && !tActiveMatch.winner) {
      var _lp = getProfile();
      if (_lp) {
        sb.from('tournaments').update({
          active_match: Object.assign({}, tActiveMatch, {abandoned_by: _lp.id})
        }).eq('code', tCode).then(function () {});
      }
    }
    if (tChannel && sb) { sb.removeChannel(tChannel); tChannel = null; }
    tCode = null; tIsHost = false; tMyMatchRole = null; tActiveMatch = null;
    goToMenu();
  }

  // ── Lobby update (before start) ───────────────────────────────
  function onTournamentLobbyUpdate(row) {
    if (row.status === 'lobby') {
      tPlayers = row.players || [];
      renderTPlayerList(tPlayers);
      updateBotCount();
      return;
    }
    if (row.status === 'playing' || row.status === 'done') {
      tMatches = row.matches || [];
      tPlayers = row.players || [];
      subscribeTournament(tCode, onTournamentUpdate);
      onTournamentUpdate(row);
    }
  }

  // ── Start tournament (host) ───────────────────────────────────
  function startTournament() {
    if (!tIsHost || !tCode) return;
    var players = tPlayers.slice();
    if (players.length < 1) { setTError('At least 1 player required!'); return; }

    // Shuffle real players
    for (var i = players.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = players[i]; players[i] = players[j]; players[j] = tmp;
    }

    // Fill to power of 2 with AI
    var size = 1;
    while (size < players.length) size *= 2;
    var aiPool = AI_FILLER.slice();
    for (var i = aiPool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = aiPool[i]; aiPool[i] = aiPool[j]; aiPool[j] = tmp;
    }
    var ai_i = 0;
    while (players.length < size) {
      var ai = aiPool[ai_i++ % aiPool.length];
      players.push({
        id: 'ai_' + Math.random().toString(36).slice(2, 8),
        name: ai.name, avatar: ai.avatar, isAI: true, difficulty: 'medium'
      });
    }

    var matches = buildTBracket(players);
    var am      = makeTActiveMatch(matches[0].p1, matches[0].p2, 0);

    sb.from('tournaments').update({
      status: 'playing', players: players, matches: matches,
      current_match_idx: 0, bracket_size: size,
      active_match: am
    }).eq('code', tCode).then(function (res) {
      if (res.error) setTError('Could not start: ' + res.error.message);
    });
  }

  function buildTBracket(players) {
    var n = players.length, matches = [], num = 0;
    for (var i = 0; i < n; i += 2)
      matches.push({match_num: num++, round: 1, p1: players[i], p2: players[i + 1],
                    winner: null, winner_player: null});
    var prevStart = 0, prevCount = n / 2, rnd = 2;
    while (prevCount > 1) {
      var nc = Math.floor(prevCount / 2);
      for (var j = 0; j < nc; j++)
        matches.push({match_num: num++, round: rnd, p1: null, p2: null,
                      winner: null, winner_player: null,
                      src_p1: prevStart + j * 2, src_p2: prevStart + j * 2 + 1});
      prevStart += prevCount; prevCount = nc; rnd++;
    }
    return matches;
  }

  function makeTActiveMatch(p1, p2, matchIdx) {
    return {
      p1: p1, p2: p2,
      p1_state: {lives: 3, bullets: 3, shields: 3},
      p2_state: {lives: 3, bullets: 3, shields: 3},
      p1_move: null, p2_move: null,
      round_num: 1, result: '', winner: null, winner_player: null, match_idx: matchIdx
    };
  }

  // ── Main tournament event handler ─────────────────────────────
  function onTournamentUpdate(row) {
    if (!row) return;
    tMatches = row.matches || tMatches;
    tPlayers = row.players || tPlayers;

    if (row.status === 'done') {
      clearInterval(countdownTimer);
      var champId = row.champion_id;
      var champ   = (row.players || []).find(function (p) { return p.id === champId; });
      showOverlay(champ ? '🏆 ' + champ.name + ' is the Champion!' : '🏆 Tournament Over!',
                  function () { leaveTournament(); });
      return;
    }

    var match = row.active_match;
    if (!match) return;
    tActiveMatch = match;

    // Opponent abandoned mid-match
    if (match.abandoned_by && !match.winner && match.match_idx !== tLastHandledEnd) {
      var _myId = getProfile().id;
      if (match.abandoned_by !== _myId) {
        tLastHandledEnd = match.match_idx;
        clearInterval(countdownTimer);
        var _gone = (match.p1 && match.p1.id === match.abandoned_by) ? match.p1.name
                  : (match.p2 && match.p2.id === match.abandoned_by) ? match.p2.name
                  : 'Opponent';
        showOverlay('🚪 ' + _gone + ' left the match!', function () {
          if (tIsHost) {
            var _wSide = (match.p1 && match.p1.id === match.abandoned_by) ? 'p2' : 'p1';
            var _wP    = _wSide === 'p1' ? match.p1 : match.p2;
            advanceTBracket(row, Object.assign({}, match, {winner: _wSide, winner_player: _wP}));
          }
          var _iWon = (match.p1 && match.p1.id === match.abandoned_by)
            ? (match.p2 && match.p2.id === _myId)
            : (match.p1 && match.p1.id === _myId);
          if (tMyMatchRole !== 'spectator') showTournamentWaitPage(!!_iWon);
        });
      }
      return;
    }

    // Re-render bracket overlay if open
    var _bo = document.getElementById('bracketOverlay');
    if (_bo && _bo.style.display !== 'none') renderBracket();

    // Keep spectate page updated live
    var _sp = document.getElementById('page-tournament-spectate');
    if (_sp && _sp.style.display !== 'none') updateTSpectate(match);

    var profile = getProfile();
    var myId    = profile.id;
    var amP1    = !!(match.p1 && !match.p1.isAI && match.p1.id === myId);
    var amP2    = !!(match.p2 && !match.p2.isAI && match.p2.id === myId);

    // Who resolves: first non-AI player, or host for all-AI
    tIsResolver = false;
    if      (amP1)                                         tIsResolver = true;
    else if (match.p1 && match.p1.isAI && amP2)           tIsResolver = true;
    else if (match.p1 && match.p1.isAI &&
             (!match.p2 || match.p2.isAI) && tIsHost)     tIsResolver = true;

    // 1) Match over?
    if (match.winner) {
      handleTMatchEnd(row, match);
      return;
    }

    // 2) Both human moves submitted (resolver resolves)?
    if (tIsResolver && mode === 'tournament-net' && !resolving &&
        match.match_idx === tMatchIdx_t && match.round_num === tRoundNum_t &&
        match.p1_move && match.p2_move) {
      resolving = true;
      resolveTNetRound(match);
      return;
    }

    // 3) New match or new round?
    var isNewMatch = (match.match_idx !== tMatchIdx_t);
    var isNewRound = (match.round_num  !== tRoundNum_t);
    if (!isNewMatch && !isNewRound) return;

    tMatchIdx_t    = match.match_idx;
    tRoundNum_t    = match.round_num;
    tMoveSubmitted = false;
    resolving      = false;

    // AI vs AI: host simulates, everyone watches
    var bothAI = !!(match.p1 && match.p1.isAI && match.p2 && match.p2.isAI);
    if (bothAI) {
      tMyMatchRole = 'spectator';
      if (tIsHost) simulateTAIMatch(match);
      showTSpectate(match);
      return;
    }

    // Spectator
    if (!amP1 && !amP2) {
      tMyMatchRole = 'spectator';
      showTSpectate(match);
      return;
    }

    tMyMatchRole = amP1 ? 'p1' : 'p2';

    var me        = amP1 ? match.p1       : match.p2;
    var them      = amP1 ? match.p2       : match.p1;
    var myState   = amP1 ? match.p1_state : match.p2_state;
    var themState = amP1 ? match.p2_state : match.p1_state;

    if (isNewMatch) {
      player1 = createPlayer(me.name, me.avatar);
      player2 = createPlayer(them.name, them.avatar);
      if (them.isAI) player2.difficulty = them.difficulty || 'medium';
      document.getElementById('player1Title').innerText = me.name + ' (You)';
      document.getElementById('enemyTitle').innerText   = them.name;
      hideTournamentUI();
      showGame();
      var tbb = document.getElementById('tBracketBtn');
      if (tbb) tbb.style.display = 'block';
    }

    player1.lives = myState.lives; player1.bullets = myState.bullets; player1.shields = myState.shields;
    player2.lives = themState.lives; player2.bullets = themState.bullets; player2.shields = themState.shields;
    updateUI();
    if (match.result) showResult(match.result);

    if (them.isAI) {
      mode = 'tournament-ai';
      if (isNewMatch) {
        player1Move = null; player2Move = null;
        document.getElementById('result').innerText = '';
        startRound();
      }
    } else {
      mode = 'tournament-net';
      if (isNewMatch) {
        document.getElementById('result').innerText = '';
        startTNetRound();
      } else if (isNewRound) {
        setTimeout(startTNetRound, 1500);
      }
    }
  }

  // ── Human vs Human (tournament-net) round ─────────────────────
  function startTNetRound() {
    player1Move = null;
    player2Move = null;
    document.getElementById('result').innerText = '';
    setButtonsLocked(true);
    showReadyGo(function () {
      setButtonsLocked(false);
      updateActionButtons();
      runCountdown(function () {
        if (!tMoveSubmitted) submitTNetMove('idle');
      });
    });
  }

  function submitTNetMove(move) {
    if (tMoveSubmitted) return;
    if (move === 'shoot' && player1.bullets <= 0) {
      showResult('🚫 No bullets — reload first!');
      return;
    }
    tMoveSubmitted = true;
    player1Move    = move;
    showResult('Locked in — waiting for opponent…');
    updateActionButtons();

    var moveUpdate = Object.assign({}, tActiveMatch, (tMyMatchRole === 'p1') ? {p1_move: move} : {p2_move: move});
    sb.from('tournaments').update({active_match: moveUpdate}).eq('code', tCode).then(function () {});
  }

  function resolveTNetRound(match) {
    var p1S = Object.assign({}, match.p1_state);
    var p2S = Object.assign({}, match.p2_state);

    // Animate from the resolver's visual perspective (player1 = me, player2 = them)
    var myMove   = tMyMatchRole === 'p1' ? match.p1_move : match.p2_move;
    var themMove = tMyMatchRole === 'p1' ? match.p2_move : match.p1_move;
    var myState  = tMyMatchRole === 'p1' ? p1S : p2S;
    var themSt   = tMyMatchRole === 'p1' ? p2S : p1S;
    animateMoves(myMove, themMove, myState.bullets > 0, themSt.bullets > 0);

    if      ((myMove === 'shoot' && myState.bullets > 0) || (themMove === 'shoot' && themSt.bullets > 0)) playSound('shoot');
    else if (myMove === 'reload' || themMove === 'reload') playSound('reload');
    else if (myMove === 'defend' || themMove === 'defend') playSound('defend');

    var res = applyNetworkRules(match.p1_move, match.p2_move, p1S, p2S, match.p1.name, match.p2.name);

    var mW = null, mWP = null;
    if      (p1S.lives <= 0 && p2S.lives <= 0) { mW = 'p1'; mWP = match.p1; }
    else if (p1S.lives <= 0)                    { mW = 'p2'; mWP = match.p2; }
    else if (p2S.lives <= 0)                    { mW = 'p1'; mWP = match.p1; }

    var updated = Object.assign({}, match, {
      p1_state: p1S, p2_state: p2S, result: res,
      round_num: match.round_num + 1, winner: mW, winner_player: mWP,
      p1_move: null, p2_move: null
    });

    if (!mW) {
      // Pre-update local round tracking before write (microtasks ensure .then() runs first)
      tRoundNum_t    = updated.round_num;
      tMoveSubmitted = false;
      resolving      = false;
    }

    sb.from('tournaments').update({
      active_match: updated
    }).eq('code', tCode).then(function () {
      if (!mW) {
        // Sync local state and continue
        var myS   = (tMyMatchRole === 'p1') ? p1S : p2S;
        var themS = (tMyMatchRole === 'p1') ? p2S : p1S;
        player1.lives = myS.lives; player1.bullets = myS.bullets; player1.shields = myS.shields;
        player2.lives = themS.lives; player2.bullets = themS.bullets; player2.shields = themS.shields;
        showResult(res);
        updateUI();
        setTimeout(startTNetRound, 1500);
      }
    });
  }

  // ── AI vs AI (host simulates instantly) ───────────────────────
  function simulateTAIMatch(match) {
    var w   = Math.random() < 0.5 ? 'p1' : 'p2';
    var wP  = w === 'p1' ? match.p1 : match.p2;
    sb.from('tournaments').update({
      active_match: Object.assign({}, match, {winner: w, winner_player: wP, result: wP.name + ' wins!'})
    }).eq('code', tCode).then(function () {});
  }

  // ── Match end & bracket advance ───────────────────────────────
  function handleTMatchEnd(row, match) {
    if (match.match_idx === tLastHandledEnd) return;
    tLastHandledEnd = match.match_idx;
    clearInterval(countdownTimer);

    var wp  = match.winner_player || (match.winner === 'p1' ? match.p1 : match.p2);
    var msg = wp ? '⚔️ ' + wp.name + ' wins this match!' : '⚔️ Match over!';

    if (tMyMatchRole === 'spectator') {
      updateTSpectate(match);
    } else {
      if (match.result) showResult(match.result);
      var myS = (tMyMatchRole === 'p1') ? match.p1_state : match.p2_state;
      if (myS) { player1.lives = myS.lives; player1.bullets = myS.bullets; player1.shields = myS.shields; }
      updateUI();
    }

    setTimeout(function () {
      showOverlay(msg, function () {
        if (tIsHost) advanceTBracket(row, match);
        // Show wait page for participants; spectators stay on spectate
        if (tMyMatchRole !== 'spectator') {
          var myId = getProfile().id;
          var wp2  = match.winner_player || (match.winner === 'p1' ? match.p1 : match.p2);
          showTournamentWaitPage(!!(wp2 && wp2.id === myId));
        }
      });
    }, 400);
  }

  function advanceTBracket(row, match) {
    var matches = JSON.parse(JSON.stringify(row.matches || tMatches));
    var mIdx    = (match.match_idx !== undefined) ? match.match_idx : row.current_match_idx;

    matches[mIdx].winner        = match.winner;
    matches[mIdx].winner_player = match.winner_player || (match.winner === 'p1' ? match.p1 : match.p2);

    // Fill slots in future rounds
    matches.forEach(function (m) {
      if (m.src_p1 === mIdx) m.p1 = matches[mIdx].winner_player;
      if (m.src_p2 === mIdx) m.p2 = matches[mIdx].winner_player;
    });

    var nextIdx = mIdx + 1;

    // Auto-skip consecutive AI vs AI matches
    while (nextIdx < matches.length &&
           matches[nextIdx].p1 && matches[nextIdx].p2 &&
           matches[nextIdx].p1.isAI && matches[nextIdx].p2.isAI) {
      var w  = Math.random() < 0.5 ? 'p1' : 'p2';
      matches[nextIdx].winner        = w;
      matches[nextIdx].winner_player = w === 'p1' ? matches[nextIdx].p1 : matches[nextIdx].p2;
      matches.forEach(function (m) {
        if (m.src_p1 === nextIdx) m.p1 = matches[nextIdx].winner_player;
        if (m.src_p2 === nextIdx) m.p2 = matches[nextIdx].winner_player;
      });
      nextIdx++;
    }

    if (nextIdx >= matches.length) {
      var champ = matches[nextIdx - 1].winner_player;
      sb.from('tournaments').update({
        status: 'done', matches: matches, current_match_idx: nextIdx - 1,
        champion_id: champ ? champ.id : null, active_match: null
      }).eq('code', tCode).then(function () {});
      return;
    }

    var nm = matches[nextIdx];
    sb.from('tournaments').update({
      matches: matches, current_match_idx: nextIdx,
      active_match: makeTActiveMatch(nm.p1, nm.p2, nextIdx)
    }).eq('code', tCode).then(function () {});
  }

  // ── Spectator view ────────────────────────────────────────────
  function showTSpectate(match) {
    var h  = document.getElementById('tSpectateHeader');
    var a1 = document.getElementById('tSpec1Avatar');
    var a2 = document.getElementById('tSpec2Avatar');
    var n1 = document.getElementById('tSpec1Name');
    var n2 = document.getElementById('tSpec2Name');
    if (h)  h.innerText  = 'Match ' + (match.match_idx + 1) + ' — Round ' + match.round_num;
    if (a1) a1.innerText = match.p1 ? match.p1.avatar : '?';
    if (a2) a2.innerText = match.p2 ? match.p2.avatar : '?';
    if (n1) n1.innerText = match.p1 ? match.p1.name : '?';
    if (n2) n2.innerText = match.p2 ? match.p2.name : '?';
    updateTSpectate(match);
    showPage('page-tournament-spectate');
  }

  function updateTSpectate(match) {
    var p1S = match.p1_state || {};
    var p2S = match.p2_state || {};
    var set = function (id, val) { var el = document.getElementById(id); if (el) el.innerText = val; };
    var setH = function (id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; };
    setH('tSpec1Lives',  renderHearts(Math.max(0, p1S.lives || 0), 3));
    setH('tSpec2Lives',  renderHearts(Math.max(0, p2S.lives || 0), 3));
    set('tSpec1Bullets', p1S.bullets !== undefined ? p1S.bullets : 3);
    set('tSpec2Bullets', p2S.bullets !== undefined ? p2S.bullets : 3);
    set('tSpec1Shields', p1S.shields !== undefined ? p1S.shields : 3);
    set('tSpec2Shields', p2S.shields !== undefined ? p2S.shields : 3);
    if (match.result) set('tSpectateResult', match.result);
    set('tSpectateHeader', 'Match ' + (match.match_idx + 1) + ' — Round ' + match.round_num);
  }

  // ══════════════════════════════════════════════════════════════
  //  BRACKET OVERLAY
  // ══════════════════════════════════════════════════════════════
  function openBracket() {
    var el = document.getElementById('bracketOverlay');
    if (!el) return;
    el.style.display = 'flex';
    renderBracket();
  }

  function closeBracket() {
    var el = document.getElementById('bracketOverlay');
    if (el) el.style.display = 'none';
  }

  function watchCurrentMatch() {
    closeBracket();
    if (tActiveMatch && !tActiveMatch.winner) {
      showTSpectate(tActiveMatch);
    } else {
      openBracket();
    }
  }

  // ── Bracket renderer ──────────────────────────────────────────
  function renderBracket() {
    var el = document.getElementById('bracketTree');
    if (!el) return;

    if (!tMatches || !tMatches.length) {
      el.innerHTML = '<p class="bracket-empty">Bracket will appear once the tournament starts.</p>';
      return;
    }

    // Group matches by round
    var roundMap = {}, maxRound = 0;
    tMatches.forEach(function (m) {
      if (!roundMap[m.round]) roundMap[m.round] = [];
      roundMap[m.round].push(m);
      if (m.round > maxRound) maxRound = m.round;
    });

    var r1Count = (roundMap[1] || []).length;
    el.style.minHeight = Math.max(240, r1Count * 130) + 'px';

    var html = '';
    for (var r = 1; r <= maxRound; r++) {
      var rLabel = r === maxRound ? '🏆 Final' : (r === maxRound - 1 && maxRound > 2 ? 'Semi-Finals' : 'Round ' + r);
      html += '<div class="bracket-round"><div class="bracket-round-label">' + rLabel + '</div>';
      html += '<div class="bracket-slots-col">';
      (roundMap[r] || []).forEach(function (m) {
        var isActive = !!(tActiveMatch && tActiveMatch.match_idx === m.match_num && !m.winner);
        html += '<div class="bracket-match' + (isActive ? ' bm-active' : '') + '" data-mn="' + m.match_num + '">';
        var am = (isActive && tActiveMatch) ? tActiveMatch : null;
        html += renderBSlot(m.p1, am ? am.p1_state : null, m.winner, 'p1');
        html += renderBSlot(m.p2, am ? am.p2_state : null, m.winner, 'p2');
        html += '</div>';
      });
      html += '</div></div>';
    }
    el.innerHTML = html;
    requestAnimationFrame(drawBracketConnectors);
  }

  function renderBSlot(player, state, matchWinner, side) {
    if (!player) return '<div class="bracket-slot bs-tbd">TBD</div>';

    var won  = (matchWinner === side);
    var lost = !!(matchWinner && matchWinner !== side);
    var lives = state ? state.lives : (lost ? 0 : 3);
    var hp = '';
    for (var i = 0; i < 3; i++) hp += i < lives ? '❤️' : '🖤';

    var cls = 'bracket-slot' + (won ? ' bs-won' : lost ? ' bs-lost' : state ? ' bs-playing' : '');
    return '<div class="' + cls + '">' +
      '<span class="bs-avatar">' + (player.avatar || '🤠') + '</span>' +
      '<div class="bs-text">' +
        '<span class="bs-name">' + player.name + '</span>' +
        '<span class="bs-hp">' + hp + '</span>' +
      '</div>' +
    '</div>';
  }

  // ── SVG connector lines ───────────────────────────────────────
  function getRelOffset(el, parent) {
    var top = 0, left = 0, cur = el;
    while (cur && cur !== parent) { top += cur.offsetTop; left += cur.offsetLeft; cur = cur.offsetParent; }
    return {top: top, left: left};
  }

  function drawBracketConnectors() {
    var tree = document.getElementById('bracketTree');
    if (!tree || !tMatches) return;
    var old = document.getElementById('bracketSVG');
    if (old) old.remove();

    var ns  = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.id = 'bracketSVG';
    svg.setAttribute('style', 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible');
    tree.style.position = 'relative';
    tree.appendChild(svg);

    tMatches.forEach(function (m) {
      if (m.src_p1 === undefined || m.src_p2 === undefined) return;

      var el1 = tree.querySelector('[data-mn="' + m.src_p1 + '"]');
      var el2 = tree.querySelector('[data-mn="' + m.src_p2 + '"]');
      var elD = tree.querySelector('[data-mn="' + m.match_num + '"]');
      if (!el1 || !el2 || !elD) return;

      var o1 = getRelOffset(el1, tree), o2 = getRelOffset(el2, tree), oD = getRelOffset(elD, tree);
      var x1 = o1.left + el1.offsetWidth,  y1 = o1.top + el1.offsetHeight / 2;
      var x2 = o2.left + el2.offsetWidth,  y2 = o2.top + el2.offsetHeight / 2;
      var xD = oD.left,                    yD = oD.top + elD.offsetHeight / 2;
      var xM = Math.round(x1 + (xD - x1) * 0.5);
      var yM = Math.round((y1 + y2) / 2);
      var color = '#c9956a';

      // Smooth cubic bezier: source → midpoint junction
      drawSVGPath(svg, ns,
        'M ' + r(x1) + ',' + r(y1) + ' C ' + r(xM) + ',' + r(y1) + ' ' + r(xM) + ',' + r(yM) + ' ' + r(xM) + ',' + r(yM),
        color);
      drawSVGPath(svg, ns,
        'M ' + r(x2) + ',' + r(y2) + ' C ' + r(xM) + ',' + r(y2) + ' ' + r(xM) + ',' + r(yM) + ' ' + r(xM) + ',' + r(yM),
        color);
      // Junction → destination
      drawSVGPath(svg, ns,
        'M ' + r(xM) + ',' + r(yM) + ' C ' + r(xM) + ',' + r(yD) + ' ' + r(xD) + ',' + r(yD) + ' ' + r(xD) + ',' + r(yD),
        color);
    });
  }

  function r(n) { return Math.round(n); }

  function drawSVGPath(svg, ns, d, color) {
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
  }

  // ── Tournament wait page ──────────────────────────────────────
  function showTournamentWaitPage(won) {
    var title = document.getElementById('tWaitTitle');
    var msg   = document.getElementById('tWaitMsg');
    var elim  = document.getElementById('tWaitElimSection');
    if (title) title.innerText = won ? '✅ You Won!' : '💀 Eliminated!';
    if (msg)   msg.innerText   = won
      ? 'Waiting for your next opponent…'
      : "You're out! Watch the rest or head to the menu whenever you're ready.";
    if (elim) elim.style.display = won ? 'none' : 'block';
    showPage('page-tournament-wait');
  }

  // ── Boot ──────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', goToMenu);

  // ── Expose to HTML ────────────────────────────────────────────
  window.startGame     = startGame;
  window.startVsAI     = startVsAI;
  window.chooseMove    = chooseMove;
  window.showMenu      = showMenu;
  window.showPage      = showPage;
  window.createProfile = createProfile;
  window.selectAvatar  = selectAvatar;
  window.openLobbyPage = openLobbyPage;
  window.createLobby   = createLobby;
  window.joinLobby     = joinLobby;
  window.cancelLobby   = cancelLobby;

  window.openTournamentPage = openTournamentPage;
  window.createTournament   = createTournament;
  window.joinTournament     = joinTournament;
  window.startTournament    = startTournament;
  window.leaveTournament    = leaveTournament;
  window.addTournamentBot   = addTournamentBot;
  window.openProfileEdit    = openProfileEdit;
  window.openBracket        = openBracket;
  window.closeBracket       = closeBracket;
  window.watchCurrentMatch  = watchCurrentMatch;
  window.copyLobbyCode      = copyLobbyCode;

})();
