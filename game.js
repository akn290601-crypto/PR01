(() => {
  const COLS = 4, ROWS = 4;
  const PLAYER = 'oda';

  const FACTIONS = {
    oda:      { name: '織田家', color: '#c0392b' },
    imagawa:  { name: '今川家', color: '#2f6fb3' },
    takeda:   { name: '武田家', color: '#2f8f4e' },
    uesugi:   { name: '上杉家', color: '#7d4fb3' },
    neutral:  { name: '中立',   color: '#6b6b6b' },
  };

  const RAW_PROVINCES = [
    { id: 'echigo',    name: '越後', row: 0, col: 0, faction: 'uesugi' },
    { id: 'kozuke',    name: '上野', row: 0, col: 1, faction: 'uesugi' },
    { id: 'musashi',   name: '武蔵', row: 0, col: 2, faction: 'neutral' },
    { id: 'sagami',    name: '相模', row: 0, col: 3, faction: 'neutral' },
    { id: 'shinano',   name: '信濃', row: 1, col: 0, faction: 'takeda' },
    { id: 'kai',       name: '甲斐', row: 1, col: 1, faction: 'takeda' },
    { id: 'suruga',    name: '駿河', row: 1, col: 2, faction: 'imagawa' },
    { id: 'izu',       name: '伊豆', row: 1, col: 3, faction: 'imagawa' },
    { id: 'kaga',      name: '加賀', row: 2, col: 0, faction: 'neutral' },
    { id: 'mino',      name: '美濃', row: 2, col: 1, faction: 'oda' },
    { id: 'owari',     name: '尾張', row: 2, col: 2, faction: 'oda' },
    { id: 'mikawa',    name: '三河', row: 2, col: 3, faction: 'imagawa' },
    { id: 'yamashiro', name: '山城', row: 3, col: 0, faction: 'neutral' },
    { id: 'oumi',      name: '近江', row: 3, col: 1, faction: 'neutral' },
    { id: 'ise',       name: '伊勢', row: 3, col: 2, faction: 'neutral' },
    { id: 'kii',       name: '紀伊', row: 3, col: 3, faction: 'neutral' },
  ];

  let provinces = [];
  let turn = 1;
  let selectedId = null;
  let queuedActions = {}; // provinceId -> {type, targetId}
  let gameOver = false;

  const rand = (n) => Math.floor(Math.random() * n);

  function freshProvinces() {
    return RAW_PROVINCES.map(p => {
      const isNeutral = p.faction === 'neutral';
      return {
        ...p,
        koku: isNeutral ? 700 + rand(300) : 1000 + rand(400),
        gold: isNeutral ? 150 : 400,
        soldiers: isNeutral ? 120 + rand(80) : 350 + rand(150),
        devLevel: 1,
        defense: isNeutral ? 1 : 2,
      };
    }).map(p => ({ ...p, maxSoldiers: 500 + p.devLevel * 300 }));
  }

  function byId(id) { return provinces.find(p => p.id === id); }

  function neighborsOf(p) {
    return provinces.filter(o =>
      (o.row === p.row && Math.abs(o.col - p.col) === 1) ||
      (o.col === p.col && Math.abs(o.row - p.row) === 1)
    );
  }

  const logEl = document.getElementById('log');
  const logLines = [];
  function log(msg) {
    logLines.push(msg);
    if (logLines.length > 40) logLines.shift();
    logEl.innerHTML = logLines.slice(-6).map(l => `<div>${l}</div>`).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  function doDevelop(p) {
    p.koku = Math.min(3000, p.koku + 150);
    if (p.koku > p.devLevel * 900) {
      p.devLevel += 1;
      p.maxSoldiers = 500 + p.devLevel * 300;
    }
    return `${p.name}は内政に努めた(石高UP)`;
  }

  function doTrain(p) {
    if (p.soldiers >= p.maxSoldiers) return `${p.name}はこれ以上兵を増やせない`;
    const amount = Math.min(100, p.maxSoldiers - p.soldiers);
    const cost = amount * 2;
    if (p.gold < cost) return `${p.name}は資金不足で訓練できなかった`;
    p.gold -= cost;
    p.soldiers += amount;
    return `${p.name}で兵を訓練した(+${amount})`;
  }

  function doAttack(attacker, defender) {
    const atkPower = attacker.soldiers * (0.8 + Math.random() * 0.4);
    const defPower = defender.soldiers * (0.8 + Math.random() * 0.4) * (1 + defender.defense * 0.15);
    if (atkPower > defPower) {
      const losses = Math.floor(attacker.soldiers * Math.min(0.6, defPower / atkPower));
      attacker.soldiers = Math.max(0, attacker.soldiers - losses);
      const garrison = Math.floor(attacker.soldiers * 0.35);
      attacker.soldiers -= garrison;
      const prevOwner = FACTIONS[defender.faction].name;
      defender.faction = attacker.faction;
      defender.soldiers = garrison;
      defender.gold = Math.floor(defender.gold * 0.5);
      defender.defense = Math.max(1, defender.defense - 1);
      return `${FACTIONS[attacker.faction].name}が${defender.name}(${prevOwner})を攻め落とした!`;
    } else {
      const losses = Math.floor(attacker.soldiers * 0.4);
      attacker.soldiers = Math.max(0, attacker.soldiers - losses);
      const defLosses = Math.floor(defender.soldiers * 0.2);
      defender.soldiers = Math.max(0, defender.soldiers - defLosses);
      return `${FACTIONS[attacker.faction].name}の${defender.name}侵攻は失敗した…`;
    }
  }

  function aiDecide(p) {
    const enemyNeighbors = neighborsOf(p).filter(n => n.faction !== p.faction);
    if (p.soldiers < p.maxSoldiers * 0.5 && p.gold >= 100) {
      return { type: 'train' };
    }
    if (enemyNeighbors.length) {
      const weakest = enemyNeighbors.reduce((a, b) => (a.soldiers < b.soldiers ? a : b));
      if (p.soldiers > weakest.soldiers * 1.25) {
        return { type: 'attack', targetId: weakest.id };
      }
    }
    return { type: 'develop' };
  }

  function incomePhase() {
    provinces.forEach(p => {
      p.gold += Math.floor(p.koku / 10);
    });
  }

  function resolveTurn() {
    if (gameOver) return;

    // Decide every faction's action against the same pre-turn snapshot,
    // so one faction's move this turn can't trigger a same-turn chain
    // reaction from provinces that haven't acted yet.
    const decisions = [];

    Object.keys(queuedActions).forEach(pid => {
      const p = byId(pid);
      if (p && p.faction === PLAYER) decisions.push({ p, act: queuedActions[pid], isPlayer: true });
    });
    queuedActions = {};

    provinces
      .filter(p => p.faction !== PLAYER && p.faction !== 'neutral')
      .forEach(p => decisions.push({ p, act: aiDecide(p), isPlayer: false }));

    decisions.forEach(({ p, act, isPlayer }) => {
      if (act.type === 'develop') {
        const msg = doDevelop(p);
        if (isPlayer) log(msg);
      } else if (act.type === 'train') {
        const msg = doTrain(p);
        if (isPlayer) log(msg);
      } else if (act.type === 'attack') {
        const target = byId(act.targetId);
        if (target && target.faction !== p.faction) log(doAttack(p, target));
      }
    });

    incomePhase();

    turn += 1;
    checkGameOver();
    render();
  }

  function checkGameOver() {
    const playerCount = provinces.filter(p => p.faction === PLAYER).length;
    const rivalFactions = ['imagawa', 'takeda', 'uesugi'];
    const rivalsAlive = rivalFactions.filter(f => provinces.some(p => p.faction === f));

    if (playerCount === 0) {
      endGame(false, '織田家は全ての領地を失い、天下統一の夢は潰えた。');
    } else if (playerCount === provinces.length) {
      endGame(true, '織田家は全国を平定し、天下統一を果たした!');
    } else if (rivalsAlive.length === 0) {
      endGame(true, '全てのライバル大名を滅ぼした!(中立の国は残っている)');
    }
  }

  function endGame(won, text) {
    gameOver = true;
    document.getElementById('resultTitle').textContent = won ? '勝利' : '敗北';
    document.getElementById('resultText').textContent = text;
    document.getElementById('resultOverlay').classList.remove('hidden');
  }

  // ---------- Rendering ----------

  function render() {
    renderTurnInfo();
    renderFactionBar();
    renderMap();
    if (selectedId) renderPanel(byId(selectedId));
  }

  function renderTurnInfo() {
    const year = Math.floor((turn - 1) / 12) + 1;
    const month = ((turn - 1) % 12) + 1;
    document.getElementById('turnInfo').textContent = `${year}年目 ${month}月`;
  }

  function renderFactionBar() {
    const bar = document.getElementById('factionBar');
    bar.innerHTML = Object.keys(FACTIONS).filter(f => f !== 'neutral').map(f => {
      const count = provinces.filter(p => p.faction === f).length;
      const dead = count === 0;
      return `<div class="factionChip ${dead ? 'eliminated' : ''}">
        <span class="dot" style="background:${FACTIONS[f].color}"></span>
        ${FACTIONS[f].name} ${count}国
      </div>`;
    }).join('');
  }

  function renderMap() {
    const map = document.getElementById('map');
    map.innerHTML = '';
    provinces.forEach(p => {
      const cell = document.createElement('div');
      cell.className = 'cell' + (p.faction === PLAYER ? ' player-owned' : '');
      cell.style.background = FACTIONS[p.faction].color;
      cell.style.gridRow = p.row + 1;
      cell.style.gridColumn = p.col + 1;
      cell.innerHTML = `<div class="pname">${p.name}</div><div class="psoldiers">兵${p.soldiers}</div>`;
      cell.addEventListener('click', () => openPanel(p.id));
      map.appendChild(cell);
    });
  }

  function openPanel(id) {
    selectedId = id;
    renderPanel(byId(id));
    document.getElementById('panelOverlay').classList.remove('hidden');
  }

  function closePanel() {
    selectedId = null;
    document.getElementById('panelOverlay').classList.add('hidden');
  }

  function renderPanel(p) {
    document.getElementById('panelTitle').textContent = p.name;
    document.getElementById('panelOwner').innerHTML =
      `<span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${FACTIONS[p.faction].color};margin-right:4px;"></span>${FACTIONS[p.faction].name}`;

    document.getElementById('panelStats').innerHTML = `
      <div><span class="k">石高</span> <span class="v">${p.koku}</span></div>
      <div><span class="k">資金</span> <span class="v">${p.gold}</span></div>
      <div><span class="k">兵力</span> <span class="v">${p.soldiers} / ${p.maxSoldiers}</span></div>
      <div><span class="k">守備力</span> <span class="v">${p.defense}</span></div>
    `;

    const actionsEl = document.getElementById('panelActions');
    const targetsEl = document.getElementById('panelTargets');
    targetsEl.classList.add('hidden');
    targetsEl.innerHTML = '';

    const isPlayerOwned = p.faction === PLAYER;
    const already = queuedActions[p.id];

    if (!isPlayerOwned) {
      actionsEl.innerHTML = `<div style="font-size:13px;color:#8a7d64;">他勢力の国です(偵察情報のみ表示)</div>`;
      return;
    }

    actionsEl.innerHTML = `
      <button class="actionBtn" id="btnDevelop" ${already ? 'disabled' : ''}>内政(石高を上げる)</button>
      <button class="actionBtn" id="btnTrain" ${already ? 'disabled' : ''}>兵を訓練する</button>
      <button class="actionBtn attack" id="btnAttack" ${already ? 'disabled' : ''}>出兵する</button>
      ${already ? `<div style="font-size:12px;color:#e0c98a;margin-top:6px;">今月のコマンド設定済み</div>` : ''}
    `;

    document.getElementById('btnDevelop').addEventListener('click', () => {
      queuedActions[p.id] = { type: 'develop' };
      renderPanel(p);
    });
    document.getElementById('btnTrain').addEventListener('click', () => {
      queuedActions[p.id] = { type: 'train' };
      renderPanel(p);
    });
    document.getElementById('btnAttack').addEventListener('click', () => {
      const targets = neighborsOf(p).filter(n => n.faction !== p.faction);
      if (!targets.length) {
        targetsEl.classList.remove('hidden');
        targetsEl.innerHTML = `<div style="font-size:12px;color:#8a7d64;">隣接する敵国がありません</div>`;
        return;
      }
      targetsEl.classList.remove('hidden');
      targetsEl.innerHTML = targets.map(t =>
        `<button class="targetBtn" data-target="${t.id}">${t.name}(${FACTIONS[t.faction].name} / 兵${t.soldiers})</button>`
      ).join('');
      targetsEl.querySelectorAll('.targetBtn').forEach(btn => {
        btn.addEventListener('click', () => {
          queuedActions[p.id] = { type: 'attack', targetId: btn.dataset.target };
          renderPanel(p);
        });
      });
    });
  }

  function init() {
    provinces = freshProvinces();
    turn = 1;
    selectedId = null;
    queuedActions = {};
    gameOver = false;
    logLines.length = 0;
    log('織田家の当主として、天下統一を目指せ。');
    document.getElementById('resultOverlay').classList.add('hidden');
    render();
  }

  document.getElementById('panelClose').addEventListener('click', closePanel);
  document.getElementById('nextTurnBtn').addEventListener('click', resolveTurn);
  document.getElementById('restartBtn').addEventListener('click', init);

  init();
})();
