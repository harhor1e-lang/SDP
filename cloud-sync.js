/* Salah Al-Din School — cloud mirror for V5.1/V6 local records.
   Keeps local cache for instant rendering and mirrors school records to Firebase RTDB.
   Student browser-session identity and appearance preferences intentionally remain device-local. */
(function () {
  'use strict';
  const KEYS = [
    'sd_v51_tasks','sd_v51_events','sd_v51_maintenance','sd_v51_suggestions',
    'sd_v51_timetables','sd_v51_initiatives','sd_v51_achievements',
    'sd_v6_smart_timetable','sd_v6_school_map',
    'sd_v61_admin_audit','sd_v61_approval_queue','sd_v61_school_archive',
    'sd_v61_early_warning_records','sd_v61_exam_lab_records','sd_v6_certificates',
    'sd_v61_assignment_tasks','salahAlDinV6AttendanceLocal',
    'salahaldin_site_text_edits_v2'
  ];
  const ROOT = 'platformCloud/v1';
  const ORIGIN = 'sdp-' + Math.random().toString(36).slice(2, 10);
  const MAX_BYTES = 4 * 1024 * 1024;
  const refs = Object.create(null);
  const initialSeen = new Set();
  const dirtyBeforeReady = new Set();
  const pending = Object.create(null);
  let bootstrapped = false;
  let state = 'تهيئة المزامنة السحابية…';
  let failures = 0;
  let badge;

  function render() {
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'sd-cloud-sync-status';
      badge.setAttribute('role', 'status');
      badge.style.cssText = 'position:fixed;top:10px;left:10px;z-index:9998;padding:7px 11px;border:1px solid rgba(212,175,55,.35);border-radius:12px;background:rgba(5,10,18,.88);color:#e9d9a2;font:700 11px Cairo, sans-serif;backdrop-filter:blur(12px);max-width:calc(100vw - 20px);direction:rtl;box-shadow:0 5px 18px #0005';
      document.body.appendChild(badge);
    }
    badge.textContent = state;
    badge.title = 'مزامنة سجلات المنصة مع Firebase Realtime Database';
    badge.style.borderColor = failures ? 'rgba(248,113,113,.7)' : 'rgba(52,211,153,.45)';
  }

  function setState(message, failed) {
    state = message;
    failures = failed ? failures + 1 : 0;
    render();
  }

  function rawSet(key, value) {
    Storage.prototype.setItem.call(localStorage, key, value);
  }
  function rawRemove(key) {
    Storage.prototype.removeItem.call(localStorage, key);
  }

  function refFor(key) {
    if (!refs[key]) refs[key] = firebase.database().ref(ROOT + '/' + key);
    return refs[key];
  }

  function writeCloud(key) {
    if (!bootstrapped || !KEYS.includes(key)) {
      if (KEYS.includes(key)) dirtyBeforeReady.add(key);
      return;
    }
    clearTimeout(pending[key]);
    pending[key] = setTimeout(async function () {
      try {
        const value = localStorage.getItem(key);
        if (value === null) {
          await refFor(key).remove();
        } else {
          if (new Blob([value]).size > MAX_BYTES) throw new Error('حجم سجل ' + key + ' يتجاوز الحد الآمن للمزامنة');
          const parsed = JSON.parse(value);
          await refFor(key).set({
            schemaVersion: 1,
            origin: ORIGIN,
            updatedAt: Date.now(),
            value: parsed
          });
        }
        setState('☁️ الحفظ السحابي متصل', false);
      } catch (error) {
        console.error('[SD cloud sync]', key, error);
        setState('⚠️ تعذرت مزامنة بعض البيانات — ستبقى النسخة المحلية محفوظة', true);
      }
    }, 250);
  }

  function installStorageHooks() {
    const proto = Storage.prototype;
    const originalSet = proto.setItem;
    const originalRemove = proto.removeItem;
    proto.setItem = function (key, value) {
      originalSet.call(this, key, value);
      if (this === localStorage && KEYS.includes(String(key))) writeCloud(String(key));
    };
    proto.removeItem = function (key) {
      originalRemove.call(this, key);
      if (this === localStorage && KEYS.includes(String(key))) writeCloud(String(key));
    };
  }

  function listen(key) {
    const ref = refFor(key);
    let first = true;
    ref.on('value', function (snapshot) {
      const remote = snapshot.val();
      if (first) {
        first = false;
        initialSeen.add(key);
        if (remote && Object.prototype.hasOwnProperty.call(remote, 'value')) {
          try {
            rawSet(key, JSON.stringify(remote.value));
          } catch (error) {
            console.error('[SD cloud restore]', key, error);
            setState('⚠️ تعذرت استعادة بعض السجلات من السحابة', true);
          }
        } else {
          const local = localStorage.getItem(key);
          if (local !== null) {
            try {
              const parsed = JSON.parse(local);
              ref.set({ schemaVersion: 1, origin: ORIGIN, updatedAt: Date.now(), value: parsed })
                .catch(error => {
                  console.error('[SD cloud migration]', key, error);
                  setState('⚠️ تعذّر رفع بعض البيانات القديمة', true);
                });
            } catch (error) {
              console.warn('[SD cloud migration] تجاهل سجل محلي غير صالح:', key, error);
            }
          }
        }
        if (initialSeen.size === KEYS.length) {
          bootstrapped = true;
          dirtyBeforeReady.clear();
          setState('☁️ المزامنة السحابية جاهزة', false);
        }
        return;
      }
      if (!remote || !Object.prototype.hasOwnProperty.call(remote, 'value')) {
        rawRemove(key);
        return;
      }
      if (remote.origin === ORIGIN) return;
      try {
        rawSet(key, JSON.stringify(remote.value));
      } catch (error) {
        console.error('[SD cloud update]', key, error);
        setState('⚠️ تعذّر تحديث نسخة هذا الجهاز', true);
      }
    }, function (error) {
      console.error('[SD cloud listener]', key, error);
      setState('⚠️ Firebase رفض المزامنة: ' + (error.message || 'تحقق من اتصال قاعدة البيانات'), true);
    });
  }

  function start() {
    if (!window.firebase || !firebase.apps || !firebase.apps.length || !firebase.database) {
      setState('⚠️ Firebase غير مهيأ — لم تتغير البيانات المحلية', true);
      return;
    }
    installStorageHooks();
    KEYS.forEach(listen);
  }

  window.SDCloudSync = {
    getStatus: function () { return { ready: bootstrapped, state: state, keys: KEYS.slice() }; },
    retry: function () {
      failures = 0;
      setState('إعادة محاولة المزامنة…', false);
      if (!bootstrapped) KEYS.forEach(function (key) { if (!refs[key]) listen(key); });
      else KEYS.forEach(writeCloud);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();