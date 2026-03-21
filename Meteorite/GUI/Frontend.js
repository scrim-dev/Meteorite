function sendMessageToBackend(action, data = null) {
    window.external.sendMessage(JSON.stringify({ action, data }));
}

let isAutoDownloaderOn = false;
let autoDownloaderInterval = null;
let lastSeenClipboardUrl = '';
let downloadQueue = [];
let queueRunning = false;
let selectedTheme = 'dark';
let selectedAccent = '#BEF837';
let rainbowModeOn = false;
let smoothScrollingOn = true;
let tourStep = 0;
let sidebarCollapsed = false;
let easterEggUnlocked = false;
let settingsClickCount = 0;

const TOUR_STEPS = [
    {
        target: 'tour-panel-download',
        title: 'Downloader',
        text: 'Paste any Medal.tv clip URL here and hit the arrow button. Press Enter to trigger the download instantly.'
    },
    {
        target: 'tour-panel-options',
        title: 'Download Options',
        text: 'Choose what happens after a clip finishes — auto-open the folder or auto-play the video.'
    },
    {
        target: 'tour-panel-queue',
        title: 'Download Queue',
        text: 'Add multiple clip URLs to a queue and download them one after another. Add a URL and hit Start Queue.'
    },
    {
        target: 'nav-history',
        title: 'History',
        text: 'Every clip you download is logged here with its date, URL, and file location.'
    },
    {
        target: 'nav-settings',
        title: 'Settings',
        text: 'Set your download folder, monitor clipboard, and pick colors. Pst... I heard clicking this 10 times unlocks a hidden surprise. Watch the spinning star!'
    },
    {
        target: 'nav-applogs',
        title: 'App Logs',
        text: 'Real-time log output from the backend — useful for seeing exactly what\'s happening and troubleshooting.'
    },
    {
        target: 'nav-about',
        title: 'About',
        text: 'App version info, links, and credits. That\'s the tour — you\'re all set to use Meteorite!'
    }
];

window.external.receiveMessage((message) => {
    try {
        const res = JSON.parse(message);
        handleBackendMessage(res.type, res.data);
    } catch (e) {
        console.error('Message parse error', e);
    }
});

function handleBackendMessage(type, data) {
    if (type === 'settings_data') {
        document.getElementById('download-path').value = data.DownloadPath;
        document.getElementById('auto-downloader').checked = data.AutoDownloader;
        isAutoDownloaderOn = data.AutoDownloader;
        setupAutoDownloader();

        selectedTheme = data.Theme || 'dark';
        selectedAccent = data.AccentColor || '#BEF837';
        rainbowModeOn = !!data.RainbowMode;
        smoothScrollingOn = data.SmoothScrolling !== false; // default true
        sidebarCollapsed = !!data.SidebarCollapsed;
        easterEggUnlocked = !!data.EasterEggUnlocked;

        applyTheme(selectedTheme);
        applyAccent(selectedAccent);
        applyRainbowMode(rainbowModeOn);
        applySmoothScrolling(smoothScrollingOn);
        applySidebarState(sidebarCollapsed);
        applyEasterEggState(easterEggUnlocked);

        syncSettingsUI();
        return;
    }
    if (type === 'settings_saved') {
        const el = document.getElementById('settings-status');
        el.textContent = 'Settings saved.';
        el.className = 'status-message status-success';
        setTimeout(() => { el.textContent = ''; }, 3000);
        isAutoDownloaderOn = document.getElementById('auto-downloader').checked;
        setupAutoDownloader();
        return;
    }
    if (type === 'history_data') {
        renderHistory(data);
        return;
    }
    if (type === 'app_log') {
        addLog(data.level, data.message, data.time);
        return;
    }
    if (type === 'download_progress') {
        onDownloadProgress(data);
        return;
    }
    if (type === 'download_status') {
        onDownloadStatus(data);
        return;
    }
    if (type === 'clipboard_check') {
        if (data.hasMedalUrl && data.url !== lastSeenClipboardUrl) {
            lastSeenClipboardUrl = data.url;
            document.getElementById('medal-url').value = data.url;
            sendMessageToBackend('download', data.url);
        }
        return;
    }
    if (type === 'app_version') {
        document.getElementById('app-version').textContent = `Version ${data}`;
        return;
    }
    if (type === 'tour_state') {
        if (!data.shown) showWelcomeScreen();
        return;
    }
    if (type === 'update_available') {
        showUpdateModal(data.currentVersion, data.latestVersion);
        return;
    }
    if (type === 'update_not_needed') {
        // Nothing to do — silently pass
        return;
    }
}

