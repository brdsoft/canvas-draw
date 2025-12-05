const CANVAS = document.getElementById('canvas');
const CTX = CANVAS.getContext('2d');
const DRAG_NOTHING = 'nothing'; // ничего
const DRAG_POINT = 'drag'; // перемещение точки
const DRAG_PAN = 'pan'; // перемещение холста
const DRAG_TOLERANCE = 5;
const DOUBLE_CLICK_TIME = 300;

let WIDTH = CANVAS.width = window.innerWidth;
let HEIGHT = CANVAS.height = window.innerHeight;
let DRAG_MODE = DRAG_NOTHING;
let GRID_STEP = 40;
let POINTS = [];
let LINES = [];
let MOUSE_UP_TIME = null;
let MOUSE_DOWN_POS = null;
let MOUSE_DOWN_POINT = null;
let MOUSE_MOVE_POS = null;
let DRAW_POINT = null; // точка с которой идет рисование линии
let PAN_OFFSET = {x: 0, y: 0};

function gridToCanvas({x, y}) {
    return {
        x: WIDTH / 2 + x * GRID_STEP + PAN_OFFSET.x,
        y: HEIGHT / 2 + y * GRID_STEP + PAN_OFFSET.y
    };
}

function canvasToGrid({x, y}) {
    return {
        x: Math.round((x - WIDTH / 2 - PAN_OFFSET.x) / GRID_STEP),
        y: Math.round((y - HEIGHT / 2 - PAN_OFFSET.y) / GRID_STEP)
    };
}

function currentCPos(e) {
    return {
        x: e.offsetX,
        y: e.offsetY
    };
}

function currentGPos(e) {
    return canvasToGrid(currentCPos(e));
}

function distance(pos1, pos2) {
    return Math.hypot(pos1.x - pos2.x, pos1.y - pos2.y);
}

//Расстояние от положения курсора до точки (в координатах сетки)
function pointDistance(pointIndex, e) {
    if (!POINTS[pointIndex]) return Infinity;
    return distance(currentGPos(e), POINTS[pointIndex]);
}

//Расстояние от положения курсора до линии (в координатах сетки)
function lineDistance(lineIndex, e) {
    const l = LINES[lineIndex];
    if (!l || !POINTS[l.p1] || !POINTS[l.p2]) return Infinity;
    const pos = currentGPos(e);
    const p1 = POINTS[l.p1], p2 = POINTS[l.p2];
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const segLenSq = dx * dx + dy * dy;
    if (segLenSq === 0) return Infinity;
    const t = ((pos.x - p1.x) * dx + (pos.y - p1.y) * dy) / segLenSq;
    if (t < 0 || t > 1) return Infinity;
    const proj = {x: p1.x + t * dx, y: p1.y + t * dy};
    return distance(pos, proj);
}

function hoverPoint(e) {
    for (let i = 0; i < POINTS.length; i++) {
        if (i !== MOUSE_DOWN_POINT && pointDistance(i, e) === 0) return i;
    }
    return null;
}

function hoverLine(e) {
    for (let i = 0; i < LINES.length; i++) {
        const l = LINES[i];
        if (!POINTS[l.p1] || !POINTS[l.p2]) continue;

        // расстояние от указателя до линии
        const distLine = lineDistance(i, e);

        // расстояние до концов линии
        const distP1 = pointDistance(l.p1, e);
        const distP2 = pointDistance(l.p2, e);

        // близко к линии но не очень близко к концам
        if (distLine < 0.2 && distP1 > 0.5 && distP2 > 0.5) {
            return i;
        }
    }
    return null;
}

function setDragMode(newMode) {
    DRAG_MODE = newMode;
    console.log('Mode ' + DRAG_MODE);
}

function addPoint({x, y}) {
    //дубль
    for (let point of POINTS) {
        if (point.x === x && point.y === y) {
            return false;
        }
    }

    POINTS.push({x, y});
    const pointIndex = POINTS.length - 1;
    console.log('Point added with index ' + pointIndex);
    //console.log(POINTS);
    return pointIndex;
}

