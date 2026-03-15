document.addEventListener('DOMContentLoaded', function() {
  var currentPage = location.pathname.split('/').pop() || 'index.html';

  var navHTML = ''
    + '<nav class="navbar">'
    + '  <a href="index.html" class="logo">📋 <span>退職・失業給付</span>完全ガイド</a>'
    + '  <button class="nav-toggle" aria-label="メニュー"><span></span></button>'
    + '  <ul class="nav-links">'
    + '    <li><a href="timeline.html">📅 タイムライン</a></li>'
    + '    <li><a href="voluntary.html">🙋 自己都合</a></li>'
    + '    <li><a href="company.html">🏢 会社都合</a></li>'
    + '    <li><a href="parttime.html">💼 バイトのルール</a></li>'
    + '    <li><a href="checklist.html">✅ チェックリスト</a></li>'
    + '    <li><a href="calculator.html" class="btn-calc">🧮 給付金計算</a></li>'
    + '    <li><a href="scam.html">⚠️ 詐欺に注意</a></li>'
    + '  </ul>'
    + '</nav>'
    + '<div class="scam-banner">'
    + '  <a href="scam.html">⚠️「失業保険の受給額を増やせる」という広告に注意！運営者は30万円騙されました <span class="scam-cta">→ 詳しく見る</span></a>'
    + '</div>';

  document.body.insertAdjacentHTML('afterbegin', navHTML);

  document.querySelectorAll('.nav-links a').forEach(function(link) {
    if (link.getAttribute('href') === currentPage) {
      link.classList.add('active');
    }
  });

  document.querySelector('.nav-toggle').addEventListener('click', function() {
    this.classList.toggle('open');
    document.querySelector('.nav-links').classList.toggle('open');
  });
  document.querySelectorAll('.nav-links a').forEach(function(link) {
    link.addEventListener('click', function() {
      document.querySelector('.nav-toggle').classList.remove('open');
      document.querySelector('.nav-links').classList.remove('open');
    });
  });
});
