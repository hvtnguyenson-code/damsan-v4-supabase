(function () {
  const frame = document.getElementById('printFrame');
  const out = document.getElementById('probeResult');
  const finish = (state, message) => {
    document.body.dataset.result = state;
    out.textContent = message;
    console.log('CANONICAL_PRINT_METADATA_PROBE', state, message);
  };

  const timeout = setTimeout(() => finish('FAIL', 'timeout waiting for canonical print result'), 45000);

  frame.addEventListener('load', () => {
    try {
      const w = frame.contentWindow;
      const d = frame.contentDocument;
      if (!w || !d) throw new Error('print iframe unavailable');

      // Deliberately set stale header values to reproduce the 079 production defect.
      d.getElementById('pcTruong').value = 'TRUNG TÂM GDNN-GDTX BUÔN HỒ';
      d.getElementById('pcKyThi').value = 'KIỂM TRA THƯỜNG XUYÊN';
      d.getElementById('pcMon').value = 'Lịch sử';
      d.getElementById('pcLop').value = '11';
      d.getElementById('pcThoiGian').value = '15 phút (không kể thời gian phát đề)';

      // Use a distinctive manual print profile. 080 must preserve it exactly.
      d.getElementById('tgtBody').checked = true;
      d.getElementById('fp_font').value = 'Arial';
      d.getElementById('fp_size').value = '11';
      d.getElementById('fp_line').value = '1.0';
      d.getElementById('fp_before').value = '0';
      d.getElementById('fp_after').value = '0';
      w.saveFpUI();
      d.getElementById('fp_margin_top').value = '1.7';
      d.getElementById('fp_margin_bottom').value = '1.8';
      d.getElementById('fp_margin_left').value = '1.9';
      d.getElementById('fp_margin_right').value = '2.0';

      let captured = null;
      w.DamSanDocxExporter = {
        downloadHtml: async (options) => {
          captured = options;
          return { filename: options.filename, size: 12345 };
        }
      };

      const requestId = 'metadata_080_probe';
      const listener = (event) => {
        if (event.source !== w) return;
        const data = event.data || {};
        if (data.type !== 'DAMSAN_CANONICAL_PRINT_RESULT' || data.requestId !== requestId) return;
        window.removeEventListener('message', listener);
        clearTimeout(timeout);

        try {
          if (data.status !== 'accepted') throw new Error(data.message || 'bridge rejected export');
          if (!captured || !captured.html) throw new Error('DOCX exporter did not receive rendered HTML');

          const rendered = captured.html;
          if (!rendered.includes('TRƯỜNG PTDTNT THPT ĐAM SAN')) throw new Error('canonical school metadata missing');
          if (!rendered.includes('KIỂM TRA THƯỜNG XUYÊN')) throw new Error('canonical assessment title missing');
          if (!rendered.includes('Môn: Địa lí - Lớp: 10A4')) throw new Error('canonical subject/class metadata missing');
          if (!rendered.includes('Thời gian: 20 phút (không kể thời gian phát đề)')) throw new Error('canonical duration missing');
          if (rendered.includes('Môn: Lịch sử - Lớp: 11')) throw new Error('stale subject/class leaked into canonical export');

          if (!rendered.includes('data-choice-columns="4"')) throw new Error('short choices were not rendered as one 4-column row');
          if (!rendered.includes('data-choice-columns="2"')) throw new Error('medium choices were not rendered as two equal columns');
          if (!rendered.includes('data-choice-columns="1"')) throw new Error('long choices were not rendered as four single-column rows');
          if (/tab-stops:|mso-tab-count/.test(rendered)) throw new Error('legacy HTML tab spacing leaked into canonical export');
          if (!rendered.includes('class="choice-tab-row')) throw new Error('native paragraph choice rows missing');
          if (rendered.includes('class="choice-grid')) throw new Error('answer choices must not be wrapped in Word layout tables');

          if (captured.bodyStyle?.font !== 'Arial' || Number(captured.bodyStyle?.size) !== 11) {
            throw new Error('manual Trộn đề font profile was not preserved');
          }
          if (String(captured.marginsCm?.top) !== '1.7'
              || String(captured.marginsCm?.bottom) !== '1.8'
              || String(captured.marginsCm?.left) !== '1.9'
              || String(captured.marginsCm?.right) !== '2.0') {
            throw new Error('manual Trộn đề margins were not preserved');
          }

          // Temporary room metadata must be rolled back after rendering.
          if (d.getElementById('pcTruong').value !== 'TRUNG TÂM GDNN-GDTX BUÔN HỒ') throw new Error('school field not restored');
          if (d.getElementById('pcMon').value !== 'Lịch sử') throw new Error('subject field not restored');
          if (d.getElementById('pcLop').value !== '11') throw new Error('class field not restored');
          if (d.getElementById('pcThoiGian').value !== '15 phút (không kể thời gian phát đề)') throw new Error('duration field not restored');

          finish('PASS', 'canonical room metadata overrides stale header for render while preserving Trộn đề layout profile');
        } catch (error) {
          finish('FAIL', error && error.stack ? error.stack : String(error));
        }
      };
      window.addEventListener('message', listener);

      w.postMessage({
        type: 'DAMSAN_EXPORT_CANONICAL_PRINT',
        requestId,
        exportMode: 'exam',
        source: 'browser-probe-080',
        payload: [{
          Phan: '1',
          MucDo: 'NB',
          NoiDung: 'Câu ngắn kiểm tra bố cục bốn phương án.',
          DapAnA: '22/6.',
          DapAnB: '22/12.',
          DapAnC: '23/9.',
          DapAnD: '21/3.',
          DapAnDung: 'A',
          CauSo: 'P1_1',
          MaDe: '1041'
        }, {
          Phan: '1',
          MucDo: 'TH',
          NoiDung: 'Câu vừa kiểm tra bố cục hai phương án trên một hàng.',
          DapAnA: 'phần dưới của lớp manti Trái Đất.',
          DapAnB: 'toàn bộ lớp manti của Trái Đất.',
          DapAnC: 'phần trên của lớp manti Trái Đất.',
          DapAnD: 'nhân ngoài nằm sâu trong Trái Đất.',
          DapAnDung: 'C',
          CauSo: 'P1_2',
          MaDe: '1041'
        }, {
          Phan: '1',
          MucDo: 'VD',
          NoiDung: 'Câu dài kiểm tra bố cục mỗi phương án trên một hàng riêng.',
          DapAnA: 'hướng và tốc độ di chuyển của đối tượng địa lí trong toàn bộ khu vực nghiên cứu.',
          DapAnB: 'phạm vi phân bố của đối tượng địa lí trên một vùng lãnh thổ rộng lớn và phức tạp.',
          DapAnC: 'số lượng đối tượng tại từng điểm cụ thể trong toàn bộ không gian lãnh thổ được khảo sát.',
          DapAnD: 'giá trị tổng cộng của hiện tượng theo từng đơn vị lãnh thổ trong phạm vi nghiên cứu.',
          DapAnDung: 'B',
          CauSo: 'P1_3',
          MaDe: '1041'
        }],
        printContext: {
          pcTruong: 'Trường PTDTNT THPT Đam San',
          pcKyThi: 'KIỂM TRA THƯỜNG XUYÊN',
          pcMon: 'Địa lí',
          pcLop: '10A4',
          pcThoiGian: '20 phút (không kể thời gian phát đề)'
        }
      }, window.location.origin);
    } catch (error) {
      clearTimeout(timeout);
      finish('FAIL', error && error.stack ? error.stack : String(error));
    }
  }, { once: true });
})();
