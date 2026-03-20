document.addEventListener('DOMContentLoaded', function() {
  var footerHTML = ''
    + '<footer>'
    + '  <div class="footer-inner">'
    + '    <div class="footer-brand">'
    + '      <div class="logo">📋 退職・失業給付 完全ガイド</div>'
    + '      <p>退職から失業給付受け取りまでをわかりやすく解説。2025年最新法改正対応。</p>'
    + '      <div class="disclaimer">⚠️ 本サイトは情報提供を目的としており、個別の法律・税務アドバイスではありません。</div>'
    + '    </div>'
    + '    <div>'
    + '      <h4>コンテンツ</h4>'
    + '      <ul>'
    + '        <li><a href="calculator.html">給付金計算ツール</a></li>'
    + '        <li><a href="timeline.html">Day0〜Day60タイムライン</a></li>'
    + '        <li><a href="voluntary.html">自己都合完全ガイド</a></li>'
    + '        <li><a href="company.html">会社都合完全ガイド</a></li>'
    + '        <li><a href="tokutei.html">特定理由離職者ガイド</a></li>'
    + '        <li><a href="health-insurance.html">退職後の健康保険ガイド</a></li>'
    + '        <li><a href="checklist.html">退職後チェックリスト</a></li>'
    + '        <li><a href="parttime.html">受給中のアルバイト</a></li>'
    + '        <li><a href="elder.html">高年齢求職者給付金</a></li>'
    + '        <li><a href="mental-check.html">メンタルヘルスチェック</a></li>'
    + '        <li><a href="clinic-support.html">医療機関サポート</a></li>'
    + '        <li><a href="scam.html">給付金詐欺に注意</a></li>'
    + '      </ul>'
    + '    </div>'
    + '    <div>'
    + '      <h4>公式情報</h4>'
    + '      <ul>'
    + '        <li><a href="https://www.hellowork.mhlw.go.jp/" target="_blank" rel="noopener">ハローワーク</a></li>'
    + '        <li><a href="https://www.mhlw.go.jp/" target="_blank" rel="noopener">厚生労働省</a></li>'
    + '      </ul>'
    + '    </div>'
    + '  </div>'
    + '  <div class="footer-bottom">© 2025 退職・失業給付 完全ガイド</div>'
    + '</footer>';

  // 既存の <footer> があれば置き換え、なければ body 末尾に追加
  var existingFooter = document.querySelector('footer');
  if (existingFooter) {
    existingFooter.outerHTML = footerHTML;
  } else {
    document.body.insertAdjacentHTML('beforeend', footerHTML);
  }
});
