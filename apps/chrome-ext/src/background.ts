/** Background Worker: öffnet die Options Page auf Anfrage des Content Scripts. */
chrome.runtime.onMessage.addListener((msg: unknown) => {
  if (msg === 'chatmail-open-options') {
    void chrome.runtime.openOptionsPage();
  }
});
