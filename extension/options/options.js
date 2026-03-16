const keepScriptsToggle = document.getElementById('keep-scripts');
const googlebotModeToggle = document.getElementById('googlebot-mode');
const savedMsg = document.getElementById('saved-msg');

function showSaved() {
  savedMsg.classList.add('visible');
  setTimeout(() => savedMsg.classList.remove('visible'), 2000);
}

// Load current settings
chrome.storage.sync.get({ keepScripts: false, googlebotMode: true }, (settings) => {
  keepScriptsToggle.checked = settings.keepScripts;
  googlebotModeToggle.checked = settings.googlebotMode;
});

// Save on change
keepScriptsToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ keepScripts: keepScriptsToggle.checked }, showSaved);
});

googlebotModeToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ googlebotMode: googlebotModeToggle.checked }, showSaved);
});
