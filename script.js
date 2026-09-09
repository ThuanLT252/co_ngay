const firebaseConfig = {
  apiKey: "AIzaSyDDZ5E2THCJBS8FpMDts2Z4vKBHt7EnxJ8",
  authDomain: "congay.firebaseapp.com",
  databaseURL:
    "https://congay-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "congay",
  storageBucket: "congay.firebasestorage.app",
  messagingSenderId: "626260272788",
  appId: "1:626260272788:web:79990e1c768041024fb681",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let gameRef = null;
let myRole = null;
let roomId = null;
let lastSyncedPlayer = null;
let turnStartTime = 0;
let isAutoMoving = false;
let serverTimeOffset = 0; // offset between local time and server time

// Sync server time offset
db.ref(".info/serverTimeOffset").on("value", function (snap) {
  serverTimeOffset = snap.val();
});

function getServerTime() {
  return Date.now() + serverTimeOffset;
}

// Custom Room Logic
const urlParams = new URLSearchParams(window.location.search);
roomId = urlParams.get("room");

if (!roomId) {
  document.getElementById("lobby-section").style.display = "flex";
  document.getElementById("game-section").style.display = "none";
} else {
  document.getElementById("lobby-section").style.display = "none";
  document.getElementById("game-section").style.display = "flex";
  initGame(roomId);
}

function createRoom() {
  const randomRoom = Math.random().toString(36).substring(2, 8);
  window.location.href = `?room=${randomRoom}`;
}

function joinRoom() {
  const inputRoom = document.getElementById("roomInput").value.trim();
  if (inputRoom) {
    window.location.href = `?room=${inputRoom}`;
  } else {
    alert("Vui lòng nhập mã phòng!");
  }
}

document.getElementById("createRoomBtn").addEventListener("click", createRoom);
document.getElementById("joinRoomBtn").addEventListener("click", joinRoom);
document.getElementById("roomInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") joinRoom();
});

// Timer Logic
setInterval(() => {
  if (!gameActive || !turnStartTime) return;
  const elapsed = getServerTime() - turnStartTime;
  const remaining = Math.max(0, 30000 - elapsed); // 30 seconds

  const timerBar = document.getElementById("timer-bar");
  const timerText = document.getElementById("timer-text");
  
  if (timerBar && timerText) {
    const percent = (remaining / 30000) * 100;
    timerBar.style.width = percent + "%";
    if (percent < 25) timerBar.style.background = "#e74c3c";
    else if (percent < 50) timerBar.style.background = "#f39c12";
    else timerBar.style.background = "#2ecc71";
    timerText.innerText = Math.ceil(remaining / 1000) + "s";
  }

  if (remaining === 0 && currentPlayer === myRole && gameActive && !isAutoMoving) {
    isAutoMoving = true;
    autoRandomMove();
    setTimeout(() => {
      isAutoMoving = false;
    }, 2000);
  }
}, 1000);

function autoRandomMove() {
  if (isRemovingMode) {
    const opponent = currentPlayer === 1 ? 2 : 1;
    const validOpponents = boardState
      .map((s, i) => (s.player === opponent && !s.tagged ? i : -1))
      .filter((i) => i !== -1);
    if (validOpponents.length > 0) {
      const randomIdx = validOpponents[Math.floor(Math.random() * validOpponents.length)];
      handleRemoving(randomIdx);
    } else {
      isRemovingMode = false;
      activeMill = null;
      if (phase === 1 && placingCount === 24) startPhase2();
      else nextTurn();
      syncToCloud();
    }
  } else if (phase === 1) {
    const emptySpots = boardState.map((s, i) => (s.player === 0 ? i : -1)).filter((i) => i !== -1);
    if (emptySpots.length > 0) {
      const randomIdx = emptySpots[Math.floor(Math.random() * emptySpots.length)];
      handlePhase1(randomIdx);
    }
  } else if (phase === 2) {
    const myPieces = boardState.map((s, i) => (s.player === currentPlayer ? i : -1)).filter((i) => i !== -1);
    const validMoves = [];
    myPieces.forEach((p) => {
      adj[p].forEach((n) => {
        if (boardState[n].player === 0) {
          validMoves.push({ from: p, to: n });
        }
      });
    });

    if (validMoves.length > 0) {
      const move = validMoves[Math.floor(Math.random() * validMoves.length)];
      selectedPiece = move.from;
      handlePhase2(move.to);
    } else {
      nextTurn();
      syncToCloud();
    }
  }
}

// Game Core Logic
const canvas = document.getElementById("gameBoard");
const ctx = canvas.getContext("2d");
const statusText = document.getElementById("status");
const subStatusText = document.getElementById("sub-status");
const resetBtn = document.getElementById("resetBtn");