function applyTheme(theme) {
    document.body.classList.toggle('theme-light', theme === 'light');
}

function applyAccent(color) {
    if (!color.startsWith('#')) color = '#' + color;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-dim', `rgba(${r},${g},${b},0.15)`);
    document.documentElement.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.45)`);
    document.documentElement.style.setProperty('--border-accent', `rgba(${r},${g},${b},0.35)`);
    document.getElementById('cp-preview').style.backgroundColor = color;
}

function applyRainbowMode(on) {
    document.body.classList.toggle('rainbow-mode', on);
}

function applySmoothScrolling(on) {
    document.documentElement.classList.toggle('no-smooth-scroll', !on);
}

function applySidebarState(collapsed) {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed', collapsed);
}

function applyEasterEggState(unlocked) {
    document.getElementById('rainbow-setting').style.display = unlocked ? 'block' : 'none';
    if (unlocked) {
        // Hide the indicator permanently once unlocked
        const indicator = document.getElementById('egg-indicator');
        indicator.style.opacity = '0';
        indicator.classList.remove('spinning');
    }
}

function syncSettingsUI() {
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-theme') === selectedTheme);
    });
    document.querySelectorAll('.swatch').forEach(sw => {
        sw.classList.toggle('active', sw.getAttribute('data-color').toLowerCase() === selectedAccent.toLowerCase());
    });
    const rainbowCheck = document.getElementById('rainbow-mode');
    if (rainbowCheck) rainbowCheck.checked = rainbowModeOn;

    const smoothCheck = document.getElementById('smooth-scrolling');
    if (smoothCheck) smoothCheck.checked = smoothScrollingOn;
}

function saveCurrentSettings() {
    sendMessageToBackend('save_settings', {
        DownloadPath: document.getElementById('download-path').value.trim(),
        Theme: selectedTheme,
        AccentColor: selectedAccent,
        RainbowMode: rainbowModeOn,
        AutoDownloader: document.getElementById('auto-downloader').checked,
        SidebarCollapsed: sidebarCollapsed,
        EasterEggUnlocked: easterEggUnlocked,
        SmoothScrolling: smoothScrollingOn
    });
}

function onDownloadProgress(data) {
    const container = document.getElementById('loading-container');
    const progress = document.getElementById('loading-progress');
    const details = document.getElementById('download-details');
    const status = document.getElementById('download-status');
    const heroMain = document.getElementById('hero-main-icon');
    const heroFile = document.getElementById('hero-file-icon');

    container.style.display = 'block';
    if (data.status !== 'downloading') return;

    status.textContent = 'Downloading clip...';
    status.className = 'status-message';

    if (heroMain && heroFile) {
        heroMain.className = 'fa-solid fa-box-open';
        heroMain.style.animation = 'none';
        heroFile.style.display = 'block';
        heroFile.style.animation = 'dropFileReal 1s infinite linear';
    }

    if (data.downloaded != null && data.total != null) {
        if (window.mockProgress) clearInterval(window.mockProgress);
        const mbDown = (data.downloaded / 1048576).toFixed(2);
        const mbTotal = (data.total / 1048576).toFixed(2);
        details.textContent = `${mbDown} MB / ${mbTotal} MB`;
        progress.style.width = ((data.downloaded / data.total) * 100) + '%';
    } else {
        let w = 10;
        progress.style.width = w + '%';
        if (window.mockProgress) clearInterval(window.mockProgress);
        window.mockProgress = setInterval(() => {
            if (w >= 90) clearInterval(window.mockProgress);
            else { w += Math.random() * 4; progress.style.width = w + '%'; }
        }, 300);
    }
}

function resetHeroIcon() {
    const heroMain = document.getElementById('hero-main-icon');
    const heroFile = document.getElementById('hero-file-icon');
    if (!heroMain || !heroFile) return;
    heroMain.className = 'fa-solid fa-cloud-arrow-down';
    heroMain.style.animation = 'float 3s ease-in-out infinite';
    heroFile.style.display = 'none';
    heroFile.style.animation = 'none';
}

function onDownloadStatus(data) {
    const status = document.getElementById('download-status');
    const container = document.getElementById('loading-container');
    const progress = document.getElementById('loading-progress');
    const details = document.getElementById('download-details');

    if (window.mockProgress) clearInterval(window.mockProgress);

    if (data.status === 'success') {
        progress.style.width = '100%';
        const fp = data.entry?.FilePath ?? '';

        const successDiv = document.createElement('div');
        successDiv.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;';

        const successSpan = document.createElement('span');
        successSpan.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;';
        successSpan.textContent = 'Downloaded successfully!';

        const pathBtn = document.createElement('button');
        pathBtn.className = 'btn-primary';
        pathBtn.style.cssText = 'height:28px;font-size:11px;padding:0 12px;';
        pathBtn.textContent = 'View Path';
        pathBtn.onclick = () => showModal('Download Path', 'File saved to:', 'prompt', null, fp);

        successDiv.appendChild(successSpan);
        successDiv.appendChild(pathBtn);
        status.innerHTML = '';
        status.appendChild(successDiv);
        status.className = 'status-message status-success';
        document.getElementById('medal-url').value = '';

        if (document.getElementById('opt-open-folder')?.checked) sendMessageToBackend('open_folder', fp);
        if (document.getElementById('opt-play-video')?.checked) sendMessageToBackend('play_video', fp);

        markActiveQueueItemDone();
        resetHeroIcon();

        setTimeout(() => {
            container.style.display = 'none';
            details.textContent = '';
            progress.style.width = '0%';
            status.innerHTML = '';
            status.className = 'status-message';
        }, 3500);
    } else {
        container.style.display = 'none';
        details.textContent = '';
        progress.style.width = '0%';
        status.textContent = `Error: ${data.message}`;
        status.className = 'status-message status-error';
        markActiveQueueItemError();
        resetHeroIcon();
    }
}

function markActiveQueueItemDone() {
    const idx = downloadQueue.findIndex(i => i.status === 'active');
    if (idx !== -1) downloadQueue[idx].status = 'done';
    renderQueue();
    if (queueRunning) advanceQueue();
}

function markActiveQueueItemError() {
    const idx = downloadQueue.findIndex(i => i.status === 'active');
    if (idx !== -1) downloadQueue[idx].status = 'error';
    renderQueue();
    if (queueRunning) advanceQueue();
}

document.addEventListener('DOMContentLoaded', () => {
    runSplash();

    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            views.forEach(v => {
                v.classList.remove('active');
                if (v.id === tabId) v.classList.add('active');
            });
            if (tabId === 'history') sendMessageToBackend('get_history');
            if (tabId === 'settings') sendMessageToBackend('get_settings');

            if (tabId === 'settings' && !easterEggUnlocked) {
                settingsClickCount++;
                const indicator = document.getElementById('egg-indicator');

                // Show the spinning star immediately on first click; grow opacity with each click
                indicator.classList.add('spinning');
                indicator.style.opacity = Math.min(settingsClickCount / 10, 1).toString();

                if (settingsClickCount >= 10) {
                    easterEggUnlocked = true;
                    applyEasterEggState(true);
                    showModal('Easter Egg Unlocked!', 'You\'ve unlocked the secret Rainbow Mode in Settings! ✦', 'alert');
                    saveCurrentSettings();
                }
            }
        });
    });

    document.getElementById('btn-download').addEventListener('click', () => {
        const url = document.getElementById('medal-url').value.trim();
        if (url) sendMessageToBackend('download', url);
    });

    document.getElementById('medal-url').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('btn-download').click();
    });

    document.getElementById('btn-save-settings').addEventListener('click', () => {
        selectedTheme = document.querySelector('.theme-btn.active')?.getAttribute('data-theme') || 'dark';
        rainbowModeOn = document.getElementById('rainbow-mode').checked;
        smoothScrollingOn = document.getElementById('smooth-scrolling').checked;
        applySmoothScrolling(smoothScrollingOn);
        saveCurrentSettings();
        applyTheme(selectedTheme);
        applyAccent(selectedAccent);
        applyRainbowMode(rainbowModeOn);
    });

    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedTheme = btn.getAttribute('data-theme');
            applyTheme(selectedTheme);
        });
    });

    document.querySelectorAll('.swatch').forEach(sw => {
        sw.addEventListener('click', () => {
            document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
            sw.classList.add('active');
            selectedAccent = sw.getAttribute('data-color');
            applyAccent(selectedAccent);
        });
    });

    document.getElementById('btn-sidebar-toggle').addEventListener('click', () => {
        sidebarCollapsed = !sidebarCollapsed;
        applySidebarState(sidebarCollapsed);
        saveCurrentSettings();
    });

    document.getElementById('btn-open-color-picker').addEventListener('click', () => {
        document.getElementById('color-picker-modal').style.display = 'flex';
        document.getElementById('cp-hex-input').value = selectedAccent.replace('#', '');
        document.getElementById('cp-preview').style.backgroundColor = selectedAccent;

        document.querySelectorAll('.cp-swatch').forEach(s => {
            s.classList.toggle('active', s.getAttribute('data-color').toLowerCase() === selectedAccent.toLowerCase());
        });
    });

    document.querySelectorAll('.cp-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
            document.querySelectorAll('.cp-swatch').forEach(s => s.classList.remove('active'));
            sw.classList.add('active');
            const color = sw.getAttribute('data-color');
            document.getElementById('cp-hex-input').value = color.replace('#', '');
            document.getElementById('cp-preview').style.backgroundColor = color;
        });
    });

    document.getElementById('cp-hex-input').addEventListener('input', e => {
        let val = e.target.value.trim();
        if (val.length === 3 || val.length === 6) {
            if (/^[0-9A-Fa-f]+$/.test(val)) {
                document.getElementById('cp-preview').style.backgroundColor = '#' + val;
            }
        }
    });

    document.getElementById('cp-confirm').addEventListener('click', () => {
        let val = document.getElementById('cp-hex-input').value.trim();
        if (/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(val)) {
            selectedAccent = '#' + val;
            applyAccent(selectedAccent);
            saveCurrentSettings();
            document.getElementById('color-picker-modal').style.display = 'none';
        } else {
            showModal('Invalid Color', 'Please enter a valid hex code (e.g. BEF837)', 'alert');
        }
    });

    document.getElementById('cp-cancel').addEventListener('click', () => {
        document.getElementById('color-picker-modal').style.display = 'none';
    });

    document.getElementById('rainbow-mode').addEventListener('change', e => {
        rainbowModeOn = e.target.checked;
        applyRainbowMode(rainbowModeOn);
    });

    document.getElementById('smooth-scrolling').addEventListener('change', e => {
        smoothScrollingOn = e.target.checked;
        applySmoothScrolling(smoothScrollingOn);
    });

    document.getElementById('btn-clear-history').addEventListener('click', () => {
        showModal('Clear History', 'Are you sure you want to clear all download history?', 'confirm', () => {
            sendMessageToBackend('clear_history');
        });
    });

    document.getElementById('btn-clear-logs').addEventListener('click', () => {
        document.getElementById('log-container').innerHTML = '';
    });

    document.getElementById('btn-add-queue').addEventListener('click', () => {
        const url = document.getElementById('queue-url-input').value.trim();
        if (!url) return;
        addToQueue(url);
        document.getElementById('queue-url-input').value = '';
    });

    document.getElementById('queue-url-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('btn-add-queue').click();
    });

    document.getElementById('btn-clear-queue').addEventListener('click', () => {
        if (queueRunning) return;
        downloadQueue = [];
        renderQueue();
    });

    document.getElementById('btn-start-queue').addEventListener('click', () => {
        if (queueRunning || downloadQueue.length === 0) return;
        queueRunning = true;
        advanceQueue();
    });

    document.getElementById('btn-start-tour').addEventListener('click', () => {
        hideWelcomeScreen();
        startTour();
    });

    document.getElementById('btn-skip-tour').addEventListener('click', () => {
        hideWelcomeScreen();
        completeTour();
    });

    document.getElementById('btn-tour-next').addEventListener('click', tourNext);
    document.getElementById('btn-tour-skip').addEventListener('click', () => {
        endTour();
        completeTour();
    });

    // Update modal buttons
    document.getElementById('btn-update-now').addEventListener('click', () => {
        sendMessageToBackend('open_url', 'https://github.com/scrim-dev/Meteorite/releases');
        document.getElementById('update-modal').style.display = 'none';
    });
    document.getElementById('btn-update-later').addEventListener('click', () => {
        sendMessageToBackend('snooze_update');
        document.getElementById('update-modal').style.display = 'none';
    });
});

function runSplash() {
    const splash = document.getElementById('splash-screen');
    const bar = document.getElementById('splash-bar');
    const statusEl = document.getElementById('splash-status');
    const steps = [
        { pct: 20, label: 'Initializing...' },
        { pct: 50, label: 'Loading settings...' },
        { pct: 80, label: 'Connecting...' },
        { pct: 100, label: 'Ready.' }
    ];
    let i = 0;
    const tick = setInterval(() => {
        if (i >= steps.length) {
            clearInterval(tick);
            setTimeout(() => {
                splash.classList.add('fade-out');
                setTimeout(() => {
                    splash.style.display = 'none';
                    sendMessageToBackend('ui_ready');
                    sendMessageToBackend('get_settings');
                    sendMessageToBackend('check_tour');
                    sendMessageToBackend('check_update');
                }, 500);
            }, 400);
            return;
        }
        bar.style.width = steps[i].pct + '%';
        statusEl.textContent = steps[i].label;
        i++;
    }, 420);
}

function showWelcomeScreen() {
    const screen = document.getElementById('welcome-screen');
    screen.style.display = 'flex';

    const skipBtn = document.getElementById('btn-skip-tour');
    const countdownEl = document.getElementById('skip-countdown');

    let secs = 10;
    const countdown = setInterval(() => {
        secs--;
        if (secs <= 0) {
            clearInterval(countdown);
            skipBtn.disabled = false;
            skipBtn.innerHTML = 'Skip';
        } else {
            countdownEl.textContent = secs;
        }
    }, 1000);
}

function hideWelcomeScreen() {
    document.getElementById('welcome-screen').style.display = 'none';
}

function startTour() {
    tourStep = 0;
    document.getElementById('tour-overlay').style.display = 'block';
    showTourStep(tourStep);
}

/**
 * showTourStep — scrolls the target element into view first, then
 * positions the highlight box and tooltip over it.
 * Uses a short delay after scrollIntoView so the layout has settled.
 */
function showTourStep(idx) {
    const step = TOUR_STEPS[idx];
    const targetEl = document.getElementById(step.target);
    const highlight = document.getElementById('tour-highlight');
    const tooltip = document.getElementById('tour-tooltip');

    document.getElementById('tour-step-label').textContent = step.title;
    document.getElementById('tour-step-count').textContent = `${idx + 1} / ${TOUR_STEPS.length}`;
    document.getElementById('tour-tooltip-text').textContent = step.text;
    document.getElementById('btn-tour-next').innerHTML = idx === TOUR_STEPS.length - 1
        ? '<i class="fa-solid fa-check"></i> Done'
        : 'Next <i class="fa-solid fa-arrow-right"></i>';

    if (!targetEl) {
        tooltip.style.display = 'block';
        return;
    }

    // Scroll target into view, then position after animation settles
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

    const positionOverlay = () => {
        const rect = targetEl.getBoundingClientRect();
        const pad = 8;
        highlight.style.top    = (rect.top  - pad) + 'px';
        highlight.style.left   = (rect.left - pad) + 'px';
        highlight.style.width  = (rect.width  + pad * 2) + 'px';
        highlight.style.height = (rect.height + pad * 2) + 'px';
        highlight.style.display = 'block';

        const tipW = 320;
        const tipH = 160;
        let tipTop  = rect.bottom + 16;
        let tipLeft = rect.left;
        if (tipTop + tipH > window.innerHeight)  tipTop  = rect.top - tipH - 16;
        if (tipLeft + tipW > window.innerWidth)   tipLeft = window.innerWidth - tipW - 16;
        if (tipLeft < 8) tipLeft = 8;
        if (tipTop  < 8) tipTop  = 8;

        tooltip.style.top  = tipTop  + 'px';
        tooltip.style.left = tipLeft + 'px';
        tooltip.style.display = 'block';
    };

    // Wait for scroll animation (smooth scroll can take ~300-400ms)
    // Use requestAnimationFrame + setTimeout to ensure layout is complete
    requestAnimationFrame(() => {
        setTimeout(positionOverlay, 350);
    });
}

function tourNext() {
    if (tourStep >= TOUR_STEPS.length - 1) {
        endTour();
        completeTour();
        return;
    }
    tourStep++;
    showTourStep(tourStep);
}

function endTour() {
    document.getElementById('tour-overlay').style.display = 'none';
    document.getElementById('tour-highlight').style.display = 'none';
    document.getElementById('tour-tooltip').style.display = 'none';
}

function completeTour() {
    sendMessageToBackend('tour_done');
}

function showUpdateModal(currentVersion, latestVersion) {
    document.getElementById('update-current-badge').textContent = `Current: ${currentVersion}`;
    document.getElementById('update-latest-badge').textContent = `Latest: ${latestVersion}`;
    document.getElementById('update-modal').style.display = 'flex';
}

function renderHistory(list) {
    const container = document.getElementById('history-list');
    container.innerHTML = '';
    if (!list || list.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">No download history.</p>';
        return;
    }
    list.forEach(entry => {
        const date = new Date(entry.DownloadDate).toLocaleString();
        const item = document.createElement('div');
        item.className = 'history-item';

        const det = document.createElement('div');
        det.className = 'history-details';
        det.innerHTML = `<h3>${entry.Title}</h3><p>${date} &bull; ${entry.Url}</p>`;

        const actions = document.createElement('div');
        actions.className = 'history-actions';

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-danger';
        delBtn.style.cssText = 'height:30px;padding:0 12px;font-size:11px;';
        delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        delBtn.onclick = () => sendMessageToBackend('delete_history_entry', entry.Id);

        actions.appendChild(delBtn);
        item.appendChild(det);
        item.appendChild(actions);
        container.appendChild(item);
    });
}

function setupAutoDownloader() {
    if (autoDownloaderInterval) {
        clearInterval(autoDownloaderInterval);
        autoDownloaderInterval = null;
    }
    if (isAutoDownloaderOn) {
        autoDownloaderInterval = setInterval(() => {
            sendMessageToBackend('check_clipboard');
        }, 3000);
    }
}

function addLog(level, message, time) {
    const container = document.getElementById('log-container');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${level}`;
    entry.innerHTML = `<span class="log-time">[${time}]</span><span class="log-message">${message}</span>`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
    if (container.children.length > 1000) container.removeChild(container.firstChild);
}

