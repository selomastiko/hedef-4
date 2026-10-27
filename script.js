/**
 * ==============================================================================
 * HEDEF 4 (CONNECT FOUR) - OYUN MANTIĞI VE KONTROLÜ (JAVASCRIPT)
 * ==============================================================================
 * 
 * Modüller:
 * 1. Sabitler ve Oyun Durumu (State Management & Undo Stack)
 * 2. Gece / Gündüz Teması (Theme Toggle & LocalStorage)
 * 3. Giriş Ekranı & Kalıcılık (Intro Screen & Reset Scores)
 * 4. 15 Saniyelik Hamle Zamanlayıcısı (Turn Timer)
 * 5. Tahta ve UI Başlatma (Initialization & Rendering)
 * 6. Hamle Yapma, Yerçekimi & Geri Alma (Gravity & Undo)
 * 7. Kazanma ve Beraberlik Algoritması (Check Win / Draw)
 * 8. Web Audio API Ses Sentezleyici (Pop, Dıt, Arpej)
 */

// ==============================================================================
// 1. SABİTLER VE OYUN DURUMU (STATE)
// ==============================================================================
const ROWS = 6;                 // Satır sayısı
const COLS = 7;                 // Sütun sayısı
const WIN_COUNT = 4;            // Kazanmak için gereken yan yana taş adedi
const TURN_TIME_LIMIT = 15;     // Hamle süresi sınırı (saniye)

const PLAYER_RED = 'red';          // 1. Oyuncu (Kırmızı)
const PLAYER_YELLOW = 'yellow';    // 2. Oyuncu (Sarı)

// Oyuncu İsimleri (Varsayılan genel etiketler)
let playerNames = {
    [PLAYER_RED]: '1. Oyuncu',
    [PLAYER_YELLOW]: '2. Oyuncu'
};

// Skor Durumu
let scores = {
    [PLAYER_RED]: 0,
    [PLAYER_YELLOW]: 0,
    ties: 0
};

// Hamle Geçmişi Yığını (Undo Stack)
// Her eleman: { row: number, col: number, player: string, wasWinningMove: boolean }
let moveHistory = [];

// Oyun Tahtası Durumu
let boardState = [];            // boardState[row][col] -> null | 'red' | 'yellow'
let currentPlayer = PLAYER_RED;
let isGameOver = false;
let isAnimating = false;        // Düşüş veya geri alma animasyonu kilidi
let hoveredCol = -1;

// Zamanlayıcı
let timeLeft = TURN_TIME_LIMIT;
let timerInterval = null;

// Ses ve Tema
let soundEnabled = true;
let currentTheme = 'dark';

// ==============================================================================
// 2. DOM ELEMANLARI
// ==============================================================================
// Tema Butonu
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');

// Ekranlar ve Form
const introScreen = document.getElementById('introScreen');
const gameContainer = document.getElementById('gameContainer');
const playerForm = document.getElementById('playerForm');
const player1Input = document.getElementById('player1Input');
const player2Input = document.getElementById('player2Input');
const btnStartGame = document.getElementById('btnStartGame');
const btnChangePlayers = document.getElementById('btnChangePlayers');

// Oyun Tahtası ve Göstergeler
const boardElement = document.getElementById('board');
const dropPreviewElement = document.getElementById('dropPreview');
const statusPanel = document.getElementById('statusPanel');
const statusText = document.getElementById('statusText');
const statusDisc = document.getElementById('statusDisc');

// Zamanlayıcı UI
const turnTimer = document.getElementById('turnTimer');
const timerNumber = document.getElementById('timerNumber');
const timerRingProgress = document.getElementById('timerRingProgress');

// Skor Tablosu UI
const scoreNameRed = document.getElementById('scoreNameRed');
const scoreNameYellow = document.getElementById('scoreNameYellow');
const scoreRedElement = document.getElementById('scoreRed');
const scoreYellowElement = document.getElementById('scoreYellow');
const scoreTiesElement = document.getElementById('scoreTies');
const scoreCardRed = document.getElementById('scoreCardRed');
const scoreCardYellow = document.getElementById('scoreCardYellow');
const btnResetScores = document.getElementById('btnResetScores');
const btnResetScoresLobby = document.getElementById('btnResetScoresLobby');

// Alt Kontrol Butonları
const btnUndo = document.getElementById('btnUndo');
const btnRestart = document.getElementById('btnRestart');
const btnSound = document.getElementById('btnSound');
const soundIcon = document.getElementById('soundIcon');

