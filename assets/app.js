/* global L, Lud21 */
(function () {
  'use strict';

  var ORANIA = { lat: -29.8192, lng: 24.4121 };
  var ZOOM = 15;

  var IKONE = {
    koffie: '☕',
    restaurant: '🍴',
    slaghuis: '🥩',
    winkel: '🛍️',
    kroeg: '🍺',
    juwele: '💍',
    verblyf: '🏡',
    dienste: '🔧',
    argitektuur: '🏛️',
    organisasie: '🤝',
    naaldwerk: '🧵',
    gas: '🔥',
    toep: '📱',
    parte: '⚙️',
    brandstof: '⛽',
    stoor: '📦',
    karre: '🚗',
    vervoer: '🚐',
    babas: '👶',
    hardeware: '🔨',
    algemeen: '📍'
  };

  var IKONE_SVG = {
    kroeg: 'assets/icons/kroeg.svg',
    gas: 'assets/icons/gas.svg',
    toep: 'assets/icons/toep.svg',
    parte: 'assets/icons/parte.svg',
    brandstof: 'assets/icons/brandstof.svg',
    stoor: 'assets/icons/stoor.svg',
    karre: 'assets/icons/karre.svg',
    vervoer: 'assets/icons/vervoer.svg',
    babas: 'assets/icons/babas.svg',
    hardeware: 'assets/icons/hardeware.svg'
  };

  var businesses = [];
  var map;
  var tileLayer;
  var markersLayer;
  var activeBiz = null;
  var payMode = 'pay';
  var currentView = 'map';
  /** null = Alle (wys alles); anders `Set` van kategorie-strings */
  var selectedCategories = null;
  var showPinLabels = true;
  var pinLabelsKey = 'orania-kaart-pin-naam-merkers';
  var lastInvoice = { pr: '', verify: null, msats: 0, ora: null };
  var themeKey = 'orania-kaart-tema';
  var userLocationGroup = null;
  var geoWatchId = null;
  var lastUserPos = null;
  var hasFlownToUser = false;
  var locateControlBtn = null;

  var $ = function (id) {
    return document.getElementById(id);
  };

  function hasStr(s) {
    return !!(s && String(s).trim());
  }

  function isActive(b) {
    // Default: aktief, unless explicitly false
    return !(b && b.aktief === false);
  }

  function coordsOf(b) {
    if (!b) return null;
    // Support both spellings (diacritics vary in JSON edits)
    var c = b.koördinate || b.koordinate || null;
    if (!c) return null;
    if (typeof c.lat !== 'number' || typeof c.lng !== 'number') return null;
    return c;
  }

  function logoPath(b) {
    if (!b || !b.logoLêer) return null;
    return 'assets/logos/' + b.logoLêer;
  }

  function isDarkTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function getAccent() {
    // `kleur` removed from data; keep a consistent accent.
    return '#3b82f6';
  }

  function setModalAccent(hex) {
    document.documentElement.style.setProperty('--modal-accent', hex);
  }

  function iconEmoji(b) {
    if (b.ikoon && IKONE[b.ikoon]) return IKONE[b.ikoon];
    return b.ikoonEmoji || IKONE.algemeen;
  }

  function ikoonSvgPath(b) {
    return b && b.ikoon && IKONE_SVG[b.ikoon] ? IKONE_SVG[b.ikoon] : null;
  }

  function setIkoonElement(el, b, imgClass) {
    if (!el) return;
    el.innerHTML = '';
    var svg = ikoonSvgPath(b);
    if (svg && !logoPath(b)) {
      var img = document.createElement('img');
      img.src = svg;
      img.alt = '';
      img.className = imgClass;
      img.loading = 'lazy';
      img.addEventListener('error', function () {
        el.textContent = iconEmoji(b);
      });
      el.appendChild(img);
      return;
    }
    el.textContent = iconEmoji(b);
  }

  function getMaxFocusZoom() {
    if (!map) return 19;
    return map.getMaxZoom();
  }

  function getTilesUrl() {
    if (isDarkTheme()) {
      return {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        options: {
          maxZoom: 20,
          subdomains: 'abcd',
          attribution: '© OpenStreetMap © CARTO'
        }
      };
    }
    return {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: { maxZoom: 19, attribution: '© OpenStreetMap' }
    };
  }

  function createMarkerClusterGroup() {
    if (typeof L !== 'undefined' && typeof L.markerClusterGroup === 'function') {
      return L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        removeOutsideVisibleBounds: true,
        animate: true,
        spiderLegPolylineOptions: {
          color: isDarkTheme() ? '#94a3b8' : '#64748b',
          weight: 1.5,
          opacity: 0.75
        }
      });
    }
    return L.layerGroup();
  }

  function initMap() {
    map = L.map('map', { zoomControl: false }).setView([ORANIA.lat, ORANIA.lng], ZOOM);
    L.control.zoom({ position: 'topright' }).addTo(map);
    var t = getTilesUrl();
    tileLayer = L.tileLayer(t.url, t.options).addTo(map);
    markersLayer = createMarkerClusterGroup().addTo(map);
    userLocationGroup = L.layerGroup().addTo(map);
    addLocateControl();
    addFitAllControl();
    cleanupAttribution();
  }

  function addLocateControl() {
    var Locate = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd: function () {
        var wrap = L.DomUtil.create('div', 'leaflet-bar locate-control');
        var btn = L.DomUtil.create('a', 'locate-control__btn', wrap);
        btn.href = '#';
        btn.title = 'Wys my posisie op die kaart';
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', 'Wys my posisie op die kaart');
        btn.innerHTML = '◎';
        locateControlBtn = btn;
        L.DomEvent.on(btn, 'mousedown dblclick', L.DomEvent.stopPropagation);
        L.DomEvent.on(btn, 'click', function (ev) {
          L.DomEvent.preventDefault(ev);
          onLocateButtonClick(ev);
        });
        return wrap;
      }
    });
    map.addControl(new Locate());
  }

  function addFitAllControl() {
    var FitAll = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd: function () {
        var wrap = L.DomUtil.create('div', 'leaflet-bar locate-control');
        var btn = L.DomUtil.create('a', 'locate-control__btn', wrap);
        btn.href = '#';
        btn.title = 'Zoom om alle besighede te wys';
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', 'Zoom om alle besighede te wys');
        btn.innerHTML = '⤢';
        L.DomEvent.on(btn, 'mousedown dblclick', L.DomEvent.stopPropagation);
        L.DomEvent.on(btn, 'click', function (ev) {
          L.DomEvent.preventDefault(ev);
          fitAllMarkers();
        });
        return wrap;
      }
    });
    map.addControl(new FitAll());
  }

  function cleanupAttribution() {
    // Defensive: remove any extra badge/flag in attribution bar (e.g. tiles adding a 🇺🇦 banner)
    setTimeout(function () {
      var el = document.querySelector('.leaflet-control-attribution');
      if (!el) return;
      Array.from(el.querySelectorAll('a,img,span')).forEach(function (n) {
        var href = (n.getAttribute && n.getAttribute('href')) || '';
        var src = (n.getAttribute && n.getAttribute('src')) || '';
        var txt = (n.textContent || '').toLowerCase();
        var alt = ((n.getAttribute && n.getAttribute('alt')) || '').toLowerCase();
        if (
          href.toLowerCase().indexOf('ukraine') >= 0 ||
          src.toLowerCase().indexOf('ukraine') >= 0 ||
          txt.indexOf('ukraine') >= 0 ||
          alt.indexOf('ukraine') >= 0 ||
          txt.indexOf('🇺🇦') >= 0 ||
          alt.indexOf('🇺🇦') >= 0
        ) {
          n.remove();
        }
      });
    }, 250);
  }

  function onLocateButtonClick(e) {
    L.DomEvent.preventDefault(e);
    if (!navigator.geolocation) {
      window.alert('Jou blaaier ondersteun nie ligging nie.');
      return;
    }
    if (lastUserPos && geoWatchId !== null) {
      map.flyTo([lastUserPos.lat, lastUserPos.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
      return;
    }
    startUserLocationWatch();
  }

  function geoErrorMessage(code) {
    if (code === 1) return 'Toestemming geweier. Skakel ligging vir hierdie werf in jou blaaier aan.';
    if (code === 2) return 'Ligging tydelik nie beskikbaar nie. Probeer weer.';
    if (code === 3) return 'Kon nie betyds lig kry nie. Probeer weer.';
    return 'Kon nie jou posisie bepaal nie.';
  }

  function updateUserOnMap(lat, lng, accuracyM) {
    if (!map || !userLocationGroup) return;
    userLocationGroup.clearLayers();
    if (typeof accuracyM === 'number' && accuracyM > 5 && accuracyM < 5000) {
      L.circle([lat, lng], {
        radius: accuracyM,
        color: '#3b82f6',
        weight: 1,
        fillColor: '#3b82f6',
        fillOpacity: 0.12
      }).addTo(userLocationGroup);
    }
    var dot = L.divIcon({
      className: 'user-loc-marker',
      html: '<div class="user-loc-dot" title="Jy is hier"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
    L.marker([lat, lng], { icon: dot, zIndexOffset: 2000, title: 'Jy is hier' }).addTo(userLocationGroup);
    lastUserPos = { lat: lat, lng: lng };
  }

  function startUserLocationWatch() {
    if (geoWatchId !== null) return;
    if (locateControlBtn) {
      locateControlBtn.classList.add('is-active');
      locateControlBtn.setAttribute('aria-pressed', 'true');
    }
    geoWatchId = navigator.geolocation.watchPosition(
      function (pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        var acc = pos.coords.accuracy;
        updateUserOnMap(lat, lng, acc);
        if (!hasFlownToUser) {
          hasFlownToUser = true;
          map.flyTo([lat, lng], 16, { duration: 0.75 });
        }
      },
      function (err) {
        if (locateControlBtn) {
          locateControlBtn.classList.remove('is-active');
          locateControlBtn.setAttribute('aria-pressed', 'false');
        }
        if (geoWatchId !== null) {
          navigator.geolocation.clearWatch(geoWatchId);
          geoWatchId = null;
        }
        lastUserPos = null;
        hasFlownToUser = false;
        if (userLocationGroup) userLocationGroup.clearLayers();
        window.alert(geoErrorMessage(err.code));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  }

  function refreshMapTiles() {
    if (!map || !tileLayer) return;
    map.removeLayer(tileLayer);
    var t = getTilesUrl();
    tileLayer = L.tileLayer(t.url, t.options).addTo(map);
  }

  function markerIkoonImgOnerror() {
    return (
      ' onerror="this.onerror=null;var s=document.createElement(\'span\');' +
      's.className=\'marker-pin__emoji\';s.setAttribute(\'aria-hidden\',\'true\');' +
      's.textContent=this.getAttribute(\'data-fallback\')||\'📍\';this.replaceWith(s);"'
    );
  }

  function createMarker(b) {
    var emoji = iconEmoji(b);
    var border = escapeHtml('#94a3b8');
    var lp = logoPath(b);
    var svg = ikoonSvgPath(b);
    var inner = lp
      ? '<div class="marker-pin__rot"><div class="marker-pin__logo-box">' +
        '<img class="marker-pin__logo" src="' +
        escapeHtml(lp) +
        '" alt="" loading="lazy" width="24" height="24"/>' +
        '</div></div>'
      : svg
        ? '<div class="marker-pin__rot"><div class="marker-pin__logo-box marker-pin__logo-box--emoji">' +
          '<img class="marker-pin__ikoon" src="' +
          escapeHtml(svg) +
          '" alt="" loading="lazy" width="22" height="22" data-fallback="' +
          escapeHtml(emoji) +
          '"' +
          markerIkoonImgOnerror() +
          '/>' +
          '</div></div>'
        : '<div class="marker-pin__rot"><div class="marker-pin__logo-box marker-pin__logo-box--emoji"><span class="marker-pin__emoji" aria-hidden="true">' +
          escapeHtml(emoji) +
          '</span></div></div>';
    var el = L.divIcon({
      className: 'marker-wrap',
      html: '<div class="marker-pin" style="border-color:' + border + '">' + inner + '</div>',
      iconSize: [40, 40],
      iconAnchor: [20, 38]
    });
    var c = coordsOf(b);
    var m = L.marker([c.lat, c.lng], { icon: el, title: b.naam });
    if (showPinLabels && b.naam) {
      m.bindTooltip(b.naam, {
        permanent: true,
        direction: 'right',
        className: 'map-pin-label',
        offset: [10, 0]
      });
    }
    m.on('click', function (e) {
      L.DomEvent.stopPropagation(e);
      openDrawer(b);
    });
    return m;
  }

  function mapVisibleBusinesses() {
    return businesses.filter(function (b) {
      if (!isActive(b)) return false;
      if (!coordsOf(b)) return false;
      if (selectedCategories === null) return true;
      var k = b.kategorie || '';
      return selectedCategories.has(k);
    });
  }

  function fitAllMarkers() {
    if (!map) return;
    var list = mapVisibleBusinesses();
    if (!list.length) return;
    var bounds = L.latLngBounds(
      list.map(function (b) {
        var c = coordsOf(b);
        return [c.lat, c.lng];
      })
    );
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
  }

  function renderMarkers() {
    if (!markersLayer) return;
    markersLayer.clearLayers();
    mapVisibleBusinesses().forEach(function (b) {
      markersLayer.addLayer(createMarker(b));
    });
  }

  function uniqueCategories() {
    var c = new Set();
    businesses.forEach(function (b) {
      if (!isActive(b)) return;
      if (b.kategorie) c.add(b.kategorie);
    });
    return Array.from(c).sort();
  }

  function categoryMatches(b) {
    if (selectedCategories === null) return true;
    var k = b.kategorie || '';
    return selectedCategories.has(k);
  }

  function filteredBusinesses() {
    var q = ($('list-search') && $('list-search').value.trim().toLowerCase()) || '';
    return businesses.filter(function (b) {
      if (!isActive(b)) return false;
      if (!categoryMatches(b)) return false;
      if (!q) return true;
      var n = (b.naam || '').toLowerCase();
      var d = (b.beskrywing || '').toLowerCase();
      var a = (b.fisieseAdres || '').toLowerCase();
      var f = (b.foon || '').toLowerCase();
      var e = (b.epos || '').toLowerCase();
      var w1 = (b.webwerf || '').toLowerCase();
      var w2 = (b.webwerf2 || '').toLowerCase();
      return (
        n.indexOf(q) >= 0 ||
        d.indexOf(q) >= 0 ||
        a.indexOf(q) >= 0 ||
        f.indexOf(q) >= 0 ||
        e.indexOf(q) >= 0 ||
        w1.indexOf(q) >= 0 ||
        w2.indexOf(q) >= 0
      );
    });
  }

  function normalizeCategorySelection() {
    if (!selectedCategories) return;
    if (selectedCategories.size === 0) {
      selectedCategories = null;
      return;
    }
    if (selectedCategories.size === 1) return;
    var sorted = Array.from(selectedCategories).sort(function (a, b) {
      return a.localeCompare(b, 'af', { sensitivity: 'base' });
    });
    selectedCategories = new Set([sorted[0]]);
  }

  function onCategorySelectValue(value) {
    if (!value || value === 'alle') {
      selectedCategories = null;
    } else {
      selectedCategories = new Set([value]);
    }
    renderCategoryFilters();
    renderList();
    renderMarkers();
  }

  function currentCategorySelectValue() {
    if (selectedCategories === null || selectedCategories.size === 0) return 'alle';
    if (selectedCategories.size === 1) return Array.from(selectedCategories)[0];
    return 'alle';
  }

  function renderCategoryFilters() {
    normalizeCategorySelection();
    var categories = uniqueCategories();
    var val = currentCategorySelectValue();
    var selects = [$('category-select'), $('list-category-select')].filter(Boolean);
    selects.forEach(function (sel) {
      sel.innerHTML = '';
      var o0 = document.createElement('option');
      o0.value = 'alle';
      o0.textContent = 'Alle';
      sel.appendChild(o0);
      categories.forEach(function (cat) {
        var opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        sel.appendChild(opt);
      });
      sel.value = val;
    });
  }

  function setMapFiltersOpen(open) {
    var panel = $('map-filters-panel');
    var btn = $('map-filters-toggle');
    if (!panel || !btn) return;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.classList.toggle('is-open', open);
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function renderList() {
    var ul = $('list-items');
    if (!ul) return;
    ul.innerHTML = '';
    var rows = filteredBusinesses();
    rows.sort(function (a, b) {
      return (a.naam || '').localeCompare(b.naam || '', 'af', { sensitivity: 'base' });
    });
    if (!rows.length) {
      var li0 = document.createElement('li');
      li0.style.cursor = 'default';
      li0.style.color = 'var(--muted)';
      li0.textContent = 'Geen resultate';
      ul.appendChild(li0);
      return;
    }
    rows.forEach(function (b) {
      var li = document.createElement('li');
      li.setAttribute('role', 'listitem');
      var lp = logoPath(b);
      if (lp) {
        var im = document.createElement('img');
        im.className = 'biz-list__logo';
        im.src = lp;
        im.alt = '';
        im.loading = 'lazy';
        im.addEventListener('error', function () {
          this.remove();
          var sp = document.createElement('span');
          sp.className = 'biz-list__icon';
          sp.setAttribute('aria-hidden', 'true');
          setIkoonElement(sp, b, 'biz-list__ikoon');
          li.insertBefore(sp, li.firstChild);
        });
        li.appendChild(im);
      } else {
        var sp0 = document.createElement('span');
        sp0.className = 'biz-list__icon';
        sp0.setAttribute('aria-hidden', 'true');
        setIkoonElement(sp0, b, 'biz-list__ikoon');
        li.appendChild(sp0);
      }
      var nm = document.createElement('span');
      nm.className = 'biz-list__name';
      nm.textContent = b.naam;
      li.appendChild(nm);
      li.addEventListener('click', function () {
        openDrawer(b);
        var c = coordsOf(b);
        if (map && c) map.flyTo([c.lat, c.lng], getMaxFocusZoom(), { duration: 0.5 });
      });
      ul.appendChild(li);
    });
  }

  function updateToggleViewButton() {
    var b = $('btn-toggle-view');
    if (!b) return;
    var isMap = currentView === 'map';
    b.textContent = isMap ? 'Lys' : 'Kaart';
    b.setAttribute('aria-label', isMap ? 'Wys lys' : 'Wys kaart');
  }

  function setView(view) {
    currentView = view;
    var isMap = view === 'map';
    $('view-map').hidden = !isMap;
    $('view-list').hidden = isMap;
    updateToggleViewButton();
    if ($('search-row')) {
      $('search-row').hidden = isMap;
    }
    if (!isMap && $('map-filters')) {
      setMapFiltersOpen(false);
    }
    if (map) {
      setTimeout(function () {
        map.invalidateSize();
        var c = coordsOf(activeBiz);
        if (isMap && activeBiz && c) {
          map.flyTo(
            [c.lat, c.lng],
            getMaxFocusZoom(),
            { duration: 0.75 }
          );
        }
      }, 200);
    }
    updateGotoMapVisibility();
  }

  function setDrawerWebLinks(b) {
    var w1 = b.webwerf;
    var w2 = b.webwerf2;
    var el1 = $('drawer-web');
    var el2 = $('drawer-web-2');
    var wrap = $('drawer-links');
    var any = false;
    if (el1) {
      if (hasStr(w1)) {
        el1.href = w1;
        el1.removeAttribute('hidden');
        any = true;
      } else {
        el1.setAttribute('hidden', '');
      }
    }
    if (el2) {
      if (hasStr(w2)) {
        el2.href = w2;
        el2.removeAttribute('hidden');
        any = true;
      } else {
        el2.setAttribute('hidden', '');
      }
    }
    if (wrap) {
      if (any) wrap.removeAttribute('hidden');
      else wrap.setAttribute('hidden', '');
    }
  }

  function setDrawerBranding(b) {
    var ic = $('drawer-icon');
    if (!ic) return;
    ic.innerHTML = '';
    var lp = logoPath(b);
    if (lp) {
      var im = document.createElement('img');
      im.className = 'drawer__logo';
      im.src = lp;
      im.alt = '';
      im.loading = 'lazy';
      im.addEventListener('error', function () {
        setIkoonElement(ic, b, 'drawer__ikoon');
      });
      ic.appendChild(im);
    } else {
      setIkoonElement(ic, b, 'drawer__ikoon');
    }
  }

  function openDrawer(b) {
    activeBiz = b;
    $('drawer-title').textContent = b.naam;
    setDrawerBranding(b);
    $('drawer-cat').textContent = b.kategorie || '';
    $('drawer-desc').textContent = b.beskrywing || '';
    if ($('drawer-addr')) $('drawer-addr').textContent = b.fisieseAdres || '—';
    if ($('drawer-foon')) $('drawer-foon').textContent = b.foon || '—';
    var eposEl = $('drawer-epos');
    if (eposEl) {
      eposEl.textContent = '';
      if (hasStr(b.epos)) {
        var em = String(b.epos).trim();
        var a = document.createElement('a');
        a.href = 'mailto:' + em.replace(/^mailto:/i, '');
        a.textContent = em;
        a.className = 'drawer__epos-link';
        eposEl.appendChild(a);
      } else {
        eposEl.textContent = '—';
      }
    }
    $('drawer-hours').textContent = b.bedryfsure || '—';
    setDrawerWebLinks(b);
    var payOk = hasStr(b.betaalLightningAdres);
    var tipOk = hasStr(b.fooitjieLightningAdres);
    var row = document.querySelector('.drawer__row');
    if (row) row.classList.toggle('is-single', (payOk && !tipOk) || (!payOk && tipOk));
    if ($('drawer-btn-pay')) {
      if (payOk) $('drawer-btn-pay').removeAttribute('hidden');
      else $('drawer-btn-pay').setAttribute('hidden', '');
    }
    if ($('drawer-btn-tip')) {
      if (tipOk) $('drawer-btn-tip').removeAttribute('hidden');
      else $('drawer-btn-tip').setAttribute('hidden', '');
    }
    var more = $('drawer-more');
    var btnMore = $('drawer-btn-more');
    if (more) more.hidden = true;
    if (btnMore) {
      btnMore.setAttribute('aria-expanded', 'false');
      btnMore.textContent = 'Meer inligting';
    }
    setModalAccent(getAccent());
    var dw = document.getElementById('drawer');
    var bd = document.getElementById('drawer-backdrop');
    if (dw) {
      dw.classList.add('is-open');
      dw.setAttribute('aria-hidden', 'false');
    }
    if (bd) {
      bd.classList.add('is-open');
      bd.removeAttribute('hidden');
    }
    updateGotoMapVisibility();
  }

  function updateGotoMapVisibility() {
    var btn = $('drawer-goto-map');
    if (!btn) return;
    if (activeBiz && currentView === 'list' && coordsOf(activeBiz)) {
      btn.removeAttribute('hidden');
    } else {
      btn.setAttribute('hidden', '');
    }
  }

  function closeDrawer() {
    var dw = document.getElementById('drawer');
    var bd = document.getElementById('drawer-backdrop');
    if (dw) {
      dw.classList.remove('is-open');
      dw.setAttribute('aria-hidden', 'true');
    }
    if (bd) {
      bd.classList.remove('is-open');
      bd.setAttribute('hidden', '');
    }
  }

  function closeAmountModal() {
    if ($('amount-modal')) $('amount-modal').classList.remove('open');
  }

  function openAmountModal() {
    if (!activeBiz) return;
    setModalAccent(getAccent());
    var isTip = payMode === 'tip';
    var addr = isTip ? activeBiz.fooitjieLightningAdres : activeBiz.betaalLightningAdres;
    if (!addr) {
      window.alert(
        isTip
          ? 'Hierdie besigheid het nog geen fooitjie-Lightning-adres in die lys nie.'
          : 'Hierdie besigheid het nog geen betaal-Lightning-adres in die lys nie.'
      );
      return;
    }
    $('amount-modal-title').textContent = (isTip ? 'Fooitjie: ' : 'Betaal: ') + activeBiz.naam;
    $('amount-modal-sub').textContent = isTip
      ? 'Voer die bedrag in Ora (Ф) in vir die personeel.'
      : 'Voer die bedrag in Ora (Ф) in.';
    $('amount-input').value = '';
    $('btn-get-invoice').disabled = true;
    $('btn-get-invoice').textContent = 'Maak faktuur';
    var hint = $('rate-hint');
    hint.textContent = 'Laai wisselkoers…';
    hint.className = 'rate-hint';
    $('amount-modal').classList.add('open');
    Lud21.fetchRate()
      .then(function (r) {
        var sats = Math.round((r.zarUsd / r.btcUsd) * 1e8);
        hint.textContent = '≈ ' + sats + ' sats per Ora (Ф)';
        var v = parseFloat($('amount-input').value);
        $('btn-get-invoice').disabled = !(Lud21.getRateCache() && v > 0);
      })
      .catch(function (e) {
        hint.textContent = 'Koers nie beskikbaar: ' + e.message;
        hint.className = 'rate-hint error';
      });
    setTimeout(function () {
      if ($('amount-input')) $('amount-input').focus();
    }, 80);
  }

  function onAmountInput() {
    var val = parseFloat($('amount-input').value);
    var btn = $('btn-get-invoice');
    var hint = $('rate-hint');
    if (!Lud21.getRateCache() || !(val > 0)) {
      if (btn) btn.disabled = true;
      if (Lud21.getRateCache() && (isNaN(val) || val <= 0)) {
        if (hint && !hint.classList.contains('error')) {
          var r = Lud21.getRateCache();
          var sats = Math.round((r.zarUsd / r.btcUsd) * 1e8);
          hint.textContent = '≈ ' + sats + ' sats per Ora (Ф)';
        }
      }
      return;
    }
    if (btn) btn.disabled = false;
    var msats = Lud21.zarToMsats(val);
    if (hint) {
      hint.textContent = '≈ ' + Lud21.satsDisplay(msats);
      hint.className = 'rate-hint';
    }
  }

  function getPayAddress() {
    if (!activeBiz) return '';
    return payMode === 'tip' ? activeBiz.fooitjieLightningAdres : activeBiz.betaalLightningAdres;
  }

  function closeInvoiceModal() {
    Lud21.stopPolling();
    if ($('invoice-modal')) $('invoice-modal').classList.remove('open');
  }

  function resetInvoiceUI() {
    var canvas = $('qr-canvas');
    var success = $('success-icon');
    var paid = $('paid-msg');
    var link = $('qr-link');
    var spin = $('poll-spinner');
    var st = $('status-text');
    var invTitle = $('invoice-modal-title');
    var invSub = $('invoice-modal-sub');
    if (link) {
      link.removeAttribute('style');
      link.style.display = 'block';
    }
    if (canvas) {
      canvas.style.display = 'block';
    }
    if (success) {
      success.setAttribute('hidden', '');
      success.setAttribute('aria-hidden', 'true');
    }
    if (paid) paid.setAttribute('hidden', '');
    if (spin) spin.style.display = '';
    if (st) st.textContent = payMode === 'tip' ? 'Wag tot die fooi berek word…' : 'Wag vir betaling…';
    if (invTitle) invTitle.style.display = '';
    if (invSub) invSub.style.display = '';
    var invBiz = $('invoice-modal-biz');
    if (invBiz) {
      invBiz.textContent = '';
      invBiz.style.display = 'none';
    }
    var invCopy = $('invoice-copy');
    if (invCopy) {
      invCopy.removeAttribute('hidden');
      invCopy.style.display = '';
    }
    var successTop = $('invoice-success-top');
    if (successTop) successTop.setAttribute('hidden', '');
  }

  function formatOraDisplay(n) {
    if (n == null || isNaN(n)) return '—';
    if (Math.abs(n % 1) < 1e-9) {
      return 'Φ ' + Math.round(n).toLocaleString('af-ZA');
    }
    return 'Φ ' + n.toLocaleString('af-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function onPaid() {
    Lud21.stopPolling();
    var link = $('qr-link');
    var canvas = $('qr-canvas');
    var success = $('success-icon');
    if (link) {
      link.removeAttribute('href');
      link.style.display = 'none';
    }
    if (canvas) canvas.style.display = 'none';
    if (success) {
      success.removeAttribute('hidden');
      success.setAttribute('aria-hidden', 'false');
    }
    if ($('poll-spinner')) $('poll-spinner').style.display = 'none';
    if ($('status-text')) $('status-text').textContent = '';
    if ($('paid-msg')) {
      $('paid-msg').textContent = lastInvoice && lastInvoice.isTip
        ? 'Fooitjie ontvang. Dankie.'
        : 'Betaling ontvang. Dankie.';
      $('paid-msg').removeAttribute('hidden');
    }
    if ($('invoice-copy')) {
      $('invoice-copy').setAttribute('hidden', '');
      $('invoice-copy').style.display = 'none';
    }
    if ($('invoice-modal-title')) $('invoice-modal-title').style.display = 'none';
    if ($('invoice-modal-sub')) $('invoice-modal-sub').style.display = 'none';
    if ($('invoice-modal-biz')) $('invoice-modal-biz').style.display = 'none';
    var kindEl = $('paid-invoice-kind');
    var shopEl = $('paid-shop-name');
    var oraEl = $('paid-ora-amount');
    var topEl = $('invoice-success-top');
    if (kindEl) {
      kindEl.textContent = lastInvoice && lastInvoice.isTip ? 'Fooitjie' : 'Betaling';
    }
    if (shopEl && activeBiz) {
      shopEl.textContent = activeBiz.naam || '';
    }
    if (oraEl) {
      oraEl.textContent = formatOraDisplay(lastInvoice.ora);
    }
    if (topEl) topEl.removeAttribute('hidden');
  }

  function openInvoiceModal(pr, verifyUrl, msats, oraAmount) {
    closeAmountModal();
    if (activeBiz) setModalAccent(getAccent());
    var isTip = payMode === 'tip';
    lastInvoice = {
      pr: pr,
      verify: verifyUrl || null,
      msats: msats,
      ora: typeof oraAmount === 'number' && !isNaN(oraAmount) ? oraAmount : null,
      isTip: isTip
    };
    resetInvoiceUI();
    var invBiz = $('invoice-modal-biz');
    if (invBiz) {
      var bizName = activeBiz && activeBiz.naam ? String(activeBiz.naam).trim() : '';
      if (bizName) {
        invBiz.textContent = bizName;
        invBiz.style.display = 'block';
      } else {
        invBiz.textContent = '';
        invBiz.style.display = 'none';
      }
    }
    if ($('invoice-modal-title')) {
      var payVerb = isTip ? 'Fooitjie' : 'Betaal';
      var titleOra =
        typeof oraAmount === 'number' && !isNaN(oraAmount) && oraAmount > 0
          ? payVerb + ' ' + formatOraDisplay(oraAmount)
          : payVerb;
      $('invoice-modal-title').textContent = titleOra;
      $('invoice-modal-title').style.display = '';
    }
    if ($('invoice-modal-sub')) {
      $('invoice-modal-sub').textContent = isTip
        ? 'Tik op die kode vir die fooi, skandeer, of gebruik “Kopieer faktuur”.'
        : 'Tik op die kode, skandeer, of gebruik “Kopieer faktuur”.';
      $('invoice-modal-sub').style.display = '';
    }
    if ($('invoice-copy')) {
      $('invoice-copy').removeAttribute('hidden');
      $('invoice-copy').textContent = 'Kopieer faktuur';
    }
    var themeDark = isDarkTheme();
    Lud21.renderQR($('qr-canvas'), $('qr-link'), pr, themeDark).catch(function (e) {
      window.alert('QR: ' + e.message);
    });
    if (verifyUrl) {
      Lud21.startPolling(verifyUrl, onPaid, null);
    } else {
      if ($('poll-spinner')) $('poll-spinner').style.display = 'none';
      if ($('status-text')) {
        $('status-text').textContent =
          'Betalingspeuring nie beskikbaar nie. Gebruik jou beursie se bevestiging.';
      }
    }
    $('invoice-modal').classList.add('open');
  }

  function generateInvoice() {
    var val = parseFloat($('amount-input').value);
    if (!activeBiz || !(val > 0) || !Lud21.getRateCache()) return;
    var addr = getPayAddress();
    if (!addr) return;
    var btn = $('btn-get-invoice');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Skep faktuur…';
    }
    var hint = $('rate-hint');
    var msats = Lud21.zarToMsats(val);
    Lud21.resolveLightningAddress(addr)
      .then(function (info) {
        return Lud21.fetchInvoice(info.callback, msats, info.minSendable, info.maxSendable);
      })
      .then(function (data) {
        var verify = data.verify;
        if (typeof verify === 'string' && verify) {
          return openInvoiceModal(data.pr, verify, msats, val);
        }
        if (data.pr) {
          return openInvoiceModal(data.pr, null, msats, val);
        }
        throw new Error('Ongeldige faktuur-antwoord');
      })
      .catch(function (e) {
        if (hint) {
          hint.textContent = 'Fout: ' + e.message;
          hint.className = 'rate-hint error';
        } else {
          window.alert(e.message);
        }
      })
      .then(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Maak faktuur';
        }
      });
  }

  function initPinLabelOption() {
    var v = localStorage.getItem(pinLabelsKey);
    showPinLabels = v !== '0';
    var tgl = $('pin-labels-toggle');
    if (tgl) tgl.checked = showPinLabels;
  }

  function setPinLabels(on) {
    showPinLabels = !!on;
    localStorage.setItem(pinLabelsKey, on ? '1' : '0');
    renderMarkers();
  }

  function initTheme() {
    var t = localStorage.getItem(themeKey);
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    } else {
      var prefers = window.matchMedia('(prefers-color-scheme: light)').matches;
      document.documentElement.setAttribute('data-theme', prefers ? 'light' : 'dark');
    }
    if ($('btn-theme')) {
      $('btn-theme').textContent = isDarkTheme() ? '☀' : '☾';
    }
  }

  function toggleTheme() {
    var next = isDarkTheme() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(themeKey, next);
    if ($('btn-theme')) {
      $('btn-theme').textContent = next === 'dark' ? '☀' : '☾';
    }
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = next === 'dark' ? '#0d0d1a' : '#f4f5f7';
    refreshMapTiles();
  }

  function loadData() {
    return fetch('data/besighede.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('Kon nie data laai nie');
        return r.json();
      })
      .then(function (j) {
        var list = j.besighede || j;
        if (!Array.isArray(list)) throw new Error('Ongeldige data');
        businesses = list;
        renderCategoryFilters();
        renderList();
        renderMarkers();
        fitAllMarkers();
      })
      .catch(function (e) {
        window.alert(e.message);
      });
  }

  function copyInvoice() {
    var pr = lastInvoice.pr;
    if (!pr) return;
    navigator.clipboard.writeText(pr).then(function () {
      var b = $('invoice-copy');
      if (b) {
        b.textContent = 'Gekopieer';
        setTimeout(function () {
          b.textContent = 'Kopieer faktuur';
        }, 1500);
      }
    });
  }

  function wire() {
    $('btn-toggle-view').addEventListener('click', function () {
      setView(currentView === 'map' ? 'list' : 'map');
    });
    $('btn-theme').addEventListener('click', toggleTheme);
    $('drawer-close').addEventListener('click', closeDrawer);
    $('drawer-backdrop').addEventListener('click', closeDrawer);
    $('drawer-btn-pay').addEventListener('click', function () {
      payMode = 'pay';
      openAmountModal();
    });
    $('drawer-btn-tip').addEventListener('click', function () {
      payMode = 'tip';
      openAmountModal();
    });
    if ($('drawer-btn-more')) {
      $('drawer-btn-more').addEventListener('click', function () {
        var more = $('drawer-more');
        var expanded = this.getAttribute('aria-expanded') === 'true';
        var next = !expanded;
        this.setAttribute('aria-expanded', next ? 'true' : 'false');
        if (more) more.hidden = !next;
        this.textContent = next ? 'Minder inligting' : 'Meer inligting';
      });
    }
    if ($('drawer-goto-map')) {
      $('drawer-goto-map').addEventListener('click', function () {
        setView('map');
      });
    }
    if ($('list-search')) {
      $('list-search').addEventListener('input', function () {
        renderList();
      });
    }
    if ($('pin-labels-toggle')) {
      $('pin-labels-toggle').addEventListener('change', function () {
        setPinLabels(this.checked);
      });
    }
    function onCategorySelectChange() {
      onCategorySelectValue(this.value);
    }
    if ($('category-select')) {
      $('category-select').addEventListener('change', onCategorySelectChange);
    }
    if ($('list-category-select')) {
      $('list-category-select').addEventListener('change', onCategorySelectChange);
    }
    if ($('map-filters-toggle') && $('map-filters')) {
      $('map-filters-toggle').addEventListener('click', function (e) {
        e.stopPropagation();
        var panel = $('map-filters-panel');
        var open = panel && panel.hidden;
        setMapFiltersOpen(!!open);
      });
      document.addEventListener('click', function (e) {
        if (currentView !== 'map') return;
        var wrap = $('map-filters');
        if (wrap && !wrap.contains(e.target)) {
          setMapFiltersOpen(false);
        }
      });
    }
    if ($('amount-input')) {
      $('amount-input').addEventListener('input', onAmountInput);
      $('amount-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !$('btn-get-invoice').disabled) {
          e.preventDefault();
          generateInvoice();
        }
      });
    }
    if ($('btn-get-invoice')) {
      $('btn-get-invoice').addEventListener('click', generateInvoice);
    }
    if ($('close-amount')) $('close-amount').addEventListener('click', closeAmountModal);
    if ($('close-invoice')) $('close-invoice').addEventListener('click', closeInvoiceModal);
    if ($('amount-modal')) {
      $('amount-modal').addEventListener('click', function (e) {
        if (e.target === $('amount-modal')) closeAmountModal();
      });
    }
    if ($('invoice-modal')) {
      $('invoice-modal').addEventListener('click', function (e) {
        if (e.target === $('invoice-modal')) closeInvoiceModal();
      });
    }
    if ($('invoice-copy')) {
      $('invoice-copy').addEventListener('click', copyInvoice);
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (currentView === 'map') {
          setMapFiltersOpen(false);
        }
        closeInvoiceModal();
        closeAmountModal();
        closeDrawer();
      }
    });
  }

  initTheme();
  initMap();
  initPinLabelOption();
  wire();
  loadData();
  updateToggleViewButton();
})();