function showModal(title, message, type, confirmCallback, inputText) {
    type = type || 'alert';
    inputText = inputText || '';

    const overlay = document.getElementById('custom-modal');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;

    const btnContainer = document.getElementById('modal-buttons');
    const inputContainer = document.getElementById('modal-input-container');
    const inputEl = document.getElementById('modal-input');
    btnContainer.innerHTML = '';

    if (type === 'prompt') {
        inputContainer.style.display = 'block';
        inputEl.value = inputText;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-primary';
        copyBtn.textContent = 'Copy Path';
        copyBtn.onclick = () => { inputEl.select(); document.execCommand('copy'); closeModal(); };

        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn-secondary';
        closeBtn.textContent = 'Close';
        closeBtn.onclick = closeModal;

        btnContainer.appendChild(copyBtn);
        btnContainer.appendChild(closeBtn);
    } else if (type === 'confirm') {
        inputContainer.style.display = 'none';

        const yesBtn = document.createElement('button');
        yesBtn.className = 'btn-primary';
        yesBtn.textContent = 'Yes';
        yesBtn.onclick = () => { if (confirmCallback) confirmCallback(); closeModal(); };

        const noBtn = document.createElement('button');
        noBtn.className = 'btn-secondary';
        noBtn.textContent = 'No';
        noBtn.onclick = closeModal;

        btnContainer.appendChild(yesBtn);
        btnContainer.appendChild(noBtn);
    } else {
        inputContainer.style.display = 'none';

        const okBtn = document.createElement('button');
        okBtn.className = 'btn-primary';
        okBtn.textContent = 'OK';
        okBtn.onclick = closeModal;
        btnContainer.appendChild(okBtn);
    }

    overlay.style.display = 'flex';
}

