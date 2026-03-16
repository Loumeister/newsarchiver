const keepScriptsToggle = document.getElementById('keep-scripts');
const savedMsg = document.getElementById('saved-msg');

// Load current settings
chrome.storage.sync.get({ keepScripts: false }, (settings) => {
  keepScriptsToggle.checked = settings.keepScripts;
});

// Save on change
keepScriptsToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ keepScripts: keepScriptsToggle.checked }, () => {
    savedMsg.classList.add('visible');
    setTimeout(() => savedMsg.classList.remove('visible'), 2000);
  });
});
