/**
 * Search Module
 */

const _k = [115,84,56,120,35,107,80,50];
const _ek = 'lanZouY-disk-app';

/**
 * Decrypt config from backend
 */
function _dc(encoded) {
    try {
        const raw = atob(encoded);
        let result = '';
        for (let i = 0; i < raw.length; i++) {
            result += String.fromCharCode(raw.charCodeAt(i) ^ _k[i % _k.length]);
        }
        return JSON.parse(result);
    } catch (e) {
        console.error('Config decode failed:', e);
        return {};
    }
}

/**
 * AES-ECB encryption
 */
async function _ae(data) {
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(_ek.padEnd(16, '\0').slice(0, 16));
    const dataBytes = encoder.encode(String(data));
    const blockSize = 16;
    const padLength = blockSize - (dataBytes.length % blockSize);
    const paddedData = new Uint8Array(dataBytes.length + padLength);
    paddedData.set(dataBytes);
    paddedData.fill(padLength, dataBytes.length);
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
    const iv = new Uint8Array(16);
    let result = new Uint8Array(paddedData.length);
    for (let i = 0; i < paddedData.length; i += 16) {
        const block = paddedData.slice(i, i + 16);
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: iv }, key, block);
        result.set(new Uint8Array(encrypted).slice(0, 16), i);
    }
    return Array.from(result).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Generate random uuid
 */
function _gu() {
    const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let r = '';
    for (let i = 0; i < 21; i++) r += c.charAt(Math.floor(Math.random() * c.length));
    return r;
}

/**
 * Execute search for a single folder
 */
async function _sf(keyword, cfg, folderId, timeoutMs = 8000) {
    const ts = Date.now();
    const ets = await _ae(ts);
    const params = new URLSearchParams({
        devType: '6', devModel: 'Chrome', uuid: _gu(), extra: '2',
        timestamp: ets, shareId: cfg.s, folderId: folderId || '0',
        offset: '1', limit: '100', search: keyword
    });
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let response;
    try {
        response = await fetch(cfg.a + '/unproved/share/list?' + params.toString(), {
            method: 'POST',
            headers: { 'Accept': 'application/json, text/plain, */*' },
            signal: controller ? controller.signal : undefined
        });
    } catch (error) {
        if (error && error.name === 'AbortError') {
            throw new Error('书库请求超时');
        }
        throw error;
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
}

/**
 * Save search results to server session
 */
async function saveSearchResults(results, options = {}) {
    if (typeof SITE_CSRF_TOKEN !== 'string' || !SITE_CSRF_TOKEN) {
        throw new Error('下载凭证已失效，请刷新页面后重试');
    }
    const action = typeof options.action === 'string' && options.action.trim()
        ? options.action.trim()
        : 'replace';
    const payload = {
        csrf_token: SITE_CSRF_TOKEN,
        action: action
    };
    if (Array.isArray(results)) {
        payload.results = results;
    }
    if (typeof options.batchId === 'string' && options.batchId.trim()) {
        payload.batch_id = options.batchId.trim();
    }
    const response = await fetch('api_save_search_results.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-Token': SITE_CSRF_TOKEN
        },
        body: JSON.stringify(payload)
    });
    const responseText = await response.text();
    let result = null;
    try {
        result = responseText ? JSON.parse(responseText) : null;
    } catch (error) {
        throw new Error(normalizeTextServiceErrorMessage(responseText, '保存搜索结果失败，请稍后重试', '保存搜索结果请求超时，请稍后重试'));
    }
    if (!response.ok) {
        throw new Error((result && (result.error || result.message)) || normalizeTextServiceErrorMessage(responseText, '保存搜索结果失败，请稍后重试', '保存搜索结果请求超时，请稍后重试'));
    }
    return result;
}

function attachDownloadTokensToList(files, downloadTokens, downloadUrls) {
    const tokenList = Array.isArray(downloadTokens) ? downloadTokens : [];
    const urlList = Array.isArray(downloadUrls) ? downloadUrls : [];
    return (Array.isArray(files) ? files : []).map((file, index) => {
        const downloadToken = typeof tokenList[index] === 'string' ? tokenList[index] : '';
        const downloadUrl = typeof urlList[index] === 'string' ? urlList[index] : '';
        return Object.assign({}, file, {
            downloadToken: downloadToken,
            downloadUrl: downloadUrl
        });
    });
}

function attachIncrementalDownloadTokensToList(files, startIndex, downloadTokens, downloadUrls) {
    const tokenList = Array.isArray(downloadTokens) ? downloadTokens : [];
    const urlList = Array.isArray(downloadUrls) ? downloadUrls : [];
    const initialIndex = Number.isInteger(startIndex) ? startIndex : 0;
    return (Array.isArray(files) ? files : []).map((file, index) => {
        const downloadToken = typeof tokenList[index] === 'string' ? tokenList[index] : '';
        const downloadUrl = typeof urlList[index] === 'string' ? urlList[index] : '';
        return Object.assign({}, file, {
            sessionIndex: initialIndex + index,
            downloadToken: downloadToken,
            downloadUrl: downloadUrl
        });
    });
}

function getClientModeTitle(mode) {
    const titles = {
        share: '书库',
        account: '书库',
        pan89: '书库',
        nailong: '书库'
    };
    return titles[mode] || '书库';
}

function getDisplayLibraryName(group, fallbackText = '当前书库') {
    const libraryName = String(group && group.libraryName || '').trim();
    if (libraryName) {
        return libraryName;
    }
    const sourceTitle = String(group && group.sourceTitle || '').trim();
    if (sourceTitle) {
        return sourceTitle;
    }
    return fallbackText;
}

function getActiveLibraryMode(container) {
    const activeButton = container ? container.querySelector('.library-tab-card.active[data-library-mode]') : null;
    return activeButton ? String(activeButton.getAttribute('data-library-mode') || '').trim() : '';
}

function restoreActiveLibraryMode(container, activeMode) {
    if (!container || !activeMode) {
        return;
    }
    const targetButton = container.querySelector(`.library-tab-card[data-library-mode="${activeMode}"]`);
    if (!targetButton) {
        return;
    }
    if (window.bootstrap && window.bootstrap.Tab) {
        window.bootstrap.Tab.getOrCreateInstance(targetButton).show();
        return;
    }
    const targetPaneSelector = targetButton.getAttribute('data-bs-target') || '';
    container.querySelectorAll('.library-tab-card').forEach(button => {
        button.classList.toggle('active', button === targetButton);
        button.setAttribute('aria-selected', button === targetButton ? 'true' : 'false');
    });
    container.querySelectorAll('.tab-pane').forEach(pane => {
        const isTarget = targetPaneSelector !== '' && ('#' + pane.id) === targetPaneSelector;
        pane.classList.toggle('show', isTarget);
        pane.classList.toggle('active', isTarget);
    });
}

function normalizeEnabledSearchModes(forceMode = '') {
    const validModes = ['share', 'account', 'pan89', 'nailong'];
    if (forceMode && validModes.includes(forceMode)) {
        return [forceMode];
    }
    const configuredModes = Array.isArray(SITE_ENABLED_SEARCH_MODES) ? SITE_ENABLED_SEARCH_MODES : [];
    const modes = Array.from(new Set(configuredModes.map(mode => String(mode || '').trim()).filter(mode => validModes.includes(mode))));
    return modes.length > 0 ? modes : ['share'];
}

function buildPendingLibraryGroups(modes) {
    const groups = (Array.isArray(modes) ? modes : []).map(mode => {
        return {
            mode: mode,
            code: 0,
            msg: '',
            notice: '',
            list: [],
            total: 0,
            hasOverflow: false,
            loading: true,
            sourceTitle: getClientModeTitle(mode)
        };
    });
    return renumberLibraryGroups(groups);
}

function buildBlockedLibraryGroups(modes, message) {
    const blockedMessage = String(message || '应版权方要求，系统已屏蔽此关键词搜索！').trim() || '应版权方要求，系统已屏蔽此关键词搜索！';
    const groups = (Array.isArray(modes) && modes.length > 0 ? modes : ['share']).map(mode => {
        return {
            mode: mode,
            code: 500,
            msg: blockedMessage,
            notice: '',
            list: [],
            total: 0,
            hasOverflow: false,
            loading: false,
            sourceTitle: getClientModeTitle(mode)
        };
    });
    return renumberLibraryGroups(groups);
}

function normalizeGroupResult(group, mode) {
    const list = Array.isArray(group && group.list) ? group.list : [];
    const code = Number(group && group.code);
    return {
        mode: (group && group.mode) || mode,
        code: Number.isFinite(code) && code > 0 ? code : 500,
        msg: group && typeof group.msg === 'string' ? group.msg : '',
        notice: group && typeof group.notice === 'string' ? group.notice : '',
        list: list,
        total: Number(group && group.total) || list.length,
        hasOverflow: !!(group && group.hasOverflow),
        remoteTotal: Number(group && group.remoteTotal) || Number(group && group.total) || list.length,
        remotePage: Math.max(1, Number(group && group.remotePage) || 1),
        remotePageSize: Math.max(1, Number(group && group.remotePageSize) || list.length || 20),
        remoteTotalPages: Math.max(1, Number(group && group.remoteTotalPages) || 1),
        supportsRemotePagination: !!(group && group.supportsRemotePagination),
        loading: !!(group && group.loading),
        sourceTitle: group && group.sourceTitle ? group.sourceTitle : getClientModeTitle((group && group.mode) || mode)
    };
}

function isTransientLibraryFailure(group) {
    const mode = String(group && group.mode || '').trim().toLowerCase();
    const message = String(group && group.msg || '').trim().toLowerCase();
    if (!message) {
        return false;
    }

    if (mode === 'pan89') {
        return /请求失败|响应异常|服务响应异常|连接超时|请求超时|timed out|timeout|502|503|504|bad gateway|gateway|temporarily unavailable/.test(message);
    }

    if (mode === 'nailong') {
        return /请求失败|连接失败|超时|timed out|timeout|502|503|504|bad gateway|gateway/.test(message);
    }

    return false;
}

function isKeywordBlockedLibraryFailure(group) {
    const mode = String(group && group.mode || '').trim().toLowerCase();
    const message = String(group && group.msg || '').trim();
    if (!message) {
        return false;
    }

    if (mode === 'pan89') {
        return /屏蔽了此关键词搜索|无法搜索当前关键词|关键词搜索受限|关键词被屏蔽/.test(message);
    }

    return false;
}

