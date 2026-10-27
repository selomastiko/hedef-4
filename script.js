/**
 * ==============================================================================
 * HEDEF 4 (CONNECT FOUR) - ONLINE MULTIPLAYER & REALTIME VERİ SENKRONİZASYONU
 * ==============================================================================
 * 
 * Bu dosya aşağıdaki ana mimari katmanları içerir:
 * 1. Firebase & Hibrit Çok Oyunculu Senkronizasyon Motoru (RTDB & Broadcast Bridge)
 * 2. Oda (Lobi) Yönetimi (Yeni Oda Kur, Odaya Katıl, Kodu Kopyala)
 * 3. Oyun İçi Güvenlik, Senkron Zamanlayıcı (15s Timestamp) ve Sıra Kilitleri
 * 4. Çift Yönlü Hamle Eşitleme (Taş Düşme Animasyonları ve Zafer Senkronu)
 * 5. Bağlantı Kopması (Disconnect) ve Terk Etme Bildirimleri
 * 6. Web Audio API Ses Sentezleyicisi & Tema Desteği
 */

// ==============================================================================
// 1. FIREBASE VE MULTIPLAYER YAPILANDIRMASI
// ==============================================================================

/**
 * 💡 KENDİ FIREBASE PROJENİZİ BAĞLAMAK İÇİN:
 * Firebase Console'dan (console.firebase.google.com) oluşturduğunuz Realtime Database
 * bilgilerini aşağıdaki alana yapıştırabilirsiniz.
 * 
 * ℹ️ EĞER FIREBASE BİLGİSİ GİRMEDİYSENİZ:
 * Sistem otomatik olarak "Akıllı Çok Oyunculu Yerel Ağ / Sekme Köprüsü"nü (BroadcastChannel)
 * devreye sokar. İki ayrı tarayıcı penceresi açarak oda kurup anında online multiplayer gibi
 * canlı test edebilirsiniz!
 */
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Firebase başlatma kontrolü
let rtdb = null;
let isFirebaseConfigured = false;

try {
    if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== "YOUR_API_KEY") {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        rtdb = firebase.database();
        isFirebaseConfigured = true;
        console.log("Firebase Realtime Database başarıyla bağlandı!");
    } else {
        console.info("Firebase Realtime Database anahtarları tanımlanmadı. Hibrit Yerel Çok Oyunculu Köprüsü aktif.");
    }
} catch (err) {
    console.warn("Firebase başlatılamadı, yerel multiplayer köprüsü kullanılıyor:", err);
}

// ==============================================================================
// 2. SABİTLER VE ÇOK OYUNCULU OYUN DURUMU (STATE)
// ==============================================================================
const ROWS = 6;
const COLS = 7;
const WIN_COUNT = 4;
const TURN_TIME_LIMIT = 15;     // Saniye

const PLAYER_RED = 'red';          // 1. Oyuncu (Kırmızı - Oda Kurucu)
const PLAYER_YELLOW = 'yellow';    // 2. Oyuncu (Sarı - Katılan)

// Çok Oyunculu Oda Durumu
let currentRoomId = null;
let myPlayerRole = 'both';         // 'red' | 'yellow' | 'both' (Yerel mod)
let isOnlineGame = false;
let roomRef = null;
let roomUnsubscribe = null;

// Oyuncu İsimleri
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

// Hamle Geçmişi (Undo)
let moveHistory = [];

// Oyun Tahtası Durumu
let boardState = [];
let currentPlayer = PLAYER_RED;
let isGameOver = false;
let isAnimating = false;
let hoveredCol = -1;

// Zamanlayıcı
let turnStartTime = Date.now();
let timerInterval = null;
let currentRemainingSeconds = TURN_TIME_LIMIT;

// Ses ve Tema
let soundEnabled = true;
let currentTheme = 'dark';

// Hibrit Yerel Ağ / Sekmeler Arası İletişim Kanalı (BroadcastChannel Bridge)
let broadcastChannel = null;
try {
    broadcastChannel = new BroadcastChannel('hedef4_online_sync');
} catch (e) {}

// ==============================================================================
// 3. DOM ELEMANLARI
// ==============================================================================
// Tema
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');

// Lobi & Ekranlar
const introScreen = document.getElementById('introScreen');
const gameContainer = document.getElementById('gameContainer');
const playerNameInput = document.getElementById('playerNameInput');
const btnCreateRoom = document.getElementById('btnCreateRoom');
const joinRoomCodeInput = document.getElementById('joinRoomCodeInput');
const btnJoinRoom = document.getElementById('btnJoinRoom');
const btnPlayLocalMode = document.getElementById('btnPlayLocalMode');

