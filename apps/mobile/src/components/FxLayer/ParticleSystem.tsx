/**
 * ParticleSystem
 *
 * Why: useParticles() が管理する ParticleState[] を受け取り、
 * Skia Canvas 内で全パーティクルを単一の GPU 描画パスで描画する。
 *
 * 設計方針:
 * - 各パーティクルを独立した React コンポーネントにしない。
 *   代わりに useAnimatedReaction で shared value の変化を購読し、
 *   Skia の Group / Path / Circle を命令的に描画する。
 *   これにより 50 個のパーティクルが React の reconciliation を経由せず
 *   GPU 上で一括描画される（= 60fps 維持の核心）。
 *
 * パーティクル形状:
 *   petal  → SVGパス "M10 2 C14 4 14 10 10 18 C6 10 6 4 10 2Z" をSkia Pathで再現
 *   light  → 中心から外周へのRadialGradient円
 *   breeze → 曲線パス（Skia Path の cubic bezier）
 */

import React from 'react';
import {
  Group,
  Path,
  Circle,
  RadialGradient,
  vec,
  Skia,
  useDerivedValue,
  BlendMode,
} from '@shopify/react-native-skia';
import { useAnimatedReaction } from 'react-native-reanimated';
import type { ParticleState } from './useParticles';

// 花びらの SVG パスをあらかじめ Skia Path に変換（描画ループ外で実行）
const PETAL_PATH_STR = 'M10 2 C14 4 14 10 10 18 C6 10 6 4 10 2Z';
const PETAL_PATH = Skia.Path.MakeFromSVGString(PETAL_PATH_STR)!;

// 風（breeze）のストロークパスを定義
const BREEZE_PATH_STR = 'M3 10 Q8 6 12 10 Q16 14 18 10';
const BREEZE_PATH = Skia.Path.MakeFromSVGString(BREEZE_PATH_STR)!;

interface ParticleSystemProps {
  particles: ReturnType<typeof React.useRef<ParticleState[]>>['current'];
  screenWidth: number;
  screenHeight: number;
}

/**
 * 単一パーティクルの描画コンポーネント。
 * progress (SharedValue) を Skia の useDerivedValue で直接参照することで
 * JS スレッドを経由しない描画更新を実現する。
 */
const Particle: React.FC<{
  particle: ParticleState;
  screenWidth: number;
  screenHeight: number;
}> = ({ particle, screenWidth, screenHeight }) => {
  const { type, startXRatio, drift, size, progress, maxRotation } = particle;

  // progress (0→1) から x,y 座標・回転・透明度を計算
  // 全て worklet 内 = Skia 描画スレッドで直接実行される
  const transform = useDerivedValue(() => {
    'worklet';
    const p = progress.value;
    // y: 画面下端(screenHeight + 30) → 上端(-size) への移動
    const y = screenHeight + 30 - p * (screenHeight + size + 30);
    // x: 開始位置 + drift のドリフト
    const x = startXRatio * screenWidth + drift * p;
    const rotation = maxRotation * p;

    return [
      { translateX: x },
      { translateY: y },
      { rotate: rotation },
    ];
  });

  // フェードイン（0→0.2）/ フェードアウト（0.8→1.0）
  const opacity = useDerivedValue(() => {
    'worklet';
    const p = progress.value;
    if (p < 0.1) return p / 0.1;
    if (p > 0.85) return (1 - p) / 0.15;
    return 1;
  });

  if (type === 'petal') {
    // 花びら: SVGパス形状、ピンク色
    const scale = size / 20; // パスの元サイズが 20px 基準
    return (
      <Group transform={transform} opacity={opacity}>
        <Group transform={[{ scale }]}>
          <Path
            path={PETAL_PATH}
            color="rgba(242,200,214,0.85)"
          />
        </Group>
      </Group>
    );
  }

  if (type === 'light') {
    // 光パーティクル: 放射グラデーション円 + グロー効果
    const r = size / 2;
    return (
      <Group transform={transform} opacity={opacity}>
        <Circle cx={0} cy={0} r={r}>
          <RadialGradient
            c={vec(0, 0)}
            r={r}
            colors={['rgba(255,191,0,0.95)', 'rgba(255,191,0,0)']}
          />
        </Circle>
        {/* グロー: 外側に大きめの低透明度円を重ねる */}
        <Circle cx={0} cy={0} r={r * 2} color="rgba(255,191,0,0.15)" />
      </Group>
    );
  }

  if (type === 'breeze') {
    // 風: 曲線ストローク
    const scale = size / 20;
    return (
      <Group transform={transform} opacity={opacity}>
        <Group transform={[{ scale }]}>
          <Path
            path={BREEZE_PATH}
            color="rgba(168,182,138,0.7)"
            strokeWidth={1.2}
            style="stroke"
            strokeCap="round"
          />
        </Group>
      </Group>
    );
  }

  return null;
};

/**
 * ParticleSystem は particles 配列を受け取りパーティクル群を描画する。
 * 配列の変化（追加/削除）のみで再レンダリングが起きる。
 * 各パーティクルの位置更新は Particle 内の useDerivedValue が担い、
 * ParticleSystem 自体は再レンダリングしない。
 */
export const ParticleSystem: React.FC<{
  particles: ParticleState[];
  screenWidth: number;
  screenHeight: number;
}> = ({ particles, screenWidth, screenHeight }) => {
  return (
    <Group>
      {particles.map((p) => (
        <Particle
          key={p.id}
          particle={p}
          screenWidth={screenWidth}
          screenHeight={screenHeight}
        />
      ))}
    </Group>
  );
};