// ==============================================================================
// 3. TEMA YÖNETİMİ (GECE / GÜNDÜZ MODU)
// ==============================================================================

/**
 * Temayı başlatır ve LocalStorage'dan tercihi yükler.
 */
function initTheme() {
    const savedTheme = localStorage.getItem('c4_theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
        currentTheme = savedTheme;
    } else {
        currentTheme = 'dark'; // Varsayılan: Koyu tema
    }
    applyTheme(currentTheme);
}

/**
 * Temayı sayfaya uygular ve buton etiketlerini günceller.
 */
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
        themeIcon.textContent = '☀️';
        themeLabel.textContent = 'Gündüz';
        themeToggleBtn.title = 'Açık (Gündüz) Moduna Geç';
    } else {
        themeIcon.textContent = '🌙';
        themeLabel.textContent = 'Gece';
        themeToggleBtn.title = 'Koyu (Gece) Moduna Geç';
    }
}

/**
 * Tema butonuna basıldığında temayı değiştirir ve LocalStorage'a kaydeder.
 */
function toggleTheme() {
    currentTheme = (currentTheme === 'dark') ? 'light' : 'dark';
    applyTheme(currentTheme);
    try {
        localStorage.setItem('c4_theme', currentTheme);
    } catch (e) {}
    playBeepSound(500, 0.05);
}

// ==============================================================================
// 4. GİRİŞ EKRANI VE LOCALSTORAGE (KALICILIK)
// ==============================================================================

// Eski isim cache'ini kesinlikle temizle (Otomatik isim doldurmayı önler)
try {
    localStorage.removeItem('c4_players');
} catch (e) {}

/**
 * LocalStorage'dan sadece skorları yükler.
 * ÖNEMLİ: Oyuncu isim kutucuklarına (input) localStorage'dan otomatik doldurma YAPILMAZ!
 * Kutucuklar her zaman tamamen boş başlar.
 */
function loadPreferences() {
    // Giriş ekranı input alanlarını kesinlikle BOŞ bırak
    if (player1Input) player1Input.value = '';
    if (player2Input) player2Input.value = '';

    try {
        // Yalnızca skorları yükle
        const savedScores = localStorage.getItem('c4_scores');
        if (savedScores) {
            const parsedScores = JSON.parse(savedScores);
            scores[PLAYER_RED] = Number(parsedScores.red) || 0;
            scores[PLAYER_YELLOW] = Number(parsedScores.yellow) || 0;
            scores.ties = Number(parsedScores.ties) || 0;
        }
    } catch (e) {}

    updateScoreNames();
    updateScoreDisplays();
}

/**
 * Skorları LocalStorage'a kaydeder.
 */
function savePreferences() {
    try {
        localStorage.setItem('c4_scores', JSON.stringify(scores));
    } catch (e) {}
}

/**
 * Skor kartlarındaki isimleri günceller.
 */
function updateScoreNames() {
    scoreNameRed.textContent = playerNames[PLAYER_RED];
    scoreNameYellow.textContent = playerNames[PLAYER_YELLOW];
}

/**
 * Kayıtlı tüm skorları sıfırlar.
 */
function resetAllScores() {
    if (!confirm('Tüm kayıtlı skorları sıfırlamak istediğinize emin misiniz?')) {
        return;
    }

    scores = { [PLAYER_RED]: 0, [PLAYER_YELLOW]: 0, ties: 0 };
    playerNames = { [PLAYER_RED]: '1. Oyuncu', [PLAYER_YELLOW]: '2. Oyuncu' };

    if (player1Input) player1Input.value = '';
    if (player2Input) player2Input.value = '';

    try {
        localStorage.removeItem('c4_scores');
        localStorage.removeItem('c4_players');
    } catch (e) {}

    updateScoreNames();
    updateScoreDisplays();
    updateStatusDisplay();

    playBeepSound(350, 0.12);
}

/**
 * Giriş ekranından oyuna geçiş.
 * Kullanıcı isim kutucuklarını boş bırakırsa otomatik olarak "1. Oyuncu" ve "2. Oyuncu" atanır.
 */
