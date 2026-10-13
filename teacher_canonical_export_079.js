/* Teacher canonical room DOCX export overlay 079. */
(function () {
  'use strict';

  async function exportPreviewExamToWord079() {
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
        exportMode: 'exam'
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

  window.exportPreviewExamToWord = exportPreviewExamToWord079;
})();