function deletePoint(pointIndex) {
    if (pointIndex < 0 || pointIndex >= POINTS.length) return;

    // --- 1. Находим связанные линии ---
    const connected = LINES
        .map((line, idx) => ({ idx, line }))
        .filter(obj => obj.line.p1 === pointIndex || obj.line.p2 === pointIndex);

    // --- 2. Если две линии → соединяем другие концы ---
    if (connected.length === 2) {
        const l1 = connected[0].line;
        const l2 = connected[1].line;

        // Другие точки
        const a = (l1.p1 === pointIndex) ? l1.p2 : l1.p1;
        const b = (l2.p1 === pointIndex) ? l2.p2 : l2.p1;

        // Проверяем, нет ли уже линии a—b
        const exists = LINES.some(line =>
            (line.p1 === a && line.p2 === b) ||
            (line.p1 === b && line.p2 === a)
        );

        // Если нет — создаём новую
        if (!exists && a !== b) {
            LINES.push({ p1: a, p2: b });
        }
    }

    // --- 3. Удаляем точку ---
    POINTS.splice(pointIndex, 1);

    // --- 4. Удаляем линии, где точка встречается ---
    LINES = LINES.filter(line => line.p1 !== pointIndex && line.p2 !== pointIndex);

    // --- 5. Корректируем индексы точек ---
    LINES = LINES.map(line => ({
        p1: line.p1 > pointIndex ? line.p1 - 1 : line.p1,
        p2: line.p2 > pointIndex ? line.p2 - 1 : line.p2
    }));
}

function movePoint(pointIndex, {x, y}) {
    POINTS[pointIndex].x = x;
    POINTS[pointIndex].y = y;
}

function mergePoints(index) {
    console.log('Merging points');

    if (index < 0 || index >= POINTS.length) return;

    const point = POINTS[index];

    // Находим все индексы точек с такими же координатами
    const indices = [];
    POINTS.forEach((p, i) => {
        if (p.x === point.x && p.y === point.y) {
            indices.push(i);
        }
    });

    if (indices.length < 2) return; // объединять нечего

    const keepIndex = indices[0]; // первая точка остаётся
    const removeIndices = indices.slice(1).sort((a,b) => b-a); // остальные удаляем

    // Перенаправляем линии
    LINES.forEach(line => {
        removeIndices.forEach(idx => {
            if (line.p1 === idx) line.p1 = keepIndex;
            if (line.p2 === idx) line.p2 = keepIndex;
        });
    });

    // Удаляем точки (с конца массива, чтобы индексы не смещались)
    removeIndices.forEach(idx => POINTS.splice(idx, 1));

    // Пересчитываем индексы линий после удаления точек
    removeIndices.forEach(removedIdx => {
        LINES.forEach(line => {
            if (line.p1 > removedIdx) line.p1--;
            if (line.p2 > removedIdx) line.p2--;
        });
    });

    // Удаляем линии-самопетли и дубликаты
    const seen = new Set();
    for (let i = LINES.length - 1; i >= 0; i--) {
        const line = LINES[i];
        if (line.p1 === line.p2) {
            LINES.splice(i, 1);
            continue;
        }
        const key = line.p1 < line.p2 ? `${line.p1},${line.p2}` : `${line.p2},${line.p1}`;
        if (seen.has(key)) {
            LINES.splice(i, 1);
        } else {
            seen.add(key);
        }
    }
}

function addLine(p1, p2) {
    // дубль
    for (let line of LINES) {
        if (
            (line.p1 === p1 && line.p2 === p2) ||
            (line.p1 === p2 && line.p2 === p1)
        ) {
            return false;
        }
    }

    LINES.push({ p1, p2 });
    const lineIndex = LINES.length - 1;
    console.log('line added with index ' + lineIndex);
    return lineIndex;
}

function pointPos(pointIndex) {
    return POINTS[pointIndex];
}

function setDrawPoint(pointIndex) {
    DRAW_POINT = pointIndex;
    console.log('Set drawing point ' + pointIndex);
}

function resetDrawPoint() {
    DRAW_POINT = null;
    console.log('Reset drawing point');
}