function getFriendlyLibraryFailureMessage(group, fallbackMessage = '当前书库暂时不可用，请稍后再试。') {
    const mode = String(group && group.mode || '').trim().toLowerCase();
    const displayTitle = getDisplayLibraryName(group, '当前书库');
    const message = String(group && group.msg || '').trim();

    if (mode === 'pan89') {
        if (isKeywordBlockedLibraryFailure(group)) {
            return `${displayTitle}屏蔽了此关键词搜索，请更换关键词后再试。`;
        }
        if (/无法搜索当前关键词/.test(message)) {
            return `${displayTitle}无法搜索当前关键词，请更换关键词后再试。`;
        }
        if (isTransientLibraryFailure(group)) {
            return `${displayTitle}临时波动，请稍后重试或先查看其它书库结果。`;
        }
        return message || `${displayTitle}暂时不可用，请稍后再试。`;
    }

    if (mode === 'nailong') {
        if (isTransientLibraryFailure(group)) {
            return `${displayTitle}响应较慢或临时波动，请稍后重试或先查看其它书库结果。`;
        }
        return message || `${displayTitle}暂时不可用，请稍后再试。`;
    }

    if (isTransientLibraryFailure(group)) {
        if (mode === 'pan89') {
            return `${displayTitle}临时波动，请稍后重试或先查看其它书库结果。`;
        }
        if (mode === 'nailong') {
            return `${displayTitle}响应较慢或临时波动，请稍后重试或先查看其它书库结果。`;
        }
    }

    return message || fallbackMessage;
}

function buildConcurrentSearchSummary(groups) {
    const items = Array.isArray(groups) ? groups : [];
    const successCount = items.filter(group => !group.loading && Number(group.code) === 200).length;
    const loadingCount = items.filter(group => !!group.loading).length;
    const failedGroups = items.filter(group => !group.loading && Number(group.code) !== 200);

    if (loadingCount > 0) {
        if (successCount > 0) {
            return {
                message: `已返回 ${successCount}/${items.length} 个书库结果，其余书库仍在搜索中...`,
                partialFailure: failedGroups.length > 0
            };
        }
        if (failedGroups.length > 0) {
            return {
                message: failedGroups.some(isTransientLibraryFailure)
                    ? '部分书库临时波动，其余书库仍在搜索中...'
                    : (failedGroups.some(isKeywordBlockedLibraryFailure)
                        ? '部分书库屏蔽了当前关键词，其余书库仍在搜索中...'
                        : '部分书库搜索失败，其余书库仍在搜索中...'),
                partialFailure: true
            };
        }
        return {
            message: '各书库正在并发搜索中，请稍候...',
            partialFailure: false
        };
    }

    if (successCount === 0) {
        let errorMessage = '';
        failedGroups.some(group => {
            const message = getFriendlyLibraryFailureMessage(group, '').trim();
            if (message !== '') {
                errorMessage = message;
                return true;
            }
            return false;
        });
        return {
            message: errorMessage || '所有书库均搜索失败，请稍后重试',
            partialFailure: false
        };
    }

    if (failedGroups.length > 0) {
        return {
            message: failedGroups.some(isTransientLibraryFailure)
                ? '部分书库临时波动，已为您展示当前可用结果'
                : (failedGroups.some(isKeywordBlockedLibraryFailure)
                    ? '部分书库屏蔽了当前关键词，已为您展示当前可用结果'
                    : '部分书库搜索失败，已为您展示当前可用结果'),
            partialFailure: true
        };
    }

    return {
        message: '',
        partialFailure: false
    };
}

function createSearchBatchId() {
    return `search_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildSearchResultCacheKey(keyword, modes) {
    return normalizeSearchKeywordForGuard(keyword) + '::' + (Array.isArray(modes) ? modes.join(',') : '');
}

function cloneSearchGroups(groups) {
    try {
        return JSON.parse(JSON.stringify(Array.isArray(groups) ? groups : []));
    } catch (error) {
        return [];
    }
}

function getCachedSearchGroups(keyword, modes) {
    const key = buildSearchResultCacheKey(keyword, modes);
    const cached = _searchResultCache.get(key);
    if (!cached || cached.expiresAt <= Date.now()) {
        _searchResultCache.delete(key);
        return [];
    }
    return cloneSearchGroups(cached.groups);
}

function rememberSearchGroups(keyword, modes, groups) {
    const preparedGroups = cloneSearchGroups(groups).map(group => {
        const list = Array.isArray(group.list) ? group.list.map(file => {
            const clonedFile = Object.assign({}, file);
            delete clonedFile.downloadToken;
            delete clonedFile.downloadUrl;
            return clonedFile;
        }) : [];
        return Object.assign({}, group, {
            list: list,
            loading: false
        });
    });
    _searchResultCache.set(buildSearchResultCacheKey(keyword, modes), {
        expiresAt: Date.now() + SEARCH_RESULT_CACHE_TTL_MS,
        groups: preparedGroups
    });
}

async function prepareCachedSearchGroupsForDisplay(groups) {
    const batchId = createSearchBatchId();
    const resetResult = await saveSearchResults([], { action: 'reset', batchId: batchId });
    if (!resetResult || !resetResult.success) {
        throw new Error((resetResult && (resetResult.error || resetResult.message)) || '初始化搜索结果失败');
    }

    const preparedGroups = [];
    for (const group of groups) {
        let preparedGroup = Object.assign({}, group, {
            list: Array.isArray(group.list) ? group.list.map(file => Object.assign({}, file)) : []
        });
        if (Number(preparedGroup.code) === 200 && preparedGroup.list.length > 0) {
            const appendResult = await saveSearchResults(preparedGroup.list, { action: 'append', batchId: batchId });
            if (!appendResult || !appendResult.success) {
                throw new Error((appendResult && (appendResult.error || appendResult.message)) || '保存搜索结果失败');
            }
            preparedGroup.list = attachIncrementalDownloadTokensToList(preparedGroup.list, Number(appendResult.start_index) || 0, appendResult.download_tokens, appendResult.download_urls);
            preparedGroup.total = preparedGroup.list.length;
        }
        preparedGroups.push(preparedGroup);
    }
    return {
        groups: renumberLibraryGroups(preparedGroups),
        batchId: batchId
    };
}

function attachDownloadTokensToGroups(groups, downloadTokens) {
    const tokenList = Array.isArray(downloadTokens) ? downloadTokens : [];
    return (Array.isArray(groups) ? groups : []).map(group => {
        const list = Array.isArray(group.list) ? group.list : [];
        const preparedList = list.map(file => {
            const sessionIndex = Number.isInteger(file.sessionIndex) ? file.sessionIndex : -1;
            const downloadToken = sessionIndex >= 0 && typeof tokenList[sessionIndex] === 'string' ? tokenList[sessionIndex] : '';
            return Object.assign({}, file, {
                downloadToken: downloadToken
            });
        });
        return Object.assign({}, group, {
            list: preparedList
        });
    });
}

/**
 * Format file size
 */
function formatFileSize(sizeKB) {
    const explicitText = arguments.length > 2 ? arguments[2] : '';
    const sizeBytes = arguments.length > 1 ? arguments[1] : null;
    if (typeof explicitText === 'string' && explicitText.trim()) return explicitText.trim();
    if (sizeBytes !== null && sizeBytes !== '' && !isNaN(sizeBytes)) {
        let bytes = parseFloat(sizeBytes);
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
        return bytes.toFixed(i === 0 ? 0 : 2) + ' ' + units[i];
    }
    if (typeof sizeKB === 'string' && /[a-z]/i.test(sizeKB)) return sizeKB;
    if (!sizeKB || isNaN(sizeKB)) return 'N/A';
    let bytes = parseFloat(sizeKB) * 1024;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return bytes.toFixed(2) + ' ' + units[i];
}

/**
 * Get file icon
 */
function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const icons = {
        'txt': '📄', 'pdf': '📕', 'epub': '📗', 'mobi': '📘',
        'azw3': '📙', 'zip': '📦', 'rar': '📦', '7z': '📦'
    };
    return icons[ext] || '📄';
}

/**
 * HTML escape
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

let _downloadResolveModalInstance = null;
let _downloadResolveRequestSerial = 0;
let _downloadResolveStatusTimer = 0;
let _searchResultsRenderSerial = 0;
const _searchResultsRenderStore = new Map();
const _searchResultCache = new Map();
const SEARCH_RESULTS_INITIAL_RENDER_COUNT = 30;
const SEARCH_RESULTS_RENDER_STEP = 30;
const SEARCH_RESULT_CACHE_TTL_MS = 120000;

function ensureDownloadResolveModal() {
    let modal = document.getElementById('downloadResolveModal');
    if (modal) {
        return modal;
    }

    modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'downloadResolveModal';
    modal.tabIndex = -1;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content border-0 shadow-lg"><div class="modal-header"><h5 class="modal-title" id="downloadResolveModalTitle">正在解析下载链接</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="关闭"></button></div><div class="modal-body"><div id="downloadResolveLoading" class="d-flex align-items-center gap-3"><div class="spinner-border text-primary" role="status" aria-hidden="true"></div><div><div class="fw-semibold" id="downloadResolveHeading">请稍候，正在为您准备下载链接...</div><div class="text-muted small mt-1" id="downloadResolveFileName"></div></div></div><div id="downloadResolveAlert" class="alert d-none mt-3 mb-0" role="alert"></div><div id="downloadResolveUrlWrap" class="d-none mt-3"><div class="small text-muted mb-2">如果“开始下载”没有反应，或复制按钮无法使用，请长按下面的下载地址手动复制，并用系统浏览器打开。</div><textarea class="form-control form-control-sm" id="downloadResolveUrlField" rows="3" readonly></textarea></div></div><div class="modal-footer"><button type="button" class="btn btn-outline-secondary" id="downloadResolveRetryBtn">重新解析</button><button type="button" class="btn btn-outline-primary d-none" id="downloadResolveCopyBtn">复制下载地址</button><a class="btn btn-primary" id="downloadResolveActionBtn" href="#">开始下载</a><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button></div></div></div>`;
    document.body.appendChild(modal);

    modal.addEventListener('hidden.bs.modal', () => {
        _downloadResolveRequestSerial++;
        if (_downloadResolveStatusTimer) {
            window.clearTimeout(_downloadResolveStatusTimer);
            _downloadResolveStatusTimer = 0;
        }
    });

    return modal;
}