// Bekleme Modali
const waitingModal = document.getElementById('waitingModal');
const displayRoomCode = document.getElementById('displayRoomCode');
const btnCopyRoomCode = document.getElementById('btnCopyRoomCode');
const copyIcon = document.getElementById('copyIcon');
const copyText = document.getElementById('copyText');
const btnCancelWaiting = document.getElementById('btnCancelWaiting');

// Online Çubuk
const onlineBar = document.getElementById('onlineBar');
const activeRoomCodeText = document.getElementById('activeRoomCodeText');
const btnCopyActiveRoom = document.getElementById('btnCopyActiveRoom');
const roleDot = document.getElementById('roleDot');
const roleText = document.getElementById('roleText');
const opponentOverlay = document.getElementById('opponentOverlay');

// Bildirim Modali
const alertModal = document.getElementById('alertModal');
const alertIcon = document.getElementById('alertIcon');
const alertTitle = document.getElementById('alertTitle');
const alertMessage = document.getElementById('alertMessage');
const btnAlertOk = document.getElementById('btnAlertOk');

// Tahta & Paneller
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

// Alt Butonlar
const btnUndo = document.getElementById('btnUndo');
const btnRestart = document.getElementById('btnRestart');
const btnChangePlayers = document.getElementById('btnChangePlayers');
const btnSound = document.getElementById('btnSound');
const soundIcon = document.getElementById('soundIcon');

// ==============================================================================
// 4. TEMA VE YEREL VERİ YÖNETİMİ
// ==============================================================================
function initTheme() {
    const savedTheme = localStorage.getItem('c4_theme') || 'dark';
    currentTheme = savedTheme;
    applyTheme(currentTheme);
}

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

function toggleTheme() {
    currentTheme = (currentTheme === 'dark') ? 'light' : 'dark';
    applyTheme(currentTheme);
    try { localStorage.setItem('c4_theme', currentTheme); } catch (e) {}
    playBeepSound(500, 0.05);
}

function loadPreferences() {
    if (playerNameInput) playerNameInput.value = '';
    if (joinRoomCodeInput) joinRoomCodeInput.value = '';

    try {
        const savedScores = localStorage.getItem('c4_scores');
        if (savedScores) {
            const parsed = JSON.parse(savedScores);
            scores[PLAYER_RED] = Number(parsed.red) || 0;
            scores[PLAYER_YELLOW] = Number(parsed.yellow) || 0;
            scores.ties = Number(parsed.ties) || 0;
        }
    } catch (e) {}

    updateScoreNames();
    updateScoreDisplays();
}

function savePreferences() {
    try {
        localStorage.setItem('c4_scores', JSON.stringify(scores));
    } catch (e) {}
}

function updateScoreNames() {
    scoreNameRed.textContent = playerNames[PLAYER_RED];
    scoreNameYellow.textContent = playerNames[PLAYER_YELLOW];
}

function updateScoreDisplays() {
    scoreRedElement.textContent = scores[PLAYER_RED];
    scoreYellowElement.textContent = scores[PLAYER_YELLOW];
    scoreTiesElement.textContent = scores.ties;
}

function resetAllScores() {
    if (!confirm('Tüm kayıtlı skorları sıfırlamak istediğinize emin misiniz?')) return;

    scores = { [PLAYER_RED]: 0, [PLAYER_YELLOW]: 0, ties: 0 };
    updateScoreDisplays();
    savePreferences();

    // Online odadaysa veritabanındaki skorları da sıfırla
    if (isOnlineGame && currentRoomId) {
        updateRemoteRoom({ scores: scores });
    }

    playBeepSound(350, 0.12);
}

// ==============================================================================
// 5. ÇOK OYUNCULU ODA SİSTEMİ (HOST & JOIN LOBBY)
// ==============================================================================

/**
 * 4-6 haneli rastgele alfasayısal oda kodu üretir (Örn: H4-729)
 */
function generateRoomCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = 'H4-';
    for (let i = 0; i < 3; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * 1. SEÇENEK: YENİ ODA KUR (HOST - KIRMIZI OYUNCU)
 */
function handleCreateRoom() {
    const myName = (playerNameInput.value.trim()) || 'Kırmızı Oyuncu';
    currentRoomId = generateRoomCode();
    myPlayerRole = PLAYER_RED;
    isOnlineGame = true;

    playerNames[PLAYER_RED] = myName;
    playerNames[PLAYER_YELLOW] = 'Rakip Bekleniyor...';

    // Başlangıç oda verisi
    const initialRoomData = {
        roomId: currentRoomId,
        board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
        turn: PLAYER_RED,
        turnStartTime: Date.now(),
        status: 'waiting', // 'waiting' -> 'playing' -> 'won' | 'draw'
        p1: { name: myName, color: PLAYER_RED, online: true },
        p2: null,
        scores: { red: 0, yellow: 0, ties: 0 },
        lastMove: null,
        winningCells: null,
        winner: null
    };

    // Veritabanına odayı kaydet
    createRemoteRoom(currentRoomId, initialRoomData);

    // Bekleme modalini aç
    displayRoomCode.textContent = currentRoomId;
    waitingModal.classList.remove('hidden');

    // Odayı anlık dinlemeye başla
    listenToRoom(currentRoomId);
}

/**
 * 2. SEÇENEK: ODAYA KATIL (JOIN - SARI OYUNCU)
 */
function handleJoinRoom() {
    const code = joinRoomCodeInput.value.trim().toUpperCase();
    if (!code) {
        showAlert('Eksik Bilgi', 'Lütfen arkadaşınızın verdiği Oda Kodunu girin.');
        return;
    }

    const myName = (playerNameInput.value.trim()) || 'Sarı Oyuncu';

    // Odayı bul ve katıl
    fetchRoomData(code, (roomData) => {
        if (!roomData) {
            showAlert('Oda Bulunamadı', `"${code}" kodlu bir oda bulunamadı. Lütfen kodu doğru yazdığınızdan emin olun.`);
            return;
        }

        if (roomData.status !== 'waiting' && roomData.p2) {
            showAlert('Oda Dolu', 'Bu oda zaten 2 kişilik bir oyuna başlamış.');
            return;
        }

        currentRoomId = code;
        myPlayerRole = PLAYER_YELLOW;
        isOnlineGame = true;

        playerNames[PLAYER_RED] = roomData.p1 ? roomData.p1.name : '1. Oyuncu';
        playerNames[PLAYER_YELLOW] = myName;

        // Odaya katılım güncellemesi
        const updates = {
            p2: { name: myName, color: PLAYER_YELLOW, online: true },
            status: 'playing',
            turnStartTime: Date.now()
        };

        updateRemoteRoom(updates);

        // Dinlemeyi başlat ve oyun ekranına geç
        listenToRoom(currentRoomId);
        startGameView();
    });
}

/**
 * 3. SEÇENEK: AYNI CİHAZDA YEREL OYNA (OFFLINE MOD)
 */
function handlePlayLocalMode() {
    isOnlineGame = false;
    currentRoomId = null;
    myPlayerRole = 'both';

    playerNames[PLAYER_RED] = '1. Oyuncu (Kırmızı)';
    playerNames[PLAYER_YELLOW] = '2. Oyuncu (Sarı)';

    onlineBar.style.display = 'none';
    startGameView();
    initLocalGame();
}

/**
 * Beklemeyi iptal et ve lobiye dön
 */
function cancelWaitingRoom() {
    if (currentRoomId) {
        deleteRemoteRoom(currentRoomId);
    }
    stopRoomListener();
    waitingModal.classList.add('hidden');
    currentRoomId = null;
}

/**
 * Oyun arayüzünü açar
 */
function startGameView() {
    waitingModal.classList.add('hidden');
    introScreen.classList.add('fade-out');

    setTimeout(() => {
        gameContainer.classList.remove('hidden');
        gameContainer.classList.add('fade-in');

        if (isOnlineGame) {
            onlineBar.style.display = 'flex';
            activeRoomCodeText.textContent = currentRoomId;
            updateMyRoleBadge();
        } else {
            onlineBar.style.display = 'none';
        }
    }, 350);
}

/**
 * Rol rozetini günceller (🔴 Kırmızı / 🟡 Sarı)
 */
function updateMyRoleBadge() {
    if (myPlayerRole === PLAYER_RED) {
        roleDot.className = 'role-dot red';
        roleText.textContent = 'Rolünüz: 🔴 1. Oyuncu (Kırmızı)';
    } else if (myPlayerRole === PLAYER_YELLOW) {
        roleDot.className = 'role-dot yellow';
        roleText.textContent = 'Rolünüz: 🟡 2. Oyuncu (Sarı)';
    } else {
        roleDot.className = 'role-dot';
        roleText.textContent = 'Mod: Yerel Oyun';
    }
}

/**
 * Oyundan çıkıp lobiye döner
 */
function leaveRoomAndReturnToLobby() {
    if (isOnlineGame && currentRoomId) {
        // Terk etme uyarısı gönder
        updateRemoteRoom({ status: 'abandoned', abandonedBy: myPlayerRole });
        deleteRemoteRoom(currentRoomId);
    }

    stopRoomListener();
    stopTurnTimer();

    currentRoomId = null;
    isOnlineGame = false;
    myPlayerRole = 'both';

    gameContainer.classList.add('hidden');
    gameContainer.classList.remove('fade-in');
    introScreen.classList.remove('fade-out');

    if (playerNameInput) playerNameInput.value = '';
    if (joinRoomCodeInput) joinRoomCodeInput.value = '';
}

// ==============================================================================
// 6. GERÇEK ZAMANLI VERİ SENKRONİZASYONU (FIREBASE RTDB & HİBRİT KÖPRÜ)
// ==============================================================================

function createRemoteRoom(roomId, data) {
    if (isFirebaseConfigured && rtdb) {
        const ref = rtdb.ref('games/' + roomId);
        ref.set(data);
        // Sekme kapatılırsa odayı otomatik temizle / terk et bildir
        ref.onDisconnect().update({ status: 'abandoned', abandonedBy: PLAYER_RED });
    } else {
        // Hibrit Yerel Ağ / Sekme Köprüsü
        try {
            localStorage.setItem('c4_room_' + roomId, JSON.stringify(data));
            if (broadcastChannel) {
                broadcastChannel.postMessage({ type: 'ROOM_CREATED', roomId, data });
            }
        } catch (e) {}
    }
}

function updateRemoteRoom(updates) {
    if (!currentRoomId) return;

    if (isFirebaseConfigured && rtdb) {
        rtdb.ref('games/' + currentRoomId).update(updates);
    } else {
        // Yerel köprü
        try {
            const raw = localStorage.getItem('c4_room_' + currentRoomId);
            if (raw) {
                const current = JSON.parse(raw);
                const updated = Object.assign({}, current, updates);
                localStorage.setItem('c4_room_' + currentRoomId, JSON.stringify(updated));
                if (broadcastChannel) {
                    broadcastChannel.postMessage({ type: 'ROOM_UPDATED', roomId: currentRoomId, updates: updated });
                }
            }
        } catch (e) {}
    }
}

function fetchRoomData(roomId, callback) {
    if (isFirebaseConfigured && rtdb) {
        rtdb.ref('games/' + roomId).once('value').then(snapshot => {
            callback(snapshot.val());
        }).catch(() => callback(null));
    } else {
        try {
            const raw = localStorage.getItem('c4_room_' + roomId);
            callback(raw ? JSON.parse(raw) : null);
        } catch (e) {
            callback(null);
        }
    }
}

function deleteRemoteRoom(roomId) {
    if (isFirebaseConfigured && rtdb) {
        rtdb.ref('games/' + roomId).remove();
    } else {
        try {
            localStorage.removeItem('c4_room_' + roomId);
            if (broadcastChannel) {
                broadcastChannel.postMessage({ type: 'ROOM_DELETED', roomId });
            }
        } catch (e) {}
    }
}

/**
 * Odayı anlık dinler (Firebase onValue & BroadcastChannel köprüsü)
 */
function listenToRoom(roomId) {
    stopRoomListener();

    if (isFirebaseConfigured && rtdb) {
        roomRef = rtdb.ref('games/' + roomId);
        const onValueChange = roomRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) handleRoomStateUpdate(data);
        });
        roomUnsubscribe = () => roomRef.off('value', onValueChange);
    } else {
        // BroadcastChannel Dinleyicisi
        if (broadcastChannel) {
            const handler = (event) => {
                const msg = event.data;
                if (!msg || msg.roomId !== roomId) return;

                if (msg.type === 'ROOM_UPDATED' && msg.updates) {
                    handleRoomStateUpdate(msg.updates);
                } else if (msg.type === 'ROOM_DELETED') {
                    handleRoomAbandoned();
                }
            };
            broadcastChannel.addEventListener('message', handler);
            roomUnsubscribe = () => broadcastChannel.removeEventListener('message', handler);
        }

        // Sekmeler arası storage event dinleyicisi
        const storageHandler = (e) => {
            if (e.key === 'c4_room_' + roomId && e.newValue) {
                handleRoomStateUpdate(JSON.parse(e.newValue));
            }
        };
        window.addEventListener('storage', storageHandler);
        const prevUnsub = roomUnsubscribe;
        roomUnsubscribe = () => {
            if (prevUnsub) prevUnsub();
            window.removeEventListener('storage', storageHandler);
        };
    }
}