function splitLine(lineIndex, pointIndex) {
    console.log('Splitting line')

    const line = LINES[lineIndex];

    const newLine1 = { p1: line.p1, p2: pointIndex };
    const newLine2 = { p1: pointIndex, p2: line.p2 };

    // Проверяем, есть ли дубликаты
    let addLine1 = true;
    let addLine2 = true;

    for (let i = 0; i < LINES.length; i++) {
        const l = LINES[i];
        if ((l.p1 === newLine1.p1 && l.p2 === newLine1.p2) ||
            (l.p1 === newLine1.p2 && l.p2 === newLine1.p1)) {
            addLine1 = false;
        }
        if ((l.p1 === newLine2.p1 && l.p2 === newLine2.p2) ||
            (l.p1 === newLine2.p2 && l.p2 === newLine2.p1)) {
            addLine2 = false;
        }
    }

    const newLines = [];
    if (addLine1) newLines.push(newLine1);
    if (addLine2) newLines.push(newLine2);

    // Заменяем исходную линию на новые линии (если обе дубли — просто удаляем исходную)
    LINES.splice(lineIndex, 1, ...newLines);
}

function isDragged(pos1, pos2) {
    return pos1 !== null && pos2 !== null && distance(pos1, pos2) > DRAG_TOLERANCE;
}

// --- Ресайз ---
window.addEventListener('resize', () => {
    WIDTH = CANVAS.width = window.innerWidth;
    HEIGHT = CANVAS.height = window.innerHeight;
    draw();
});

// --- Масштабирование к курсору ---
CANVAS.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.15 : 0.85;
    const mouse = currentCPos(e);
    const oldStep = GRID_STEP;
    GRID_STEP = Math.max(10, Math.min(100, GRID_STEP * delta));
    PAN_OFFSET.x -= (mouse.x - WIDTH / 2 - PAN_OFFSET.x) * (GRID_STEP / oldStep - 1);
    PAN_OFFSET.y -= (mouse.y - HEIGHT / 2 - PAN_OFFSET.y) * (GRID_STEP / oldStep - 1);
    draw(e);
}, {passive: false});

CANVAS.addEventListener('pointerdown', e => {
    if (e.button !== 0)
        return;
    MOUSE_DOWN_POS = MOUSE_MOVE_POS = currentCPos(e);
    MOUSE_DOWN_POINT = hoverPoint(e);
});

CANVAS.addEventListener('pointermove', e => {
    const cPos = currentCPos(e);
    const gPos = currentGPos(e);

    switch (DRAG_MODE) {
        case DRAG_NOTHING:
            //Кнопка зажата
            if (MOUSE_DOWN_POS !== null) {
                //Указатель сместился достаточно
                if (isDragged(MOUSE_DOWN_POS, cPos)) {
                    //Кнопка была зажата над точкой
                    if (MOUSE_DOWN_POINT !== null) {
                        if (distance(cPos, MOUSE_DOWN_POS) > DRAG_TOLERANCE) {
                            setDragMode(DRAG_POINT);
                            resetDrawPoint();
                        }
                    } else {
                        setDragMode(DRAG_PAN);
                        CANVAS.style.cursor = 'grab';
                    }
                }
            }
            break;
        case DRAG_PAN:
            PAN_OFFSET.x += cPos.x - MOUSE_MOVE_POS.x;
            PAN_OFFSET.y += cPos.y - MOUSE_MOVE_POS.y;
            MOUSE_MOVE_POS = cPos;
            break;
        case DRAG_POINT:
            movePoint(MOUSE_DOWN_POINT, gPos);
            break;
        default:
    }

    draw(e);
});

CANVAS.addEventListener('pointerup', e => {
    if (e.button !== 0)
        return;
    const cPos = currentCPos(e);
    const gPos = currentGPos(e);
    const hLine = hoverLine(e);
    const hPoint = hoverPoint(e);

    switch (DRAG_MODE) {
        case DRAG_NOTHING:
            if (DRAW_POINT === null) {
                if (hLine === null && MOUSE_DOWN_POINT === null) {
                    let pointIndex = addPoint(gPos);
                    setDrawPoint(pointIndex);
                } else if (MOUSE_DOWN_POINT !== null) {
                    if (Date.now() - MOUSE_UP_TIME < DOUBLE_CLICK_TIME) {
                        deletePoint(MOUSE_DOWN_POINT);
                    } else {
                        setDrawPoint(MOUSE_DOWN_POINT);
                    }
                } else if (hLine !== null) {
                    let pointIndex = addPoint(gPos);
                    splitLine(hLine, pointIndex)
                    setDrawPoint(pointIndex);
                }
            } else {
                if (hLine === null && MOUSE_DOWN_POINT === null) {
                    let pointIndex = addPoint(gPos);
                    addLine(DRAW_POINT, pointIndex);
                    setDrawPoint(pointIndex);
                } else if (MOUSE_DOWN_POINT !== null) {
                    if (DRAW_POINT !== MOUSE_DOWN_POINT) {
                        addLine(DRAW_POINT, MOUSE_DOWN_POINT);
                    } else if (Date.now() - MOUSE_UP_TIME < DOUBLE_CLICK_TIME) {
                        console.log()
                        deletePoint(MOUSE_DOWN_POINT);
                    }
                    resetDrawPoint();
                } else if (hLine !== null) {
                    let pointIndex = addPoint(gPos);
                    splitLine(hLine, pointIndex)
                    addLine(DRAW_POINT, pointIndex);
                    resetDrawPoint();
                }
            }
            draw(e);
            break;
        case DRAG_PAN:
            CANVAS.style.cursor = 'default';
            setDragMode(DRAG_NOTHING);
            break;
        case DRAG_POINT:
            if (hPoint !== null) {
                mergePoints(hPoint);
            }
            if (hLine !== null) {
                splitLine(hLine, MOUSE_DOWN_POINT);
            }
            setDragMode(DRAG_NOTHING);
            draw(e);
            break;
        default:
    }
    MOUSE_UP_TIME = Date.now();
    MOUSE_DOWN_POS = null;
    MOUSE_DOWN_POINT = null;
});

