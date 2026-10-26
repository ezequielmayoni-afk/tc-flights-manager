/* Gift Card Sí, Viajo · widget inyectado por GTM en la landing de TC. Carga config de HUB, arma el formulario,
   crea el pedido y manda a Mercado Pago con las cuotas elegidas. Al volver (?gc=<pedido>) muestra el estado y el código. */
(function () {
  if (window.__svGiftcardLoaded) return; window.__svGiftcardLoaded = true;
  var API = (document.currentScript && document.currentScript.getAttribute('data-api')) || 'https://hub.siviajo.com/api/giftcard';
  var CSS = "#sv-giftcard{--navy:#10214b;--navy2:#1c2f66;--accent:#35d1a3;--accent2:#1fb88b;--bg:#f3f5fb;--card:#fff;--line:#e3e7f2;--muted:#5d6386;--fg:#10214b;font-family:Montserrat,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--fg);max-width:1140px;margin:0 auto;padding:8px 16px 40px;box-sizing:border-box}#sv-giftcard *{box-sizing:border-box}#sv-giftcard h2{font-size:26px;font-weight:800;margin:0 0 6px;letter-spacing:-.01em}#sv-giftcard .sv-lead{color:var(--muted);margin:0 0 18px;font-size:15px;max-width:70ch}#sv-giftcard .sv-steps{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 22px}#sv-giftcard .sv-step{flex:1 1 180px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;display:flex;gap:10px;align-items:center;font-size:14px}#sv-giftcard .sv-step b{width:28px;height:28px;border-radius:50%;background:var(--navy);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;flex:none}#sv-giftcard .sv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:12px;margin:0 0 18px}#sv-giftcard .sv-card{position:relative;background:var(--card);border:2px solid var(--line);border-radius:16px;padding:16px 14px 14px;cursor:pointer;transition:border-color .15s,transform .15s,box-shadow .15s;text-align:left}#sv-giftcard .sv-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(16,33,75,.08)}#sv-giftcard .sv-card.on{border-color:var(--accent);box-shadow:0 0 0 3px rgba(53,209,163,.18)}#sv-giftcard .sv-card .sv-usd{font-size:22px;font-weight:800;color:var(--navy)}#sv-giftcard .sv-card .sv-ars{font-size:13px;color:var(--muted);margin-top:4px}#sv-giftcard .sv-card .sv-cuo{font-size:12px;color:var(--accent2);font-weight:600;margin-top:6px}#sv-giftcard .sv-card .sv-tag{display:inline-block;margin-bottom:6px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;background:var(--bg);border-radius:999px;padding:3px 8px;color:var(--muted)}#sv-giftcard .sv-card select.sv-plan{width:100%;margin-top:10px;padding:7px 22px 7px 8px;font:inherit;font-size:12.5px;font-weight:600;color:var(--navy);border:1px solid var(--line);border-radius:10px;background:#fff;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}#sv-giftcard .sv-card input[type=number]{width:100%;margin-top:8px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;font:inherit;font-size:15px}#sv-giftcard .sv-panel{display:grid;grid-template-columns:1.4fr 1fr;gap:18px;align-items:start}#sv-giftcard .sv-box{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px}#sv-giftcard .sv-box h3{font-size:16px;margin:0 0 12px;font-weight:700}#sv-giftcard label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin:10px 0 4px;letter-spacing:.02em}#sv-giftcard input[type=text],#sv-giftcard input[type=email],#sv-giftcard input[type=tel],#sv-giftcard select,#sv-giftcard textarea{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px;font:inherit;font-size:15px;background:#fff;color:var(--fg)}#sv-giftcard textarea{min-height:64px;resize:vertical}#sv-giftcard .sv-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}#sv-giftcard .sv-sum{background:var(--bg);border-radius:12px;padding:14px;margin:0 0 14px;font-size:14px}#sv-giftcard .sv-sum .sv-big{font-size:24px;font-weight:800;color:var(--navy)}#sv-giftcard .sv-sum .sv-line{display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px dashed var(--line)}#sv-giftcard .sv-btn{width:100%;border:0;border-radius:12px;padding:15px 18px;font:inherit;font-weight:800;font-size:16px;background:var(--accent);color:#07261d;cursor:pointer;transition:filter .15s}#sv-giftcard .sv-btn:hover{filter:brightness(.95)}#sv-giftcard .sv-btn[disabled]{opacity:.6;cursor:wait}#sv-giftcard .sv-legal{font-size:12px;color:var(--muted);margin:10px 0 0;line-height:1.45}#sv-giftcard .sv-err{background:#fde9e7;color:#b3261e;border-radius:10px;padding:10px 12px;margin:10px 0 0;font-size:13px;display:none}#sv-giftcard .sv-status{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px;text-align:center;max-width:620px;margin:0 auto}#sv-giftcard .sv-code{font-size:34px;font-weight:900;letter-spacing:.08em;color:var(--navy);background:var(--bg);border-radius:12px;padding:14px;margin:14px 0}#sv-giftcard .sv-link{color:var(--navy);font-weight:700}#sv-giftcard .sv-gift{margin-top:12px;font-size:14px}#sv-giftcard .sv-gift details summary{cursor:pointer;color:var(--navy);font-weight:600}@media (max-width:800px){#sv-giftcard .sv-panel{grid-template-columns:1fr}#sv-giftcard h2{font-size:22px}}";
  function fmt(n) { return '$ ' + Math.round(n).toLocaleString('es-AR'); }
  function el(tag, attrs, html) { var e = document.createElement(tag); if (attrs) for (var k in attrs) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function dl(ev, data) { try { window.dataLayer = window.dataLayer || []; var o = { event: ev }; for (var k in data) o[k] = data[k]; window.dataLayer.push(o); } catch (e) {} }
  function place(root) {
    // Debajo del hero y antes de las secciones de la landing. GTM carga el script en el <head>, así que el DOM puede no estar todavía.
    var sections = document.querySelector('.c-home-sections');
    if (sections) { sections.insertBefore(root, sections.firstChild); return true; }
    var hero = document.querySelector('.c-hero-screen');
    if (hero && hero.parentNode) { hero.parentNode.insertBefore(root, hero.nextSibling); return true; }
    return false;
  }
  function mount() {
    var style = el('style', null, CSS); (document.head || document.documentElement).appendChild(style);
    var root = document.getElementById('sv-giftcard') || el('div', { id: 'sv-giftcard' });
    var tries = 0;
    (function attempt() {
      // GTM agrega el <div id="sv-giftcard"> del tag al final del body: si está ahí (o suelto), lo movemos debajo del hero.
      if (root.parentNode && root.parentNode !== document.body) return;
      if (place(root)) return;
      if (++tries < 80) { setTimeout(attempt, 250); return; }
      var footer = document.querySelector('footer');
      if (footer && footer.parentNode) footer.parentNode.insertBefore(root, footer); else if (document.body) document.body.appendChild(root);
    })();
    return root;
  }
  function getParam(name) { var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search); return m ? decodeURIComponent(m[1]) : null; }
  var root = mount();
  var orderId = getParam('gc');
  if (orderId && /^[0-9a-f-]{36}$/.test(orderId)) { renderStatus(root, orderId); } else { renderForm(root); }

  function renderStatus(root, id) {
    root.innerHTML = '<div class="sv-status"><h2>Tu Gift Card Sí, Viajo</h2><p class="sv-lead" style="margin:6px auto 0">Estamos confirmando el pago con Mercado Pago…</p></div>';
    var tries = 0; var pid = getParam('payment_id') || getParam('collection_id');
    function poll() {
      tries++;
      fetch(API + '/orders/' + id + (pid ? '?payment_id=' + encodeURIComponent(pid) : ''), { credentials: 'omit' }).then(function (r) { return r.json(); }).then(function (o) {
        if (!o || !o.ok) { fail('No encontramos el pedido. Escribinos por WhatsApp y lo revisamos.'); return; }
        var box = root.querySelector('.sv-status');
        if (o.status === 'issued') {
          dl('giftcard_purchase', { value: o.amountUsd, currency: 'USD', transaction_id: o.id });
          box.innerHTML = '<h2>¡Listo! Tu Gift Card ya está activa</h2><p class="sv-lead" style="margin:6px auto 0">Te mandamos el voucher a <b>' + esc(o.email) + '</b>. Guardá el código:</p><div class="sv-code">' + esc(o.code) + '</div><p>Valor <b>USD ' + esc(o.amountUsd) + '</b> · válida hasta el <b>' + esc(fechaLarga(o.validUntil)) + '</b></p><p class="sv-legal">Para usarla, escribí el código en "¿Tenés un código?" antes de pagar cualquier viaje en siviajo.com, o mandáselo a un asesor por <a class="sv-link" href="https://wa.me/5491135181235?text=' + encodeURIComponent('Hola, quiero usar mi Gift Card ' + o.code) + '">WhatsApp</a>.</p>';
          return;
        }
        if (o.status === 'paid') { box.querySelector('.sv-lead').textContent = 'Pago aprobado. Estamos emitiendo tu código, un momento…'; }
        else if (o.status === 'pending') { box.querySelector('.sv-lead').textContent = tries < 6 ? 'Estamos confirmando el pago con Mercado Pago…' : 'Tu pago todavía figura en proceso. Si pagaste, el voucher te llega por email apenas Mercado Pago lo confirme.'; }
        else if (o.status === 'rejected') { box.innerHTML = '<h2>El pago no se aprobó</h2><p class="sv-lead" style="margin:6px auto 14px">Mercado Pago rechazó el pago. Podés intentar con otra tarjeta.</p><button class="sv-btn" onclick="location.href=location.pathname">Volver a intentar</button>'; return; }
        else { fail('Hubo un problema con tu pedido. Escribinos por WhatsApp con tu email y lo resolvemos en el día.'); return; }
        if (tries < 40) setTimeout(poll, tries < 10 ? 3000 : 8000);
      }).catch(function () { if (tries < 40) setTimeout(poll, 5000); });
    }
    function fail(msg) { root.querySelector('.sv-status').innerHTML = '<h2>Tu Gift Card</h2><p class="sv-lead" style="margin:6px auto 14px">' + esc(msg) + '</p><a class="sv-btn" style="display:inline-block;width:auto;text-decoration:none" href="https://wa.me/5491135181235?text=' + encodeURIComponent('Hola, compré una Gift Card y tengo una consulta (pedido ' + id + ')') + '">Escribir por WhatsApp</a>'; }
    poll();
  }
  function fechaLarga(iso) { if (!iso) return ''; var p = iso.split('-'); var m = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']; return parseInt(p[2], 10) + ' de ' + m[parseInt(p[1], 10) - 1] + ' de ' + p[0]; }

  function renderForm(root) {
    root.innerHTML = '<h2>Elegí tu Gift Card</h2><p class="sv-lead">Cargando montos y cuotas…</p>';
    fetch(API + '/config', { credentials: 'omit' }).then(function (r) { return r.json(); }).then(function (cfg) {
      if (!cfg || !cfg.ok) throw new Error(cfg && cfg.error || 'config');
      build(root, cfg);
    }).catch(function () {
      root.innerHTML = '<h2>Gift Card Sí, Viajo</h2><p class="sv-lead">Ahora mismo no podemos mostrar los montos. Escribinos por <a class="sv-link" href="https://wa.me/5491135181235?text=' + encodeURIComponent('Hola, quiero comprar una Gift Card') + '">WhatsApp</a> y la compramos juntos.</p>';
    });
  }
  function build(root, cfg) {
    dl('giftcard_view', {});
    var rate = cfg.fx.rate; var plans = (cfg.plans && cfg.plans.length) ? cfg.plans : [{ n: 1, coef: 1 }];
    var state = { usd: cfg.amounts[1] ? cfg.amounts[1].usd : cfg.amounts[0].usd, custom: false, n: 1 };
    function arsOf(usd) { return Math.round(usd * rate); }
    // Mismo cálculo que HUB (src/lib/giftcard/quote.ts): total = round(contado × coef); cuota = round(total / n); se cobra cuota × n.
    function quotes(usd) {
      var found = null; for (var i = 0; i < cfg.amounts.length; i++) if (cfg.amounts[i].usd === usd) found = cfg.amounts[i];
      if (found && found.installments && found.installments.length) return found.installments;
      var cash = arsOf(usd); var out = [];
      for (var j = 0; j < plans.length; j++) { var p = plans[j]; var n = p.n; var coef = n === 1 ? 1 : (p.coef || 1); var inst = Math.round(Math.round(cash * coef) / n); out.push({ n: n, coef: coef, installmentArs: inst, totalArs: inst * n }); }
      return out;
    }
    // Etiqueta corta para el desplegable de la tarjeta (entra en 2 columnas en el celular); el resumen lo dice en palabras.
    function optLabel(q) { return q.n === 1 ? '1 pago ' + fmt(q.totalArs) : q.n + ' x ' + fmt(q.installmentArs); }
    function planOptions(usd) { var l = quotes(usd); var h = ''; for (var i = 0; i < l.length; i++) h += '<option value="' + l[i].n + '"' + (l[i].n === state.n ? ' selected' : '') + '>' + optLabel(l[i]) + '</option>'; return h; }
    var html = '<h2>Elegí tu Gift Card</h2><p class="sv-lead">Cada Gift Card vale su monto en dólares y se usa en cualquier paquete, vuelo u hotel de Sí, Viajo durante ' + cfg.validityMonths + ' meses. Pagás en pesos a la cotización de hoy (USD 1 = ' + fmt(rate) + '), con Mercado Pago y en cuotas.</p>';
    html += '<div class="sv-steps"><div class="sv-step"><b>1</b>Elegí el monto y las cuotas</div><div class="sv-step"><b>2</b>Pagá con Mercado Pago</div><div class="sv-step"><b>3</b>Recibí el voucher con tu código por email</div></div>';
    html += '<div class="sv-grid" id="sv-amounts">';
    for (var i = 0; i < cfg.amounts.length; i++) { var a = cfg.amounts[i]; html += '<div class="sv-card' + (a.usd === state.usd ? ' on' : '') + '" data-usd="' + a.usd + '"><span class="sv-tag">' + cfg.validityMonths + ' meses</span><div class="sv-usd">USD ' + a.usd + '</div><div class="sv-ars">Contado ' + fmt(a.ars) + '</div><select class="sv-plan" aria-label="Cuotas para USD ' + a.usd + '">' + planOptions(a.usd) + '</select></div>'; }
    html += '<div class="sv-card" data-usd="custom"><span class="sv-tag">a medida</span><div class="sv-usd">Otro monto</div><div class="sv-ars">Desde USD ' + cfg.custom.minUsd + '</div><input type="number" min="' + cfg.custom.minUsd + '" max="' + cfg.custom.maxUsd + '" step="1" placeholder="Ej: 750" id="sv-custom" aria-label="Monto en dólares"><select class="sv-plan" id="sv-custom-plan" aria-label="Cuotas para otro monto"><option value="1">Cuotas</option></select></div></div>';
    html += '<div class="sv-panel"><div class="sv-box"><h3>Tus datos</h3><div class="sv-row"><div><label>Nombre *</label><input type="text" id="sv-name" maxlength="60" autocomplete="given-name"></div><div><label>Apellido *</label><input type="text" id="sv-last" maxlength="60" autocomplete="family-name"></div></div><label>Email * <span style="font-weight:400">(acá llega el voucher)</span></label><input type="email" id="sv-email" maxlength="145" autocomplete="email"><div class="sv-row"><div><label>Teléfono *</label><input type="tel" id="sv-phone" maxlength="40" autocomplete="tel" placeholder="11 1234 5678"></div><div><label>DNI o CUIL</label><input type="text" id="sv-doc" maxlength="13" inputmode="numeric" placeholder="Para la factura"></div></div><div class="sv-gift"><details><summary>¿Es un regalo? Agregá el nombre y un mensaje</summary><label>Para</label><input type="text" id="sv-rname" maxlength="80" placeholder="Nombre de quien la recibe"><label>Mensaje</label><textarea id="sv-msg" maxlength="300" placeholder="Va impreso en el voucher"></textarea></details></div></div>';
    html += '<div class="sv-box"><h3>Tu compra</h3><div class="sv-sum" id="sv-sum"></div><button class="sv-btn" id="sv-buy" type="button">Comprar con Mercado Pago</button><div class="sv-err" id="sv-err"></div><p class="sv-legal">Los montos en dólares se cobran en pesos a la cotización del momento de la compra. El valor de las cuotas es el que ves acá y Mercado Pago te lo confirma antes de pagar. Un solo uso, no acumulable con otras promociones. Aplican los términos de la Gift Card que están más abajo en esta página.</p></div></div>';
    root.innerHTML = html;
    var grid = root.querySelector('#sv-amounts'), custom = root.querySelector('#sv-custom'), sum = root.querySelector('#sv-sum'), err = root.querySelector('#sv-err'), btn = root.querySelector('#sv-buy');
    function currentUsd() { if (state.custom) { var v = parseInt(custom.value, 10); return isFinite(v) ? v : 0; } return state.usd; }
    function refresh(syncSelects) {
      var usd = currentUsd(); var valid = usd >= cfg.custom.minUsd && usd <= cfg.custom.maxUsd;
      var cards = grid.querySelectorAll('.sv-card'); for (var i = 0; i < cards.length; i++) { var d = cards[i].getAttribute('data-usd'); cards[i].className = 'sv-card' + ((state.custom && d === 'custom') || (!state.custom && String(state.usd) === d) ? ' on' : ''); }
      var list = valid ? quotes(usd) : []; var chosen = null; for (var k = 0; k < list.length; k++) if (list[k].n === state.n) chosen = list[k];
      if (!chosen && list.length) { chosen = list[0]; state.n = chosen.n; }
      if (syncSelects !== false) {
        var cp = root.querySelector('#sv-custom-plan'); if (cp) cp.innerHTML = (state.custom && valid) ? planOptions(usd) : '<option value="1">Cuotas</option>';
        var sels = grid.querySelectorAll('select.sv-plan'); for (var s = 0; s < sels.length; s++) { if (sels[s].id === 'sv-custom-plan') continue; sels[s].value = String(state.n); }
      }
      sum.innerHTML = valid && chosen ? '<div class="sv-big">USD ' + usd + '</div><div class="sv-line"><span>Contado en pesos</span><b>' + fmt(arsOf(usd)) + '</b></div>' + (chosen.n > 1 ? '<div class="sv-line"><span>' + chosen.n + ' cuotas de</span><b>' + fmt(chosen.installmentArs) + '</b></div><div class="sv-line"><span>Total en ' + chosen.n + ' cuotas</span><b>' + fmt(chosen.totalArs) + '</b></div>' : '<div class="sv-line"><span>Pago</span><b>1 pago · ' + fmt(chosen.totalArs) + '</b></div>') + '<div class="sv-line"><span>Vigencia</span><b>' + cfg.validityMonths + ' meses</b></div>' : '<span style="color:var(--muted)">Elegí un monto para ver el resumen.</span>';
      btn.disabled = !valid;
    }
    function activate(card) { var d = card.getAttribute('data-usd'); if (d === 'custom') { state.custom = true; } else { state.custom = false; state.usd = parseInt(d, 10); dl('giftcard_select_amount', { value: state.usd }); } }
    grid.addEventListener('click', function (e) { var t = e.target; if (!t || t.tagName === 'SELECT' || t.tagName === 'OPTION') return; var card = t.closest ? t.closest('.sv-card') : null; if (!card) return; activate(card); if (card.getAttribute('data-usd') === 'custom' && t !== custom) custom.focus(); refresh(true); });
    grid.addEventListener('focusin', function (e) { var t = e.target; if (!t || !t.classList || !t.classList.contains('sv-plan')) return; var card = t.closest ? t.closest('.sv-card') : null; if (card) { activate(card); refresh(false); } });
    grid.addEventListener('change', function (e) { var t = e.target; if (!t || !t.classList || !t.classList.contains('sv-plan')) return; var card = t.closest ? t.closest('.sv-card') : null; if (card) activate(card); var n = parseInt(t.value, 10); if (n > 0) state.n = n; dl('giftcard_select_plan', { value: currentUsd(), installments: state.n }); refresh(true); });
    custom.addEventListener('input', function () { state.custom = true; refresh(true); });
    btn.addEventListener('click', function () {
      err.style.display = 'none';
      var body = { amountUsd: currentUsd(), installments: state.n, buyer: { name: val('sv-name'), lastname: val('sv-last'), email: val('sv-email'), phone: val('sv-phone'), document: val('sv-doc') }, recipientName: val('sv-rname'), message: val('sv-msg') };
      var missing = [];
      if (body.buyer.name.length < 2) missing.push('nombre'); if (body.buyer.lastname.length < 2) missing.push('apellido'); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.buyer.email)) missing.push('email válido'); if (body.buyer.phone.replace(/\D/g, '').length < 8) missing.push('teléfono');
      if (missing.length) { showErr('Completá: ' + missing.join(', ') + '.'); return; }
      btn.disabled = true; btn.textContent = 'Creando tu pago…';
      dl('giftcard_checkout', { value: body.amountUsd, currency: 'USD', installments: body.installments });
      fetch(API + '/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit' }).then(function (r) { return r.json(); }).then(function (o) {
        if (!o || !o.ok || !o.initPoint) throw new Error(o && o.error || 'No pudimos iniciar el pago.');
        btn.textContent = 'Te llevamos a Mercado Pago…'; location.href = o.initPoint;
      }).catch(function (e) { showErr(e.message || 'No pudimos iniciar el pago. Probá de nuevo.'); btn.disabled = false; btn.textContent = 'Comprar con Mercado Pago'; });
    });
    function val(id) { var e = root.querySelector('#' + id); return e ? String(e.value || '').trim() : ''; }
    function showErr(m) { err.textContent = m; err.style.display = 'block'; }
    refresh();
  }
})();