const size = 600,
  padding = 60,
  cellSize = (size - padding * 2) / 6;
let currentPlayer,
  phase,
  placingCount,
  selectedPiece,
  isRemovingMode,
  gameActive,
  boardState;
let activeMill = null;
let globalAnimFrame = null;
let animStep = 0;
let moveHistory = [];
let endGameData = null;

const points = [
  { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 },
  { x: 6, y: 3 }, { x: 6, y: 6 }, { x: 3, y: 6 },
  { x: 0, y: 6 }, { x: 0, y: 3 }, { x: 1, y: 1 },
  { x: 3, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 3 },
  { x: 5, y: 5 }, { x: 3, y: 5 }, { x: 1, y: 5 },
  { x: 1, y: 3 }, { x: 2, y: 2 }, { x: 3, y: 2 },
  { x: 4, y: 2 }, { x: 4, y: 3 }, { x: 4, y: 4 },
  { x: 3, y: 4 }, { x: 2, y: 4 }, { x: 2, y: 3 },
];

const mills = [
  [0, 1, 2], [2, 3, 4], [4, 5, 6], [6, 7, 0],
  [8, 9, 10], [10, 11, 12], [12, 13, 14], [14, 15, 8],
  [16, 17, 18], [18, 19, 20], [20, 21, 22], [22, 23, 16],
  [1, 9, 17], [5, 13, 21], [7, 15, 23], [3, 11, 19],
  [0, 8, 16], [2, 10, 18], [4, 12, 20], [6, 14, 22],
];

const adj = Array.from({ length: 24 }, () => []);
mills.forEach((mill) => {
  for (let i = 0; i < mill.length - 1; i++) {
    const u = mill[i], v = mill[i + 1];
    if (!adj[u].includes(v)) adj[u].push(v);
    if (!adj[v].includes(u)) adj[v].push(u);
  }
});

function initGame(roomId) {
  document.getElementById("roomIdDisplay").innerText = "Phòng: " + roomId;
  gameRef = db.ref(`games/${roomId}`);
  
  const presenceRef = db.ref(`games/${roomId}/players`);
  presenceRef.transaction((currentPlayers) => {
    if (!currentPlayers) {
      myRole = 1;
      return { p1: true, p2: false };
    } else if (!currentPlayers.p1) {
      myRole = 1;
      return { ...currentPlayers, p1: true };
    } else if (!currentPlayers.p2) {
      myRole = 2;
      return { ...currentPlayers, p2: true };
    }
    myRole = 3; // Viewer
    return currentPlayers;
  });

  gameRef.on("value", (snapshot) => {
    const gameState = snapshot.val();
    if (!gameState || !gameState.boardState) {
      if (myRole === 1) resetGameOnCloud();
      return;
    }

    currentPlayer = gameState.currentPlayer;
    phase = gameState.phase;
    placingCount = gameState.placingCount;
    boardState = gameState.boardState;
    gameActive = gameState.gameActive;
    isRemovingMode = gameState.isRemovingMode;
    activeMill = gameState.activeMill || null;
    turnStartTime = gameState.turnStartTime || getServerTime();
    moveHistory = gameState.moveHistory || [];
    endGameData = gameState.endGameData || null;

    lastSyncedPlayer = currentPlayer;

    manageLoopAnimation();
    updateUIState();
    
    if (endGameData && !gameActive) {
      statusText.innerText = endGameData.title;
      statusText.style.color = "#f1c40f";
      subStatusText.innerText = endGameData.detail;
      subStatusText.style.color = "#ecf0f1";
    }
  });
}

function syncToCloud() {
  if (!gameRef) return;
  const updateData = {
    currentPlayer,
    phase,
    placingCount,
    boardState,
    gameActive,
    isRemovingMode,
    activeMill,
    moveHistory,
    endGameData,
  };
  
  if (currentPlayer !== lastSyncedPlayer) {
    updateData.turnStartTime = firebase.database.ServerValue.TIMESTAMP;
    lastSyncedPlayer = currentPlayer;
  }
  
  gameRef.update(updateData);
}

function resetGameOnCloud() {
  if (!gameRef) return;
  const initialBoard = points.map(() => ({ player: 0, tagged: false }));
  gameRef.set({
    currentPlayer: 2,
    phase: 1,
    placingCount: 0,
    boardState: initialBoard,
    gameActive: true,
    isRemovingMode: false,
    activeMill: null,
    turnStartTime: firebase.database.ServerValue.TIMESTAMP,
    moveHistory: [],
    endGameData: null,
  });
}

function getPixel(idx) {
  return {
    x: padding + points[idx].x * cellSize,
    y: padding + points[idx].y * cellSize,
  };
}

function logMove(msg, player) {
  moveHistory.unshift({ msg, player });
  if (moveHistory.length > 20) moveHistory.pop(); // Keep only last 20 moves
}

