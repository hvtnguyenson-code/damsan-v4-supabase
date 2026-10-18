(function () {
  'use strict';

  let lastMaintenancePreview083B = null;

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function totalEligible(preview) {
    const e = preview?.eligible || {};
    return Number(e.student_sessions || 0)
      + Number(e.staff_sessions || 0)
      + Number(e.admin_sessions || 0)
      + Number(e.ai_requests || 0);
  }

  function renderMaintenancePreview083B(data) {
    const e = data.eligible || {};
    lastMaintenancePreview083B = data;
    setText('sys083bStudent', String(e.student_sessions ?? 0));
    setText('sys083bStaff', String(e.staff_sessions ?? 0));
    setText('sys083bAdmin', String(e.admin_sessions ?? 0));
    setText('sys083bAi', String(e.ai_requests ?? 0));
    setText('sys083bPolicy', `Session cũ ≥ ${data.grace?.sessions_days ?? 7} ngày; AI dang dở ≥ ${data.grace?.ai_hours ?? 24} giờ và không gắn phòng thi thật.`);

    const btn = document.getElementById('sys083bCleanupBtn');
    if (btn) {
      const total = totalEligible(data);
      btn.disabled = total === 0;
      btn.style.opacity = total === 0 ? '0.55' : '1';
      btn.textContent = total === 0 ? '✅ Không có dữ liệu cần dọn' : `🧹 Dọn ${total} mục dữ liệu tạm`;
    }
  }

  async function callMaintenance083B(action) {
    const token = ensureControlSession('admin');
    const { data, error } = await sb.rpc('rpc_admin_maintenance_083b', {
      p_admin_token: token,
      p_action: action
    });
    if (error) throw error;
    if (data?.code === 'admin_session_invalid') {
      clearGvSessionAndReturnToLogin('Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.');
      throw new Error('admin_session_invalid');
    }
    if (!data || data.status !== 'success') {
      throw new Error(data?.message || 'Thao tác bảo trì thất bại.');
    }
    return data;
  }

  async function loadMaintenancePreview083B() {
    const panel = document.getElementById('subTabStatus');
    if (!panel || !panel.classList.contains('active')) return null;

    const btn = document.getElementById('sys083bPreviewBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Đang quét...';
    }
    setText('sys083bError', '');

    try {
      const data = await callMaintenance083B('preview');
      renderMaintenancePreview083B(data);
      return data;
    } catch (err) {
      setText('sys083bError', 'Không đọc được dữ liệu tạm: ' + (err?.message || 'Lỗi không xác định'));
      return null;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🔄 Quét lại dữ liệu tạm';
      }
    }
  }

  function buildConfirmation(preview) {
    const e = preview?.eligible || {};
    return [
      'SẮP DỌN DỮ LIỆU TẠM:',
      '',
      `• Session học sinh cũ: ${e.student_sessions || 0}`,
      `• Session giáo viên cũ: ${e.staff_sessions || 0}`,
      `• Session Admin cũ: ${e.admin_sessions || 0}`,
      `• Request AI dang dở, không gắn phòng thi thật: ${e.ai_requests || 0}`,
      '',
      'KHÔNG đụng bài nộp, điểm, đề thi, phòng thi, học sinh hoặc giáo viên.',
      '',
      'Xác nhận dọn?'
    ].join('\n');
  }

  async function cleanupMaintenance083B() {
    const btn = document.getElementById('sys083bCleanupBtn');
    if (btn) btn.disabled = true;
    setText('sys083bError', '');

    try {
      // Always refresh the authoritative preview immediately before confirmation.
      const preview = await callMaintenance083B('preview');
      renderMaintenancePreview083B(preview);
      if (totalEligible(preview) === 0) return;

      if (!window.confirm(buildConfirmation(preview))) return;

      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Đang dọn...';
      }

      const result = await callMaintenance083B('cleanup');
      const d = result.deleted || {};
      window.alert(
        'Đã dọn dữ liệu tạm:\n'
        + `- Session học sinh: ${d.student_sessions || 0}\n`
        + `- Session giáo viên: ${d.staff_sessions || 0}\n`
        + `- Session Admin: ${d.admin_sessions || 0}\n`
        + `- Request AI: ${d.ai_requests || 0}`
      );

      await Promise.allSettled([
        typeof loadSystemStatus083A === 'function' ? loadSystemStatus083A() : Promise.resolve(),
        loadMaintenancePreview083B()
      ]);
    } catch (err) {
      setText('sys083bError', 'Dọn dữ liệu thất bại: ' + (err?.message || 'Lỗi không xác định'));
    } finally {
      if (btn && lastMaintenancePreview083B && totalEligible(lastMaintenancePreview083B) > 0) {
        btn.disabled = false;
      }
    }
  }

  window.loadMaintenancePreview083B = loadMaintenancePreview083B;
  window.cleanupMaintenance083B = cleanupMaintenance083B;
})();