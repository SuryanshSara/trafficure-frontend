/* rmi-link.js — route the orb/disk "RMI" item to rmi.html.
   Capture phase so it beats the nav's smooth-scroll preventDefault. */
(function () {
  console.log('[rmi-link] loaded');           // <- check console says this
  function go(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    window.location.href = 'rmi.html';
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    // 1) a real anchor pointing at #rmi (with or without other path)
    var a = t.closest && t.closest('a[href$="#rmi"]');
    if (a) { console.log('[rmi-link] matched #rmi anchor'); return go(e); }
    // 2) any element carrying a data-target/data-section of rmi
    var d = t.closest && t.closest('[data-target="#rmi"],[data-section="rmi"],[data-nav="rmi"]');
    if (d) { console.log('[rmi-link] matched data attr'); return go(e); }
    // 3) fallback: climb ancestors looking for one whose text is exactly RMI
    var node = t;
    while (node && node !== document) {
      if ((node.textContent || '').replace(/[^A-Za-z]/g, '').toUpperCase() === 'RMI') {
        console.log('[rmi-link] matched by text'); return go(e);
      }
      node = node.parentElement;
    }
  }, true);
})();
