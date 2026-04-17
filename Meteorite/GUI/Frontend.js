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
let smoothScrollingOn = true;
let guiScale = 100;
let tourStep = 0;
let sidebarCollapsed = false;
let currentTab = 'downloader';

const TOUR_STEPS = [
    {
        target: 'tour-panel-download',
        title: 'Downloader',
        text: 'Paste any Medal.tv clip URL here and hit the arrow button. Press Enter to trigger the download instantly.'
    },
    {
        target: 'tour-panel-options',
        title: 'Download Options',
        text: 'Choose what happens after a clip finishes: auto-open the folder or auto-play the video.'
    },
    {
        target: 'tour-panel-queue',
        title: 'Download Queue',
        text: 'Add multiple clip URLs to a queue and download them one after another. Add a URL and hit Start Queue.'
    },
    {
        target: 'nav-history',
        title: 'History',
        text: 'Every clip you download is logged here with its title, URL, date, file path, and size.'
    },
    {
        target: 'nav-settings',
        title: 'Settings',
        text: 'Set your download folder, pick a theme and accent color, adjust GUI scale, and more. Settings autosave when you leave this tab.'
    },
    {
        target: 'nav-applogs',
        title: 'App Logs',
        text: 'Real-time log output from the backend, useful for seeing exactly what\'s happening and troubleshooting.'
    },
    {
        target: 'nav-about',
        title: 'About',
        text: 'App version info, links, and credits. That\'s the tour - you\'re all set to use Meteorite!'
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
        smoothScrollingOn = data.SmoothScrolling !== false;
        guiScale = data.GUIScale || 100;
        sidebarCollapsed = !!data.SidebarCollapsed;

        applyTheme(selectedTheme);
        applyAccent(selectedAccent);
        applySmoothScrolling(smoothScrollingOn);
        applyGuiScale(guiScale);
        applySidebarState(sidebarCollapsed);

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
    if (type === 'beta_build') {
        showBetaModal(data.currentVersion, data.latestVersion);
        return;
    }
    if (type === 'update_not_needed') {
        // Nothing to do - silently pass
        return;
    }
    if (type === 'videos_data') {
        videoList = data || [];
        renderVideoLibrary(videoList);
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

function applySmoothScrolling(on) {
    document.documentElement.classList.toggle('no-smooth-scroll', !on);
}

function applyGuiScale(scale) {
    guiScale = scale;
    const factor = scale / 100;
    // Use transform + inverse dimensions so content is never clipped at any scale
    document.documentElement.style.setProperty('--gui-scale', factor);
    const container = document.querySelector('.app-container');
    if (container) {
        container.style.width  = (100 / factor) + 'vw';
        container.style.height = (100 / factor) + 'vh';
    }
    // Update label and slider
    const lbl = document.getElementById('gui-scale-label');
    if (lbl) lbl.textContent = scale + '%';
    const slider = document.getElementById('gui-scale');
    if (slider) {
        slider.value = scale;
        // Fill the track left of the thumb with accent color
        const min = parseInt(slider.min, 10) || 70;
        const max = parseInt(slider.max, 10) || 150;
        const pct = ((scale - min) / (max - min) * 100).toFixed(2) + '%';
        slider.style.setProperty('--slider-fill', pct);
    }
}

function applySidebarState(collapsed) {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed', collapsed);
}

function syncSettingsUI() {
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-theme') === selectedTheme);
    });
    document.querySelectorAll('.swatch').forEach(sw => {
        sw.classList.toggle('active', sw.getAttribute('data-color').toLowerCase() === selectedAccent.toLowerCase());
    });

    const smoothCheck = document.getElementById('smooth-scrolling');
    if (smoothCheck) smoothCheck.checked = smoothScrollingOn;

    const scaleSlider = document.getElementById('gui-scale');
    if (scaleSlider) scaleSlider.value = guiScale;
    const scaleLbl = document.getElementById('gui-scale-label');
    if (scaleLbl) scaleLbl.textContent = guiScale + '%';
}

function saveCurrentSettings() {
    selectedTheme = document.querySelector('.theme-btn.active')?.getAttribute('data-theme') || selectedTheme;
    smoothScrollingOn = document.getElementById('smooth-scrolling')?.checked ?? smoothScrollingOn;
    sendMessageToBackend('save_settings', {
        DownloadPath: document.getElementById('download-path').value.trim(),
        Theme: selectedTheme,
        AccentColor: selectedAccent,
        AutoDownloader: document.getElementById('auto-downloader').checked,
        SidebarCollapsed: sidebarCollapsed,
        SmoothScrolling: smoothScrollingOn,
        GUIScale: guiScale
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

            // Autosave settings when leaving the settings tab
            if (currentTab === 'settings' && tabId !== 'settings') {
                saveCurrentSettings();
            }

            currentTab = tabId;
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            views.forEach(v => {
                v.classList.remove('active');
                if (v.id === tabId) v.classList.add('active');
            });
            if (tabId === 'history') sendMessageToBackend('get_history');
            if (tabId === 'settings') sendMessageToBackend('get_settings');
            if (tabId === 'videos') loadVideosTab();
        });
    });

    document.getElementById('btn-download').addEventListener('click', () => {
        const url = document.getElementById('medal-url').value.trim();
        if (url) sendMessageToBackend('download', url);
    });

    document.getElementById('medal-url').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('btn-download').click();
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

    document.getElementById('smooth-scrolling').addEventListener('change', e => {
        smoothScrollingOn = e.target.checked;
        applySmoothScrolling(smoothScrollingOn);
    });

    // GUI Scale slider
    document.getElementById('gui-scale').addEventListener('input', e => {
        const val = parseInt(e.target.value, 10);
        applyGuiScale(val);
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
        sendMessageToBackend('open_url', 'https://github.com/scrim-dev/Meteorite/releases/latest');
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
 * showTourStep - scrolls the target element into view, waits for scroll to
 * fully settle, then snaps the highlight and tooltip into place.
 * The highlight has no CSS transition so it always reflects the post-scroll position.
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

    // Hide both while repositioning to avoid flash of wrong position
    highlight.style.display = 'none';
    tooltip.style.display = 'none';

    if (!targetEl) {
        tooltip.style.display = 'block';
        return;
    }

    // Scroll the content panel (not window) so the highlight stays fixed-correct
    const contentEl = document.querySelector('.content');
    const activeView = document.querySelector('.view.active');
    if (activeView) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }

    const positionOverlay = () => {
        const rect = targetEl.getBoundingClientRect();
        const pad = 8;

        // Highlight - fixed position based on viewport rect
        highlight.style.top    = (rect.top  - pad) + 'px';
        highlight.style.left   = (rect.left - pad) + 'px';
        highlight.style.width  = (rect.width  + pad * 2) + 'px';
        highlight.style.height = (rect.height + pad * 2) + 'px';
        highlight.style.display = 'block';

        // Tooltip - positioned relative to viewport
        const tipW = 320;
        const tipH = 170;
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

    // Wait for smooth scroll to settle (~500ms), then snap positions
    requestAnimationFrame(() => {
        setTimeout(positionOverlay, 500);
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
    document.getElementById('update-modal-title').textContent = 'Update Available';
    document.getElementById('update-modal-message').textContent = 'A newer version of Meteorite is available. Update to get the latest features and fixes.';
    document.getElementById('update-current-badge').textContent = `Current: ${currentVersion}`;
    document.getElementById('update-latest-badge').textContent = `Latest: ${latestVersion}`;
    
    document.getElementById('btn-update-now').style.display = 'inline-flex';
    document.getElementById('btn-update-later').innerHTML = 'Skip for Now';

    const icon = document.querySelector('#update-modal-icon i');
    if(icon) icon.className = 'fa-solid fa-circle-up';
    document.getElementById('update-modal-icon').style.color = 'var(--accent)';

    document.getElementById('update-modal').style.display = 'flex';
}

function showBetaModal(currentVersion, latestVersion) {
    document.getElementById('update-modal-title').textContent = 'Early Access Build';
    document.getElementById('update-modal-message').textContent = 'You are running an early access or beta build. Please be warned that there might be bugs or errors.';
    document.getElementById('update-current-badge').textContent = `Beta: ${currentVersion}`;
    document.getElementById('update-latest-badge').textContent = `Stable: ${latestVersion}`;
    
    document.getElementById('btn-update-now').style.display = 'none';
    document.getElementById('btn-update-later').innerHTML = 'Acknowledge';

    const icon = document.querySelector('#update-modal-icon i');
    if(icon) icon.className = 'fa-solid fa-flask';
    document.getElementById('update-modal-icon').style.color = 'var(--danger)';

    document.getElementById('update-modal').style.display = 'flex';
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return 'Unknown size';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
}

function renderHistory(list) {
    const container = document.getElementById('history-list');
    container.innerHTML = '';
    if (!list || list.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px 20px;"><i class="fa-solid fa-inbox" style="font-size:2rem;display:block;margin-bottom:10px;opacity:0.4;"></i>No download history yet.</p>';
        return;
    }
    list.forEach(entry => {
        const date = new Date(entry.DownloadDate).toLocaleString();
        const item = document.createElement('div');
        item.className = 'history-item';

        // Left: icon + details
        const iconEl = document.createElement('div');
        iconEl.className = 'history-icon';
        iconEl.innerHTML = '<i class="fa-solid fa-film"></i>';

        const det = document.createElement('div');
        det.className = 'history-details';

        const titleEl = document.createElement('div');
        titleEl.className = 'history-title';
        titleEl.textContent = entry.Title || 'Untitled Clip';

        const metaEl = document.createElement('div');
        metaEl.className = 'history-meta';

        const urlSpan = document.createElement('span');
        urlSpan.className = 'history-url';
        urlSpan.textContent = entry.Url;
        urlSpan.title = entry.Url;

        const sep1 = document.createElement('span');
        sep1.className = 'history-sep';
        sep1.textContent = '·';

        const dateSpan = document.createElement('span');
        dateSpan.textContent = date;

        const sep2 = document.createElement('span');
        sep2.className = 'history-sep';
        sep2.textContent = '·';

        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'history-size';
        sizeSpan.textContent = formatFileSize(entry.FileSize);

        metaEl.appendChild(urlSpan);
        metaEl.appendChild(sep1);
        metaEl.appendChild(dateSpan);
        metaEl.appendChild(sep2);
        metaEl.appendChild(sizeSpan);

        // File path row
        const pathEl = document.createElement('div');
        pathEl.className = 'history-path';
        pathEl.innerHTML = `<i class="fa-solid fa-folder"></i> ${entry.FilePath || 'Path unknown'}`;

        det.appendChild(titleEl);
        det.appendChild(metaEl);
        det.appendChild(pathEl);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'history-actions';

        const openBtn = document.createElement('button');
        openBtn.className = 'btn-secondary history-action-btn';
        openBtn.title = 'Open file location';
        openBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i>';
        openBtn.onclick = () => sendMessageToBackend('open_folder', entry.FilePath);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-secondary history-action-btn';
        copyBtn.title = 'Copy URL';
        copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';
        copyBtn.onclick = () => {
            showModal('Clip URL', 'Source URL for this clip:', 'prompt', null, entry.Url);
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-danger history-action-btn';
        delBtn.title = 'Remove from history';
        delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        delBtn.onclick = () => sendMessageToBackend('delete_history_entry', entry.Id);

        actions.appendChild(openBtn);
        actions.appendChild(copyBtn);
        actions.appendChild(delBtn);

        item.appendChild(iconEl);
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
        copyBtn.textContent = 'Copy';
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

/* ============================================================
   Videos Tab
   ============================================================ */

let videoList = [];
let activeVideoEntry = null;
let vpDuration = 0;
let vpTrimStart = 0;
let vpTrimEnd = 0;
let trimRecorder = null;
let trimChunks = [];

// ---- Load videos from backend ----
function loadVideosTab() {
    sendMessageToBackend('get_videos');
}

// ---- Format seconds to M:SS ----
function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ---- Render library cards ----
function renderVideoLibrary(list) {
    const lib = document.getElementById('video-library');
    const empty = document.getElementById('video-empty-state');
    const countLbl = document.getElementById('video-count-label');

    // Remove old cards (keep empty state node)
    Array.from(lib.children).forEach(c => { if (c !== empty) c.remove(); });

    if (!list || list.length === 0) {
        empty.style.display = 'flex';
        countLbl.textContent = '0 videos';
        return;
    }

    empty.style.display = 'none';
    countLbl.textContent = `${list.length} video${list.length !== 1 ? 's' : ''}`;

    list.forEach(v => {
        const vName = v.name || v.Name || 'Unknown Video';
        const vPath = v.path || v.Path || '';
        const vSize = v.size || v.Size;
        const vMod = v.modified || v.Modified;
        const vFullPath = v.fullPath || v.FullPath || '';

        const safeV = { name: vName, path: vPath, size: vSize, modified: vMod, fullPath: vFullPath };

        const card = document.createElement('div');
        card.className = 'video-card' + (activeVideoEntry && activeVideoEntry.path === safeV.path ? ' active' : '');
        card.dataset.path = safeV.path;

        const sizeMB = safeV.size ? (safeV.size / 1048576).toFixed(1) + ' MB' : '';
        const modDate = safeV.modified ? new Date(safeV.modified).toLocaleDateString() : '';

        // Left Icon
        const iconContainer = document.createElement('div');
        iconContainer.className = 'video-list-icon';
        const iconEl = document.createElement('i');
        iconEl.className = 'fa-solid fa-file-video';
        iconContainer.appendChild(iconEl);

        // Details
        const detailsContainer = document.createElement('div');
        detailsContainer.className = 'video-card-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'video-card-name';
        nameEl.textContent = safeV.name;
        nameEl.title = safeV.name;

        const metaEl = document.createElement('div');
        metaEl.className = 'video-card-meta';

        if (sizeMB) {
            const sizeSpan = document.createElement('span');
            sizeSpan.textContent = sizeMB;
            metaEl.appendChild(sizeSpan);
        }
        if (sizeMB && modDate) {
            const sep = document.createElement('span');
            sep.textContent = '·';
            metaEl.appendChild(sep);
        }
        if (modDate) {
            const dateSpan = document.createElement('span');
            dateSpan.textContent = modDate;
            metaEl.appendChild(dateSpan);
        }

        detailsContainer.appendChild(nameEl);
        detailsContainer.appendChild(metaEl);

        card.appendChild(iconContainer);
        card.appendChild(detailsContainer);

        card.addEventListener('click', () => loadVideoInPlayer(safeV));
        lib.appendChild(card);
    });
}

// ---- Load a video into the player ----
function loadVideoInPlayer(v) {
    activeVideoEntry = v;

    // Update active state on cards
    document.querySelectorAll('.video-card').forEach(c => {
        c.classList.toggle('active', c.dataset.path === v.path);
    });

    // Show the player, hide placeholder
    document.getElementById('vp-placeholder').style.display = 'none';
    document.getElementById('vp-active').style.display = 'flex';

    const vid = document.getElementById('vp-video');
    vid.src = v.path;
    vid.load();

    // Reset controls
    vpSetSeek(0);
    document.getElementById('vp-time-current').textContent = '0:00';
    document.getElementById('vp-time-total').textContent = '0:00';
    setPlayIcon(false);

    // Reset trim
    vpTrimStart = 0;
    vpTrimEnd = 0;
    document.getElementById('trim-start').value = 0;
    document.getElementById('trim-end').value = 1000;
    updateTrimSelection();
    document.getElementById('vp-trim-range-label').textContent = 'Full clip';
    document.getElementById('trim-start-label').textContent = 'Start: 0:00';
    document.getElementById('trim-end-label').textContent = 'End: 0:00';
    document.getElementById('trim-export-status').textContent = '';
    document.getElementById('trim-export-status').className = 'trim-export-status';
}

// ---- Player helpers ----
function setPlayIcon(playing) {
    const icon = document.getElementById('vp-play-icon');
    if (!icon) return;
    icon.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
}

function vpSetSeek(pct) {
    const el = document.getElementById('vp-seek');
    if (!el) return;
    el.value = pct * 1000;
    el.style.setProperty('--vp-fill', (pct * 100).toFixed(2) + '%');
}

function vpSetVol(pct) {
    const el = document.getElementById('vp-vol');
    if (!el) return;
    el.value = pct * 100;
    el.style.setProperty('--vp-fill', (pct * 100).toFixed(2) + '%');
}

function showOverlay(playing) {
    const ov = document.getElementById('vp-overlay-play');
    if (!ov) return;
    const i = ov.querySelector('i');
    if (i) i.className = playing ? 'fa-solid fa-play' : 'fa-solid fa-pause';
    ov.classList.remove('show');
    void ov.offsetWidth; // reflow to restart animation
    ov.classList.add('show');
    setTimeout(() => ov.classList.remove('show'), 450);
}

// ---- Trim timeline helpers ----
function updateTrimSelection() {
    const track = document.getElementById('trim-track');
    const sel = document.getElementById('trim-selection');
    if (!track || !sel) return;

    const s = parseInt(document.getElementById('trim-start').value, 10) / 1000;
    const e = parseInt(document.getElementById('trim-end').value, 10) / 1000;
    sel.style.left = (s * 100).toFixed(2) + '%';
    sel.style.width = ((e - s) * 100).toFixed(2) + '%';

    // Update time labels
    const tStart = s * vpDuration;
    const tEnd = e * vpDuration;
    vpTrimStart = tStart;
    vpTrimEnd = tEnd;

    document.getElementById('trim-start-label').textContent = 'Start: ' + fmtTime(tStart);
    document.getElementById('trim-end-label').textContent = 'End: ' + fmtTime(tEnd);

    const dur = tEnd - tStart;
    document.getElementById('vp-trim-range-label').textContent =
        (dur < vpDuration - 0.5) ? `${fmtTime(tStart)} - ${fmtTime(tEnd)} (${fmtTime(dur)})` : 'Full clip';
}

// ---- Wire up player events after DOM ready ----
document.addEventListener('DOMContentLoaded', () => {
    const vid = document.getElementById('vp-video');
    const seekEl = document.getElementById('vp-seek');
    const volEl = document.getElementById('vp-vol');
    const playBtn = document.getElementById('vp-play-btn');
    const muteBtn = document.getElementById('vp-mute-btn');
    const fsBtn = document.getElementById('vp-fullscreen-btn');
    const openFileBtn = document.getElementById('vp-openfile-btn');

    if (!vid) return;

    // --- Video element events ---
    vid.addEventListener('loadedmetadata', () => {
        vpDuration = vid.duration || 0;
        document.getElementById('vp-time-total').textContent = fmtTime(vpDuration);
        document.getElementById('vp-time-current').textContent = '0:00';

        // Reset trim handles to full clip
        vpTrimStart = 0;
        vpTrimEnd = vpDuration;
        document.getElementById('trim-start').value = 0;
        document.getElementById('trim-end').value = 1000;
        updateTrimSelection();

        vpSetVol(vid.volume);
    });

    vid.addEventListener('timeupdate', () => {
        if (!vid.duration) return;
        const pct = vid.currentTime / vid.duration;
        vpSetSeek(pct);
        document.getElementById('vp-time-current').textContent = fmtTime(vid.currentTime);
    });

    vid.addEventListener('ended', () => {
        setPlayIcon(false);
    });

    vid.addEventListener('play', () => setPlayIcon(true));
    vid.addEventListener('pause', () => setPlayIcon(false));

    // --- Play / Pause ---
    playBtn.addEventListener('click', () => {
        const wasPaused = vid.paused;
        if (wasPaused) { vid.play(); } else { vid.pause(); }
        showOverlay(wasPaused);
    });

    // Click on video itself to toggle play
    // Wrap element
    const wrap = document.querySelector('.vp-video-wrap');
    if (wrap) {
        wrap.addEventListener('click', (e) => {
            if (e.target === wrap || e.target === vid) {
                const wasPaused = vid.paused;
                if (wasPaused) { vid.play(); } else { vid.pause(); }
                showOverlay(wasPaused);
            }
        });
    }

    // --- Seek ---
    seekEl.addEventListener('input', () => {
        if (!vid.duration) return;
        const pct = parseInt(seekEl.value, 10) / 1000;
        vid.currentTime = pct * vid.duration;
        seekEl.style.setProperty('--vp-fill', (pct * 100).toFixed(2) + '%');
    });

    // --- Volume ---
    volEl.addEventListener('input', () => {
        const pct = parseInt(volEl.value, 10) / 100;
        vid.volume = pct;
        vid.muted = pct === 0;
        volEl.style.setProperty('--vp-fill', (pct * 100).toFixed(2) + '%');
        updateVolIcon();
    });

    // --- Mute toggle ---
    muteBtn.addEventListener('click', () => {
        vid.muted = !vid.muted;
        if (vid.muted) {
            vpSetVol(0);
        } else {
            vid.volume = vid.volume || 0.7;
            vpSetVol(vid.volume);
        }
        updateVolIcon();
    });

    function updateVolIcon() {
        const icon = document.getElementById('vp-vol-icon');
        if (!icon) return;
        if (vid.muted || vid.volume === 0) {
            icon.className = 'fa-solid fa-volume-xmark';
        } else if (vid.volume < 0.5) {
            icon.className = 'fa-solid fa-volume-low';
        } else {
            icon.className = 'fa-solid fa-volume-high';
        }
    }

    // --- Open file location ---
    openFileBtn.addEventListener('click', () => {
        if (activeVideoEntry) sendMessageToBackend('open_folder', activeVideoEntry.fullPath);
    });

    // --- Fullscreen ---
    fsBtn.addEventListener('click', () => {
        const vw = document.querySelector('.vp-video-wrap');
        if (!vw) return;
        if (!document.fullscreenElement) {
            vw.requestFullscreen().then(() => {
                fsBtn.querySelector('i').className = 'fa-solid fa-compress';
            }).catch(() => {});
        } else {
            document.exitFullscreen().then(() => {
                fsBtn.querySelector('i').className = 'fa-solid fa-expand';
            }).catch(() => {});
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            const i = fsBtn.querySelector('i');
            if (i) i.className = 'fa-solid fa-expand';
        }
    });

    // Initialize volume fill
    vpSetVol(1);

    // --- Trim handles ---
    const trimStartEl = document.getElementById('trim-start');
    const trimEndEl = document.getElementById('trim-end');

    trimStartEl.addEventListener('input', () => {
        // Enforce start < end
        const s = parseInt(trimStartEl.value, 10);
        const e = parseInt(trimEndEl.value, 10);
        if (s >= e - 10) trimStartEl.value = e - 10;
        updateTrimSelection();
    });

    trimEndEl.addEventListener('input', () => {
        const s = parseInt(trimStartEl.value, 10);
        const e = parseInt(trimEndEl.value, 10);
        if (e <= s + 10) trimEndEl.value = s + 10;
        updateTrimSelection();
    });

    // --- Preview trim button ---
    document.getElementById('btn-trim-preview').addEventListener('click', () => {
        if (!vid.src) return;
        vid.currentTime = vpTrimStart;
        vid.play();

        // Pause at trim end
        const stopAt = vpTrimEnd;
        const checker = setInterval(() => {
            if (vid.currentTime >= stopAt) {
                vid.pause();
                clearInterval(checker);
            }
        }, 100);
    });

    // --- Export trim button (MediaRecorder approach) ---
    document.getElementById('btn-trim-export').addEventListener('click', () => {
        if (!vid.src || trimRecorder) return;
        if (vpTrimEnd <= vpTrimStart) return;

        if (!window.trimWarningShown) {
            showModal('Beta Feature warning', 'The trim/record feature is currently buggy and not fully recommended. Output files may vary or lose sync. Continue?', 'confirm', () => {
                window.trimWarningShown = true;
                setTimeout(() => document.getElementById('btn-trim-export').click(), 200);
            });
            return;
        }

        const statusEl = document.getElementById('trim-export-status');
        const exportBtn = document.getElementById('btn-trim-export');
        const duration = vpTrimEnd - vpTrimStart;

        statusEl.innerHTML = `<div style="margin-bottom:8px;">Recording... please wait</div><div class="trim-progress-track"><div class="trim-progress-fill" id="trim-progress-fill"></div></div>`;
        statusEl.className = 'trim-export-status trim-export-recording';
        exportBtn.disabled = true;

        trimChunks = [];

        // Seek to start
        vid.currentTime = vpTrimStart;
        vid.muted = false;

        vid.onseeked = () => {
            vid.onseeked = null;
            try {
                const stream = vid.captureStream();
                const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                    ? 'video/webm;codecs=vp9'
                    : MediaRecorder.isTypeSupported('video/webm')
                        ? 'video/webm'
                        : 'video/mp4';

                trimRecorder = new MediaRecorder(stream, { mimeType });
                trimRecorder.ondataavailable = e => { if (e.data.size > 0) trimChunks.push(e.data); };
                trimRecorder.onstop = () => {
                    const blob = new Blob(trimChunks, { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    const baseName = activeVideoEntry
                        ? activeVideoEntry.name.replace(/\.[^/.]+$/, '')
                        : 'trim';
                    a.href = url;
                    a.download = `${baseName}_trim_${fmtTime(vpTrimStart).replace(':', 'm')}s-${fmtTime(vpTrimEnd).replace(':', 'm')}s.webm`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    statusEl.textContent = 'Export complete! File saved via browser download.';
                    statusEl.className = 'trim-export-status trim-export-done';
                    exportBtn.disabled = false;
                    trimRecorder = null;
                    setTimeout(() => {
                        statusEl.textContent = '';
                        statusEl.className = 'trim-export-status';
                    }, 5000);
                };

                trimRecorder.start(100);
                vid.play();

                const progressFill = document.getElementById('trim-progress-fill');
                const startTime = Date.now();
                const progInterval = setInterval(() => {
                    if (!trimRecorder) { clearInterval(progInterval); return; }
                    const elapsed = (Date.now() - startTime) / 1000;
                    let pct = (elapsed / duration) * 100;
                    if (pct > 100) pct = 100;
                    if (progressFill) progressFill.style.width = pct + '%';
                }, 100);

                // Stop recording after the trim duration
                setTimeout(() => {
                    if (trimRecorder && trimRecorder.state === 'recording') {
                        vid.pause();
                        trimRecorder.stop();
                    }
                }, duration * 1000 + 200);

            } catch (err) {
                statusEl.textContent = 'Export failed: ' + err.message;
                statusEl.className = 'trim-export-status trim-export-recording';
                exportBtn.disabled = false;
                trimRecorder = null;
            }
        };

        // Trigger the seek
        if (Math.abs(vid.currentTime - vpTrimStart) < 0.05) {
            const cb = vid.onseeked;
            if (cb) {
                vid.onseeked = null;
                cb();
            }
        }
    });

    // --- Videos tab: Refresh button ---
    document.getElementById('btn-refresh-videos').addEventListener('click', () => {
        loadVideosTab();
    });
});

