(function () {
  'use strict';

  const STUDENT_PWA_VERSION = '20261018-student-local-deps-081a';

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setStatus(id, ok, okText, badText) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = ok ? okText : badText;
    el.style.color = ok ? '#188038' : '#b06000';
    el.style.fontWeight = '700';
  }

  function realtimeConnected() {
    try {
      return Boolean(ketQuaChannel) && ['joined', 'SUBSCRIBED'].includes(String(ketQuaChannel.state || ketQuaChannel._state || '').toUpperCase());
    } catch (_) {
      return false;
    }
  }

  function renderSystemStatus083A(data) {
    const sessions = data.sessions || {};
    const submissions = data.submissions || {};
    const rooms = data.rooms || {};
    const ai = data.ai || {};

    setStatus('sys083Supabase', true, '✅ Kết nối', '⚠️ Lỗi');
    setStatus('sys083Realtime', realtimeConnected(), '✅ Đã kết nối', '⚠️ Chưa xác nhận');
    setText('sys083Pwa', STUDENT_PWA_VERSION);
    setText('sys083Pending', String(submissions.pending ?? 0));
    setText('sys083Errors', String(submissions.grading_errors ?? 0));
    setText('sys083StudentSessions', `${sessions.student_active ?? 0} active / ${sessions.student_expired ?? 0} cũ`);
    setText('sys083StaffSessions', `${sessions.staff_active ?? 0} active / ${sessions.staff_expired ?? 0} cũ`);
    setText('sys083AdminSessions', `${sessions.admin_active ?? 0} active / ${sessions.admin_expired ?? 0} cũ`);
    setText('sys083Rooms', `${rooms.open ?? 0} mở / ${rooms.collecting ?? 0} thu bài / ${rooms.total ?? 0} tổng`);
    setText('sys083Ai', String(ai.unfinished_unlinked ?? 0));
    setText('sys083Updated', data.server_time ? new Date(data.server_time).toLocaleString('vi-VN') : new Date().toLocaleString('vi-VN'));
  }

  async function loadSystemStatus083A() {
    const card = document.getElementById('subTabStatus');
    if (!card || !card.classList.contains('active')) return;
    const btn = document.getElementById('sys083RefreshBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang kiểm tra...'; }

    setText('sys083Error', '');
    try {
      const token = ensureControlSession('admin');
      const { data, error } = await sb.rpc('rpc_admin_system_status_083a', { p_admin_token: token });
      if (error) throw error;
      if (data?.code === 'admin_session_invalid') {
        clearGvSessionAndReturnToLogin('Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.');
        return;
      }
      if (!data || data.status !== 'success') throw new Error(data?.message || 'Không đọc được trạng thái hệ thống.');
      renderSystemStatus083A(data);
    } catch (err) {
      setStatus('sys083Supabase', false, '✅ Kết nối', '❌ Không đọc được');
      setText('sys083Error', 'Không tải được trạng thái: ' + (err?.message || 'Lỗi không xác định'));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Kiểm tra lại'; }
    }
  }

  window.loadSystemStatus083A = loadSystemStatus083A;
})();