function stopRoomListener() {
    if (roomUnsubscribe) {
        roomUnsubscribe();
        roomUnsubscribe = null;
    }
}

/**
 * Veritabanından gelen anlık oda durumu ile istemciyi eşitler.
 */
function handleRoomStateUpdate(data) {
    if (!data) return;

    // 1. Oyuncu İsimleri ve Skorlar
    if (data.p1) playerNames[PLAYER_RED] = data.p1.name;
    if (data.p2) playerNames[PLAYER_YELLOW] = data.p2.name;
    updateScoreNames();

    if (data.scores) {
        scores[PLAYER_RED] = data.scores.red || 0;
        scores[PLAYER_YELLOW] = data.scores.yellow || 0;
        scores.ties = data.scores.ties || 0;
        updateScoreDisplays();
    }

    // 2. İkinci oyuncu katıldı ve maç başladıysa
    if (data.status === 'playing' && !waitingModal.classList.contains('hidden')) {
        startGameView();
        createBoardDOM();
        createPreviewSlots();
    }

    // 3. Bağlantı Kopması / Terk Edilme Durumu
    if (data.status === 'abandoned') {
        handleRoomAbandoned(data.abandonedBy);
        return;
    }

    // 4. Tahta ve Son Hamle Senkronizasyonu
    if (data.board) {
        // Eğer tahtada yerel matrise göre yeni bir taş varsa görsel düşüşü tetikle
        if (data.lastMove) {
            const { row, col, player } = data.lastMove;
            if (boardState[row] && boardState[row][col] !== player) {
                executeVisualDrop(row, col, player);
            }
        }
        boardState = data.board;
    }

    // 5. Sıra ve Kilit Durumu
    currentPlayer = data.turn || PLAYER_RED;
    updateStatusDisplay();
    updateScoreCardHighlight();
    updateTurnLock();

    // 6. Senkronize 15 Saniyelik Zamanlayıcı (Timestamp Bazlı)
    if (data.turnStartTime && data.status === 'playing') {
        syncTimerWithTimestamp(data.turnStartTime);
    }

    // 7. Kazanma veya Beraberlik Durumu
    if (data.status === 'won' && data.winningCells && !isGameOver) {
        applyRemoteWin(data.winningCells, data.winner);
    } else if (data.status === 'draw' && !isGameOver) {
        applyRemoteDraw();
    }
}