CANVAS.addEventListener('contextmenu', e => {
    e.preventDefault();
    resetDrawPoint();
    MOUSE_DOWN_POS = null;
    draw(e);
});

// --- Рисование ---
function draw(e) {
    CTX.clearRect(0, 0, WIDTH, HEIGHT);
    const centerX = WIDTH / 2 + PAN_OFFSET.x;
    const centerY = HEIGHT / 2 + PAN_OFFSET.y;
    const hLine = e ? hoverLine(e) : null;
    const gcPos = e ? gridToCanvas(currentGPos(e)) : null;

    // Сетка
    CTX.strokeStyle = '#eee';
    CTX.lineWidth = 1;
    for (let x = centerX % GRID_STEP; x < WIDTH; x += GRID_STEP) {
        CTX.beginPath();
        CTX.moveTo(x, 0);
        CTX.lineTo(x, HEIGHT);
        CTX.stroke();
    }
    for (let y = centerY % GRID_STEP; y < HEIGHT; y += GRID_STEP) {
        CTX.beginPath();
        CTX.moveTo(0, y);
        CTX.lineTo(WIDTH, y);
        CTX.stroke();
    }

    // Линии
    LINES.forEach((l, i) => {
        if (!POINTS[l.p1] || !POINTS[l.p2]) return;
        const p1 = gridToCanvas(POINTS[l.p1]), p2 = gridToCanvas(POINTS[l.p2]);
        CTX.strokeStyle = hLine === i ? 'orange' : 'black';
        CTX.lineWidth = 2;
        CTX.beginPath();
        CTX.moveTo(p1.x, p1.y);
        CTX.lineTo(p2.x, p2.y);
        CTX.stroke();
    });

    // Точки
    POINTS.forEach((p, i) => {
        const c = gridToCanvas(p);
        CTX.beginPath();
        CTX.arc(c.x, c.y, Math.max(1, Math.min(6, GRID_STEP / 7)), 0, Math.PI * 2);
        CTX.fillStyle = (DRAW_POINT === i) ? 'red' : 'blue';
        CTX.fill();
        CTX.strokeStyle = 'black';
        CTX.lineWidth = 2;
        CTX.stroke();
    });

    // Временная линия
    if (DRAW_POINT !== null && gcPos !== null) {
        const from = gridToCanvas(pointPos(DRAW_POINT));
        CTX.strokeStyle = 'red';
        CTX.setLineDash([3, 3]);
        CTX.beginPath();
        CTX.moveTo(from.x, from.y);
        CTX.lineTo(gcPos.x, gcPos.y);
        CTX.lineWidth = 1;
        CTX.stroke();
        CTX.setLineDash([]);
    }

    //Фантомная точка
    if (hLine !== null && gcPos !== null) {
        CTX.beginPath();
        CTX.arc(gcPos.x, gcPos.y, Math.max(1, Math.min(5, GRID_STEP / 8)), 0, Math.PI * 2);
        CTX.fillStyle = 'orange';
        CTX.fill();
        CTX.strokeStyle = 'transparent';
        CTX.stroke();
    }
}

// Начальная отрисовка
draw();
