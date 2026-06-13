/** Background Worker: öffnet die Options Page auf Anfrage des Content Scripts oder Klick auf das Extension-Icon. */

// Klick auf das Extension-Icon in der Chrome-Toolbar → Einstellungen öffnen
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

// Content Script kann Einstellungen auch per Message öffnen (Fallback)
chrome.runtime.onMessage.addListener((msg: unknown) => {
  if (msg === 'chatmail-open-options') {
    void chrome.runtime.openOptionsPage();
  }
});