/**
 * Rakip oyundan ayrıldığında bildirim gösterir
 */
function handleRoomAbandoned(abandonedBy) {
    stopTurnTimer();
    isGameOver = true;

    const quitterName = (abandonedBy === myPlayerRole) ? 'Siz' : 'Rakip';
    if (abandonedBy !== myPlayerRole) {
        showAlert('🎉 Tebrikler! Hükmen Kazandınız', 'Rakip oyundan ayrıldı veya bağlantısı koptu. Maçı siz kazandınız!', () => {
            leaveRoomAndReturnToLobby();
        });
        playWinArpeggio();
    } else {
        leaveRoomAndReturnToLobby();
    }
}

// ==============================================================================
// 7. GÜVENLİK, SIRA KİLİDİ VE SENKRON ZAMANLAYICI
// ==============================================================================

/**
 * Sıra rakipteyken tahtaya tıklamayı engeller ve bekleme rozetini gösterir.
 */
function updateTurnLock() {
    if (!isOnlineGame) {
        opponentOverlay.classList.add('hidden');
        return;
    }

    const isMyTurn = (myPlayerRole === currentPlayer) && !isGameOver;

    if (isMyTurn) {
        opponentOverlay.classList.add('hidden');
    } else {
        opponentOverlay.classList.remove('hidden');
    }

    updatePreviewState();
}

/**
 * 15 saniyelik zamanlayıcıyı sunucu zaman damgasına göre (timestamp) eşitler.
 * Her iki cihazda da salise farkı olmadan aynı saniyeyi gösterir!
 */
