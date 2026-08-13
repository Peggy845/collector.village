'use client';

import { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';

const PLUSH_IMAGES = [
  '/dream-room/plush-1.png',
  '/dream-room/plush-2.png',
  '/dream-room/plush-3.png',
  '/dream-room/plush-4.png',
  '/dream-room/plush-5.png',
  '/dream-room/plush-6.png',
  '/dream-room/plush-7.png',
  '/dream-room/plush-8.png',
];

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
// 放開手時甩出去的最高速度，防止太用力甩導致單一物理步位移過大而「穿牆」飛出去。
const MAX_FLING_SPEED = 40;

interface PlushObj {
  body: Matter.Body;
  el: HTMLDivElement;
  halfW: number;
  halfH: number;
  baseW: number;
  baseH: number;
  scale: number;
}

export default function ClawMachine() {
  const stageRef = useRef<HTMLDivElement>(null);
  const rotateUiRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [tidyMode, setTidyMode] = useState(false);
  const tossOneRef = useRef<() => void>(() => {});
  const applyTidyModeRef = useRef<(tidy: boolean) => void>(() => {});
  const tidyModeRef = useRef(tidyMode);

  useEffect(() => {
    tidyModeRef.current = tidyMode;
    applyTidyModeRef.current(tidyMode);
  }, [tidyMode]);

  useEffect(() => {
    const stage = stageRef.current;
    const rotateUi = rotateUiRef.current;
    if (!stage || !rotateUi) return;

    const { Engine, World, Bodies, Body, Runner } = Matter;

    let W = stage.clientWidth;
    let H = stage.clientHeight;

    const engine = Engine.create();
    engine.gravity.y = 1.1;
    const world = engine.world;

    // 娃娃只能在看得到的框框範圍內活動，四個邊都圍起來，碰到邊界會彈回來，
    // 不會有丟出框框外、要等很久才掉得回來的情況（見使用者回報）。
    // 牆壁刻意做得比較厚（見WALL_THICKNESS），是為了配合下面甩出去的速度上限一起
    // 防止「穿牆」：物理引擎每一步都是離散運算，太薄的牆配上夠快的速度，
    // 娃娃有可能一步就跳過牆的範圍，等於直接穿過去消失在外面。
    const WALL_THICKNESS = 120;
    const wallOpts = { isStatic: true, restitution: 0.4, friction: 0.6 };
    const ground = Bodies.rectangle(W / 2, H + WALL_THICKNESS / 2, W * 2, WALL_THICKNESS, wallOpts);
    const leftWall = Bodies.rectangle(-WALL_THICKNESS / 2, H / 2, WALL_THICKNESS, H * 2, wallOpts);
    const rightWall = Bodies.rectangle(W + WALL_THICKNESS / 2, H / 2, WALL_THICKNESS, H * 2, wallOpts);
    const ceiling = Bodies.rectangle(W / 2, -WALL_THICKNESS / 2, W * 2, WALL_THICKNESS, wallOpts);
    World.add(world, [ground, leftWall, rightWall, ceiling]);

    const runner = Runner.create();
    Runner.run(runner, engine);

    let plushies: PlushObj[] = [];
    let dragTarget: {
      body: Matter.Body;
      plushObj: PlushObj;
      startX: number | null;
      startY: number | null;
      lastX: number | null;
      lastY: number | null;
      lastT: number | null;
      vx: number;
      vy: number;
      moved: boolean;
    } | null = null;
    let selectedPlush: PlushObj | null = null;
    let tossIndex = 0;
    let rafId = 0;
    let cancelled = false;

    function radiusRange() {
      const base = Math.min(W, H);
      return { min: base * 0.09, max: base * 0.13 };
    }

    function positionRotateUI() {
      if (!selectedPlush || !rotateUi) return;
      const { x, y } = selectedPlush.body.position;
      rotateUi.style.left = x + 'px';
      rotateUi.style.top = y - selectedPlush.halfH - 40 + 'px';
    }

    function selectPlush(p: PlushObj) {
      selectedPlush = p;
      rotateUi!.style.display = 'flex';
      positionRotateUI();
    }

    function deselectPlush() {
      selectedPlush = null;
      rotateUi!.style.display = 'none';
    }

    // 這個模式本來就不在意娃娃的真實比例，所以大小是玩家自己等比例調的，
    // 只能在整理模式下調整；調整後直接寫回 plushObj/body，不受整理模式開關影響，
    // 關掉整理模式回到亂丟模式時會保留剛剛調的大小。
    function applyScale(p: PlushObj, factor: number) {
      const nextScale = Math.min(Math.max(p.scale * factor, MIN_SCALE), MAX_SCALE);
      const appliedFactor = nextScale / p.scale;
      if (appliedFactor === 1) return;
      Body.scale(p.body, appliedFactor, appliedFactor);
      p.scale = nextScale;
      const w = p.baseW * nextScale;
      const h = p.baseH * nextScale;
      p.halfW = w / 2;
      p.halfH = h / 2;
      p.el.style.width = w + 'px';
      p.el.style.height = h + 'px';
    }

    function tossOne() {
      if (tidyModeRef.current) return;

      const src = PLUSH_IMAGES[tossIndex % PLUSH_IMAGES.length];
      tossIndex++;

      const { min, max } = radiusRange();
      const targetDiam = (min + Math.random() * (max - min)) * 2;

      const probeImg = new Image();
      probeImg.onload = () => {
        if (cancelled) return;
        const aspect = probeImg.naturalWidth / probeImg.naturalHeight;
        let dispW: number;
        let dispH: number;
        if (aspect >= 1) {
          dispW = targetDiam;
          dispH = targetDiam / aspect;
        } else {
          dispH = targetDiam;
          dispW = targetDiam * aspect;
        }

        const r = Math.max(dispW, dispH) * 0.42;
        const x = W * 0.25 + Math.random() * W * 0.5;
        const y = r + 5 + Math.random() * 30;
        const body = Bodies.circle(x, y, r, {
          restitution: 0.5,
          friction: 0.4,
          frictionAir: 0.012,
          density: 0.002,
        });
        Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.25);
        World.add(world, body);

        const el = document.createElement('div');
        el.className = 'dream-room-plush';
        el.style.width = dispW + 'px';
        el.style.height = dispH + 'px';
        const img = document.createElement('img');
        img.src = src;
        img.draggable = false;
        img.alt = '';
        el.appendChild(img);
        stage!.appendChild(el);

        const plushObj: PlushObj = {
          body,
          el,
          halfW: dispW / 2,
          halfH: dispH / 2,
          baseW: dispW,
          baseH: dispH,
          scale: 1,
        };

        el.addEventListener('pointerdown', (e) => {
          // 抓到別隻娃娃時，目標已經換人了，先前選取的那隻旋轉按鈕要立刻收掉，
          // 不然體感上會覺得焦點卡在舊的那隻身上（見使用者回報）。
          if (selectedPlush && selectedPlush !== plushObj) {
            deselectPlush();
          }
          dragTarget = {
            body,
            plushObj,
            startX: null,
            startY: null,
            lastX: null,
            lastY: null,
            lastT: null,
            vx: 0,
            vy: 0,
            moved: false,
          };
          Body.setStatic(body, true);
          stage!.appendChild(el);
          e.preventDefault();
        });

        plushies.push(plushObj);
        setCount(plushies.length);
      };
      probeImg.src = src;
    }
    tossOneRef.current = tossOne;

    // 整理模式開關要讓場上「所有」娃娃立刻暫停/恢復物理，不是只影響之後新的拖曳，
    // 不然像剛剛測試發現的，關掉整理模式後娃娃還是靜止不動（之前漏掉這段邏輯）。
    applyTidyModeRef.current = (tidy: boolean) => {
      for (const p of plushies) {
        Body.setStatic(p.body, tidy);
        if (!tidy) Body.setVelocity(p.body, { x: 0, y: 0 });
      }
    };

    function handlePointerMove(e: PointerEvent) {
      if (!dragTarget) return;
      const rect = stage!.getBoundingClientRect();
      const r = dragTarget.body.circleRadius ?? 0;
      // 拖曳中心點不能超出框框範圍（上下左右都算），碰到邊界就夾住不再跟著手指走，
      // 放開後物理引擎的牆壁會讓它自然回彈。
      const x = Math.min(Math.max(e.clientX - rect.left, r), W - r);
      const y = Math.min(Math.max(e.clientY - rect.top, r), H - r);
      const t = performance.now();
      if (dragTarget.startX === null) {
        dragTarget.startX = x;
        dragTarget.startY = y;
      }
      if (Math.hypot(x - dragTarget.startX!, y - dragTarget.startY!) > 6) {
        dragTarget.moved = true;
      }
      if (dragTarget.lastT !== null && dragTarget.lastX !== null && dragTarget.lastY !== null) {
        const dt = Math.max(t - dragTarget.lastT, 1);
        dragTarget.vx = ((x - dragTarget.lastX) / dt) * 16;
        dragTarget.vy = ((y - dragTarget.lastY) / dt) * 16;
      }
      dragTarget.lastX = x;
      dragTarget.lastY = y;
      dragTarget.lastT = t;
      Body.setPosition(dragTarget.body, { x, y });
      if (selectedPlush === dragTarget.plushObj) positionRotateUI();
    }
    stage.addEventListener('pointermove', handlePointerMove);

    function handlePointerUp() {
      if (!dragTarget) return;
      const stillStatic = tidyModeRef.current;
      Body.setStatic(dragTarget.body, stillStatic);
      if (!stillStatic) {
        let vx = dragTarget.vx || 0;
        let vy = dragTarget.vy || 0;
        const speed = Math.hypot(vx, vy);
        if (speed > MAX_FLING_SPEED) {
          const scale = MAX_FLING_SPEED / speed;
          vx *= scale;
          vy *= scale;
        }
        Body.setVelocity(dragTarget.body, { x: vx, y: vy });
        deselectPlush();
      } else if (!dragTarget.moved) {
        selectPlush(dragTarget.plushObj);
      } else {
        positionRotateUI();
      }
      dragTarget = null;
    }
    window.addEventListener('pointerup', handlePointerUp);

    function handleRotateClick(e: Event) {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn || !selectedPlush) return;
      if (btn.dataset.scale) {
        // 縮放時故意不重新定位面板：娃娃變大會讓面板往上飄，連續點+/-還要一直移動滑鼠瞄準，
        // 體感不順（見使用者回報）。面板固定在選取當下的位置，點幾下都不用動滑鼠，
        // 之後只要重新選取或拖曳娃娃，面板自然會重新定位一次。
        applyScale(selectedPlush, parseFloat(btn.dataset.scale));
      } else if (btn.dataset.a) {
        const a = btn.dataset.a;
        if (a === 'reset') {
          Body.setAngle(selectedPlush.body, 0);
        } else {
          Body.setAngle(selectedPlush.body, selectedPlush.body.angle + (parseFloat(a) * Math.PI) / 180);
        }
        positionRotateUI();
      }
    }
    rotateUi.addEventListener('pointerdown', (e) => e.stopPropagation());
    rotateUi.addEventListener('click', handleRotateClick);

    function handleStagePointerDown(e: PointerEvent) {
      if (e.target === stage) deselectPlush();
    }
    stage.addEventListener('pointerdown', handleStagePointerDown);

    function handleResize() {
      W = stage!.clientWidth;
      H = stage!.clientHeight;
      Body.setPosition(ground, { x: W / 2, y: H + WALL_THICKNESS / 2 });
      Body.setPosition(rightWall, { x: W + WALL_THICKNESS / 2, y: H / 2 });
      Body.setPosition(ceiling, { x: W / 2, y: -WALL_THICKNESS / 2 });
    }
    window.addEventListener('resize', handleResize);

    function loop() {
      for (const p of plushies) {
        const { x, y } = p.body.position;
        const angle = p.body.angle;
        p.el.style.transform = `translate(${x - p.halfW}px, ${y - p.halfH}px) rotate(${angle}rad)`;
      }
      rafId = requestAnimationFrame(loop);
    }
    loop();

    const t1 = setTimeout(tossOne, 300);
    const t2 = setTimeout(tossOne, 700);
    const t3 = setTimeout(tossOne, 1100);

    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      cancelAnimationFrame(rafId);
      Runner.stop(runner);
      World.clear(world, false);
      Engine.clear(engine);
      stage.removeEventListener('pointermove', handlePointerMove);
      stage.removeEventListener('pointerdown', handleStagePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('resize', handleResize);
      rotateUi.removeEventListener('click', handleRotateClick);
      for (const p of plushies) p.el.remove();
      plushies = [];
    };
  }, []);

  function handleTidyToggle() {
    setTidyMode((prev) => {
      const next = !prev;
      return next;
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => tossOneRef.current()}
          disabled={tidyMode}
          className="rounded-full bg-[#E88AA0] px-6 py-3 text-[15px] font-bold text-white shadow-[0_4px_0_#C96E85] transition-transform active:translate-y-[3px] active:shadow-[0_1px_0_#C96E85] disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:shadow-[0_4px_0_#c3b8af]"
        >
          {tidyMode ? '暫停中，先關掉才能再夾' : '夾一隻進來'}
        </button>
        <button
          type="button"
          onClick={handleTidyToggle}
          className="flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-[13px] font-semibold text-[#5A4A42] shadow"
        >
          整理模式
          <span
            className={`relative h-[22px] w-10 shrink-0 rounded-full transition-colors ${tidyMode ? 'bg-[#E88AA0]' : 'bg-[#E3DAD3]'}`}
          >
            <span
              className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-[left] ${tidyMode ? 'left-5' : 'left-[2px]'}`}
            />
          </span>
        </button>
      </div>

      <div className="mb-2.5 text-center text-xs text-[#8A7A70]">
        機台裡目前有 <b className="text-sm text-[#E88AA0]">{count}</b> 隻
      </div>

      <div className="relative overflow-hidden rounded-3xl bg-[#C9A27B] shadow-[0_10px_30px_rgba(90,74,66,0.15)]">
        {/* 玻璃箱上緣：呼應「夾娃娃機」主題的視覺包裝，互動邏輯不變 */}
        <div className="flex h-9 items-end justify-center bg-gradient-to-b from-[#C9A27B] to-[#B08A63] pb-1">
          <div className="h-3.5 w-1/2 rounded-t-lg bg-white/20" />
        </div>
        <div
          ref={stageRef}
          className="relative h-[420px] w-full overflow-hidden touch-none"
          style={{
            background:
              'repeating-linear-gradient(45deg, #EFC3CE 0, #EFC3CE 1px, transparent 1px, transparent 26px), repeating-linear-gradient(-45deg, #EFC3CE 0, #EFC3CE 1px, transparent 1px, transparent 26px), #F6D9DF',
          }}
        >
          {count === 0 && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-[13px] text-[#B58A96] opacity-80">
              點「夾一隻進來」試試看 →
            </div>
          )}
          {/* 玻璃箱反光：純裝飾，不影響互動 */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-transparent" />
        </div>
        <div
          ref={rotateUiRef}
          className="absolute z-50 hidden -translate-x-1/2 -translate-y-full items-center gap-1.5 rounded-2xl bg-[#5A4A42]/90 p-1.5"
        >
          <button
            type="button"
            data-a="-30"
            title="向左轉"
            className="h-[30px] w-[30px] rounded-full bg-white text-[15px] text-[#5A4A42] shadow active:scale-95"
          >
            ⟲
          </button>
          <button
            type="button"
            data-a="reset"
            title="回到上傳照片的原始方向"
            className="h-[30px] w-[30px] rounded-full bg-white text-[15px] text-[#5A4A42] shadow active:scale-95"
          >
            正
          </button>
          <button
            type="button"
            data-a="30"
            title="向右轉"
            className="h-[30px] w-[30px] rounded-full bg-white text-[15px] text-[#5A4A42] shadow active:scale-95"
          >
            ⟳
          </button>
          <div className="mx-0.5 h-[20px] w-px bg-white/25" />
          <button
            type="button"
            data-scale="0.85"
            title="縮小"
            className="h-[30px] w-[30px] rounded-full bg-white text-[15px] text-[#5A4A42] shadow active:scale-95"
          >
            －
          </button>
          <button
            type="button"
            data-scale="1.15"
            title="放大"
            className="h-[30px] w-[30px] rounded-full bg-white text-[15px] text-[#5A4A42] shadow active:scale-95"
          >
            ＋
          </button>
        </div>
      </div>

      <p className="mt-3 text-center text-xs leading-[1.7] text-[#8A7A70]">
        隨時可以按住娃娃拖拉調整位置，放開手會保留甩動的力道，碰到框框邊界會彈回來
        <br />
        打開整理模式：娃娃暫停不動，輕點一下會跳出旋轉／縮放按鈕，大小調整會保留到亂丟模式
      </p>

      <style jsx global>{`
        .dream-room-plush {
          position: absolute;
          display: flex;
          align-items: center;
          justify-content: center;
          will-change: transform;
          cursor: grab;
          filter: drop-shadow(0 6px 6px rgba(90, 74, 66, 0.35));
        }
        .dream-room-plush img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          pointer-events: none;
          -webkit-user-drag: none;
        }
      `}</style>
    </div>
  );
}