function closeModal() {
    document.getElementById('custom-modal').style.display = 'none';
}

function addToQueue(url) {
    downloadQueue.push({ url, status: 'pending' });
    renderQueue();
}

function renderQueue() {
    const list = document.getElementById('queue-list');
    const counter = document.getElementById('queue-count');
    list.innerHTML = '';

    const pending = downloadQueue.filter(i => i.status === 'pending' || i.status === 'active');
    counter.textContent = pending.length;

    if (downloadQueue.length === 0) {
        list.innerHTML = '<p class="queue-empty"><i class="fa-solid fa-inbox"></i> Queue is empty</p>';
        return;
    }

    downloadQueue.forEach((item, idx) => {
        const el = document.createElement('div');
        el.className = 'queue-item';

        const urlEl = document.createElement('span');
        urlEl.className = 'queue-item-url';
        urlEl.title = item.url;
        urlEl.textContent = item.url;

        const statusEl = document.createElement('span');
        statusEl.className = `queue-item-status queue-status-${item.status}`;
        statusEl.textContent = item.status;

        el.appendChild(urlEl);
        el.appendChild(statusEl);

        if (item.status !== 'active') {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'queue-item-remove';
            removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            removeBtn.onclick = () => { downloadQueue.splice(idx, 1); renderQueue(); };
            el.appendChild(removeBtn);
        }

        list.appendChild(el);
    });
}

function advanceQueue() {
    const nextIdx = downloadQueue.findIndex(i => i.status === 'pending');
    if (nextIdx === -1) {
        queueRunning = false;
        renderQueue();
        return;
    }
    downloadQueue[nextIdx].status = 'active';
    renderQueue();
    sendMessageToBackend('download', downloadQueue[nextIdx].url);
}
