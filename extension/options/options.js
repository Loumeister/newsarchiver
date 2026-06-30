const keepScriptsToggle = document.getElementById('keep-scripts');
const googlebotModeToggle = document.getElementById('googlebot-mode');
const autoBypassToggle = document.getElementById('auto-bypass');
const savedMsg = document.getElementById('saved-msg');
const customRulesArea = document.getElementById('custom-rules');
const customRulesError = document.getElementById('custom-rules-error');
const saveCustomRulesBtn = document.getElementById('save-custom-rules');
const refreshRulesBtn = document.getElementById('refresh-rules');
const rulesStatus = document.getElementById('rules-status');
const adBlockToggle = document.getElementById('adblock-enabled');
const adBlockAllowlistArea = document.getElementById('adblock-allowlist');
const saveAllowlistBtn = document.getElementById('save-allowlist');
const adBlockSaved = document.getElementById('adblock-saved');

function showSaved(el) {
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2000);
}

// Load current settings
chrome.storage.sync.get(
  { keepScripts: false, googlebotMode: true, autoBypass: false, customRules: '[]' },
  (settings) => {
    keepScriptsToggle.checked = settings.keepScripts;
    googlebotModeToggle.checked = settings.googlebotMode;
    autoBypassToggle.checked = settings.autoBypass;
    customRulesArea.value = settings.customRules || '[]';
  }
);

// Save on toggle change
keepScriptsToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ keepScripts: keepScriptsToggle.checked }, () => showSaved(savedMsg));
});

googlebotModeToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ googlebotMode: googlebotModeToggle.checked }, () => showSaved(savedMsg));
});

autoBypassToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ autoBypass: autoBypassToggle.checked }, () => showSaved(savedMsg));
});

// Save custom rules (validate JSON first)
saveCustomRulesBtn.addEventListener('click', () => {
  const raw = customRulesArea.value.trim() || '[]';
  let parsed;
  try {
    parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Must be a JSON array');
  } catch (err) {
    customRulesError.textContent = `Invalid JSON: ${err.message}`;
    customRulesError.style.display = 'block';
    return;
  }
  customRulesError.style.display = 'none';
  chrome.storage.sync.set({ customRules: raw }, () => showSaved(savedMsg));
});

// ── Ad / tracker blocking (stored in chrome.storage.local) ────────────────
chrome.storage.local.get(
  { adBlockEnabled: true, adBlockAllowlist: [] },
  (cfg) => {
    adBlockToggle.checked = cfg.adBlockEnabled;
    adBlockAllowlistArea.value = (cfg.adBlockAllowlist || []).join('\n');
  }
);

adBlockToggle.addEventListener('change', () => {
  chrome.storage.local.set({ adBlockEnabled: adBlockToggle.checked }, () => showSaved(adBlockSaved));
});

saveAllowlistBtn.addEventListener('click', () => {
  const domains = adBlockAllowlistArea.value
    .split('\n')
    .map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''))
    .filter(Boolean);
  // De-duplicate while preserving order
  const unique = [...new Set(domains)];
  adBlockAllowlistArea.value = unique.join('\n');
  chrome.storage.local.set({ adBlockAllowlist: unique }, () => showSaved(adBlockSaved));
});

// Refresh built-in rules (re-reads bundled rules.json via background message)
refreshRulesBtn.addEventListener('click', () => {
  refreshRulesBtn.disabled = true;
  rulesStatus.textContent = 'Refreshing...';
  rulesStatus.classList.add('visible');
  chrome.runtime.sendMessage({ action: 'refreshRulesCache' }, () => {
    rulesStatus.textContent = 'Rules refreshed.';
    setTimeout(() => rulesStatus.classList.remove('visible'), 2000);
    refreshRulesBtn.disabled = false;
  });
});