function handleStartGame() {
    const p1Name = (player1Input && player1Input.value.trim()) || '1. Oyuncu';
    const p2Name = (player2Input && player2Input.value.trim()) || '2. Oyuncu';

    playerNames[PLAYER_RED] = p1Name;
    playerNames[PLAYER_YELLOW] = p2Name;

    updateScoreNames();
    savePreferences();

    // Animasyonlu Geçiş (Fade-Out -> Fade-In)
    introScreen.classList.add('fade-out');

    setTimeout(() => {
        gameContainer.classList.remove('hidden');
        gameContainer.classList.add('fade-in');

        initGame();
        startTurnTimer();
    }, 350);
}

/**
 * Giriş ekranına geri dönüş.
 * Kutucuklar her zaman boş açılarak sadece yer tutucular (placeholder) görünür.
 */
function returnToIntroScreen() {
    stopTurnTimer();
    gameContainer.classList.add('hidden');
    gameContainer.classList.remove('fade-in');

    introScreen.classList.remove('fade-out');
    
    // Kutucukları kesinlikle boşalt
    if (player1Input) player1Input.value = '';
    if (player2Input) player2Input.value = '';
    if (player1Input) player1Input.focus();
}

// ==============================================================================
// 5. 15 SANİYELİK HAMLE ZAMANLAYICISI (TURN TIMER)
// ==============================================================================

function startTurnTimer() {
    stopTurnTimer();

    if (isGameOver) {
        turnTimer.classList.add('hidden');
        return;
    }

    turnTimer.classList.remove('hidden');
    timeLeft = TURN_TIME_LIMIT;
    updateTimerUI();

    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerUI();

        // Son 5 saniyede hafif uyarı sesi
        if (timeLeft <= 5 && timeLeft > 0) {
            playBeepSound(520, 0.04);
        }

        // Süre dolduğunda sıra otomatik geçer
        if (timeLeft <= 0) {
            handleTimeOut();
        }
    }, 1000);
}

function stopTurnTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerUI() {
    timerNumber.textContent = timeLeft;

    const totalCircumference = 100;
    const progressOffset = totalCircumference - (timeLeft / TURN_TIME_LIMIT) * totalCircumference;
    timerRingProgress.style.strokeDashoffset = progressOffset;

    turnTimer.classList.toggle('urgent', timeLeft <= 5);
}

function handleTimeOut() {
    stopTurnTimer();
    playTimeoutBuzzer(); // Süre dolma uyarı sesi

    const timedOutPlayer = playerNames[currentPlayer];
    switchTurn();

    const nextPlayer = playerNames[currentPlayer];
    statusText.textContent = `⏳ ${timedOutPlayer}'in süresi doldu! Sıra ${nextPlayer}'de`;

    startTurnTimer();
}

// ==============================================================================
// 6. OYUNU BAŞLATMA (INIT)
// ==============================================================================
function initGame() {
    boardState = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    moveHistory = []; // Hamle geçmişini sıfırla
    
    currentPlayer = PLAYER_RED;
    isGameOver = false;
    isAnimating = false;
    hoveredCol = -1;

    document.documentElement.style.setProperty('--rows', ROWS);
    document.documentElement.style.setProperty('--cols', COLS);

    boardElement.classList.remove('has-winner');

    createBoardDOM();
    createPreviewSlots();
    updateStatusDisplay();
    updateScoreCardHighlight();
    updateScoreDisplays();
    updateUndoButtonState();
}

function createBoardDOM() {
    boardElement.innerHTML = '';

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.row = r;
            cell.dataset.col = c;
            cell.setAttribute('role', 'gridcell');

            cell.addEventListener('click', () => handleColumnClick(c));
            cell.addEventListener('mouseenter', () => handleColumnHover(c));
            cell.addEventListener('mouseleave', () => handleColumnLeave());

            boardElement.appendChild(cell);
        }
    }
}

function createPreviewSlots() {
    dropPreviewElement.innerHTML = '';

    for (let c = 0; c < COLS; c++) {
        const slot = document.createElement('div');
        slot.classList.add('preview-slot');
        slot.dataset.col = c;

        const disc = document.createElement('div');
        disc.classList.add('preview-disc');
        slot.appendChild(disc);

        slot.addEventListener('click', () => handleColumnClick(c));
        slot.addEventListener('mouseenter', () => handleColumnHover(c));
        slot.addEventListener('mouseleave', () => handleColumnLeave());

        dropPreviewElement.appendChild(slot);
    }
}

