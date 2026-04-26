/**
 * LUD-21 / LNURLp hulp: Ora (1:1 ZAR) → sats, Lightning-adres → faktuur, QR, verify-polling.
 * Globale: window.Lud21, window.QRCode (qrcode.min.js)
 */
(function (global) {
  'use strict';

  var rateCache = null;
  var pollTimer = null;

  function satsDisplay(msats) {
    var sats = Math.ceil(msats / 1000);
    return sats.toLocaleString('af-ZA') + ' sats';
  }

  function zarToMsats(zar) {
    if (!rateCache) throw new Error('Koers nie gelaai nie');
    var sats = Math.ceil(zar * (rateCache.zarUsd / rateCache.btcUsd) * 1e8);
    return sats * 1000;
  }

  function fetchRate() {
    if (rateCache && Date.now() - rateCache.fetchedAt < 600000) {
      return Promise.resolve(rateCache);
    }
    return fetch('https://price-feed.dev.fedibtc.com/latest')
      .then(function (res) {
        if (!res.ok) throw new Error('Prysvoer fout ' + res.status);
        return res.json();
      })
      .then(function (data) {
        rateCache = {
          btcUsd: data.prices['BTC/USD'].rate,
          zarUsd: data.prices['ZAR/USD'].rate,
          fetchedAt: Date.now()
        };
        return rateCache;
      });
  }

  function getRateCache() {
    return rateCache;
  }

  function resolveLightningAddress(address) {
    var parts = String(address).split('@');
    var user = parts[0];
    var domain = parts[1];
    if (!user || !domain) {
      return Promise.reject(new Error('Ongeldige Lightning-adres'));
    }
    var url = 'https://' + domain + '/.well-known/lnurlp/' + encodeURIComponent(user);
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('Kon nie ' + domain + ' bereik nie (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        if (data.status === 'ERROR') throw new Error(data.reason || 'LNURL fout');
        return data;
      });
  }

  function fetchInvoice(callback, msats, minSendable, maxSendable) {
    if (msats < minSendable) {
      throw new Error('Bedrag te klein (min ' + satsDisplay(minSendable) + ')');
    }
    if (msats > maxSendable) {
      throw new Error('Bedrag te groot (maks ' + satsDisplay(maxSendable) + ')');
    }
    var url = callback + (callback.indexOf('?') >= 0 ? '&' : '?') + 'amount=' + msats;
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('Faktuur-ophaling misluk (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        if (data.status === 'ERROR') throw new Error(data.reason || 'Faktuur fout');
        if (!data.pr) throw new Error('Geen faktuur teruggekeer');
        return data;
      });
  }

  function renderQR(canvas, linkEl, invoice, themeDark) {
    if (!global.QRCode || !global.QRCode.toCanvas) {
      return Promise.reject(new Error('QR-biblioteek ontbreek'));
    }
    var uri = 'lightning:' + String(invoice).toUpperCase();
    var light = themeDark ? '#1a1a2e' : '#f8fafc';
    var dark = themeDark ? '#ffffff' : '#0f172a';
    var opts = {
      width: 240,
      margin: 1,
      color: { dark: dark, light: light },
      errorCorrectionLevel: 'M'
    };
    var ret = global.QRCode.toCanvas(canvas, uri, opts);
    if (ret && typeof ret.then === 'function') {
      return ret.then(function () {
        if (linkEl) linkEl.href = uri;
      });
    }
    return new Promise(function (resolve, reject) {
      global.QRCode.toCanvas(canvas, uri, opts, function (err) {
        if (err) reject(err);
        else {
          if (linkEl) linkEl.href = uri;
          resolve();
        }
      });
    });
  }

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling(verifyUrl, onSettled, onTick) {
    stopPolling();
    if (!verifyUrl) return;
    var failCount = 0;

    function schedule(delay) {
      pollTimer = setTimeout(tick, delay);
    }

    function tick() {
      fetch(verifyUrl)
        .then(function (res) {
          if (!res.ok) throw new Error('verify ' + res.status);
          return res.json();
        })
        .then(function (data) {
          failCount = 0;
          if (onTick) onTick();
          if (data.settled) {
            onSettled();
            return;
          }
        })
        .catch(function () {
          failCount++;
        })
        .then(function () {
          var delay = failCount > 2 ? 10000 : 2000;
          schedule(delay);
        });
    }
    schedule(2000);
  }

  global.Lud21 = {
    fetchRate: fetchRate,
    getRateCache: getRateCache,
    zarToMsats: zarToMsats,
    satsDisplay: satsDisplay,
    resolveLightningAddress: resolveLightningAddress,
    fetchInvoice: fetchInvoice,
    renderQR: renderQR,
    startPolling: startPolling,
    stopPolling: stopPolling
  };
})(typeof window !== 'undefined' ? window : this);
