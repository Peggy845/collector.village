import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { raycastFurnitureHit, computeBinLayout, type ViewportRect } from './scene3d';
import type { BinDef } from './furniture';

// 正交相機從+Z看向原點，世界座標跟NDC是簡單的線性關係（world/50 = ndc），方便手算期望值，
// 不用處理透視相機的深度變形。跟raycastFurnitureHit實際在RoomScene3D.tsx用的透視相機
// 不同型別沒關係——Raycaster.setFromCamera對任何THREE.Camera子類別都適用同一套介面，
// 這裡只是為了讓測試案例的世界座標跟畫面座標的對應關係好手算、好驗證。
function makeCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 1000);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

const RECT: ViewportRect = { left: 0, right: 1000, top: 0, bottom: 1000, width: 1000, height: 1000 };

// 世界座標(worldX,worldY)換算成對應的螢幕座標(clientX,clientY)，是raycastFurnitureHit內部
// NDC換算的反函式，只在測試裡用來準備case，不是被測程式碼的一部分。
function screenPointFor(worldX: number, worldY: number): { clientX: number; clientY: number } {
  const ndcX = worldX / 50;
  const ndcY = worldY / 50;
  return {
    clientX: RECT.left + (RECT.width * (ndcX + 1)) / 2,
    clientY: RECT.top + (RECT.height * (1 - ndcY)) / 2,
  };
}

function makePlane(x: number, y: number, z: number, width: number, height: number, userData: object): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial());
  mesh.position.set(x, y, z);
  mesh.userData = userData;
  mesh.updateMatrixWorld(true);
  return mesh;
}

const BIN: BinDef = { cols: 4, rows: 3, cellWidthCm: 5, cellHeightCm: 5, depthCm: 10 };
const BIN_LAYOUT = computeBinLayout(0, BIN, 0); // left=0, width=20, height=15

describe('raycastFurnitureHit', () => {
  it('畫面座標超出rect範圍 -> null，不用建相機/mesh也能判斷', () => {
    const camera = makeCamera();
    const result = raycastFurnitureHit(-10, 500, camera, RECT, {}, null, BIN_LAYOUT);
    expect(result).toBeNull();
  });

  it('射線沒打中任何mesh（瞄準空白處）-> null', () => {
    const camera = makeCamera();
    const tierPlane = makePlane(0, 0, 0, 40, 40, { kind: 'tier', tierIndex: 1 });
    const { clientX, clientY } = screenPointFor(45, 45); // 遠離那片40x40的平面
    const result = raycastFurnitureHit(clientX, clientY, camera, RECT, { 1: tierPlane }, null, BIN_LAYOUT);
    expect(result).toBeNull();
  });

  it('打中層架的落點判定面 -> 回傳對應的tierIndex跟世界座標落點', () => {
    const camera = makeCamera();
    const tierPlane = makePlane(0, 0, 0, 40, 40, { kind: 'tier', tierIndex: 2 });
    const { clientX, clientY } = screenPointFor(5, 5); // 平面範圍內、不是正中心
    const result = raycastFurnitureHit(clientX, clientY, camera, RECT, { 2: tierPlane }, null, BIN_LAYOUT);
    expect(result?.kind).toBe('tier');
    if (result?.kind === 'tier') {
      expect(result.tierIndex).toBe(2);
      expect(result.point.x).toBeCloseTo(5, 1);
      expect(result.point.y).toBeCloseTo(5, 1);
    }
  });

  it('打中堆疊箱的落點判定面 -> 用binCellFromPoint換算出正確的col/row', () => {
    const camera = makeCamera();
    // BIN_LAYOUT: left=0, height=15, cellWidthCm=5, cellHeightCm=5，中心點在(10, 7.5)
    const binPlane = makePlane(BIN_LAYOUT.centerX, BIN_LAYOUT.height / 2, 0, BIN_LAYOUT.width, BIN_LAYOUT.height, {
      kind: 'bin',
    });
    // 世界座標(7,12)：col = floor((7-0)/5) = 1；row = floor((15-12)/5) = 0
    const { clientX, clientY } = screenPointFor(7, 12);
    const result = raycastFurnitureHit(clientX, clientY, camera, RECT, {}, binPlane, BIN_LAYOUT);
    expect(result).toEqual({ kind: 'bin', col: 1, row: 0, point: expect.anything() });
  });

  it('tierPlanes裡有null值（尚未註冊好的家具）不會被當成raycast目標、不會噴錯', () => {
    const camera = makeCamera();
    const tierPlane = makePlane(0, 0, 0, 40, 40, { kind: 'tier', tierIndex: 1 });
    const { clientX, clientY } = screenPointFor(0, 0);
    const result = raycastFurnitureHit(clientX, clientY, camera, RECT, { 0: null, 1: tierPlane }, null, BIN_LAYOUT);
    expect(result?.kind).toBe('tier');
  });
});