function syncTimerWithTimestamp(startTime) {
    stopTurnTimer();

    if (isGameOver) {
        turnTimer.classList.add('hidden');
        return;
    }

    turnTimer.classList.remove('hidden');

    function tick() {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        currentRemainingSeconds = Math.max(0, TURN_TIME_LIMIT - elapsed);

        timerNumber.textContent = currentRemainingSeconds;

        const totalCircumference = 100;
        const progressOffset = totalCircumference - (currentRemainingSeconds / TURN_TIME_LIMIT) * totalCircumference;
        timerRingProgress.style.strokeDashoffset = progressOffset;

        turnTimer.classList.toggle('urgent', currentRemainingSeconds <= 5);

        // Son 5 saniye uyarısı
        if (currentRemainingSeconds <= 5 && currentRemainingSeconds > 0) {
            playBeepSound(520, 0.03);
        }

        // Süre Doldu! Sırayı otomatik devret (Oda kurucu veya sırası olan yazar)
        if (currentRemainingSeconds <= 0) {
            stopTurnTimer();
            playTimeoutBuzzer();

            // Çift yazmayı önlemek için yalnızca sırası olan taraf veya host devretsin
            if (myPlayerRole === currentPlayer || myPlayerRole === PLAYER_RED) {
                const nextTurn = (currentPlayer === PLAYER_RED) ? PLAYER_YELLOW : PLAYER_RED;
                updateRemoteRoom({
                    turn: nextTurn,
                    turnStartTime: Date.now()
                });
            }
        }
    }

    tick();
    timerInterval = setInterval(tick, 1000);
}

function stopTurnTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// ==============================================================================
// 8. OYUN TAHTASI VE HAMLE MOTORU (ONLINE & LOCAL)
// ==============================================================================