function getDownloadResolveModalControls() {
    const modal = ensureDownloadResolveModal();
    return {
        modal,
        title: modal.querySelector('#downloadResolveModalTitle'),
        heading: modal.querySelector('#downloadResolveHeading'),
        fileName: modal.querySelector('#downloadResolveFileName'),
        loading: modal.querySelector('#downloadResolveLoading'),
        alert: modal.querySelector('#downloadResolveAlert'),
        urlWrap: modal.querySelector('#downloadResolveUrlWrap'),
        urlField: modal.querySelector('#downloadResolveUrlField'),
        retryBtn: modal.querySelector('#downloadResolveRetryBtn'),
        copyBtn: modal.querySelector('#downloadResolveCopyBtn'),
        actionBtn: modal.querySelector('#downloadResolveActionBtn')
    };
}

function showDownloadResolveModal() {
    const controls = getDownloadResolveModalControls();
    if (_downloadResolveStatusTimer) {
        window.clearTimeout(_downloadResolveStatusTimer);
        _downloadResolveStatusTimer = 0;
    }
    if (window.bootstrap && window.bootstrap.Modal) {
        _downloadResolveModalInstance = window.bootstrap.Modal.getOrCreateInstance(controls.modal, {
            backdrop: 'static',
            keyboard: true
        });
        _downloadResolveModalInstance.show();
    } else {
        controls.modal.style.display = 'block';
        controls.modal.classList.add('show');
        document.body.classList.add('modal-open');
    }
    return controls;
}

function closeDownloadResolveModal() {
    const controls = getDownloadResolveModalControls();
    if (_downloadResolveStatusTimer) {
        window.clearTimeout(_downloadResolveStatusTimer);
        _downloadResolveStatusTimer = 0;
    }
    if (window.bootstrap && window.bootstrap.Modal) {
        _downloadResolveModalInstance = window.bootstrap.Modal.getOrCreateInstance(controls.modal, {
            backdrop: 'static',
            keyboard: true
        });
        _downloadResolveModalInstance.hide();
        return;
    }
    controls.modal.classList.remove('show');
    controls.modal.style.display = 'none';
    document.body.classList.remove('modal-open');
}

function scheduleDownloadResolveModalClose(delayMs = 2500) {
    if (_downloadResolveStatusTimer) {
        window.clearTimeout(_downloadResolveStatusTimer);
    }
    _downloadResolveStatusTimer = window.setTimeout(() => {
        _downloadResolveStatusTimer = 0;
        closeDownloadResolveModal();
    }, Math.max(800, Number(delayMs) || 2500));
}

function ensureSearchResultsContainerId(container) {
    if (!container) {
        return '';
    }
    if (container.id) {
        return String(container.id).trim();
    }
    _searchResultsRenderSerial++;
    const containerId = `search-results-list-${_searchResultsRenderSerial}`;
    container.id = containerId;
    return containerId;
}

function storeSearchResultsForRender(container, files) {
    const containerId = ensureSearchResultsContainerId(container);
    if (!containerId) {
        return '';
    }
    _searchResultsRenderStore.set(containerId, Array.isArray(files) ? files.slice() : []);
    return containerId;
}

function getStoredSearchResultsForRender(containerOrId) {
    const containerId = typeof containerOrId === 'string'
        ? containerOrId.trim()
        : ensureSearchResultsContainerId(containerOrId);
    if (!containerId || !_searchResultsRenderStore.has(containerId)) {
        return [];
    }
    return _searchResultsRenderStore.get(containerId) || [];
}

function renderStoredSearchResults(container, visibleCount) {
    const containerId = ensureSearchResultsContainerId(container);
    const files = getStoredSearchResultsForRender(containerId);
    if (!files || files.length === 0) {
        container.innerHTML = '<div class="alert alert-warning">没有搜索到相关文件，请尝试使用书名中的某个关键词或作者名再试！</div>';
        return;
    }

    const normalizedVisibleCount = Math.max(1, Math.min(files.length, Number.isInteger(visibleCount) ? visibleCount : SEARCH_RESULTS_INITIAL_RENDER_COUNT));
    container.dataset.visibleCount = String(normalizedVisibleCount);

    let html = '<ul class="list-group mt-3">';
    files.slice(0, normalizedVisibleCount).forEach((file, index) => {
        const displayName = escapeHtml(file.name || file.fileName);
        const fileSize = formatFileSize(file.fileSize, file.fileSizeBytes, file.fileSizeText);
        const fileIcon = getFileIcon(file.name || file.fileName);
        const downloadIndex = Number.isInteger(file.sessionIndex) ? file.sessionIndex : index;
        const downloadToken = typeof file.downloadToken === 'string' ? file.downloadToken : '';
        const downloadSuffix = downloadToken ? `&token=${encodeURIComponent(downloadToken)}` : '';
        const defaultDownloadUrl = `download.php?index=${downloadIndex}${downloadSuffix}`;
        const downloadUrl = typeof file.downloadUrl === 'string' && file.downloadUrl.trim() ? file.downloadUrl.trim() : defaultDownloadUrl;
        html += `<li class="list-group-item">
            <span class="me-2">${fileIcon}</span>
            <a href="${escapeHtml(downloadUrl)}" class="text-decoration-none" data-download-resolve="1" data-file-name="${displayName}"><strong>${displayName}</strong></a>
            <small class="text-muted ms-3">(${fileSize})</small>
        </li>`;
    });
    html += '</ul>';

    if (files.length > normalizedVisibleCount) {
        const remainingCount = files.length - normalizedVisibleCount;
        html += `<div class="d-grid mt-3"><button type="button" class="btn btn-outline-primary btn-sm" data-search-results-load-more="1" data-target-id="${escapeHtml(containerId)}">加载更多（剩余 ${remainingCount} 条）</button></div>`;
    }

    container.innerHTML = html;
}

function setDownloadResolveModalState(options = {}) {
    const controls = getDownloadResolveModalControls();
    const title = typeof options.title === 'string' && options.title.trim() ? options.title.trim() : '正在解析下载链接';
    const heading = typeof options.heading === 'string' && options.heading.trim() ? options.heading.trim() : '请稍候，正在为您准备下载链接...';
    const fileName = typeof options.fileName === 'string' ? options.fileName.trim() : '';
    const message = typeof options.message === 'string' ? options.message.trim() : '';
    const alertClass = typeof options.alertClass === 'string' && options.alertClass.trim() ? options.alertClass.trim() : 'alert-info';
    const showLoading = options.showLoading !== false;
    const actionUrl = typeof options.actionUrl === 'string' ? options.actionUrl.trim() : '';
    const actionLabel = typeof options.actionLabel === 'string' && options.actionLabel.trim() ? options.actionLabel.trim() : '开始下载';
    const showAction = !!options.showAction && actionUrl !== '';
    const showRetry = !!options.showRetry;
    const showCopy = options.showCopy !== false && actionUrl !== '';
    const manualUrl = typeof options.manualUrl === 'string' && options.manualUrl.trim() ? options.manualUrl.trim() : actionUrl;
    const showManualUrl = !!options.showManualUrl && manualUrl !== '';
    const copyUrl = typeof options.copyUrl === 'string' && options.copyUrl.trim() ? options.copyUrl.trim() : manualUrl;
    const actionType = typeof options.actionType === 'string' ? options.actionType.trim() : '';

    controls.title.textContent = title;
    controls.heading.textContent = heading;
    controls.fileName.textContent = fileName ? `文件：${fileName}` : '';
    controls.loading.classList.toggle('d-none', !showLoading);
    controls.alert.className = `alert mt-3 mb-0${message ? ' ' + alertClass : ' d-none'}`;
    controls.alert.innerHTML = message ? escapeHtml(message) : '';
    controls.urlField.value = manualUrl || '';
    controls.urlWrap.classList.toggle('d-none', !showManualUrl);
    controls.actionBtn.textContent = actionLabel;
    controls.actionBtn.href = actionUrl || '#';
    controls.actionBtn.dataset.actionType = actionType;
    controls.actionBtn.classList.toggle('d-none', !showAction);
    controls.retryBtn.classList.toggle('d-none', !showRetry);
    controls.copyBtn.dataset.downloadUrl = copyUrl || '';
    controls.copyBtn.classList.toggle('d-none', !showCopy);
}

function getResolvedDownloadTransportFrame() {
    let frame = document.getElementById('resolvedDownloadTransportFrame');
    if (frame) {
        return frame;
    }
    frame = document.createElement('iframe');
    frame.id = 'resolvedDownloadTransportFrame';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.position = 'fixed';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.border = '0';
    frame.style.opacity = '0';
    frame.style.pointerEvents = 'none';
    frame.style.left = '-9999px';
    frame.style.bottom = '0';
    document.body.appendChild(frame);
    return frame;
}

function openPendingResolvedDownloadWindow() {
    return null;
}

function closePendingResolvedDownloadWindow(popup) {
}

function triggerResolvedDownload(url) {
    if (!url) {
        return false;
    }
    try {
        const frame = getResolvedDownloadTransportFrame();
        frame.src = 'about:blank';
        window.setTimeout(() => {
            try {
                frame.src = url;
            } catch (error) {
            }
        }, 30);
        return true;
    } catch (error) {
    }

    try {
        const link = document.createElement('a');
        link.href = url;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        return true;
    } catch (error) {
    }

    return false;
}

function navigateToResolvedDownload(url) {
    if (!url) {
        return false;
    }
    if (triggerResolvedDownload(url)) {
        return true;
    }
    try {
        window.location.assign(url);
        return true;
    } catch (error) {
    }
    return false;
}