// ==============================================================================
// 7. HAMLE YAPMA VE YERÇEKİMİ MEKANİZMASI (GRAVITY)
// ==============================================================================

function handleColumnClick(col) {
    if (isGameOver || isAnimating) return;

    const emptyRow = getLowestEmptyRow(col);
    if (emptyRow === -1) {
        playBeepSound(220, 0.1);
        return;
    }

    stopTurnTimer();
    executeMove(emptyRow, col);
}

function getLowestEmptyRow(col) {
    for (let r = ROWS - 1; r >= 0; r--) {
        if (boardState[r][col] === null) {
            return r;
        }
    }
    return -1;
}

function executeMove(row, col) {
    isAnimating = true;

    // Matriste durumu güncelle
    boardState[row][col] = currentPlayer;

    // Hamleyi yığına (stack) kaydet
    moveHistory.push({
        row,
        col,
        player: currentPlayer,
        wasWinningMove: false
    });
    updateUndoButtonState();

    const cell = getCellElement(row, col);
    if (!cell) return;

    const disc = document.createElement('div');
    disc.classList.add('disc', currentPlayer, 'dropping');

    const cellHeight = cell.offsetHeight || 60;
    const dropDistance = (row + 1.2) * (cellHeight + 10);
    disc.style.setProperty('--drop-distance', `${dropDistance}px`);

    cell.appendChild(disc);
    playDropPopSound(row); // Tok pop/tık sesi

    setTimeout(() => {
        disc.classList.remove('dropping');
        isAnimating = false;
        updateUndoButtonState();

        // 1. Kazanma Kontrolü
        const winningCombination = checkWin(boardState, row, col);
        if (winningCombination) {
            moveHistory[moveHistory.length - 1].wasWinningMove = true;
            handleWin(winningCombination);
            return;
        }

        // 2. Beraberlik Kontrolü
        if (checkDraw(boardState)) {
            handleDraw();
            return;
        }

        // 3. Sırayı diğer oyuncuya devret
        switchTurn();
        updatePreviewState();
        startTurnTimer();
    }, 450);
}

function switchTurn() {
    currentPlayer = (currentPlayer === PLAYER_RED) ? PLAYER_YELLOW : PLAYER_RED;
    updateStatusDisplay();
    updateScoreCardHighlight();
}

// ==============================================================================
// 8. HAMLEYİ GERİ AL (UNDO) ÖZELLİĞİ
// ==============================================================================

/**
 * Son yapılan hamleyi yığından çıkarır ve tahtadan temizler.
 */
function undoMove() {
    if (moveHistory.length === 0 || isAnimating) return;

    isAnimating = true;
    stopTurnTimer();

    const lastMove = moveHistory.pop();
    const { row, col, player, wasWinningMove } = lastMove;

    // Matristeki hücreyi boşalt
    boardState[row][col] = null;

    // DOM'daki taşı animasyonla kaldır
    const cell = getCellElement(row, col);
    if (cell) {
        const disc = cell.querySelector('.disc');
        if (disc) {
            disc.classList.add('undoing');
            setTimeout(() => {
                if (disc.parentNode) disc.parentNode.removeChild(disc);
                isAnimating = false;
                updateUndoButtonState();
            }, 250);
        } else {
            isAnimating = false;
            updateUndoButtonState();
        }
    } else {
        isAnimating = false;
        updateUndoButtonState();
    }

    // Geri alma sesini çal
    playUndoSound();

    // Eğer son hamle kazanma hamlesi idiyse kazanma durumunu geri al
    if (wasWinningMove || isGameOver) {
        isGameOver = false;
        boardElement.classList.remove('has-winner');

        // Hücrelerden kazanma sınıflarını temizle
        document.querySelectorAll('.cell.winner').forEach(wCell => {
            wCell.classList.remove('winner');
            wCell.style.removeProperty('--winner-glow');
        });

        // Skoru 1 eksilt ve kaydet
        if (scores[player] > 0) {
            scores[player]--;
            updateScoreDisplays();
            savePreferences();
        }
    }

    // Sırayı son hamleyi yapan oyuncuya geri ver
    currentPlayer = player;

    // Arayüzü güncelle ve zamanlayıcıyı 15 saniyeye sıfırla
    updateStatusDisplay();
    updateScoreCardHighlight();
    updatePreviewState();
    startTurnTimer();
}

/**
 * Geri al butonunun tıklanabilir durumunu günceller.
 */