function initLocalGame() {
    boardState = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    moveHistory = [];
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
    updateTurnLock();
    startLocalTurnTimer();
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

/**
 * Tıklama yapıldığında sıra kontrolü ve hamle icrası
 */
function handleColumnClick(col) {
    if (isGameOver || isAnimating) return;

    // Online oyunda sıra kontrolü: Sadece kendi sırası gelen hamle yapabilir!
    if (isOnlineGame && myPlayerRole !== currentPlayer) {
        playBeepSound(180, 0.08);
        return;
    }

    const emptyRow = getLowestEmptyRow(col);
    if (emptyRow === -1) {
        playBeepSound(220, 0.1);
        return;
    }

    if (isOnlineGame) {
        // Hamleyi gerçekleştir ve veritabanına gönder
        executeOnlineMove(emptyRow, col);
    } else {
        // Klasik yerel hamle
        executeLocalMove(emptyRow, col);
    }
}

function getLowestEmptyRow(col) {
    for (let r = ROWS - 1; r >= 0; r--) {
        if (!boardState[r] || boardState[r][col] === null) {
            return r;
        }
    }
    return -1;
}

/**
 * Online Hamleyi veritabanına yazar
 */
function executeOnlineMove(row, col) {
    isAnimating = true;

    const movingPlayer = currentPlayer;
    const nextPlayer = (movingPlayer === PLAYER_RED) ? PLAYER_YELLOW : PLAYER_RED;

    // Matriste güncelle
    boardState[row][col] = movingPlayer;

    // Görsel düşüşü bu ekranda da göster
    executeVisualDrop(row, col, movingPlayer);

    // Kazanma / Beraberlik kontrolü
    const winningCells = checkWin(boardState, row, col);
    const isDraw = !winningCells && checkDraw(boardState);

    setTimeout(() => {
        isAnimating = false;

        const updates = {
            board: boardState,
            lastMove: { row, col, player: movingPlayer },
            turn: nextPlayer,
            turnStartTime: Date.now()
        };

        if (winningCells) {
            updates.status = 'won';
            updates.winner = movingPlayer;
            updates.winningCells = winningCells;
            updates.scores = {
                red: scores[PLAYER_RED] + (movingPlayer === PLAYER_RED ? 1 : 0),
                yellow: scores[PLAYER_YELLOW] + (movingPlayer === PLAYER_YELLOW ? 1 : 0),
                ties: scores.ties
            };
        } else if (isDraw) {
            updates.status = 'draw';
            updates.scores = {
                red: scores[PLAYER_RED],
                yellow: scores[PLAYER_YELLOW],
                ties: scores.ties + 1
            };
        }

        updateRemoteRoom(updates);
    }, 450);
}

/**
 * Yerel Hamle İcrası
 */
function executeLocalMove(row, col) {
    isAnimating = true;
    stopTurnTimer();

    boardState[row][col] = currentPlayer;
    executeVisualDrop(row, col, currentPlayer);

    setTimeout(() => {
        isAnimating = false;

        const winningCombination = checkWin(boardState, row, col);
        if (winningCombination) {
            applyRemoteWin(winningCombination, currentPlayer);
            return;
        }

        if (checkDraw(boardState)) {
            applyRemoteDraw();
            return;
        }

        currentPlayer = (currentPlayer === PLAYER_RED) ? PLAYER_YELLOW : PLAYER_RED;
        updateStatusDisplay();
        updateScoreCardHighlight();
        updatePreviewState();
        startLocalTurnTimer();
    }, 450);
}

function startLocalTurnTimer() {
    syncTimerWithTimestamp(Date.now());
}

/**
 * Taşın tahtaya yukarıdan fiziksel düşüş animasyonu
 */
function executeVisualDrop(row, col, player) {
    const cell = getCellElement(row, col);
    if (!cell) return;

    // Hücrede zaten taş varsa tekrar ekleme
    if (cell.querySelector('.disc')) return;

    const disc = document.createElement('div');
    disc.classList.add('disc', player, 'dropping');

    const cellHeight = cell.offsetHeight || 60;
    const dropDistance = (row + 1.2) * (cellHeight + 10);
    disc.style.setProperty('--drop-distance', `${dropDistance}px`);

    cell.appendChild(disc);
    playDropPopSound(row);

    setTimeout(() => {
        disc.classList.remove('dropping');
    }, 450);
}

/**
 * Kazanma efekti ve zafer ekranı senkronu
 */
function applyRemoteWin(winningCells, winner) {
    isGameOver = true;
    stopTurnTimer();
    turnTimer.classList.add('hidden');
    opponentOverlay.classList.add('hidden');

    boardElement.classList.add('has-winner');

    const winnerGlowColor = (winner === PLAYER_RED)
        ? 'rgba(239, 68, 68, 0.95)'
        : 'rgba(234, 179, 8, 0.95)';

    winningCells.forEach(({ r, c }) => {
        const cell = getCellElement(r, c);
        if (cell) {
            cell.classList.add('winner');
            cell.style.setProperty('--winner-glow', winnerGlowColor);
        }
    });

    const winnerName = playerNames[winner];
    const colorTag = (winner === PLAYER_RED) ? 'Kırmızı' : 'Sarı';

    if (isOnlineGame) {
        if (winner === myPlayerRole) {
            statusText.textContent = `🏆 TEBRİKLER! OYUNU SİZ KAZANDINIZ!`;
            playWinArpeggio();
        } else {
            statusText.textContent = `😔 ${winnerName} (${colorTag}) Kazandı!`;
            playBeepSound(260, 0.3);
        }
    } else {
        statusText.textContent = `🎉 Tebrikler! ${winnerName} (${colorTag}) Kazandı!`;
        playWinArpeggio();
    }

    statusPanel.className = `status-panel win-${winner}`;
    clearColumnHover();
}

function applyRemoteDraw() {
    isGameOver = true;
    stopTurnTimer();
    turnTimer.classList.add('hidden');
    opponentOverlay.classList.add('hidden');

    statusText.textContent = `🤝 Oyun Berabere Bitti!`;
    statusPanel.className = 'status-panel draw';
    statusDisc.style.display = 'none';

    playBeepSound(300, 0.25);
    clearColumnHover();
}

/**
 * 4'lü Kazanma Algoritması
 */
function checkWin(board, r, c) {
    const player = board[r][c];
    if (!player) return null;

    const directions = [
        { dr: 0, dc: 1 },
        { dr: 1, dc: 0 },
        { dr: 1, dc: 1 },
        { dr: -1, dc: 1 }
    ];

    for (let { dr, dc } of directions) {
        let matchedCells = [{ r, c }];

        let step = 1;
        while (true) {
            const nr = r + dr * step;
            const nc = c + dc * step;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === player) {
                matchedCells.push({ r: nr, c: nc });
                step++;
            } else break;
        }

        step = 1;
        while (true) {
            const nr = r - dr * step;
            const nc = c - dc * step;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === player) {
                matchedCells.push({ r: nr, c: nc });
                step++;
            } else break;
        }

        if (matchedCells.length >= WIN_COUNT) return matchedCells;
    }
    return null;
}

function checkDraw(board) {
    for (let c = 0; c < COLS; c++) {
        if (!board[0] || board[0][c] === null) return false;
    }
    return true;
}

function getCellElement(row, col) {
    return document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
}

