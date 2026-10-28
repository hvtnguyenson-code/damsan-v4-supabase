(async function () {
  const resultEl = document.getElementById('probeResult');
  const setResult = (state, text) => {
    document.body.dataset.result = state;
    resultEl.textContent = text;
    console.log('NATIVE_DOCX_PROBE', state, text);
  };

  try {
    if (!window.DamSanDocxExporter) throw new Error('DamSanDocxExporter global missing');

    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';
    const html = [
      '<html><head><meta charset="utf-8"></head><body>',
      '<div class="WordSection1">',
      '<table border="0" style="width:100%"><tr>',
      '<td style="white-space:nowrap;text-align:center;vertical-align:top"><p style="font-family:Times New Roman;font-size:12pt;font-weight:bold;text-align:center">TRƯỜNG PTDTNT THPT ĐAM SAN</p></td>',
      '<td style="white-space:nowrap;text-align:center;vertical-align:top"><p style="font-family:Times New Roman;font-size:12pt;font-weight:bold;text-align:center">KIỂM TRA</p></td>',
      '</tr></table>',
      '<hr/>',
      '<table style="width:100%"><tr><td>Họ tên học sinh: ................................ Lớp: ............</td><td><table><tr><td style="border:1pt solid #000;text-align:center"><b>MÃ ĐỀ: 101</b></td></tr></table></td></tr></table>',
      '<p style="font-family:Times New Roman;font-size:12pt;font-weight:bold;text-align:justify;margin-top:12pt;margin-bottom:6pt">PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.</p>',
      '<p style="font-family:Times New Roman;font-size:12pt;text-align:justify"><b>Câu 1:</b> Nội dung kiểm tra DOCX chuẩn.</p>',
      '<p></p>',
      '<p class="choice-tab-row choice-cols-4" data-choice-columns="4" style="margin:0;text-align:left">' +
        '<span class="choice-item" data-choice-item="1">A. Một</span>' +
        '<span class="choice-item" data-choice-item="1">B. Hai</span>' +
        '<span class="choice-item" data-choice-item="1">C. Ba</span>' +
        '<span class="choice-item" data-choice-item="1">D. Bốn</span>' +
      '</p>',
      '<div align="center"><img src="' + tinyPng + '"></div>',
      '<table border="1" style="width:80%;margin:6pt auto"><tr><th>Năm</th><th>Giá trị</th></tr><tr><td>2025</td><td>100</td></tr></table>',
      '<p style="text-align:center;font-weight:bold;font-size:12pt;margin-top:20pt;margin-bottom:6pt">----------HẾT---------</p>',
      '<div style="mso-element:footer" id="f1"><p class="MsoFooter">Mã đề 101 - Trang <span style="mso-field-code: PAGE"></span> / <span style="mso-field-code: NUMPAGES"></span></p></div>',
      '</div></body></html>'
    ].join('');

    const blob = await window.DamSanDocxExporter.packDocument({
      html,
      filename: 'DeThi_MaDe_101.docx',
      bodyStyle: { font: 'Times New Roman', size: 12, align: 'justify', line: 1.15, before: 0, after: 3 },
      marginsCm: { top: 2, right: 2, bottom: 2, left: 2 }
    });

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (blob.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      throw new Error('wrong MIME: ' + blob.type);
    }
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4B) {
      throw new Error('missing PK ZIP signature');
    }
    if (bytes.length < 5000) {
      throw new Error('DOCX unexpectedly small: ' + bytes.length);
    }

    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    window.__nativeDocxProbeBase64 = btoa(binary);

    setResult('PASS', 'native DOCX converter executed in Chrome; bytes=' + bytes.length);
  } catch (error) {
    setResult('FAIL', error && error.stack ? error.stack : String(error));
  }
})();