function findClosestElement(target, selector) {
    let current = target && target.nodeType === 1 ? target : (target && target.parentElement ? target.parentElement : null);
    while (current && current !== document) {
        if (typeof current.matches === 'function' && current.matches(selector)) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

function isSignedDownloadUrl(url) {
    const value = String(url || '').trim();
    if (!value) {
        return false;
    }
    try {
        const parsedUrl = new URL(value, window.location.href);
        return parsedUrl.searchParams.has('payload') && parsedUrl.searchParams.has('sig');
    } catch (error) {
        return /(^|[?&])payload=/.test(value) && /(^|[?&])sig=/.test(value);
    }
}

function getDownloadResolveCompatibilityIssue() {
    if (typeof window.fetch !== 'function') {
        return '当前浏览器不支持下载解析功能，请升级浏览器后重试。系统将为您切换为普通下载方式。';
    }
    if (typeof window.Promise === 'undefined') {
        return '当前浏览器兼容性较差，无法稳定完成下载解析。系统将为您切换为普通下载方式。';
    }
    if (!window.bootstrap || !window.bootstrap.Modal) {
        return '当前浏览器不支持解析弹窗提示。系统将为您切换为普通下载方式。';
    }
    return '';
}

function fallbackToLegacyDownload(downloadUrl, message) {
    const notice = String(message || '').trim() || '当前浏览器兼容性较差，系统将为您切换为普通下载方式。';
    if (window.confirm(`${notice}\n\n点击“确定”继续使用普通下载方式，或点击“取消”留在当前页面。`)) {
        if (!triggerResolvedDownload(downloadUrl)) {
            navigateToResolvedDownload(downloadUrl);
        }
    }
}

function buildAbsoluteDownloadUrl(url) {
    const value = String(url || '').trim();
    if (!value) {
        return '';
    }
    try {
        return new URL(value, window.location.href).toString();
    } catch (error) {
        return value;
    }
}

function isEmbeddedDownloadBrowser() {
    const ua = String(navigator.userAgent || '').toLowerCase();
    return /micromessenger|qq\/|quark|ucbrowser|mqqbrowser/.test(ua);
}

async function copyResolvedDownloadUrl(url) {
    const value = String(url || '').trim();
    if (!value) {
        return false;
    }
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch (error) {
    }

    try {
        const textArea = document.createElement('textarea');
        textArea.value = value;
        textArea.setAttribute('readonly', 'readonly');
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        textArea.style.pointerEvents = 'none';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const copied = document.execCommand('copy');
        textArea.remove();
        return !!copied;
    } catch (error) {
    }

    window.prompt('当前浏览器不支持自动复制，请手动复制下面的下载地址：', value);
    return false;
}

function normalizeTextServiceErrorMessage(rawText, fallbackMessage = '服务响应异常，请稍后重试', timeoutMessage = '当前请求连接超时，请稍后重试') {
    const message = String(rawText || '').trim();
    if (!message) {
        return fallbackMessage;
    }
    if (/read tcp|i\/o timeout|timed out|timeout/i.test(message)) {
        return timeoutMessage;
    }
    if (/unexpected token .*not valid json/i.test(message)) {
        return fallbackMessage;
    }
    if (/^<!doctype html/i.test(message) || /^<html/i.test(message) || /^<[^>]+>/.test(message)) {
        return fallbackMessage;
    }
    return message;
}

async function checkBlockedSearchKeyword(keyword) {
    if (typeof SITE_CSRF_TOKEN !== 'string' || !SITE_CSRF_TOKEN) {
        return { blocked: false, message: '' };
    }

    const body = new URLSearchParams({
        keyword: String(keyword || '').trim(),
        csrf_token: SITE_CSRF_TOKEN
    });

    try {
        const response = await fetch('api_search_guard.php', {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: body.toString()
        });
        const responseText = await response.text();
        const result = responseText ? JSON.parse(responseText) : null;
        if (!response.ok || !result || !result.success) {
            return { blocked: false, message: '' };
        }
        return {
            blocked: !!result.blocked,
            message: typeof result.message === 'string' ? result.message.trim() : ''
        };
    } catch (error) {
        return { blocked: false, message: '' };
    }
}

function appendBlockedResultNotice(notice, blockedCount) {
    const count = Number(blockedCount) || 0;
    const currentNotice = String(notice || '').trim();
    if (count <= 0) {
        return currentNotice;
    }
    const blockedNotice = `已自动隐藏 ${count} 条版权受限结果`;
    return currentNotice ? `${currentNotice}；${blockedNotice}` : blockedNotice;
}

async function filterBlockedSearchResults(items) {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0 || typeof SITE_CSRF_TOKEN !== 'string' || !SITE_CSRF_TOKEN) {
        return { list: list, blockedCount: 0 };
    }

    const body = new URLSearchParams({
        csrf_token: SITE_CSRF_TOKEN
    });
    list.forEach(item => {
        const title = String((item && (item.name || item.fileName || item.title || item.file_name)) || '').trim();
        body.append('titles[]', title);
    });

    try {
        const response = await fetch('api_search_guard.php', {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: body.toString()
        });
        const responseText = await response.text();
        const result = responseText ? JSON.parse(responseText) : null;
        if (!response.ok || !result || !result.success || !Array.isArray(result.blocked_indexes) || result.blocked_indexes.length === 0) {
            return { list: list, blockedCount: 0 };
        }

        const blockedIndexSet = new Set(result.blocked_indexes.map(index => Number(index)).filter(index => Number.isInteger(index) && index >= 0));
        if (blockedIndexSet.size === 0) {
            return { list: list, blockedCount: 0 };
        }

        return {
            list: list.filter((item, index) => !blockedIndexSet.has(index)),
            blockedCount: blockedIndexSet.size
        };
    } catch (error) {
        return { list: list, blockedCount: 0 };
    }
}

async function resolveDownloadLink(downloadUrl) {
    const requestUrl = downloadUrl.includes('?') ? `${downloadUrl}&ajax=1` : `${downloadUrl}?ajax=1`;
    const response = await fetch(requestUrl, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        }
    });

    const responseText = await response.text();
    let result = null;
    try {
        result = responseText ? JSON.parse(responseText) : null;
    } catch (error) {
        throw new Error(normalizeTextServiceErrorMessage(responseText, '下载解析服务响应异常，请稍后重试', '下载请求超时，请稍后重试'));
    }

    if (!response.ok || !result || !result.success || !result.url) {
        const errorMessage = (result && result.message) || normalizeTextServiceErrorMessage(responseText, '下载链接解析失败，请稍后重试', '下载请求超时，请稍后重试');
        const error = new Error(errorMessage);
        error.httpStatus = response.status;
        error.downloadSessionExpired = response.status === 410 || /会话已失效|重新搜索|已过期|已失效/.test(errorMessage);
        throw error;
    }

    return result;
}

async function startResolvedDownload(downloadUrl, fileName, pendingWindow = null) {
    const currentRequestId = ++_downloadResolveRequestSerial;
    const manualDownloadUrl = buildAbsoluteDownloadUrl(downloadUrl);
    showDownloadResolveModal();
    setDownloadResolveModalState({
        title: '正在解析下载链接',
        heading: '请稍候，正在为您准备下载链接...',
        fileName,
        message: '系统正在为您解析可用的下载地址，请不要关闭当前页面。',
        alertClass: 'alert-info',
        showLoading: true,
        showRetry: false,
        showAction: false
    });

    try {
        const result = await resolveDownloadLink(downloadUrl);
        if (currentRequestId !== _downloadResolveRequestSerial) {
            return;
        }
        setDownloadResolveModalState({
            title: '下载链接解析成功',
            heading: '下载链接已准备就绪',
            fileName,
            message: isEmbeddedDownloadBrowser() ? '已为您准备好下载链接。当前浏览器可能会拦截下载，如果没有自动开始，请复制下载地址到系统浏览器打开。' : '已为您准备好下载链接。如果浏览器没有自动开始下载，请点击下方“开始下载”再次尝试。',
            alertClass: 'alert-success',
            showLoading: false,
            showRetry: false,
            showAction: true,
            showCopy: true,
            showManualUrl: isEmbeddedDownloadBrowser(),
            manualUrl: result.url,
            copyUrl: result.url,
            actionUrl: result.url,
            actionLabel: '开始下载'
        });
        if (pendingWindow && !pendingWindow.closed) {
            try {
                pendingWindow.location.href = result.url;
            } catch (error) {
                closePendingResolvedDownloadWindow(pendingWindow);
                triggerResolvedDownload(result.url);
            }
        } else {
            triggerResolvedDownload(result.url);
        }
    } catch (error) {
        if (currentRequestId !== _downloadResolveRequestSerial) {
            return;
        }
        closePendingResolvedDownloadWindow(pendingWindow);
        const isSessionExpired = error && error.downloadSessionExpired;
        setDownloadResolveModalState({
            title: isSessionExpired ? '下载会话已失效' : '下载链接解析失败',
            heading: isSessionExpired ? '请重新搜索后再下载' : '当前暂时无法完成下载解析',
            fileName,
            message: isSessionExpired ? '当前页面中的下载结果已过期或会话已失效。请回到搜索框重新搜索资源，再点击新的下载结果。' : normalizeSearchErrorMessage(error, '下载链接解析失败，请稍后重试'),
            alertClass: 'alert-warning',
            showLoading: false,
            showRetry: !isSessionExpired,
            showAction: isSessionExpired,
            showCopy: false,
            actionUrl: '#searchForm',
            actionLabel: '返回重新搜索',
            actionType: isSessionExpired ? 'search-again' : ''
        });
        const controls = getDownloadResolveModalControls();
        controls.retryBtn.dataset.downloadUrl = downloadUrl;
        controls.retryBtn.dataset.fileName = fileName || '';
    }
}

function startDirectDownloadWithModal(downloadUrl, fileName) {
    const currentRequestId = ++_downloadResolveRequestSerial;
    const manualDownloadUrl = buildAbsoluteDownloadUrl(downloadUrl);
    showDownloadResolveModal();
    setDownloadResolveModalState({
        title: '下载链接已准备就绪',
        heading: '下载链接已准备就绪',
        fileName,
        message: isEmbeddedDownloadBrowser() ? '已为您准备好下载链接。当前浏览器可能会拦截下载，如果没有自动开始，请复制下载地址到系统浏览器打开。' : '已为您准备好下载链接。如果浏览器没有自动开始下载，请点击下方“开始下载”再次尝试。',
        alertClass: 'alert-success',
        showLoading: false,
        showRetry: false,
        showAction: true,
        showCopy: true,
        showManualUrl: isEmbeddedDownloadBrowser(),
        manualUrl: manualDownloadUrl,
        copyUrl: manualDownloadUrl,
        actionUrl: manualDownloadUrl,
        actionLabel: '开始下载'
    });
    if (currentRequestId !== _downloadResolveRequestSerial) {
        return;
    }
    if (!triggerResolvedDownload(downloadUrl)) {
        navigateToResolvedDownload(downloadUrl);
    }
}