function updateUndoButtonState() {
    btnUndo.disabled = (moveHistory.length === 0 || isAnimating);
}

// ==============================================================================
// 9. KAZANMA VE BERABERLİK KONTROL ALGORİTMALARI
// ==============================================================================

function checkWin(board, r, c) {
    const player = board[r][c];
    if (!player) return null;

    const directions = [
        { dr: 0,  dc: 1 },  // Yatay
        { dr: 1,  dc: 0 },  // Dikey
        { dr: 1,  dc: 1 },  // Çapraz (\)
        { dr: -1, dc: 1 }   // Çapraz (/)
    ];

    for (let { dr, dc } of directions) {
        let matchedCells = [{ r, c }];

        // Pozitif yön
        let step = 1;
        while (true) {
            const nr = r + dr * step;
            const nc = c + dc * step;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === player) {
                matchedCells.push({ r: nr, c: nc });
                step++;
            } else break;
        }

        // Negatif yön
        step = 1;
        while (true) {
            const nr = r - dr * step;
            const nc = c - dc * step;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === player) {
                matchedCells.push({ r: nr, c: nc });
                step++;
            } else break;
        }

        if (matchedCells.length >= WIN_COUNT) {
            return matchedCells;
        }
    }

    return null;
}

function checkDraw(board) {
    for (let c = 0; c < COLS; c++) {
        if (board[0][c] === null) return false;
    }
    return true;
}

function handleWin(winningCells) {
    isGameOver = true;
    stopTurnTimer();
    turnTimer.classList.add('hidden');

    boardElement.classList.add('has-winner');

    const winnerGlowColor = (currentPlayer === PLAYER_RED) 
        ? 'rgba(239, 68, 68, 0.95)' 
        : 'rgba(234, 179, 8, 0.95)';

    winningCells.forEach(({ r, c }) => {
        const cell = getCellElement(r, c);
        if (cell) {
            cell.classList.add('winner');
            cell.style.setProperty('--winner-glow', winnerGlowColor);
        }
    });

    scores[currentPlayer]++;
    updateScoreDisplays();
    savePreferences();

    const winnerName = playerNames[currentPlayer];
    const colorTag = (currentPlayer === PLAYER_RED) ? 'Kırmızı' : 'Sarı';
    statusText.textContent = `🎉 Tebrikler! ${winnerName} (${colorTag}) Kazandı!`;
    statusPanel.className = `status-panel win-${currentPlayer}`;

    playWinArpeggio(); // Neşeli arpej melodisi
    clearColumnHover();
    updateUndoButtonState();
}

function handleDraw() {
    isGameOver = true;
    stopTurnTimer();
    turnTimer.classList.add('hidden');

    scores.ties++;
    updateScoreDisplays();
    savePreferences();

    statusText.textContent = `🤝 Oyun Berabere Bitti!`;
    statusPanel.className = 'status-panel draw';
    statusDisc.style.display = 'none';

    playBeepSound(300, 0.25);
    clearColumnHover();
    updateUndoButtonState();
}

// ==============================================================================
// 10. ARAYÜZ (UI) GÜNCELLEMELERİ VE YARDIMCILAR
// ==============================================================================

function updateStatusDisplay() {
    if (isGameOver) return;

    statusDisc.style.display = 'inline-block';
    const currentName = playerNames[currentPlayer];

    if (currentPlayer === PLAYER_RED) {
        statusText.textContent = `Sıra ${currentName}'de (Kırmızı)`;
        statusPanel.className = 'status-panel red-turn';
        statusDisc.className = 'pulse-disc red';
    } else {
        statusText.textContent = `Sıra ${currentName}'de (Sarı)`;
        statusPanel.className = 'status-panel yellow-turn';
        statusDisc.className = 'pulse-disc yellow';
    }
}

function updateScoreCardHighlight() {
    scoreCardRed.classList.toggle('active-turn', currentPlayer === PLAYER_RED && !isGameOver);
    scoreCardYellow.classList.toggle('active-turn', currentPlayer === PLAYER_YELLOW && !isGameOver);
}

function updateScoreDisplays() {
    scoreRedElement.textContent = scores[PLAYER_RED];
    scoreYellowElement.textContent = scores[PLAYER_YELLOW];
    scoreTiesElement.textContent = scores.ties;
}

function getCellElement(row, col) {
    return document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
}

