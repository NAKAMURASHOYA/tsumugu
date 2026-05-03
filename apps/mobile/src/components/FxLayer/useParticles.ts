/**
 * useParticles
 *
 * Why: HTMLプロトタイプの spawnParticle() / emitFx() の物理ロジックを
 * Reanimated Worklet に移植する。
 *
 * 設計方針:
 * - 全パーティクル状態を useSharedValue<ParticleState[]> の単一配列で管理する。
 *   個別コンポーネントにすると50個 × Reactコンポーネント = 再レンダリング爆発になるため、
 *   Skia Canvas の useAnimatedReaction で配列を直接 Skia に流し込む。
 * - パーティクルの物理計算（座標、回転、透明度）は全て worklet 関数で実行し
 *   JS スレッドをブロックしない。
 * - Easing.bezier(0.2, 0.6, 0.4, 1) はプロトタイプの cubic-bezier(0.2, 0.6, 0.4, 1) を再現。
 */

import { useSharedValue, withTiming, Easing, runOnJS } from 'react-native-reanimated';

export type ParticleType = 'petal' | 'light' | 'breeze';

export interface ParticleState {
  id: number;
  type: ParticleType;
  // 初期座標（画面幅に対する 0〜1 の比率）
  startXRatio: number;
  // 水平ドリフト量（px）
  drift: number;
  // パーティクルサイズ（px）
  size: number;
  // アニメーション進行値（0=下端, 1=上端到達）
  progress: ReturnType<typeof useSharedValue<number>>;
  // 総アニメーション時間（ms）
  duration: number;
  // Z軸回転の最大角度（ラジアン）: 花びら用
  maxRotation: number;
}

let _nextId = 0;

/**
 * 指定タイプのパーティクルを count 個生成し、staggered（60ms ずつ遅延）で放出する。
 * 戻り値の particles を ParticleSystem に渡すことで Skia Canvas が描画する。
 */
export function useParticles() {
  const particles = useSharedValue<ParticleState[]>([]);

  const emit = (type: ParticleType, screenWidth: number, screenHeight: number) => {
    // プロトタイプの count 定義を踏襲
    const count = type === 'petal' ? 18 : type === 'light' ? 30 : 14;

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const id = _nextId++;
        const duration = 3000 + Math.random() * 2000;
        const size =
          type === 'light'
            ? 4 + Math.random() * 8
            : 14 + Math.random() * 14;

        const progress = useSharedValue(0);

        const particle: ParticleState = {
          id,
          type,
          startXRatio: Math.random(),
          drift: (Math.random() - 0.5) * 80,
          size,
          progress,
          duration,
          // 花びら: 最大 ±2π回転（プロトタイプの ±360deg × 2 = 720deg を再現）
          maxRotation: type === 'petal' ? (Math.random() - 0.5) * Math.PI * 4 : 0,
        };

        // パーティクルを配列に追加
        particles.value = [...particles.value, particle];

        // アニメーション開始: 0 → 1 で「下端から上端への移動」を表現
        progress.value = withTiming(
          1,
          {
            duration,
            easing: Easing.bezier(0.2, 0.6, 0.4, 1),
          },
          (finished) => {
            // アニメーション完了後にパーティクルを配列から除去（メモリ解放）
            'worklet';
            if (finished) {
              particles.value = particles.value.filter((p) => p.id !== id);
            }
          }
        );
      }, i * 60); // stagger: 60ms ずつ遅延放出（プロトタイプと同値）
    }
  };

  return { particles, emit };
}
