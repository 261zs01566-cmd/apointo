'use strict';
// あぽいんと！ のブラウザ側の動き（CSPの都合で、HTMLの中には書かずここにまとめる）

// 1. URLのコピーボタン
document.querySelectorAll('[data-copy-target]').forEach((button) => {
  button.addEventListener('click', async () => {
    const input = document.querySelector(button.dataset.copyTarget);
    if (!input) return;
    const label = button.querySelector('.copy-label');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select(); // 古いブラウザ向け
      document.execCommand('copy');
    }
    if (label) {
      const original = label.textContent;
      label.textContent = 'コピーしました';
      setTimeout(() => {
        label.textContent = original;
      }, 1800);
    }
  });
});

// 2. 削除などの確認ダイアログ
document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  });
});

// 3. 二重送信の防止
document.querySelectorAll('form[data-once]').forEach((form) => {
  form.addEventListener('submit', () => {
    setTimeout(() => {
      form.querySelectorAll('button[type="submit"]').forEach((button) => {
        button.disabled = true;
      });
    }, 0);
  });
});

// 4. 候補日の行の追加・削除（イベント作成ページ）
const rows = document.getElementById('candidate-rows');
const template = document.getElementById('candidate-template');
const addButton = document.getElementById('add-candidate');
if (rows && template && addButton) {
  const max = Number(rows.dataset.max) || 20;
  const refresh = () => {
    addButton.disabled = rows.children.length >= max;
  };
  addButton.addEventListener('click', () => {
    if (rows.children.length >= max) return;
    rows.appendChild(template.content.cloneNode(true));
    rows.lastElementChild.querySelector('input').focus();
    refresh();
  });
  rows.addEventListener('click', (event) => {
    const remove = event.target.closest('.js-remove-row');
    if (!remove) return;
    if (rows.children.length <= 1) {
      // 最後の1行は消さずに中身だけ空にする
      rows.querySelectorAll('input').forEach((input) => {
        input.value = '';
      });
      return;
    }
    remove.closest('.candidate-row').remove();
    refresh();
  });
  refresh();
}

// 5. 一言メモの表示切り替え（選択はこのブラウザに記憶する）
const toggle = document.getElementById('toggle-notes');
const table = document.getElementById('result-table');
if (toggle && table) {
  const KEY = 'apointo.showNotes';
  const apply = (on) => {
    table.classList.toggle('show-notes', on);
    toggle.checked = on;
  };
  apply(localStorage.getItem(KEY) === '1');
  toggle.addEventListener('change', () => {
    apply(toggle.checked);
    localStorage.setItem(KEY, toggle.checked ? '1' : '0');
  });
}

// 6. 一言メモのツールチップ（Bootstrap）
document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((element) => {
  new bootstrap.Tooltip(element);
});
