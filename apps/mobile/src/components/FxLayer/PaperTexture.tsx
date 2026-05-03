/**
 * PaperTexture
 *
 * Why: HTMLプロトタイプの .screen::after が持つ
 *   `repeating-linear-gradient(0deg, ...) + mix-blend-mode: multiply`
 * による紙の繊維感をネイティブで再現する。
 *
 * Android での mix-blend-mode 未実装問題（react-native-svg の既知バグ）を
 * Skia の BlendMode.Multiply で解決することが、このコンポーネントの
 * Skia 採用の核心的理由である。
 *
 * 設計方針:
 * - アニメーションなし（静的テクスチャ）のため useSharedValue 不要
 * - Skia Group の blendMode prop に BlendMode.Multiply を指定することで
 *   下層レイヤーとのピクセル乗算合成を GPU 上で実行する
 * - ストライプ間隔 3px はプロトタイプの CSS を忠実に再現
 */

import React from 'react';
import { Group, Line, vec, BlendMode, Paint } from '@shopify/react-native-skia';

interface PaperTextureProps {
  width: number;
  height: number;
}

// ストライプ1本あたりの高さ（プロトタイプの repeating-linear-gradient 3px サイクルに対応）
const STRIPE_PERIOD = 3;
// 繊維の濃度（プロトタイプの rgba(0,0,0,0.008) に対応）
const FIBER_OPACITY = 0.008;

export const PaperTexture: React.FC<PaperTextureProps> = ({ width, height }) => {
  // 描画するストライプの y 座標リストを事前計算（レンダリング時の計算を排除）
  const stripeYCoords = React.useMemo(() => {
    const coords: number[] = [];
    // 3px ごとに不透明ライン（2px 透明 + 1px 濃色）を配置
    for (let y = 2; y < height; y += STRIPE_PERIOD) {
      coords.push(y);
    }
    return coords;
  }, [height]);

  return (
    // BlendMode.Multiply: 下のピクセルと乗算合成。
    // 白(#FFF)ベースの背景では繊維の暗線だけが浮き出る = 紙の風合い
    <Group blendMode={BlendMode.Multiply}>
      {stripeYCoords.map((y) => (
        <Line
          key={y}
          p1={vec(0, y)}
          p2={vec(width, y)}
          color={`rgba(0,0,0,${FIBER_OPACITY})`}
          strokeWidth={1}
        />
      ))}
    </Group>
  );
};