function updateStatusDisplay() {
    if (isGameOver) return;

    statusDisc.style.display = 'inline-block';
    const currentName = playerNames[currentPlayer];

    if (isOnlineGame) {
        const isMyTurn = (currentPlayer === myPlayerRole);
        if (isMyTurn) {
            statusText.textContent = `🟢 SIRA SİZDE! Taşınızı bırakın`;
        } else {
            statusText.textContent = `⏳ Sıra Rakipte (${currentName})`;
        }
    } else {
        statusText.textContent = `Sıra ${currentName}'de (${currentPlayer === PLAYER_RED ? 'Kırmızı' : 'Sarı'})`;
    }

    statusPanel.className = `status-panel ${currentPlayer}-turn`;
    statusDisc.className = `pulse-disc ${currentPlayer}`;
}

function updateScoreCardHighlight() {
    scoreCardRed.classList.toggle('active-turn', currentPlayer === PLAYER_RED && !isGameOver);
    scoreCardYellow.classList.toggle('active-turn', currentPlayer === PLAYER_YELLOW && !isGameOver);
}

// ==============================================================================
// 9. SÜTUN HOVER VE ÖNİZLEME (GHOST DISC)
// ==============================================================================
function handleColumnHover(col) {
    if (isGameOver) return;
    if (isOnlineGame && myPlayerRole !== currentPlayer) return; // Sıra rakipteyken hover yok

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
    if (hoveredCol === -1 || isGameOver || (isOnlineGame && myPlayerRole !== currentPlayer)) {
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
// 10. YENİDEN BAŞLATMA VE GERİ ALMA
// ==============================================================================
function restartGame() {
    if (isOnlineGame && currentRoomId) {
        // Her iki ekranda da tahtayı sıfırla
        updateRemoteRoom({
            board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
            turn: PLAYER_RED,
            turnStartTime: Date.now(),
            status: 'playing',
            lastMove: null,
            winningCells: null,
            winner: null
        });
    } else {
        initLocalGame();
    }
    playBeepSound(440, 0.08);
}

// ==============================================================================
// 11. BİLDİRİM VE KOPYALAMA YARDIMCILARI
// ==============================================================================
function showAlert(title, message, onOk) {
    alertTitle.textContent = title;
    alertMessage.textContent = message;
    alertModal.classList.remove('hidden');

    btnAlertOk.onclick = () => {
        alertModal.classList.add('hidden');
        if (onOk) onOk();
    };
}

function copyToClipboard(text, onSuccess) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallbackCopy(text, onSuccess));
    } else {
        fallbackCopy(text, onSuccess);
    }
}

function fallbackCopy(text, onSuccess) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        if (onSuccess) onSuccess();
    } catch (e) {}
    document.body.removeChild(textarea);
}

// ==============================================================================
// 12. WEB AUDIO API SES SENTEZLEYİCİSİ (HARİCİ DOSYA YOK)
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

function playDropPopSound(row) {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const startFreq = 460 - (row * 35);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.09);

        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.09);
    } catch (e) {}
}

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

function playWinArpeggio() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const notes = [261.63, 329.63, 392.00, 523.25, 659.25];
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
// 13. OLAY DİNLEYİCİLERİ (EVENT LISTENERS)
// ==============================================================================
themeToggleBtn.addEventListener('click', toggleTheme);

// Çok Oyunculu Butonlar
btnCreateRoom.addEventListener('click', handleCreateRoom);
btnJoinRoom.addEventListener('click', handleJoinRoom);
btnCancelWaiting.addEventListener('click', cancelWaitingRoom);
btnPlayLocalMode.addEventListener('click', handlePlayLocalMode);

// Kopyalama Butonları
btnCopyRoomCode.addEventListener('click', () => {
    if (currentRoomId) {
        copyToClipboard(currentRoomId, () => {
            copyText.textContent = 'Kopyalandı!';
            copyIcon.textContent = '✅';
            setTimeout(() => {
                copyText.textContent = 'Kodu Kopyala';
                copyIcon.textContent = '📋';
            }, 2000);
        });
    }
});

btnCopyActiveRoom.addEventListener('click', () => {
    if (currentRoomId) {
        copyToClipboard(currentRoomId, () => {
            btnCopyActiveRoom.textContent = '✅';
            setTimeout(() => { btnCopyActiveRoom.textContent = '📋'; }, 1500);
        });
    }
});

// Oyun İçi Kontroller
btnRestart.addEventListener('click', restartGame);
btnChangePlayers.addEventListener('click', leaveRoomAndReturnToLobby);
btnResetScores.addEventListener('click', resetAllScores);

btnSound.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
    if (soundEnabled) playBeepSound(600, 0.08);
});

// Sayfa Yüklendiğinde Başlat
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadPreferences();
});
