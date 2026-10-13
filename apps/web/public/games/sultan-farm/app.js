(() => {
  const G = window.FarmGame,
    $ = (id) => document.getElementById(id),
    num = (n) => Number(n).toLocaleString('ar-SA'),
    remaining = (t) => Math.max(0, Math.ceil((t - Date.now()) / 1000));
  const KEY =
    'mamluk-farm-v1:' + (new URLSearchParams(location.search).get('save') || 'standalone');
  let state = G.initial(),
    tab = 'farm',
    selection = null,
    mode = null,
    world = null,
    saveAvailable = true,
    toastTimer,
    timer,
    disposed = false;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const restored = G.migrate(JSON.parse(raw));
      if (restored) state = restored;
      else notify('تعذر قراءة الحفظ القديم؛ بدأت مزرعة جديدة');
    }
  } catch {
    saveAvailable = false;
  }
  G.settle(state);
  const titles = {
    farm: ['من الأرض إلى السوق', 'حقول المزرعة'],
    build: ['مدينتك… على طريقتك', 'البناء والتطوير'],
    production: ['سلاسل صناعة مترابطة', 'ورش الإنتاج'],
    orders: ['خيراتك في طريقها إلى المدن', 'طلبات السوق'],
    transport: ['قوافل البر وسفن البحر', 'مركز التجارة'],
    inventory: ['كل محصول له قيمة', 'مخزن السلطان'],
    quests: ['كل إنجاز يبني إرثًا', 'طريق الازدهار'],
  };
  function notify(message) {
    $('toast').textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      $('toast').textContent = '';
    }, 4500);
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      saveAvailable = true;
    } catch {
      saveAvailable = false;
    }
    $('save-note').textContent = saveAvailable
      ? '✓ يُحفظ التقدم تلقائيًا على هذا الجهاز'
      : 'الحفظ غير متاح؛ أبقِ الصفحة مفتوحة';
  }
  function perform(type, arg) {
    // Reconcile a second tab before spending ingredients or collecting a timed reward.
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const fresh = G.migrate(JSON.parse(raw));
        if (fresh) state = fresh;
      }
    } catch {}
    const previous = G.level(state),
      message = G.act(state, type, arg);
    if (
      (type === 'build' && message.startsWith('بدأ بناء')) ||
      (type === 'move' && message.startsWith('نُقل'))
    )
      mode = null;
    if (type === 'plot') selection = { type: 'plot', id: arg };
    save();
    render();
    notify(message);
    if (G.level(state) > previous)
      notify(
        `ارتقيت إلى المستوى ${num(G.level(state))}! افتح البناء لاكتشاف منشآت ومحاصيل جديدة ✦`,
      );
  }
  function chooseTab(next) {
    if (!titles[next]) return;
    tab = next;
    mode = null;
    selection = null;
    $('side-panel').classList.remove('collapsed');
    $('toggle-panel').setAttribute('aria-expanded', 'true');
    render();
    $('panel-content').scrollTop = 0;
  }
  function ingredientList(items) {
    return `<div class="requirements">${Object.entries(items)
      .map(
        ([k, n]) =>
          `<span class="requirement ${state.inventory[k] >= n ? 'enough' : ''}">${G.goods[k].icon} ${G.goods[k].name} ${num(state.inventory[k])}/${num(n)}</span>`,
      )
      .join('')}</div>`;
  }
  function button(action, id, text, disabled = false, secondary = false) {
    return `<button class="${secondary ? 'secondary' : 'primary'}" data-action="${action}" ${id === undefined ? '' : `data-id="${id}"`} ${disabled ? 'disabled' : ''}>${text}</button>`;
  }
  function cropPanel() {
    return `<p class="panel-copy">اختر البذرة ثم اضغط على الحقل هنا أو في العالم. القمح مجاني، والنمو يستمر أثناء غيابك.</p><div class="seed-grid">${Object.entries(
      G.crops,
    )
      .map(
        ([k, c]) =>
          `<button class="seed" data-action="select" data-id="${k}" aria-pressed="${state.selected === k}" ${G.level(state) < c.level ? 'disabled' : ''}><span>${c.icon}</span>${c.name}<small>${G.level(state) < c.level ? 'مستوى ' + num(c.level) : c.cost ? num(c.cost) + ' 🪙' : 'مجاني'}</small></button>`,
      )
      .join(
        '',
      )}</div><div class="section-label"><strong>${num(state.plots.length)} حقول</strong><small>المحدد: ${G.crops[state.selected].name}</small></div><div class="field-grid">${state.plots
      .map((p, i) => {
        const ready = p && remaining(p.ready) === 0;
        return `<button class="field" data-action="plot" data-id="${i}" data-plot="${i}" data-ready="${!!ready}" aria-pressed="${selection?.type === 'plot' && selection.id === i}" aria-label="الحقل ${num(i + 1)}، ${p ? G.crops[p.crop].name : 'فارغ'}، ${ready ? 'جاهز للحصاد' : p ? 'ينمو' : 'اضغط للزراعة'}"><span class="field-icon">${p ? G.crops[p.crop].icon : '＋'}</span><strong>الحقل ${num(i + 1)}</strong><small>${ready ? 'جاهز للحصاد' : p ? num(remaining(p.ready)) + ' ث' : 'ازرع ' + G.crops[state.selected].name}</small>${p ? `<progress aria-label="نمو الحقل ${num(i + 1)}" max="${p.ready - p.start}" value="${Math.min(p.ready - p.start, Math.max(0, Date.now() - p.start))}"></progress>` : ''}</button>`;
      })
      .join(
        '',
      )}</div>${button('expand', undefined, state.plots.length >= 18 ? 'اكتملت توسعة الحقول' : '＋ حقلان جديدان · ' + num(G.expandCost(state)) + ' دينار', state.plots.length >= 18)}`;
  }
  function buildingPanel() {
    const occupied = Object.entries(state.positions);
    if (mode) {
      const name = G.buildingTypes[mode.kind || mode.move].name;
      return `<div class="card mode-card"><h3>${mode.move ? 'نقل' : 'بناء'} ${name}</h3><p>اضغط على قطعة الأرض الخضراء في العالم، أو اختر موقعًا من القائمة.</p><div class="slot-list">${G.buildSlots.map((p, i) => (occupied.some(([k, x]) => k !== mode.move && x[0] === p[0] && x[1] === p[1]) ? '' : `<button data-action="slot" data-id="${i}">قطعة ${num(i + 1)}</button>`)).join('')}</div>${button('cancelMode', undefined, 'إلغاء الاختيار', false, true)}</div>`;
    }
    return `<p class="panel-copy">ضع منشآتك على أرض شاغرة، ثم انقلها ورتبها كما تحب. زيادة السكان تفتح المصانع الأكبر.</p><div class="inline-stats"><span class="badge">👥 ${num(G.population(state))} سكان</span><span class="badge">🏘 ${num(Object.values(state.buildings).filter((n) => n > 0).length)} مبانٍ</span></div>${Object.entries(
      G.buildingTypes,
    )
      .map(([k, b]) => {
        const built = state.buildings[k],
          construction = state.construction[k],
          locked = G.level(state) < b.level || G.population(state) < b.population;
        return `<article class="card"><div class="card-head"><div class="card-icon">${b.icon}</div><div><h3>${b.name}</h3><small>${construction ? 'قيد البناء · ' + num(remaining(construction.ready)) + ' ث' : built ? 'المستوى ' + num(built) : 'يفتح في المستوى ' + num(b.level)}</small></div></div><p>${k === 'house' ? 'طوّر البيت لزيادة السكان وفتح المصانع.' : k === 'garden' ? 'مساحة خضراء لتجميل القرية.' : k === 'fountain' ? 'نافورة تزيّن قلب قريتك.' : 'منشأة إنتاج تعمل بمواد من مزرعتك.'}</p>${!built && !construction ? `<div class="inline-stats"><span>${num(b.cost)} 🪙</span><span>${num(b.time)} ثانية بناء</span>${b.population ? `<span>${num(b.population)} سكان</span>` : ''}</div>${button('place', k, 'اختر موقع البناء', locked || state.coins < b.cost)}` : construction ? `<progress aria-label="بناء ${b.name}" max="${construction.ready - construction.start}" value="${Math.max(0, Date.now() - construction.start)}"></progress>` : `<div class="action-row">${button('upgrade', k, built >= 3 ? 'أعلى مستوى' : 'تطوير · ' + num(G.upgradeCost(state, k)) + ' 🪙', built >= 3 || state.coins < G.upgradeCost(state, k))}${button('relocate', k, 'نقل المبنى', false, true)}</div>`}</article>`;
      })
      .join('')}`;
  }
  function factoryCard(k) {
    const b = G.buildingTypes[k],
      q = state.jobs[k] || [],
      ready = q.some((j) => j.ready <= Date.now()),
      available = Object.entries(G.recipes).filter(([, r]) => r.building === k);
    return `<article class="card" data-factory="${k}"><div class="card-head"><div class="card-icon">${b.icon}</div><div><h3>${b.name}</h3><small>المستوى ${num(state.buildings[k])} · طابور ${num(q.length)}/${num(Math.min(3, state.buildings[k] + 1))}</small></div></div>${['stable', 'coop'].includes(k) ? `<p>${k === 'stable' ? '🐄 ثلاثة أبقار تنتظر العلف الطازج' : '🐔 ثلاثة دجاجات تنتظر العلف الطازج'}</p>` : ''}${q.length ? `<div class="queue">${q.map((j) => `<div class="queue-item"><span>${G.goods[G.recipes[j.recipe].output].icon}</span>${G.recipes[j.recipe].name}<small>${remaining(j.ready) === 0 ? 'جاهز للاستلام' : Date.now() < j.start ? 'في الانتظار' : num(remaining(j.ready)) + ' ث'}</small></div>`).join('')}</div>${button('collect', k, 'استلم المنتجات', !ready)}` : ''}${available.map(([id, r]) => `<div class="recipe"><div class="recipe-head"><strong>${G.goods[r.output].icon} ${r.name} ×${num(r.amount)}</strong><small>${num(Math.ceil(r.time * (1 - (state.buildings[k] - 1) * 0.15)))} ث</small></div>${ingredientList(r.input)}${button('produce', id, G.level(state) < r.level ? 'مستوى ' + num(r.level) : '＋ أضف إلى الإنتاج', G.level(state) < r.level || q.length >= Math.min(3, state.buildings[k] + 1) || !G.requirements(state, r.input))}</div>`).join('')}<div class="action-row">${button('upgrade', k, state.buildings[k] >= 3 ? 'أعلى مستوى' : 'تطوير · ' + num(G.upgradeCost(state, k)) + ' 🪙', state.buildings[k] >= 3 || state.coins < G.upgradeCost(state, k), true)}${button('relocate', k, 'نقل', false, true)}</div></article>`;
  }
  function productionPanel() {
    const factories = Object.keys(G.buildingTypes).filter(
      (k) => state.buildings[k] && Object.values(G.recipes).some((r) => r.building === k),
    );
    return `<div class="guide-chain">قمح ← دقيق ← خبز<br>قمح ← علف ← حليب وبيض ← جبن<br>قطن ← قماش ← ثياب</div><p class="panel-copy" style="margin-top:12px">المواد تُستهلك عند إضافة المنتج. يمكنك تجهيز عدة منتجات؛ يعمل الطابور بالتتابع ويستمر أثناء غيابك.</p>${factories.map(factoryCard).join('')}${button('openBuild', undefined, 'افتح البناء لإضافة مصانع جديدة', false, true)}`;
  }
  function orderPanel() {
    return `<p class="panel-copy">سلّم خيرات المزرعة إلى الزبائن لتحصل على الدنانير والخبرة. يمكن تغيير الطلب مقابل ٥ دنانير.</p>${state.orderIds
      .map((id, i) => {
        const o = G.orderTemplates[id];
        return `<article class="card"><div class="card-head"><div class="card-icon">${o.icon}</div><div><h3>${o.name}</h3><small>${num(o.coins)} دينار · ${num(o.xp)} خبرة</small></div></div>${ingredientList(o.items)}${button('deliver', i, 'إرسال طلب السوق', !G.requirements(state, o.items))}<button class="text-button" data-action="skipOrder" data-id="${i}">طلب آخر · ٥ دنانير</button></article>`;
      })
      .join('')}<p class="panel-copy">تم تسليم ${num(state.deliveries)} طلبات إلى السوق.</p>`;
  }
  function transportPanel() {
    return `<p class="panel-copy">حمّل المنتجات وأرسلها برًا أو بحرًا. تعود الرحلات بالدنانير ومواد تطوير المخزن. لا تنسَ استلامها عند العودة.</p>${[
      'caravan',
      'ship',
    ]
      .map((k) => {
        const o = G.tripOffer(state, k),
          j = state.trips[k],
          locked = k === 'ship' && G.level(state) < 2;
        return `<article class="card"><div class="card-head"><div class="card-icon">${k === 'ship' ? '⛵' : '🐪'}</div><div><h3>${k === 'ship' ? 'ميناء السلطان' : 'قوافل المدن'}</h3><small>${locked ? 'يفتح في المستوى ٢' : j ? (remaining(j.ready) ? 'تعود خلال ' + num(remaining(j.ready)) + ' ث' : 'عادت الرحلة!') : 'جاهز للتحميل'}</small></div></div>${j ? `<progress aria-label="تقدم الرحلة" max="${j.ready - j.start}" value="${Math.min(j.ready - j.start, Date.now() - j.start)}"></progress>${button('collectTrip', k, 'استلم حمولة العودة', remaining(j.ready) > 0)}` : `${ingredientList(o.items)}<div class="inline-stats"><span>${num(o.reward)} 🪙</span><span>${num(o.xp)} ✦</span><span>${num(o.time)} ث</span><span>مواد توسعة</span></div>${button('trip', k, k === 'ship' ? 'أبحر بالسفينة' : 'أرسل القافلة', locked || !G.requirements(state, o.items))}`}</article>`;
      })
      .join(
        '',
      )}<div class="supplies"><span>🪵 خشب: ${num(state.supplies.wood)}</span><span>🧱 طوب: ${num(state.supplies.brick)}</span><span>🔩 مسامير: ${num(state.supplies.nails)}</span></div>`;
  }
  function inventoryPanel() {
    const used = G.stock(state) + G.reserved(state);
    return `<div class="card"><h3>المخزن · المستوى ${num(state.barnLevel)}</h3><div class="section-label"><strong>${num(used)} / ${num(state.capacity)}</strong><small>المحجوز للإنتاج: ${num(G.reserved(state))}</small></div><progress class="barn-bar" aria-label="سعة المخزن" max="${state.capacity}" value="${used}"></progress><p>بِع فائض المحاصيل أو سلّم الطلبات لتوفير مساحة.</p><div class="supplies"><span>🪵 ${num(state.supplies.wood)}</span><span>🧱 ${num(state.supplies.brick)}</span><span>🔩 ${num(state.supplies.nails)}</span></div>${button('barn', undefined, state.barnLevel >= 10 ? 'أكبر سعة' : 'زيادة السعة ٣٠ · ' + num(60 + state.barnLevel * 30) + ' 🪙', state.barnLevel >= 10)}${state.barnLevel >= 2 ? '<p style="margin-top:8px">يتطلب خشبًا وطوبًا ومسمارًا من رحلات التجارة.</p>' : ''}</div>${Object.entries(
      G.goods,
    )
      .map(
        ([k, g]) =>
          `<div class="stock-row"><span>${g.icon}</span><div>${g.name}<br><strong>${num(state.inventory[k])}</strong></div><button data-action="sell" data-id="${k}" data-amount="1" ${state.inventory[k] < 1 ? 'disabled' : ''}>بيع ١</button><button data-action="sell" data-id="${k}" data-amount="5" ${state.inventory[k] < 5 ? 'disabled' : ''}>بيع ٥</button></div>`,
      )
      .join('')}`;
  }
  function questPanel() {
    return `<p class="panel-copy">مكافآت واضحة لكل خطوة. افتح هدية اليوم من الخريطة، وواصل الزيارة لزيادة المكافأة.</p>${G.quests(
      state,
    )
      .map(
        (q, i) =>
          `<article class="card"><div class="quest-row"><strong>${q.name}</strong><small>${num(Math.min(q.value, q.max))}/${num(q.max)}</small></div><progress aria-label="${q.name}" max="${q.max}" value="${Math.min(q.value, q.max)}"></progress>${button('claim', i, state.claimed.includes(i) ? 'تم الاستلام ✓' : 'استلم ' + num(q.reward) + ' دينار', q.value < q.max || state.claimed.includes(i))}</article>`,
      )
      .join('')}`;
  }
  function render() {
    const focused = document.activeElement,
      identity = focused?.closest('#panel-content')
        ? { action: focused.dataset.action, id: focused.dataset.id, amount: focused.dataset.amount }
        : null;
    const scroll = $('panel-content').scrollTop;
    $('coins').textContent = num(state.coins);
    $('level').textContent = num(G.level(state));
    $('xp').value = state.xp % 60;
    $('storage').textContent =
      num(G.stock(state) + G.reserved(state)) + ' / ' + num(state.capacity);
    $('village-status').textContent =
      num(G.population(state)) +
      ' سكان · ' +
      num(state.plots.length) +
      ' حقول · ' +
      num(state.deliveries) +
      ' طلبات';
    $('panel-eyebrow').textContent = titles[tab][0];
    $('panel-title').textContent = titles[tab][1];
    document
      .querySelectorAll('[data-tab]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
    $('panel-content').innerHTML = {
      farm: cropPanel,
      build: buildingPanel,
      production: productionPanel,
      orders: orderPanel,
      transport: transportPanel,
      inventory: inventoryPanel,
      quests: questPanel,
    }[tab]();
    $('panel-content').scrollTop = scroll;
    if (identity?.action) {
      const b = [...$('panel-content').querySelectorAll('button')].find(
        (b) =>
          b.dataset.action === identity.action &&
          b.dataset.id === identity.id &&
          b.dataset.amount === identity.amount,
      );
      if (b && !b.disabled) b.focus({ preventScroll: true });
    }
    $('world-hint').textContent = mode
      ? 'اختر أرضًا خضراء لبناء أو نقل المنشأة'
      : 'اسحب لتدوير العالم · بإصبعين للتكبير والتحريك';
    if (state.harvests > 0) $('tutorial-tip').hidden = true;
    world?.update(state, selection, mode);
  }
  function selectWorld(hit) {
    if (hit.type === 'slot' && mode) {
      const position = G.buildSlots[hit.id];
      perform(
        mode.move ? 'move' : 'build',
        mode.move ? { kind: mode.move, position } : { kind: mode.kind, position },
      );
      return;
    }
    if (hit.type === 'plot') {
      tab = 'farm';
      perform('plot', hit.id);
      return;
    }
    if (hit.type === 'building') {
      selection = hit;
      tab = Object.values(G.recipes).some((r) => r.building === hit.id) ? 'production' : 'build';
      render();
      const card = $('panel-content').querySelector(`[data-factory="${hit.id}"]`);
      card?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.tab) {
      chooseTab(b.dataset.tab);
      return;
    }
    const a = b.dataset.action,
      id = b.dataset.id;
    if (!a) return;
    if (a === 'place' || a === 'relocate') {
      mode = a === 'place' ? { kind: id } : { move: id };
      tab = 'build';
      render();
      return;
    }
    if (a === 'cancelMode') {
      mode = null;
      render();
      return;
    }
    if (a === 'slot') {
      selectWorld({ type: 'slot', id: Number(id) });
      return;
    }
    if (a === 'openBuild') {
      chooseTab('build');
      return;
    }
    if (a === 'sell') {
      perform(a, { good: id, amount: Number(b.dataset.amount) });
      return;
    }
    const numeric = ['plot', 'deliver', 'skipOrder', 'claim'];
    perform(a, numeric.includes(a) ? Number(id) : id);
    if (a === 'plot') world?.focus('plot', Number(id));
  });
  document.addEventListener('keydown', (event) => {
    if (
      event.key === 'Escape' &&
      !document.querySelector('dialog[open]') &&
      window.parent !== window
    ) {
      window.parent.postMessage({ type: 'sultan-farm-return' }, location.origin);
    }
  });
  $('help').onclick = () => $('help-modal').showModal();
  $('close-help').onclick = () => $('help-modal').close();
  $('reset').onclick = () => {
    $('help-modal').close();
    $('reset-modal').showModal();
  };
  $('cancel-reset').onclick = () => $('reset-modal').close();
  $('confirm-reset').onclick = () => {
    state = G.initial();
    mode = null;
    selection = null;
    tab = 'farm';
    save();
    render();
    $('reset-modal').close();
    notify('مزرعة جديدة… وبداية مباركة!');
  };
  $('dismiss-tip').onclick = () => {
    $('tutorial-tip').hidden = true;
  };
  $('toggle-panel').onclick = () => {
    const collapsed = $('side-panel').classList.toggle('collapsed');
    $('toggle-panel').setAttribute('aria-expanded', String(!collapsed));
    $('toggle-panel').textContent = collapsed ? '⌃' : '⌄';
  };
  $('zoom-in').onclick = () => world?.zoom(0.85);
  $('zoom-out').onclick = () => world?.zoom(1.15);
  $('rotate').onclick = () => world?.rotate();
  $('reset-camera').onclick = () => world?.reset();
  $('day-night').onclick = () => {
    if (world) $('day-night').textContent = world.night() ? '☀' : '☾';
  };
  $('quality').onclick = () => {
    if (world)
      notify(
        world.quality()
          ? 'جودة عالية: ظلال وتفاصيل إضافية'
          : 'جودة خفيفة: أداء أفضل للأجهزة الصغيرة',
      );
  };
  function fallback() {
    if (disposed) return;
    $('world').dataset.renderer = 'unavailable';
    $('loading-scene').hidden = false;
    $('loading-scene').innerHTML =
      '<span>♜</span><strong>العرض ثلاثي الأبعاد غير متاح على هذا الجهاز</strong><small>يمكنك الزراعة والبناء والإنتاج والتجارة من لوحة الإدارة.</small>';
    for (const id of ['zoom-in', 'zoom-out', 'rotate', 'reset-camera', 'day-night', 'quality'])
      $(id).disabled = true;
  }
  $('world').addEventListener('world-error', () => {
    world?.dispose();
    world = null;
    fallback();
  });
  render();
  save();
  import('./world.js')
    .then((module) => {
      if (disposed) return;
      world = module.createWorld($('world'), selectWorld);
      $('world').dataset.renderer = 'ready';
      $('loading-scene').hidden = true;
      world.update(state, selection, mode);
    })
    .catch(fallback);
  timer = setInterval(() => {
    if (document.hidden || document.querySelector('dialog[open]')) return;
    if (G.settle(state)) {
      save();
      notify('اكتمل البناء في القرية!');
    }
    render();
  }, 1000);
  function visibility() {
    if (!document.hidden) {
      G.settle(state);
      save();
      render();
    }
  }
  function storageEvent(e) {
    if (e.key === KEY && e.newValue) {
      try {
        const fresh = G.migrate(JSON.parse(e.newValue));
        if (fresh) {
          state = fresh;
          render();
        }
      } catch {}
    }
  }
  window.addEventListener('storage', storageEvent);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener(
    'pagehide',
    () => {
      disposed = true;
      clearInterval(timer);
      clearTimeout(toastTimer);
      world?.dispose();
      window.removeEventListener('storage', storageEvent);
      document.removeEventListener('visibilitychange', visibility);
    },
    { once: true },
  );
})();