// ==============================================================================
// 11. SÜTUN HOVER VE ÖNİZLEME (PREVIEW GHOST DISC)
// ==============================================================================

function handleColumnHover(col) {
    if (isGameOver) return;
    hoveredCol = col;
    updatePreviewState();

    document.querySelectorAll('.cell').forEach(cell => {
        cell.classList.toggle('column-hover', Number(cell.dataset.col) === col);
    });
}

function handleColumnLeave() {
    hoveredCol = -1;
    clearColumnHover();
}

function clearColumnHover() {
    document.querySelectorAll('.preview-slot').forEach(slot => {
        slot.classList.remove('hovered', 'full');
    });
    document.querySelectorAll('.cell').forEach(cell => {
        cell.classList.remove('column-hover');
    });
}

function updatePreviewState() {
    if (hoveredCol === -1 || isGameOver) {
        clearColumnHover();
        return;
    }

    const slots = document.querySelectorAll('.preview-slot');
    slots.forEach((slot, c) => {
        const disc = slot.querySelector('.preview-disc');
        const isCurrentHovered = (c === hoveredCol);
        const isColumnFull = (getLowestEmptyRow(c) === -1);

        slot.classList.toggle('hovered', isCurrentHovered && !isColumnFull);
        slot.classList.toggle('full', isCurrentHovered && isColumnFull);

        if (disc) {
            disc.className = `preview-disc ${currentPlayer}`;
        }
    });
}

// ==============================================================================
// 12. YENİDEN BAŞLATMA
// ==============================================================================
function restartGame() {
    initGame();
    startTurnTimer();
    playBeepSound(440, 0.08);
}

// ==============================================================================
// 13. WEB AUDIO API SES SENTEZLEYİCİSİ (HARİCİ DOSYA YOK)
// ==============================================================================
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

/**
 * 1. Taş Düşme Sesi: Tok ve rezonanslı pop/tık sesi
 */
function playDropPopSound(row) {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // Satır indikçe frekans baslaşır (450Hz -> 240Hz)
        const startFreq = 460 - (row * 35);
        const endFreq = 140;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.09);

        // Tok 'pop' hissi için ani tepe ve hızlı sönüm
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.09);
    } catch (e) {}
}

/**
 * 2. Süre Dolma Sesi: İki aşamalı kısa uyarı/dıt sesi
 */
function playTimeoutBuzzer() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        [220, 180].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now + idx * 0.1);

            gain.gain.setValueAtTime(0.2, now + idx * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.09);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now + idx * 0.1);
            osc.stop(now + idx * 0.1 + 0.09);
        });
    } catch (e) {}
}

/**
 * 3. Kazanma Sesi: Neşeli majör arpej melodisi (C4, E4, G4, C5, E5)
 */
function playWinArpeggio() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const notes = [261.63, 329.63, 392.00, 523.25, 659.25]; // C, E, G, C5, E5
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.11);

            gain.gain.setValueAtTime(0.26, ctx.currentTime + idx * 0.11);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.11 + 0.35);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime + idx * 0.11);
            osc.stop(ctx.currentTime + idx * 0.11 + 0.35);
        });
    } catch (e) {}
}

/**
 * 4. Geri Alma Sesi: Hafif ters pop / whoosh efekti
 */
function playUndoSound() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(360, ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
}

/**
 * Genel bip sesi
 */
function playBeepSound(frequency, duration) {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);

        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + duration);
    } catch (e) {}
}

// ==============================================================================
// 14. OLAY DİNLEYİCİLERİ (EVENT LISTENERS)
// ==============================================================================
themeToggleBtn.addEventListener('click', toggleTheme);
playerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleStartGame();
});

btnStartGame.addEventListener('click', handleStartGame);
btnChangePlayers.addEventListener('click', returnToIntroScreen);
btnRestart.addEventListener('click', restartGame);
btnUndo.addEventListener('click', undoMove);
btnResetScores.addEventListener('click', resetAllScores);
if (btnResetScoresLobby) btnResetScoresLobby.addEventListener('click', resetAllScores);

btnSound.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
    if (soundEnabled) playBeepSound(600, 0.08);
});

// Sayfa yüklendiğinde tema ve tercihleri başlat, inputları kesinlikle temizle
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadPreferences();
    if (playerForm) playerForm.reset();
    if (player1Input) player1Input.value = '';
    if (player2Input) player2Input.value = '';
});
