// AI-EXAM-031C: restore a safe cleanup path after a page reload drops the
// short-lived AI capability. Pending/working requests can be rejected without
// ever obtaining a new capability or mutating the target room.
const aieOpenRequest031B2 = aieOpenRequest;
aieOpenRequest = function aieOpenRequest031C(requestId) {
  const request = aieRequests.find((item) => item.request_id === requestId);
  aieOpenRequest031B2(requestId);
  if (!request) return;

  const approve = document.getElementById('btnApprove');
  const reject = document.getElementById('btnReject');
  approve.style.display = '';
  reject.style.display = '';

  if (!['AWAITING_AI', 'AI_WORKING', 'FAILED'].includes(request.status)) return;

  aieCurrentRequestId = request.request_id;
  document.getElementById('reviewMeta').textContent = `${request.ma_phong} · ${request.status} · request chưa có draft có thể duyệt`;
  document.getElementById('preview').innerHTML = [
    '<div class="question">',
    '<h3>Request AI chưa hoàn tất</h3>',
    '<div>Capability AI là thông tin ngắn hạn và không được lưu sau khi tải lại trang.</div>',
    '<div class="source">Có thể từ chối request này để dọn trạng thái rồi tạo một request mới. Thao tác từ chối không ghi hoặc thay đề trong phòng thi.</div>',
    '</div>'
  ].join('');
  approve.style.display = 'none';
  reject.disabled = false;
  document.getElementById('reviewCard').classList.remove('hidden');
  document.getElementById('reviewCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
};
