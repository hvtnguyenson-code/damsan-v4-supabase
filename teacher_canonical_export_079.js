/* Teacher canonical room DOCX export overlay 080. */
(function () {
  'use strict';


  function canonicalRoomPrintTitle080(rawValue) {
    const raw = String(rawValue || '').trim();
    const folded = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (/KTTX|THUONG[ _-]*XUYEN/.test(folded)) return 'KIỂM TRA THƯỜNG XUYÊN';
    if (/KTGK|GIUA[ _-]*KY/.test(folded)) return 'KIỂM TRA GIỮA KỲ';
    if (/KTCK|CUOI[ _-]*KY/.test(folded)) return 'KIỂM TRA CUỐI KỲ';
    return raw;
  }

  function canonicalRoomSubjectName080() {
    const subjectId = (typeof activeWorkspaceMonId !== 'undefined' && activeWorkspaceMonId && activeWorkspaceMonId !== 'ALL')
      ? activeWorkspaceMonId
      : (typeof gvData !== 'undefined' ? gvData?.mon_id : null);
    const rows = (typeof g_sysMonList !== 'undefined' && Array.isArray(g_sysMonList)) ? g_sysMonList : [];
    return String(rows.find((item) => String(item.id) === String(subjectId))?.ten_mon || '').trim();
  }

  function canonicalRoomPrintContext080() {
    const room = (typeof getSelectedRoom === 'function') ? getSelectedRoom('ctrlMaPhong') : null;
    if (!room) throw new Error('Không xác định được metadata phòng thi để dàn trang Word.');

    const className = String(room.DoiTuong || '').trim();
    const duration = Number(room.ThoiGian);
    return {
      pcTruong: String(room.TenTruong || '').trim(),
      pcKyThi: canonicalRoomPrintTitle080(room.TenDotKiemTra),
      pcMon: canonicalRoomSubjectName080(),
      pcLop: (!className || /^TatCa$/i.test(className)) ? '' : className,
      pcThoiGian: Number.isFinite(duration) && duration > 0
        ? duration + ' phút (không kể thời gian phát đề)'
        : ''
    };
  }

  async function exportPreviewExamToWord080() {
    const exams = (typeof previewExamData !== 'undefined' && Array.isArray(previewExamData))
      ? previewExamData
      : [];

    if (!exams.length) {
      alert("⚠️ Chưa có đề chính thức trong phòng để xuất Word.");
      return { status: 'no_data' };
    }
    if (!window.DamSanCanonicalPrint || typeof window.DamSanCanonicalPrint.exportCanonicalExams !== 'function') {
      alert("❌ Bộ cầu nối xuất Word chưa sẵn sàng. Hãy tải lại trang.");
      return { status: 'bridge_unavailable' };
    }

    const btn = document.getElementById('btnExportPreviewWord');
    if (btn?.disabled) return { status: 'busy' };
    if (btn) {
      btn.disabled = true;
      btn.dataset.originalText = btn.textContent;
      btn.textContent = '⏳ Đang tạo Word...';
    }

    try {
      const result = await window.DamSanCanonicalPrint.exportCanonicalExams(exams, {
        source: 'teacher-room-preview',
        exportMode: 'exam',
        printContext: canonicalRoomPrintContext080()
      });
      const count = Number(result?.variantCount || 0);
      alert(count > 0
        ? `✅ Đã bắt đầu xuất ${count} mã đề Word (.docx) từ đúng đề chính thức trong phòng.`
        : "✅ Đã bắt đầu xuất đề Word (.docx) từ đúng đề chính thức trong phòng.");
      return { status: 'success', result };
    } catch (error) {
      alert("❌ Không xuất được Word: " + (error?.message || error));
      return { status: 'error', error };
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset.originalText || '📄 Xuất Word (.docx)';
      }
    }
  }

  window.exportPreviewExamToWord = exportPreviewExamToWord080;
})();