function manageLoopAnimation() {
  if (globalAnimFrame) cancelAnimationFrame(globalAnimFrame);

  function renderLoop() {
    animStep++;
    drawScene();
    if (activeMill || isRemovingMode) {
      globalAnimFrame = requestAnimationFrame(renderLoop);
    }
  }
  renderLoop();
}

function drawScene() {
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "#34495e";
  ctx.lineWidth = 4;

  mills.forEach((m) => {
    ctx.beginPath();
    const p1 = getPixel(m[0]), p2 = getPixel(m[1]), p3 = getPixel(m[2]);
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.stroke();
  });

  if (activeMill) {
    const showLine = Math.floor(animStep / 30) % 2 === 0;
    if (showLine) {
      ctx.save();
      ctx.strokeStyle = "#f1c40f";
      ctx.lineWidth = 10;
      ctx.shadowColor = "#f1c40f";
      ctx.shadowBlur = 15;
      ctx.beginPath();
      const p1 = getPixel(activeMill[0]), p2 = getPixel(activeMill[1]), p3 = getPixel(activeMill[2]);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  const opponent = currentPlayer === 1 ? 2 : 1;

  boardState.forEach((state, i) => {
    const p = getPixel(i);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#bdc3c7";
    ctx.fill();

    if (state.player !== 0) {
      ctx.save();

      if (state.tagged) {
        ctx.globalAlpha = 0.5;
      }

      ctx.beginPath();
      ctx.arc(p.x + 2, p.y + 3, 22, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fill();

      const grad = ctx.createRadialGradient(p.x - 6, p.y - 6, 2, p.x, p.y, 22);
      if (state.player === 1) {
        grad.addColorStop(0, "#ff7675");
        grad.addColorStop(1, "#d63031");
      } else {
        grad.addColorStop(0, "#74b9ff");
        grad.addColorStop(1, "#0984e3");
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, 22, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      if (isRemovingMode && state.player === opponent && !state.tagged) {
        const pulse = Math.sin(animStep * 0.1) * 6 + 24;
        const alpha = ((Math.sin(animStep * 0.1) + 1) / 2) * 0.7 + 0.3;

        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 234, 167, ${alpha})`;
        ctx.lineWidth = 6;
        ctx.shadowColor = "#ffeaa7";
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
      }

      if (selectedPiece === i) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
        ctx.strokeStyle = "#f1c40f";
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      ctx.restore();
    }
  });
}

function checkMillAndGetIndices(idx, player) {
  const found = mills.find(
    (mill) =>
      mill.includes(idx) &&
      mill.every((i) => boardState[i].player === player && !boardState[i].tagged)
  );
  return found || null;
}

function canMove(player) {
  const playerPos = boardState
    .map((s, i) => (s.player === player ? i : -1))
    .filter((i) => i !== -1);
  return playerPos.some((pos) => adj[pos].some((n) => boardState[n].player === 0));
}

canvas.addEventListener("mousedown", (e) => {
  if (!gameActive) return;
  if (currentPlayer !== myRole) {
    alert("Chưa đến lượt của bạn!");
    return;
  }
  if (activeMill) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const clickedIdx = points.findIndex(
    (p, i) => Math.hypot(getPixel(i).x - x, getPixel(i).y - y) < 30
  );
  if (clickedIdx === -1) return;

  if (isRemovingMode) handleRemoving(clickedIdx);
  else if (phase === 1) handlePhase1(clickedIdx);
  else handlePhase2(clickedIdx);
});

function handlePhase1(idx) {
  if (boardState[idx].player !== 0) return;
  boardState[idx].player = currentPlayer;
  placingCount++;
  logMove(`Đặt quân tại vị trí ${idx}`, currentPlayer);

  const mill = checkMillAndGetIndices(idx, currentPlayer);
  if (mill) {
    activeMill = mill;
    isRemovingMode = true;
    statusText.innerText = "HÀNG 3!";
    subStatusText.innerText = `Người ${currentPlayer}: Đã vô hiệu hóa quân địch!`;

    setTimeout(() => {
      activeMill = null;
      syncToCloud();
    }, 2500);
  } else {
    nextTurn();
  }
  if (placingCount === 24 && !isRemovingMode) startPhase2();
  else syncToCloud();
}

function handlePhase2(idx) {
  const state = boardState[idx];
  if (selectedPiece === null) {
    if (state.player === currentPlayer) selectedPiece = idx;
    manageLoopAnimation();
  } else {
    if (state.player === 0 && adj[selectedPiece].includes(idx)) {
      boardState[idx].player = currentPlayer;
      boardState[selectedPiece].player = 0;
      logMove(`Di chuyển quân từ ${selectedPiece} đến ${idx}`, currentPlayer);

      const mill = checkMillAndGetIndices(idx, currentPlayer);
      if (mill) {
        activeMill = mill;
        isRemovingMode = true;
        statusText.innerText = "MILL!";
        subStatusText.innerText = `Người ${currentPlayer}: Tạo hàng 3 thành công!`;
        selectedPiece = null;

        setTimeout(() => {
          activeMill = null;
          syncToCloud();
        }, 2500);
      } else {
        selectedPiece = null;
        nextTurn();
      }
    } else {
      selectedPiece = state.player === currentPlayer ? idx : null;
    }
    manageLoopAnimation();
    syncToCloud();
  }
}

function handleRemoving(idx) {
  const opponent = currentPlayer === 1 ? 2 : 1;
  if (boardState[idx].player !== opponent || boardState[idx].tagged) return;

  if (phase === 1) {
    boardState[idx].tagged = true;
    logMove(`Vô hiệu hóa quân tại ${idx}`, currentPlayer);
  } else {
    boardState[idx] = { player: 0, tagged: false };
    logMove(`Xóa quân tại ${idx}`, currentPlayer);
  }

  isRemovingMode = false;
  activeMill = null;

  if (phase === 1 && placingCount === 24) startPhase2();
  else nextTurn();
  syncToCloud();
}

function startPhase2() {
  phase = 2;
  boardState = boardState.map((s) => (s.tagged ? { player: 0, tagged: false } : s));
  statusText.innerText = "HIỆP 2 BẮT ĐẦU";
  nextTurn();
}

function nextTurn() {
  if (phase === 2) {
    const p1 = boardState.filter((s) => s.player === 1).length;
    const p2 = boardState.filter((s) => s.player === 2).length;
    if (p1 < 3) return endGame("XANH THẮNG!", "Đỏ đã hết quân.");
    if (p2 < 3) return endGame("ĐỎ THẮNG!", "Xanh đã hết quân.");
    const nextP = currentPlayer === 1 ? 2 : 1;
    if (!canMove(nextP))
      return endGame(
        `${currentPlayer === 1 ? "ĐỎ" : "XANH"} THẮNG!`,
        "Đối thủ bị vây chặt."
      );
  }
  currentPlayer = currentPlayer === 1 ? 2 : 1;
}

function updateUIState() {
  const playerColor = currentPlayer === 1 ? "var(--red-piece)" : "var(--blue-piece)";
  subStatusText.style.color = playerColor;

  if (gameActive && !isRemovingMode && !activeMill) {
    statusText.innerText = phase === 1 ? "Hiệp 1: Đặt quân" : "Hiệp 2: Di chuyển";
    subStatusText.innerText = `Lượt: Người chơi ${currentPlayer} (${currentPlayer === 1 ? "Đỏ" : "Xanh"})${myRole === currentPlayer ? " (Lượt của bạn)" : ""}`;
  }
  
  // Show or hide surrender button
  const surrenderBtn = document.getElementById("surrenderBtn");
  if (surrenderBtn) {
    surrenderBtn.style.display = (gameActive && (myRole === 1 || myRole === 2)) ? "block" : "none";
  }

  // Update Move History
  const historyList = document.getElementById("moveHistory");
  if (historyList) {
    historyList.innerHTML = moveHistory
      .map(
        (m) =>
          `<li class="p${m.player}"><b>${m.player === 1 ? "Đỏ" : "Xanh"}:</b> ${m.msg}</li>`
      )
      .join("");
  }
}

function endGame(title, detail) {
  gameActive = false;
  endGameData = { title, detail };
  statusText.innerText = title;
  statusText.style.color = "#f1c40f";
  subStatusText.innerText = detail;
  subStatusText.style.color = "#ecf0f1";
  syncToCloud();
}

resetBtn.addEventListener("click", () => {
  if (myRole === 1 || myRole === 2) {
    resetGameOnCloud();
  } else {
    alert("Chỉ người chơi chính mới có thể reset ván đấu!");
  }
});

document.getElementById("copyLinkBtn").addEventListener("click", () => {
  navigator.clipboard.writeText(window.location.href).then(() => {
    alert("Đã copy link phòng!");
  });
});

document.getElementById("surrenderBtn").addEventListener("click", () => {
  if (!gameActive) return;
  if (myRole !== 1 && myRole !== 2) return;
  
  if (confirm("Bạn có chắc chắn muốn đầu hàng không?")) {
    const title = myRole === 1 ? "XANH THẮNG!" : "ĐỎ THẮNG!";
    const detail = `Người chơi ${myRole === 1 ? "Đỏ" : "Xanh"} đã đầu hàng.`;
    logMove("Đầu hàng", myRole);
    endGame(title, detail);
  }
});
