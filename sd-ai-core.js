/* SD AI CORE v1 — public school knowledge bridge */
(function () {
  'use strict';

  const SCHOOL_PATHS = [
    ['posts', 'المنشورات'],
    ['schoolMessages', 'التبليغات'],
    ['liveBroadcast', 'البث المباشر'],
    ['digitalLibrary', 'المكتبة الرقمية'],
    ['books', 'الكتب'],
    ['questionBank', 'بنك الأسئلة']
  ];
  const PUBLIC_FIELDS = new Set([
    'title', 'name', 'headline', 'body', 'text', 'content', 'description',
    'summary', 'subject', 'stage', 'grade', 'className', 'category',
    'type', 'teacher', 'teacherName', 'author', 'date', 'createdAt',
    'question', 'answer', 'lesson', 'chapter', 'term', 'audience'
  ]);
  const PUBLIC_SECTION_IDS = [
    'teachers-section', 'school-info-section', 'notices-section',
    'guidance-public-section', 'live-broadcast-banner', 'v7-timetable',
    'v7-guidance-feed', 'v7-reports', 'v7-contact', 'labs-section',
    'library-section', 'question-bank-section'
  ];
  let history = [];
  let busy = false;
  let lastIndex = { text: '', status: {} };

  function clean(value) {
    return String(value == null ? '' : value)
      .replace(/https?:\/\/\S+/gi, '[رابط]')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isPublicRecord(record) {
    if (!record || typeof record !== 'object') return true;
    if (record.published === false || record.isPublic === false || record.public === false) return false;
    if (String(record.visibility || '').toLowerCase() === 'private') return false;
    if (String(record.status || '').toLowerCase() === 'draft') return false;
    return true;
  }

  function collectAllowedFields(value, label, output, depth) {
    if (depth > 5 || value == null) return;
    if (Array.isArray(value)) {
      value.slice(0, 80).forEach((item) => collectAllowedFields(item, label, output, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    if (!isPublicRecord(value)) return;
    Object.keys(value).forEach((key) => {
      if (key === 'published' || key === 'isPublic' || key === 'public' || key === 'visibility' || key === 'status') return;
      const item = value[key];
      if (PUBLIC_FIELDS.has(key) && (typeof item === 'string' || typeof item === 'number')) {
        const text = clean(item);
        if (text) output.push(label + ' — ' + key + ': ' + text.slice(0, 900));
      } else if (item && typeof item === 'object') {
        collectAllowedFields(item, label, output, depth + 1);
      }
    });
  }

  function collectPageText() {
    const output = [];
    PUBLIC_SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.closest('#admin-dashboard-modal') || el.closest('#sd-assistant-modal')) return;
      const value = clean(el.innerText || el.textContent || '');
      if (value) output.push('قسم ' + id + ': ' + value.slice(0, 1800));
    });
    return output;
  }

  async function collectFirebaseText() {
    const output = [];
    const status = {};
    if (typeof db === 'undefined' || !db || typeof db.ref !== 'function') {
      SCHOOL_PATHS.forEach(([path]) => { status[path] = 'Firebase غير متاح'; });
      return { output, status };
    }
    await Promise.all(SCHOOL_PATHS.map(async ([path, label]) => {
      try {
        const snapshot = await db.ref(path).once('value');
        const value = snapshot.val();
        if (value && typeof value === 'object') collectAllowedFields(value, label, output, 0);
        status[path] = value && typeof value === 'object' ? 'متصل' : 'فارغ';
      } catch (error) {
        status[path] = 'تعذر القراءة';
        console.warn('SD AI CORE source unavailable:', path, error);
      }
    }));
    return { output, status };
  }

  async function refreshIndex() {
    const pageText = collectPageText();
    const cloud = await collectFirebaseText();
    const combined = pageText.concat(cloud.output);
    const unique = Array.from(new Set(combined)).filter(Boolean);
    lastIndex = {
      text: unique.join('\n').slice(0, 14500),
      status: Object.assign({ 'محتوى صفحات الموقع': pageText.length ? pageText.length + ' أقسام' : 'لا توجد نصوص ظاهرة' }, cloud.status)
    };
    return lastIndex;
  }

  function assistantStatus(message) {
    const el = document.getElementById('sd-assistant-status');
    if (el) el.textContent = message;
  }

  function addMessage(message, kind) {
    const box = document.getElementById('sd-assistant-messages');
    if (!box) return;
    const item = document.createElement('div');
    item.className = 'sd-ai-msg ' + kind;
    item.textContent = message;
    box.appendChild(item);
    box.scrollTop = box.scrollHeight;
  }

  function getEndpoint() {
    if (typeof SCHOOL_SUPABASE_URL === 'undefined' || typeof SCHOOL_SUPABASE_PUBLISHABLE_KEY === 'undefined') {
      throw new Error('إعداد اتصال Supabase غير متاح في هذه الصفحة.');
    }
    return {
      url: SCHOOL_SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/bright-api',
      key: SCHOOL_SUPABASE_PUBLISHABLE_KEY
    };
  }

  async function sendMessage() {
    const input = document.getElementById('sd-assistant-input');
    const button = document.querySelector('#sd-assistant-modal button[onclick="sendGeneralAssistantMessage()"]');
    const value = (input && input.value || '').trim();
    if (!value || busy) return;
    if (value.length > 1700) {
      addMessage('الرسالة طويلة. اختصرها إلى 1700 حرف ثم أعد الإرسال.', 'system');
      return;
    }
    busy = true;
    if (button) button.disabled = true;
    addMessage(value, 'user');
    input.value = '';
    assistantStatus('يجري تحديث مصادر معرفة المدرسة...');
    try {
      const index = await refreshIndex();
      const endpoint = getEndpoint();
      const outgoing = history.slice(-10);
      outgoing.push({
        role: 'user',
        content:
          'أنت SD AI CORE، مساعد عام متعدد الاستخدامات ومساعد رسمي لإعدادية صلاح الدين للبنين. أجب عن الأسئلة العامة والعلمية والتقنية والثقافية والكتابة وغيرها اعتماداً على معرفتك العامة. إذا كان السؤال متعلقاً بالمدرسة أو إدارتها أو المدرسين أو التبليغات أو الجداول أو الكتب أو الموارد، فاعتمد أولاً على محتوى المدرسة المنشور أدناه. لا تخترع أسماء أو مواعيد أو معلومات مدرسية. إذا لم تجد معلومة مدرسية محددة، قل بوضوح إنها غير موجودة ضمن المحتوى المنشور حالياً. لا تكشف بيانات خاصة ولا تطلب كلمات مرور أو رموز دخول.\n\n[قاعدة المعرفة المدرسية المنشورة]\n' +
          (index.text || 'لا توجد حالياً نصوص منشورة قابلة للفهرسة.') +
          '\n\n[سؤال المستخدم]\n' + value
      });
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': endpoint.key },
        body: JSON.stringify({ messages: outgoing })
      });
      let data = {};
      try { data = await response.json(); } catch (_) {}
      if (!response.ok || !data.reply) {
        if (response.status === 401 || response.status === 403) throw new Error('الخادم رفض الاتصال. يلزم فحص إعدادات وظيفة الذكاء الاصطناعي.');
        if (response.status === 429) throw new Error('وصل المساعد إلى حد الاستخدام المؤقت. حاول لاحقاً.');
        throw new Error(data.error || 'تعذر الحصول على إجابة من خدمة الذكاء الاصطناعي.');
      }
      const answer = String(data.reply).slice(0, 12000);
      history.push({ role: 'user', content: value }, { role: 'assistant', content: answer });
      history = history.slice(-12);
      addMessage(answer, 'system');
      assistantStatus('SD AI CORE متصل — مصادر المدرسة محدثة');
    } catch (error) {
      console.error('SD AI CORE:', error);
      addMessage(error && error.message ? error.message : 'حدث خطأ غير متوقع. حاول مرة أخرى.', 'system');
      assistantStatus('تعذر الاتصال — تحقق من الخدمة والإنترنت');
    } finally {
      busy = false;
      if (button) button.disabled = false;
      if (input) input.focus();
    }
  }

  window.SD_AI_CORE = {
    refresh: refreshIndex,
    getStatus: function () { return lastIndex.status; },
    getIndexedTextLength: function () { return lastIndex.text.length; }
  };
  window.sendGeneralAssistantMessage = sendMessage;

  function renderAdminStatus(status) {
    const host = document.getElementById('sd-ai-core-source-status');
    if (!host) return;
    host.replaceChildren();
    Object.keys(status || {}).forEach((key) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-3 rounded-xl border border-amber-300/15 bg-white/5 px-3 py-2 text-xs';
      const name = document.createElement('span');
      name.textContent = key;
      const state = document.createElement('b');
      state.className = 'text-amber-200';
      state.textContent = status[key];
      row.append(name, state);
      host.appendChild(row);
    });
  }

  function openAdminCore() {
    const modal = document.getElementById('admin-dashboard-modal');
    if (!modal) return;
    const adminVerified = !!window.sdAdminSession || (typeof isAdminLoggedIn !== 'undefined' && !!isAdminLoggedIn);
    if (!adminVerified) {
      if (typeof toast === 'function') toast('سجّل الدخول إلى لوحة الإدارة أولاً.', false);
      else alert('سجّل الدخول إلى لوحة الإدارة أولاً.');
      return;
    }
    let page = document.getElementById('sd-ai-core-admin-page');
    if (!page) {
      page = document.createElement('section');
      page.id = 'sd-ai-core-admin-page';
      page.className = 'v14-admin-page';
      page.hidden = true;
      page.innerHTML =
        '<div class="v14-page-head"><div><h2 class="font-black text-yellow-100">SD AI CORE — مركز المعرفة</h2><p class="text-xs text-slate-300">يربط المساعد بالمحتوى المنشور في الموقع</p></div><button type="button" class="v14-back" data-ai-back>العودة إلى لوحة المدير</button></div>' +
        '<div class="theme-card rounded-2xl p-4 space-y-3"><p class="text-sm leading-7">يتحدّث فهرس المعرفة تلقائياً عند سؤال المستخدم، ويقرأ الأقسام العامة المنشورة فقط. إدارة المحتوى تتم من أقسام الإدارة الحالية: التبليغات، الجداول، الموارد، المكتبة، المختبرات، والمدرسون. لا يقرأ سجل الطلاب أو الحضور أو بيانات الدخول.</p>' +
        '<div class="flex flex-wrap gap-2"><button type="button" id="sd-ai-core-refresh" class="rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-black text-amber-100">تحديث وفحص مصادر المعرفة</button><button type="button" id="sd-ai-core-test" class="rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-black text-amber-100">اختبار اتصال المساعد</button></div>' +
        '<p id="sd-ai-core-admin-message" class="text-xs text-slate-300" role="status" aria-live="polite">لم يتم إجراء الفحص بعد.</p><div id="sd-ai-core-source-status" class="grid gap-2"></div></div>';
      modal.appendChild(page);
      page.querySelector('[data-ai-back]').addEventListener('click', function () {
        page.hidden = true;
        modal.querySelectorAll('.v14-admin-page').forEach((item) => { item.hidden = true; });
        const home = modal.querySelector('.v14-admin-home');
        if (home) { home.hidden = false; home.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
      page.querySelector('#sd-ai-core-refresh').addEventListener('click', async function () {
        const msg = page.querySelector('#sd-ai-core-admin-message');
        msg.textContent = 'جارٍ فحص مصادر الموقع وقاعدة البيانات...';
        try {
          const result = await refreshIndex();
          renderAdminStatus(result.status);
          msg.textContent = 'اكتمل الفحص. حجم قاعدة المعرفة الحالية: ' + result.text.length + ' حرفاً.';
        } catch (error) {
          msg.textContent = 'تعذر إكمال الفحص: ' + (error.message || 'خطأ غير معروف');
        }
      });
      page.querySelector('#sd-ai-core-test').addEventListener('click', async function () {
        const msg = page.querySelector('#sd-ai-core-admin-message');
        msg.textContent = 'يجري اختبار وظيفة الذكاء الاصطناعي...';
        try {
          const endpoint = getEndpoint();
          const response = await fetch(endpoint.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': endpoint.key },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'أجب بكلمة: متصل' }] })
          });
          const data = await response.json();
          if (!response.ok || !data.reply) throw new Error(data.error || 'استجابة غير صالحة (' + response.status + ')');
          msg.textContent = 'نجح الاتصال بمحرك الذكاء الاصطناعي.';
        } catch (error) {
          msg.textContent = 'فشل الاختبار: ' + (error.message || 'تحقق من إعدادات الخدمة.');
        }
      });
    }
    modal.querySelectorAll('.v14-admin-page').forEach((item) => { item.hidden = true; });
    const home = modal.querySelector('.v14-admin-home');
    if (home) home.hidden = true;
    page.hidden = false;
    page.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function addAdminTile() {
    const nav = document.getElementById('v14-admin-nav');
    if (!nav || document.getElementById('sd-ai-core-admin-tile')) return;
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.id = 'sd-ai-core-admin-tile';
    tile.className = 'v14-admin-tile';
    tile.innerHTML = '<span class="v14-icon">✦</span><span><b>SD AI CORE</b><small>مركز معرفة الذكاء الاصطناعي ومصادر الموقع</small></span>';
    tile.addEventListener('click', openAdminCore);
    nav.appendChild(tile);
  }

  function init() {
    addAdminTile();
    const nav = document.getElementById('v14-admin-nav');
    if (nav) new MutationObserver(addAdminTile).observe(nav, { childList: true });
    const input = document.getElementById('sd-assistant-input');
    if (input) input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        sendMessage();
      }
    });
    assistantStatus('SD AI CORE جاهز — متصل بمعرفة الموقع عند الإرسال');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();