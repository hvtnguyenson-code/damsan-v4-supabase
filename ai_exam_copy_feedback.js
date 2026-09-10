(() => {
  const button = document.getElementById('btnCopyPrompt');
  const box = document.getElementById('promptBox');
  if (!button || !box) return;

  const defaultLabel = (button.textContent || '').trim() || 'Sao chép prompt';
  let resetTimer = null;

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const text = box.value || '';
    if (!text) {
      if (typeof aieNotice === 'function') aieNotice('Chưa có prompt để sao chép.', 'error');
      return;
    }

    button.disabled = true;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = '✓ Đã sao chép';
      if (typeof aieNotice === 'function') aieNotice('Đã sao chép prompt ra đề.', 'ok');
    } catch {
      box.focus();
      box.select();
      button.textContent = '✓ Đã chọn prompt';
      if (typeof aieNotice === 'function') aieNotice('Trình duyệt không cho ghi clipboard tự động. Prompt đã được chọn để sao chép thủ công.', 'info');
    }

    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      button.textContent = defaultLabel;
      button.disabled = false;
    }, 1800);
  }, true);
})();