function bindResolvedDownloadEvents() {
    document.addEventListener('click', event => {
        const retryButton = findClosestElement(event.target, '#downloadResolveRetryBtn');
        if (retryButton) {
            event.preventDefault();
            const downloadUrl = String(retryButton.dataset.downloadUrl || '').trim();
            const fileName = String(retryButton.dataset.fileName || '').trim();
            if (downloadUrl) {
                try {
                    startResolvedDownload(downloadUrl, fileName, openPendingResolvedDownloadWindow());
                } catch (error) {
                    fallbackToLegacyDownload(downloadUrl, '下载解析暂时不可用，系统将切换为普通下载方式。');
                }
            }
            return;
        }

        const copyButton = findClosestElement(event.target, '#downloadResolveCopyBtn');
        if (copyButton) {
            event.preventDefault();
            const actionUrl = String(copyButton.dataset.downloadUrl || '').trim();
            if (actionUrl) {
                copyResolvedDownloadUrl(actionUrl).then(success => {
                    if (success) {
                        alert('下载地址已复制，请粘贴到系统浏览器中打开。');
                    }
                });
            }
            return;
        }

        const actionButton = findClosestElement(event.target, '#downloadResolveActionBtn');
        if (actionButton) {
            if (String(actionButton.dataset.actionType || '').trim() === 'search-again') {
                event.preventDefault();
                closeDownloadResolveModal();
                const searchInput = document.getElementById('searchInput');
                const searchForm = document.getElementById('searchForm');
                const target = searchInput || searchForm;
                if (target && typeof target.scrollIntoView === 'function') {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                if (searchInput && typeof searchInput.focus === 'function') {
                    window.setTimeout(() => searchInput.focus(), 250);
                }
                return;
            }
            const actionUrl = String(actionButton.getAttribute('href') || '').trim();
            if (!actionUrl || actionUrl === '#') {
                event.preventDefault();
            }
            return;
        }

        const loadMoreButton = findClosestElement(event.target, 'button[data-search-results-load-more="1"]');
        if (loadMoreButton) {
            event.preventDefault();
            const targetId = String(loadMoreButton.dataset.targetId || '').trim();
            const targetContainer = targetId ? document.getElementById(targetId) : null;
            if (targetContainer) {
                const currentVisibleCount = Number.parseInt(targetContainer.dataset.visibleCount || '0', 10) || SEARCH_RESULTS_INITIAL_RENDER_COUNT;
                renderStoredSearchResults(targetContainer, currentVisibleCount + SEARCH_RESULTS_RENDER_STEP);
            }
            return;
        }

        const nailongPageButton = findClosestElement(event.target, 'button[data-nailong-page]');
        if (nailongPageButton) {
            event.preventDefault();
            const pagination = findClosestElement(nailongPageButton, '[data-nailong-pagination="1"]');
            const page = Number.parseInt(nailongPageButton.dataset.nailongPage || '1', 10) || 1;
            const pageSize = pagination ? (Number.parseInt(pagination.dataset.pageSize || '20', 10) || 20) : 20;
            loadNailongRemotePage(page, pageSize, nailongPageButton);
            return;
        }

        const downloadLink = findClosestElement(event.target, 'a[data-download-resolve="1"]');
        if (!downloadLink) {
            return;
        }
        const downloadUrl = String(downloadLink.getAttribute('href') || '').trim();
        const fileName = String(downloadLink.dataset.fileName || '').trim();
        if (!downloadUrl) {
            return;
        }
        event.preventDefault();
        if (hasPendingModeSearchRequests()) {
            abortPendingModeSearchRequests('已停止继续搜索，优先处理下载请求');
        }
        try {
            if (isSignedDownloadUrl(downloadUrl)) {
                startDirectDownloadWithModal(downloadUrl, fileName);
                return;
            }
            const compatibilityIssue = getDownloadResolveCompatibilityIssue();
            if (compatibilityIssue) {
                fallbackToLegacyDownload(downloadUrl, compatibilityIssue);
                return;
            }
            startResolvedDownload(downloadUrl, fileName, openPendingResolvedDownloadWindow());
        } catch (error) {
            fallbackToLegacyDownload(downloadUrl, '下载解析暂时不可用，系统将切换为普通下载方式。');
        }
    });
}

bindResolvedDownloadEvents();

/**
 * Display search results
 */
function displaySearchResults(files, container) {
    if (!files || files.length === 0) {
        container.innerHTML = '<div class="alert alert-warning">没有搜索到相关文件，请尝试使用书名中的某个关键词或作者名再试！</div>';
        return;
    }
    storeSearchResultsForRender(container, files);
    renderStoredSearchResults(container, Math.min(files.length, SEARCH_RESULTS_INITIAL_RENDER_COUNT));
}

/**
 * Display error message
 */
function displayError(message, container) {
    container.innerHTML = `<div class="alert alert-danger">
        <i class="fa-solid fa-exclamation-triangle me-2"></i>
        搜索失败: ${escapeHtml(message)}
    </div>`;
}

function buildGroupedSessionResults(groups) {
    const flatResults = [];
    const preparedGroups = (Array.isArray(groups) ? groups : []).map(group => {
        const list = Array.isArray(group.list) ? group.list : [];
        const preparedList = list.map(file => {
            const sessionIndex = flatResults.length;
            const clonedFile = Object.assign({}, file);
            flatResults.push(clonedFile);
            return Object.assign({ sessionIndex: sessionIndex }, clonedFile);
        });
        return Object.assign({}, group, {
            list: preparedList,
            total: preparedList.length
        });
    });
    return { groups: preparedGroups, flatResults };
}

function renumberLibraryGroups(groups) {
    return (Array.isArray(groups) ? groups : []).map((group, index) => {
        return Object.assign({}, group, {
            libraryName: `书库${index + 1}`,
            tabTitle: `书库${index + 1}`
        });
    });
}

function ensureLibraryTabStyles() {
    if (document.getElementById('library-tab-card-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'library-tab-card-styles';
    style.textContent = `
        .library-tab-list {
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem;
            align-items: stretch;
        }
        .library-tab-item {
            list-style: none;
        }
        .library-tab-card {
            display: inline-flex;
            align-items: center;
            gap: 0.6rem;
            padding: 0.8rem 1rem;
            min-height: 3.25rem;
            border-radius: 1rem;
            border: 1px solid rgba(37, 99, 235, 0.14);
            background: linear-gradient(180deg, #ffffff 0%, #f4f8ff 100%);
            color: #2563eb;
            font-weight: 700;
            box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
            white-space: nowrap;
            transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, color 0.2s ease;
        }
        .library-tab-card:hover {
            transform: translateY(-1px);
            box-shadow: 0 14px 28px rgba(37, 99, 235, 0.12);
            color: #1d4ed8;
        }
        .library-tab-card.active {
            background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%);
            border-color: rgba(37, 99, 235, 0.3);
            color: #ffffff;
            box-shadow: 0 16px 32px rgba(37, 99, 235, 0.24);
        }
        .library-tab-card:focus-visible {
            outline: none;
            box-shadow: 0 0 0 0.25rem rgba(59, 130, 246, 0.2);
        }
        .library-tab-name {
            line-height: 1;
        }
        .library-tab-count {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 2rem;
            padding: 0.18rem 0.52rem;
            border-radius: 999px;
            border: 1px solid rgba(37, 99, 235, 0.12);
            background: rgba(37, 99, 235, 0.08);
            color: inherit;
            font-size: 0.82rem;
            font-weight: 700;
            line-height: 1.2;
        }
        .library-tab-card.active .library-tab-count {
            border-color: rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.18);
            color: #ffffff;
        }
        @media (max-width: 576px) {
            .library-tab-list {
                flex-wrap: nowrap;
                gap: 0.42rem;
                overflow-x: auto;
                overflow-y: hidden;
                padding-bottom: 0.2rem;
                margin-bottom: -0.2rem;
                -webkit-overflow-scrolling: touch;
                scrollbar-width: none;
                scroll-snap-type: x proximity;
            }
            .library-tab-list::-webkit-scrollbar {
                display: none;
            }
            .library-tab-item {
                flex: 0 0 auto;
                scroll-snap-align: start;
            }
            .library-tab-card {
                gap: 0.45rem;
                padding: 0.68rem 0.78rem;
                min-height: 3rem;
                border-radius: 0.95rem;
            }
            .library-tab-count {
                min-width: 1.7rem;
                padding: 0.15rem 0.4rem;
                font-size: 0.76rem;
            }
        }
    `;
    document.head.appendChild(style);
}

function getGroupedSearchResultsStructureKey(groups) {
    return (Array.isArray(groups) ? groups : []).map((group, index) => {
        return `${String(group && group.mode || '').trim()}::${index}`;
    }).join('|');
}

function getGroupedSearchResultsSummaryClass(successCount, loadingCount, hasTransientFailure, partialFailure) {
    if (loadingCount > 0) {
        return 'alert alert-info';
    }
    if (successCount === 0) {
        return hasTransientFailure ? 'alert alert-warning' : 'alert alert-danger';
    }
    return partialFailure ? 'alert alert-info' : 'alert alert-secondary';
}

function buildNailongRemotePaginationHtml(group) {
    if (!group || group.mode !== 'nailong' || !group.supportsRemotePagination || Number(group.remoteTotalPages || 0) <= 1) {
        return '';
    }
    const currentPage = Math.max(1, Number(group.remotePage) || 1);
    const totalPages = Math.max(1, Number(group.remoteTotalPages) || 1);
    const pageSize = Math.max(1, Number(group.remotePageSize) || 20);
    const pages = [];
    pages.push(1);
    for (let page = currentPage - 2; page <= currentPage + 2; page++) {
        if (page > 1 && page < totalPages) {
            pages.push(page);
        }
    }
    if (totalPages > 1) {
        pages.push(totalPages);
    }
    const uniquePages = Array.from(new Set(pages)).sort((a, b) => a - b);
    let html = `<div class="d-flex flex-wrap gap-2 align-items-center justify-content-center mt-3" data-nailong-pagination="1" data-page-size="${pageSize}">`;
    html += `<button type="button" class="btn btn-outline-primary btn-sm" data-nailong-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>`;
    let previousPage = 0;
    uniquePages.forEach(page => {
        if (previousPage > 0 && page - previousPage > 1) {
            html += '<span class="text-muted small px-1">...</span>';
        }
        html += `<button type="button" class="btn btn-sm ${page === currentPage ? 'btn-primary' : 'btn-outline-primary'}" data-nailong-page="${page}" ${page === currentPage ? 'disabled' : ''}>${page}</button>`;
        previousPage = page;
    });
    html += `<button type="button" class="btn btn-outline-primary btn-sm" data-nailong-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>`;
    html += '</div>';
    return html;
}

function buildGroupedSearchResultsPaneBody(group, index) {
    const listContainerId = `library-results-${index}`;
    const totalLabel = group.loading
        ? '正在搜索中...'
        : (group.mode === 'nailong' && group.supportsRemotePagination
            ? `共 ${Number(group.remoteTotal || group.total || 0)} 条结果，第 ${Number(group.remotePage || 1)}/${Number(group.remoteTotalPages || 1)} 页`
            : `共 ${Number(group.total || 0)} 条结果`);
    let html = `<div class="d-flex flex-wrap gap-2 align-items-center mb-3">
                <span class="text-muted small">${totalLabel}</span>
            </div>`;
    if (group.notice) {
        html += `<div class="alert alert-info">${escapeHtml(group.notice)}</div>`;
    }
    if (group.loading) {
        html += '<div class="alert alert-secondary">当前书库正在搜索中，请稍候...</div>';
    } else if (group.hasOverflow && !(group.mode === 'nailong' && group.supportsRemotePagination)) {
        html += '<div class="alert alert-warning">当前书库搜索结果过多，仅展示部分内容，请尝试使用更精确的关键词。</div>';
    }
    if (!group.loading && (!Array.isArray(group.list) || group.list.length === 0)) {
        const emptyMessage = group.code === 200
            ? '当前书库暂无相关结果，请换个关键词再试。'
            : getFriendlyLibraryFailureMessage(group, '当前书库暂时不可用，请稍后再试。');
        html += `<div class="alert alert-${group.code === 200 ? 'info' : 'warning'}">${escapeHtml(emptyMessage)}</div>`;
    } else if (!group.loading) {
        html += `<div id="${listContainerId}"></div>`;
        html += buildNailongRemotePaginationHtml(group);
    }
    return html;
}

function renderGroupedSearchResultsList(pane, group, index) {
    if (!pane || group.loading || !Array.isArray(group.list) || group.list.length === 0) {
        return;
    }
    const listContainer = pane.querySelector(`#library-results-${index}`);
    if (listContainer) {
        displaySearchResults(group.list, listContainer);
    }
}

function renderGroupedSearchResultsShell(groups, container, summaryMessage = '', partialFailure = false, activeMode = '') {
    const successCount = groups.filter(group => !group.loading && Number(group.code) === 200).length;
    const loadingCount = groups.filter(group => !!group.loading).length;
    const hasTransientFailure = groups.some(group => !group.loading && Number(group.code) !== 200 && isTransientLibraryFailure(group));
    const summaryClass = getGroupedSearchResultsSummaryClass(successCount, loadingCount, hasTransientFailure, partialFailure);
    let html = `<div data-search-summary="1" class="${summaryClass}${summaryMessage ? '' : ' d-none'}">${summaryMessage ? escapeHtml(summaryMessage) : ''}</div>`;
    html += '<div class="mt-3" data-grouped-search-shell="1">';
    html += '<ul class="nav nav-pills library-tab-list" role="tablist">';
    groups.forEach((group, index) => {
        const isActive = activeMode ? activeMode === group.mode : index === 0;
        const tabId = `library-tab-${index}`;
        const paneId = `library-pane-${index}`;
        const tabLabel = escapeHtml(group.libraryName || `书库${index + 1}`);
        const tabCount = group.loading ? '...' : Number(group.remoteTotal || group.total || 0);
        html += `<li class="nav-item library-tab-item" role="presentation">
            <button class="nav-link library-tab-card ${isActive ? 'active' : ''}" id="${tabId}" data-library-mode="${escapeHtml(group.mode || '')}" data-bs-toggle="tab" data-bs-target="#${paneId}" type="button" role="tab" aria-controls="${paneId}" aria-selected="${isActive ? 'true' : 'false'}">
                <span class="library-tab-name">${tabLabel}</span>
                <span class="library-tab-count">${tabCount}</span>
            </button>
        </li>`;
    });
    html += '</ul>';
    html += '<div class="tab-content border rounded-4 p-3 bg-white mt-3">';
    groups.forEach((group, index) => {
        const isActive = activeMode ? activeMode === group.mode : index === 0;
        const paneId = `library-pane-${index}`;
        html += `<div class="tab-pane fade ${isActive ? 'show active' : ''}" id="${paneId}" role="tabpanel" data-library-mode="${escapeHtml(group.mode || '')}">`;
        html += buildGroupedSearchResultsPaneBody(group, index);
        html += '</div>';
    });
    html += '</div></div>';
    container.innerHTML = html;
    container.dataset.groupedResultsStructureKey = getGroupedSearchResultsStructureKey(groups);

    groups.forEach((group, index) => {
        const pane = container.querySelector(`#library-pane-${index}`);
        renderGroupedSearchResultsList(pane, group, index);
    });

    if (activeMode) {
        restoreActiveLibraryMode(container, activeMode);
    }
}

function updateGroupedSearchResultsShell(groups, container, summaryMessage = '', partialFailure = false, changedModes = []) {
    const successCount = groups.filter(group => !group.loading && Number(group.code) === 200).length;
    const loadingCount = groups.filter(group => !!group.loading).length;
    const hasTransientFailure = groups.some(group => !group.loading && Number(group.code) !== 200 && isTransientLibraryFailure(group));
    const summaryClass = getGroupedSearchResultsSummaryClass(successCount, loadingCount, hasTransientFailure, partialFailure);
    const summaryEl = container.querySelector('[data-search-summary="1"]');
    if (summaryEl) {
        summaryEl.className = `${summaryClass}${summaryMessage ? '' : ' d-none'}`;
        summaryEl.textContent = summaryMessage || '';
    }

    const changedModeSet = new Set((Array.isArray(changedModes) ? changedModes : []).map(mode => String(mode || '').trim()).filter(Boolean));
    groups.forEach((group, index) => {
        const button = container.querySelector(`#library-tab-${index}`);
        if (button) {
            const countEl = button.querySelector('.library-tab-count');
            if (countEl) {
                countEl.textContent = group.loading ? '...' : String(Number(group.remoteTotal || group.total || 0));
            }
        }

        const pane = container.querySelector(`#library-pane-${index}`);
        if (!pane) {
            return;
        }
        if (changedModeSet.size > 0 && !changedModeSet.has(String(group.mode || '').trim())) {
            return;
        }

        const isActive = pane.classList.contains('show') || pane.classList.contains('active');
        pane.className = `tab-pane fade ${isActive ? 'show active' : ''}`;
        pane.innerHTML = buildGroupedSearchResultsPaneBody(group, index);
        renderGroupedSearchResultsList(pane, group, index);
    });
}

function displayGroupedSearchResults(groups, container, summaryMessage = '', partialFailure = false, options = {}) {
    if (!Array.isArray(groups) || groups.length === 0) {
        displayError('搜索结果为空，请稍后重试', container);
        return;
    }

    ensureLibraryTabStyles();

    const previousActiveMode = getActiveLibraryMode(container);
    const requestedActiveMode = typeof options.activeMode === 'string' && options.activeMode.trim() ? options.activeMode.trim() : previousActiveMode;
    const structureKey = getGroupedSearchResultsStructureKey(groups);
    const changedModes = Array.isArray(options.changedModes) ? options.changedModes : [];
    if (
        container.dataset.groupedResultsStructureKey !== structureKey ||
        !container.querySelector('[data-grouped-search-shell="1"]')
    ) {
        renderGroupedSearchResultsShell(groups, container, summaryMessage, partialFailure, requestedActiveMode);
        return;
    }

    updateGroupedSearchResultsShell(groups, container, summaryMessage, partialFailure, changedModes);
}

function updateLoadingText(loadingSpinner, message) {
    if (!loadingSpinner) {
        return;
    }
    const loadingText = loadingSpinner.querySelector('p');
    if (loadingText) {
        loadingText.textContent = message;
    }
}

function normalizeSearchErrorMessage(error, fallbackMessage = '搜索失败，请稍后重试') {
    const rawMessage = typeof error === 'string'
        ? error
        : (error && typeof error.message === 'string' ? error.message : '');
    const message = rawMessage.trim();
    if (!message) {
        return fallbackMessage;
    }
    if (message === 'Failed to fetch') {
        return '搜索节点连接失败，请稍后重试';
    }
    if (message === '书库请求超时') {
        return '当前书库请求超时，请稍后重试';
    }
    if (/read tcp|i\/o timeout|timed out|timeout/i.test(message)) {
        return '当前书库连接超时，请稍后重试';
    }
    if (/unexpected token .*not valid json/i.test(message)) {
        return '当前书库服务响应异常，请稍后重试';
    }
    if (/^<!doctype html/i.test(message) || /^<html/i.test(message) || /^<[^>]+>/.test(message)) {
        return '当前书库服务响应异常，请稍后重试';
    }
    return message;
}

let _shareCfgPromise = null;

async function getDirectShareConfig() {
    if (!_shareCfgPromise) {
        _shareCfgPromise = fetch('api_search_config.php?_t=' + Date.now(), {
            cache: 'no-store',
            credentials: 'same-origin'
        }).then(async response => {
            if (!response.ok) {
                throw new Error('书库配置请求失败');
            }
            const data = await response.json();
            if (!data || !data.d) {
                throw new Error((data && data.error) || '未获取到书库配置');
            }
            const cfg = _dc(data.d);
            if (!cfg || !cfg.s) {
                throw new Error('书库配置解析失败');
            }
            return cfg;
        }).catch(error => {
            _shareCfgPromise = null;
            throw error;
        });
    }
    return await _shareCfgPromise;
}

function normalizeDirectShareResults(files, shareId) {
    if (!Array.isArray(files)) {
        return [];
    }
    return files.map(file => {
        const fileName = (file.name || file.fileName || '').trim();
        const fileId = String(file.fileId || '').trim();
        if (!fileName || !fileId) {
            return null;
        }
        return {
            fileId: fileId,
            fileName: fileName,
            name: fileName,
            fileSize: file.fileSize || '',
            addTime: file.addTime || '',
            updTime: file.updTime || '',
            shareId: String(shareId || ''),
            searchSource: 'share'
        };
    }).filter(Boolean);
}

function sortDirectShareResults(files) {
    return files.slice().sort((a, b) => {
        if (a.updTime && b.updTime) {
            return String(b.updTime).localeCompare(String(a.updTime));
        }
        if (a.addTime && b.addTime) {
            return String(b.addTime).localeCompare(String(a.addTime));
        }
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

async function fetchDirectShareGroup(keyword) {
    const cfg = await getDirectShareConfig();
    const folderIds = Array.isArray(cfg.f) && cfg.f.length > 0 ? cfg.f : ['0'];
    let allFiles = [];
    let hasOverflow = false;
    let successCount = 0;

    const searchTasks = folderIds.map(folderId => {
        return _sf(keyword, cfg, folderId)
            .then(result => ({ ok: true, result }))
            .catch(error => ({ ok: false, error }));
    });

    const searchResults = await Promise.all(searchTasks);

    for (const item of searchResults) {
        if (!item.ok) {
            continue;
        }
        const result = item.result;
        if (!result || Number(result.code) !== 200) {
            continue;
        }
        successCount++;
        if (Number(result.total || 0) > Number(result.limit || 100)) {
            hasOverflow = true;
        }
        allFiles = allFiles.concat(normalizeDirectShareResults(result.list || [], cfg.s));
    }

    if (successCount === 0) {
        return {
            mode: 'share',
            code: 500,
            msg: '当前书库暂时不可用，请稍后重试',
            notice: '',
            list: [],
            total: 0,
            hasOverflow: false
        };
    }

    const uniqueMap = new Map();
    allFiles.forEach(file => {
        const key = `${file.fileId}::${file.name}`;
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, file);
        }
    });

    const finalFiles = sortDirectShareResults(Array.from(uniqueMap.values()));
    const filteredResult = await filterBlockedSearchResults(finalFiles);
    return {
        mode: 'share',
        code: 200,
        msg: '',
        notice: appendBlockedResultNotice(successCount < folderIds.length ? '当前书库部分节点响应异常，已为您展示当前可用结果。' : '', filteredResult.blockedCount),
        list: filteredResult.list,
        total: filteredResult.list.length,
        hasOverflow: hasOverflow
    };
}

async function performDirectShareSearch(keyword, resultContainer, loadingSpinner) {
    const group = await fetchDirectShareGroup(keyword);
    if (Number(group.code) !== 200) {
        throw new Error(group.msg || '当前书库搜索失败');
    }

    if (group.list.length > 0) {
        const saveResult = await saveSearchResults(group.list);
        if (!saveResult || !saveResult.success) {
            throw new Error((saveResult && (saveResult.error || saveResult.message)) || '保存搜索结果失败');
        }
        group.list = attachDownloadTokensToList(group.list, saveResult.download_tokens, saveResult.download_urls);
    }

    let html = '';
    if (group.hasOverflow) {
        html += '<div class="alert alert-warning">部分搜索结果过多，只展示其中的一部分。如果结果中没有您要找的文件，请使用更精确的关键词再次搜索！</div>';
    }
    if (group.notice) {
        html += `<div class="alert alert-info">${escapeHtml(group.notice)}</div>`;
    }
    resultContainer.innerHTML = html;
    const resultsDiv = document.createElement('div');
    resultContainer.appendChild(resultsDiv);
    displaySearchResults(group.list, resultsDiv);
}

async function performShareFallbackSearch(keyword, resultContainer, loadingSpinner, notice) {
    updateLoadingText(loadingSpinner, notice || '搜索节点1出错，正在进行节点2搜索...');
    await performDirectShareSearch(keyword, resultContainer, loadingSpinner);
}

async function recordHotSearchKeyword(keyword, groups) {
    if (typeof SITE_CSRF_TOKEN !== 'string' || !SITE_CSRF_TOKEN) {
        return;
    }
    if (!Array.isArray(groups)) {
        return;
    }
    const resultCount = groups.reduce((total, group) => {
        if (Number(group && group.code) !== 200 || !Array.isArray(group && group.list)) {
            return total;
        }
        return total + group.list.length;
    }, 0);
    if (resultCount <= 0) {
        return;
    }
    try {
        const params = new URLSearchParams();
        params.set('action', 'record');
        params.set('keyword', keyword || '');
        params.set('result_count', String(resultCount));
        params.set('csrf_token', SITE_CSRF_TOKEN);
        await fetch('api_hot_search.php', {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: params.toString()
        });
    } catch (error) {
    }
}

async function requestModeSearch(keyword, mode, options = {}) {
    if (typeof SITE_CSRF_TOKEN !== 'string' || !SITE_CSRF_TOKEN || typeof SITE_SEARCH_REQUEST_TOKEN !== 'string' || !SITE_SEARCH_REQUEST_TOKEN) {
        throw new Error('搜索凭证已失效，请刷新页面后重试');
    }

    const searchParams = new URLSearchParams({ keyword: keyword, force_mode: mode });
    searchParams.set('csrf_token', SITE_CSRF_TOKEN);
    searchParams.set('search_request_token', SITE_SEARCH_REQUEST_TOKEN);
    if (mode === 'nailong') {
        searchParams.set('page', String(Math.max(1, Number(options.page) || 1)));
        searchParams.set('page_size', String(Math.max(1, Math.min(100, Number(options.pageSize) || 20))));
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (controller) {
        _activeModeSearchControllers.set(mode, controller);
    }

    let response = null;
    try {
        response = await fetch('api_search.php', {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: searchParams.toString(),
            signal: controller ? controller.signal : undefined
        });
    } catch (error) {
        if (controller && _activeModeSearchControllers.get(mode) === controller) {
            _activeModeSearchControllers.delete(mode);
        }
        if (error && error.name === 'AbortError') {
            throw new Error(_activeModeSearchAbortMessage || '已停止继续搜索');
        }
        throw error;
    }
    if (controller && _activeModeSearchControllers.get(mode) === controller) {
        _activeModeSearchControllers.delete(mode);
    }

    const responseText = await response.text();
    let result = null;
    try {
        result = responseText ? JSON.parse(responseText) : null;
    } catch (parseError) {
        throw new Error(normalizeTextServiceErrorMessage(responseText, '搜索服务响应异常，请稍后重试', '当前书库连接超时，请稍后重试'));
    }

    if (result && typeof result.next_search_request_token === 'string' && result.next_search_request_token) {
        SITE_SEARCH_REQUEST_TOKEN = result.next_search_request_token;
    }

    if (!response.ok) {
        throw new Error((result && result.msg) || normalizeTextServiceErrorMessage(responseText, '搜索服务请求失败，请稍后重试', '当前书库连接超时，请稍后重试'));
    }

    return result;
}

function normalizeModeSearchResponse(result, mode) {
    const groups = Array.isArray(result && result.groups) ? result.groups : [];
    const matchedGroup = groups.find(group => String(group && group.mode || '') === mode) || groups[0] || {
        mode: mode,
        code: Number(result && result.code) || 500,
        msg: result && typeof result.msg === 'string' ? result.msg : '',
        list: Array.isArray(result && result.list) ? result.list : [],
        total: Number(result && result.total) || 0,
        hasOverflow: !!(result && result.hasOverflow),
        remoteTotal: Number(result && result.remoteTotal) || 0,
        remotePage: Number(result && result.remotePage) || 1,
        remotePageSize: Number(result && result.remotePageSize) || 20,
        remoteTotalPages: Number(result && result.remoteTotalPages) || 1,
        supportsRemotePagination: !!(result && result.supportsRemotePagination)
    };
    return normalizeGroupResult(matchedGroup, mode);
}

async function fetchModeGroup(keyword, mode, options = {}) {
    if (mode === 'share') {
        return normalizeGroupResult(await fetchDirectShareGroup(keyword), mode);
    }
    const result = await requestModeSearch(keyword, mode, options);
    return normalizeModeSearchResponse(result, mode);
}

let _activeSearchExecutionId = 0;
let _activeModeSearchControllers = new Map();
let _activeModeSearchAbortMessage = '';
let _currentGroupedSearchState = null;
let _nailongPageCache = new Map();
let _searchSubmissionState = {
    busy: false,
    lastKeyword: '',
    lastStartedAt: 0,
    duplicateCooldownMs: 1500
};

function hasPendingModeSearchRequests() {
    return _activeModeSearchControllers && _activeModeSearchControllers.size > 0;
}

function abortPendingModeSearchRequests(message = '') {
    _activeModeSearchAbortMessage = String(message || '').trim();
    _activeModeSearchControllers.forEach(controller => {
        try {
            controller.abort();
        } catch (error) {
        }
    });
    _activeModeSearchControllers.clear();
}

function getNailongPageCacheKey(keyword, page, pageSize) {
    return `${normalizeSearchKeywordForGuard(keyword)}::${Math.max(1, Number(page) || 1)}::${Math.max(1, Number(pageSize) || 20)}`;
}

function cloneNailongCachedGroup(group) {
    return normalizeGroupResult(Object.assign({}, group, {
        list: Array.isArray(group && group.list) ? group.list.map(file => Object.assign({}, file)) : []
    }), 'nailong');
}

async function loadNailongRemotePage(page, pageSize, button) {
    const state = _currentGroupedSearchState;
    if (!state || !state.keyword || !state.resultContainer || !Array.isArray(state.groups)) {
        return;
    }
    const targetPage = Math.max(1, Number(page) || 1);
    const targetPageSize = Math.max(1, Math.min(100, Number(pageSize) || 20));
    const groupIndex = state.groups.findIndex(group => group && group.mode === 'nailong');
    if (groupIndex < 0) {
        return;
    }
    if (button) {
        button.disabled = true;
        button.dataset.originalText = button.textContent || '';
        button.textContent = '加载中...';
    }
    try {
        const cacheKey = getNailongPageCacheKey(state.keyword, targetPage, targetPageSize);
        let group = _nailongPageCache.has(cacheKey) ? cloneNailongCachedGroup(_nailongPageCache.get(cacheKey)) : null;
        if (!group) {
            group = await fetchModeGroup(state.keyword, 'nailong', { page: targetPage, pageSize: targetPageSize });
        }
        if (Number(group.code) === 200 && Array.isArray(group.list) && group.list.length > 0 && !group._tokensReady) {
            const appendResult = await saveSearchResults(group.list, { action: 'append', batchId: state.batchId });
            if (!appendResult || !appendResult.success) {
                throw new Error((appendResult && (appendResult.error || appendResult.message)) || '保存搜索结果失败');
            }
            group = Object.assign({}, group, {
                list: attachIncrementalDownloadTokensToList(group.list, Number(appendResult.start_index) || 0, appendResult.download_tokens, appendResult.download_urls),
                total: Array.isArray(group.list) ? group.list.length : 0,
                _tokensReady: true
            });
            _nailongPageCache.set(cacheKey, cloneNailongCachedGroup(group));
        }
        state.groups = renumberLibraryGroups(state.groups.map(existingGroup => {
            if (!existingGroup || existingGroup.mode !== 'nailong') {
                return existingGroup;
            }
            return Object.assign({}, existingGroup, normalizeGroupResult(Object.assign({}, group, { mode: 'nailong', loading: false }), 'nailong'), {
                loading: false
            });
        }));
        const summary = buildConcurrentSearchSummary(state.groups);
        displayGroupedSearchResults(state.groups, state.resultContainer, summary.message, summary.partialFailure, {
            changedModes: ['nailong'],
            activeMode: 'nailong'
        });
        rememberSearchGroups(state.keyword, state.enabledModes, state.groups);
    } catch (error) {
        alert(normalizeSearchErrorMessage(error) || '当前页加载失败，请稍后重试');
        if (button) {
            button.disabled = false;
            button.textContent = button.dataset.originalText || '重试';
        }
    }
}

function normalizeSearchKeywordForGuard(keyword) {
    return String(keyword || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getSearchActionElements() {
    const form = document.getElementById('searchForm');
    const input = document.getElementById('searchInput');
    const submitButton = form ? form.querySelector('button[type="submit"]') : null;
    return {
        form,
        input,
        submitButton
    };
}

function setSearchSubmissionUiState(isBusy) {
    const elements = getSearchActionElements();
    if (elements.form) {
        elements.form.dataset.searchBusy = isBusy ? '1' : '0';
    }
    if (elements.input) {
        elements.input.readOnly = !!isBusy;
        elements.input.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    }
    if (elements.submitButton) {
        if (!elements.submitButton.dataset.defaultHtml) {
            elements.submitButton.dataset.defaultHtml = elements.submitButton.innerHTML;
        }
        elements.submitButton.disabled = !!isBusy;
        elements.submitButton.innerHTML = isBusy
            ? '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>搜索中...'
            : elements.submitButton.dataset.defaultHtml;
    }
}

function shouldBlockSearchSubmission(keyword, loadingSpinner) {
    const normalizedKeyword = normalizeSearchKeywordForGuard(keyword);
    const now = Date.now();
    if (!normalizedKeyword) {
        return {
            blocked: false,
            normalizedKeyword: normalizedKeyword
        };
    }

    if (_searchSubmissionState.busy) {
        if (loadingSpinner) {
            loadingSpinner.style.display = 'block';
            updateLoadingText(loadingSpinner, '正在搜索中，请稍候...');
        }
        return {
            blocked: true,
            normalizedKeyword: normalizedKeyword
        };
    }

    if (
        _searchSubmissionState.lastKeyword === normalizedKeyword &&
        _searchSubmissionState.lastStartedAt > 0 &&
        (now - _searchSubmissionState.lastStartedAt) < _searchSubmissionState.duplicateCooldownMs
    ) {
        return {
            blocked: true,
            normalizedKeyword: normalizedKeyword
        };
    }

    return {
        blocked: false,
        normalizedKeyword: normalizedKeyword
    };
}

/**
 * Main search function
 */
async function performSearch(keyword, resultContainer, loadingSpinner, options = {}) {
    if (!keyword.trim()) {
        displayError('请输入关键词', resultContainer);
        return;
    }

    const guardResult = shouldBlockSearchSubmission(keyword, loadingSpinner);
    if (guardResult.blocked) {
        return;
    }

    _searchSubmissionState.busy = true;
    _searchSubmissionState.lastKeyword = guardResult.normalizedKeyword;
    _searchSubmissionState.lastStartedAt = Date.now();
    setSearchSubmissionUiState(true);
    abortPendingModeSearchRequests();
    _activeModeSearchAbortMessage = '';
    
    loadingSpinner.style.display = 'block';
    resultContainer.innerHTML = '';
    const executionId = ++_activeSearchExecutionId;
    
    try {
        updateLoadingText(loadingSpinner, '正在努力搜索中，请稍候...');

        const forceMode = typeof options.forceMode === 'string' ? options.forceMode.trim() : '';
        const enabledModes = options && options.directShareSearch === true
            ? ['share']
            : normalizeEnabledSearchModes(forceMode);
        const blockedCheck = await checkBlockedSearchKeyword(keyword);
        if (executionId !== _activeSearchExecutionId) {
            return;
        }
        if (blockedCheck.blocked) {
            try {
                await saveSearchResults([], { action: 'reset', batchId: createSearchBatchId() });
            } catch (error) {
            }
            const blockedMessage = blockedCheck.message || '应版权方要求，系统已屏蔽此关键词搜索！';
            displayGroupedSearchResults(buildBlockedLibraryGroups(enabledModes, blockedMessage), resultContainer, blockedMessage, false);
            return;
        }

        if (options && options.directShareSearch === true) {
            await performDirectShareSearch(keyword, resultContainer, loadingSpinner);
            return;
        }

        if (forceMode === 'share') {
            await performDirectShareSearch(keyword, resultContainer, loadingSpinner);
            return;
        }

        const cachedGroups = getCachedSearchGroups(keyword, enabledModes);
        if (cachedGroups.length > 0) {
            updateLoadingText(loadingSpinner, '正在载入最近一次搜索结果...');
            const preparedCachedResult = await prepareCachedSearchGroupsForDisplay(cachedGroups);
            const preparedCachedGroups = preparedCachedResult.groups;
            if (executionId !== _activeSearchExecutionId) {
                return;
            }
            const cachedSummary = buildConcurrentSearchSummary(preparedCachedGroups);
            displayGroupedSearchResults(
                preparedCachedGroups,
                resultContainer,
                cachedSummary.message || '已为您显示最近一次搜索结果，下载凭证已刷新。',
                cachedSummary.partialFailure
            );
            _currentGroupedSearchState = {
                keyword: keyword,
                enabledModes: enabledModes,
                groups: preparedCachedGroups,
                resultContainer: resultContainer,
                batchId: preparedCachedResult.batchId
            };
            loadingSpinner.style.display = 'none';
            return;
        }

        const batchId = createSearchBatchId();
        const resetResult = await saveSearchResults([], { action: 'reset', batchId: batchId });
        if (executionId !== _activeSearchExecutionId) {
            return;
        }
        if (!resetResult || !resetResult.success) {
            throw new Error((resetResult && (resetResult.error || resetResult.message)) || '初始化搜索结果失败');
        }

        let groups = buildPendingLibraryGroups(enabledModes);
        _currentGroupedSearchState = {
            keyword: keyword,
            enabledModes: enabledModes,
            groups: groups,
            resultContainer: resultContainer,
            batchId: batchId
        };
        const renderGroups = (changedModes = []) => {
            const summary = buildConcurrentSearchSummary(groups);
            displayGroupedSearchResults(groups, resultContainer, summary.message, summary.partialFailure, {
                changedModes: changedModes
            });
            if (_currentGroupedSearchState && _currentGroupedSearchState.batchId === batchId) {
                _currentGroupedSearchState.groups = groups;
            }
        };

        renderGroups();
        loadingSpinner.style.display = 'none';

        const searchTasks = enabledModes.map(async mode => {
            let group = null;
            try {
                group = await fetchModeGroup(keyword, mode);
                if (executionId !== _activeSearchExecutionId) {
                    return;
                }

                if (Number(group.code) === 200 && Array.isArray(group.list) && group.list.length > 0) {
                    const appendResult = await saveSearchResults(group.list, { action: 'append', batchId: batchId });
                    if (executionId !== _activeSearchExecutionId) {
                        return;
                    }
                    if (!appendResult || !appendResult.success) {
                        throw new Error((appendResult && (appendResult.error || appendResult.message)) || '保存搜索结果失败');
                    }
                    group = Object.assign({}, group, {
                        list: attachIncrementalDownloadTokensToList(group.list, Number(appendResult.start_index) || 0, appendResult.download_tokens, appendResult.download_urls),
                        total: Array.isArray(group.list) ? group.list.length : 0,
                        _tokensReady: true
                    });
                    if (mode === 'nailong') {
                        _nailongPageCache.set(getNailongPageCacheKey(keyword, Number(group.remotePage) || 1, Number(group.remotePageSize) || 20), cloneNailongCachedGroup(group));
                    }
                } else {
                    group = Object.assign({}, group, {
                        total: Array.isArray(group.list) ? group.list.length : 0
                    });
                }
            } catch (error) {
                if (executionId !== _activeSearchExecutionId) {
                    return;
                }
                group = {
                    mode: mode,
                    code: 500,
                    msg: normalizeSearchErrorMessage(error),
                    notice: '',
                    list: [],
                    total: 0,
                    hasOverflow: false,
                    loading: false,
                    sourceTitle: getClientModeTitle(mode)
                };
            }

            groups = renumberLibraryGroups(groups.map(existingGroup => {
                if (existingGroup.mode !== mode) {
                    return existingGroup;
                }
                return Object.assign({}, existingGroup, normalizeGroupResult(Object.assign({}, group, { mode: mode, loading: false }), mode), {
                    loading: false
                });
            }));
            renderGroups([mode]);
        });

        await Promise.all(searchTasks);
        if (executionId !== _activeSearchExecutionId) {
            return;
        }
        rememberSearchGroups(keyword, enabledModes, groups);
        await recordHotSearchKeyword(keyword, groups);
        
    } catch (error) {
        console.error('Search error:', error);
        displayError(error.message || '未知错误', resultContainer);
    } finally {
        abortPendingModeSearchRequests();
        _activeModeSearchAbortMessage = '';
        _searchSubmissionState.busy = false;
        setSearchSubmissionUiState(false);
        if (executionId === _activeSearchExecutionId) {
            loadingSpinner.style.display = 'none';
            updateLoadingText(loadingSpinner, '正在努力搜索中，请稍候...');
        }
    }
}
