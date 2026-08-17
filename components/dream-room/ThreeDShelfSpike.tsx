'use client';

// 技術驗證用的小型spike，不是正式功能：測試「真3D、鏡頭自由旋轉、娃娃用真實寬高深貼照片box、
// 摸娃娃拖曳擺放/摸空白轉鏡頭」這整套手感值不值得往下做。
import { useCallback, useRef, useState } from 'react';
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';

const COMPARTMENT_WIDTH = 32;
const COMPARTMENT_HEIGHT = 20;
const COMPARTMENT_DEPTH = 8; // 刻意比plush-3的深度(10cm)淺，測試頂出效果

const SIDE_COLOR = '#c9a27b'; // 跟現有超市家具配色(#C9A27B)一致

interface DollSpec {
  id: string;
  width: number;
  height: number;
  depth: number;
  textureUrl: string;
  z: number; // 深度固定不給拖，貼齊背板放置（會不會頂出開口由depth決定，不用玩家操心）
  initialX: number;
}

const DOLLS: DollSpec[] = [
  { id: 'plush-1', width: 14, height: 18, depth: 5, textureUrl: '/dream-room/plush-1.png', z: 2.5, initialX: -6 },
  { id: 'plush-3', width: 10, height: 16.5, depth: 10, textureUrl: '/dream-room/plush-3.png', z: 5, initialX: 8 },
];

function DraggableDollBox({
  spec,
  x,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  spec: DollSpec;
  x: number;
  onDragStart: () => void;
  onDragMove: (id: string, newX: number) => void;
  onDragEnd: () => void;
}) {
  const texture = useTexture(spec.textureUrl);
  const { camera, gl, raycaster } = useThree();
  const draggingRef = useRef(false);
  const y = spec.height / 2;

  // 摸到娃娃本體 → 進入拖曳模式（同時通知外層暫時關閉鏡頭旋轉），
  // 摸空白處完全不會走到這個handler，鏡頭旋轉照常運作，靠「摸到什麼」自然分流，不用額外的模式切換按鈕。
  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      draggingRef.current = true;
      onDragStart();

      // 建立一片面向鏡頭、通過娃娃目前位置的隱形平面，之後拖曳靠滑鼠射線跟這片面的交點算新位置，
      // 只取交點的x（左右），y、z（高度、深度）維持不變——娃娃只能貼著層架表面左右滑動，跟現有2D版邏輯一致。
      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        normal,
        new THREE.Vector3(x, y, spec.z)
      );

      const handleMove = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        const rect = gl.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(ndc, camera);
        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, hit)) {
          const half = spec.width / 2;
          const clampedX = Math.min(
            COMPARTMENT_WIDTH / 2 - half,
            Math.max(-COMPARTMENT_WIDTH / 2 + half, hit.x)
          );
          onDragMove(spec.id, clampedX);
        }
      };
      const handleUp = () => {
        draggingRef.current = false;
        onDragEnd();
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [camera, gl, raycaster, onDragStart, onDragMove, onDragEnd, spec, x, y]
  );

  return (
    <mesh position={[x, y, spec.z]} castShadow receiveShadow onPointerDown={handlePointerDown}>
      <boxGeometry args={[spec.width, spec.height, spec.depth]} />
      <meshStandardMaterial attach="material-0" color="#ddc9b4" />
      <meshStandardMaterial attach="material-1" color="#ddc9b4" />
      <meshStandardMaterial attach="material-2" color="#ddc9b4" />
      <meshStandardMaterial attach="material-3" color="#ddc9b4" />
      <meshStandardMaterial attach="material-4" map={texture} transparent alphaTest={0.3} />
      <meshStandardMaterial attach="material-5" color="#ddc9b4" />
    </mesh>
  );
}

function Compartment() {
  const w = COMPARTMENT_WIDTH;
  const h = COMPARTMENT_HEIGHT;
  const d = COMPARTMENT_DEPTH;
  return (
    <group>
      {/* 背板 */}
      <mesh position={[0, h / 2, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={SIDE_COLOR} side={2} />
      </mesh>
      {/* 左板 */}
      <mesh position={[-w / 2, h / 2, d / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={SIDE_COLOR} side={2} />
      </mesh>
      {/* 右板 */}
      <mesh position={[w / 2, h / 2, d / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={SIDE_COLOR} side={2} />
      </mesh>
      {/* 頂板 */}
      <mesh position={[0, h, d / 2]} rotation={[Math.PI / 2, 0, 0]} receiveShadow castShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={SIDE_COLOR} side={2} />
      </mesh>
      {/* 底板 */}
      <mesh position={[0, 0, d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={SIDE_COLOR} side={2} />
      </mesh>
    </group>
  );
}

export default function ThreeDShelfSpike() {
  const [positions, setPositions] = useState<Record<string, number>>(() =>
    Object.fromEntries(DOLLS.map((d) => [d.id, d.initialX]))
  );
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  const handleDragMove = useCallback((id: string, newX: number) => {
    setPositions((prev) => ({ ...prev, [id]: newX }));
  }, []);

  return (
    <div className="h-[70vh] w-full overflow-hidden rounded-3xl bg-[#2b2420]">
      <Canvas shadows camera={{ position: [34, 26, 44], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[20, 30, 20]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <Compartment />
        {DOLLS.map((spec) => (
          <DraggableDollBox
            key={spec.id}
            spec={spec}
            x={positions[spec.id]}
            onDragStart={() => setOrbitEnabled(false)}
            onDragMove={handleDragMove}
            onDragEnd={() => setOrbitEnabled(true)}
          />
        ))}
        {/* 地面 */}
        <mesh position={[0, -0.5, 20]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#3a322c" />
        </mesh>
        <OrbitControls
          enabled={orbitEnabled}
          target={[0, COMPARTMENT_HEIGHT / 2, COMPARTMENT_DEPTH / 2]}
          minDistance={20}
          maxDistance={120}
        />
      </Canvas>
    </div>
  );
}
