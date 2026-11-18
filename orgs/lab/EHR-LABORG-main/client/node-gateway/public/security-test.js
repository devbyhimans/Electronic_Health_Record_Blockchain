'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const payloadInput = document.getElementById('payloadInput');
  const textTestForm = document.getElementById('textTestForm');
  const fileTestForm = document.getElementById('fileTestForm');
  const fileInput = document.getElementById('fileInput');

  const resultContainer = document.getElementById('resultContainer');
  const statusBadge = document.getElementById('statusBadge');
  const statusCode = document.getElementById('statusCode');
  const reasonText = document.getElementById('reasonText');
  const rawResult = document.getElementById('rawResult');

  // Handle Preset Buttons
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      payloadInput.value = btn.getAttribute('data-payload') || '';
      payloadInput.focus();
    });
  });

  function renderResult(status, code, data) {
    resultContainer.style.display = 'block';
    statusCode.textContent = `HTTP ${code}`;

    if (code >= 200 && code < 300) {
      statusBadge.innerHTML = '<span class="badge-accepted">ACCEPTED</span>';
      statusBadge.className = '';
      reasonText.style.color = '#a3e635';
      reasonText.textContent = data.message || 'Payload verified and accepted as safe.';
    } else {
      statusBadge.innerHTML = '<span class="badge-rejected">REJECTED</span>';
      statusBadge.className = '';
      reasonText.style.color = '#f87171';
      reasonText.textContent = data.reason || data.error || 'Request rejected by security policy.';
    }

    rawResult.textContent = JSON.stringify(data, null, 2);
    resultContainer.scrollIntoView({ behavior: 'smooth' });
  }

  // Handle Text Submission
  textTestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawVal = payloadInput.value;

    let bodyData;
    try {
      // If user typed JSON like {"$ne": null}, parse it so server receives real object
      bodyData = JSON.parse(rawVal);
      if (typeof bodyData !== 'object' || bodyData === null) {
        bodyData = { input: rawVal };
      }
    } catch (_err) {
      bodyData = { input: rawVal };
    }

    try {
      const response = await fetch('/api/security-test/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
      });

      const data = await response.json().catch(() => ({ status: response.statusText }));
      renderResult(response.ok ? 'ACCEPTED' : 'REJECTED', response.status, data);
    } catch (err) {
      renderResult('ERROR', 500, { error: err.message });
    }
  });

  // Handle File Upload Submission
  fileTestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!fileInput.files || fileInput.files.length === 0) {
      alert('Please select a file.');
      return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    try {
      const response = await fetch('/api/security-test/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => ({ status: response.statusText }));
      renderResult(response.ok ? 'ACCEPTED' : 'REJECTED', response.status, data);
    } catch (err) {
      renderResult('ERROR', 500, { error: err.message });
    }
  });
});
