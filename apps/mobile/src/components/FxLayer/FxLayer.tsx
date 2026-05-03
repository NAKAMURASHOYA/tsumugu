/**
 * FxLayer
 *
 * Why: AmbientBackground / ParticleSystem / PaperTexture の3レイヤーを
 * 単一の Skia Canvas に統合し、React Native の View ツリーの上に
 * フルスクリーンオーバーレイとして配置する統合コンポーネント。
 *
 * 積層順（下から上）:
 *   1. AmbientBackground  ← 感情色グラデーション（最底面）
 *   2. ParticleSystem     ← 花びら/光パーティクル
 *   3. PaperTexture       ← 紙質テクスチャ（最前面、BlendMode.Multiply）
 *
 * 設計方針:
 * - Canvas は StyleSheet.absoluteFill で React Native の View 階層に重ねる。
 *   pointer-events: 'none' 相当にするため、View に pointerEvents="none" を設定。
 * - useParticles() の emit 関数を ref 経由で外部に公開し、
 *   パートナー画面の「花びらを送る」ボタンから呼び出せるようにする。
 */

import React, { useImperativeHandle, forwardRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';

import { AmbientBackground, type EmotionType } from './AmbientBackground';
import { PaperTexture } from './PaperTexture';
import { ParticleSystem } from './ParticleSystem';
import { useParticles, type ParticleType } from './useParticles';

export interface FxLayerHandle {
  /** パーティクルを放出する。PartnerView の「お疲れ様」ボタンから呼び出す */
  emit: (type: ParticleType) => void;
}

interface FxLayerProps {
  /** 現在の感情状態。JournalScreen の感情選択から受け取る */
  emotion: EmotionType;
}

export const FxLayer = forwardRef<FxLayerHandle, FxLayerProps>(
  ({ emotion }, ref) => {
    const { width, height } = useWindowDimensions();
    const { particles, emit } = useParticles();

    // 外部から emit を呼び出せるよう ref に公開する
    useImperativeHandle(ref, () => ({
      emit: (type: ParticleType) => emit(type, width, height),
    }));

    // particles は SharedValue<ParticleState[]>。
    // useAnimatedReaction でローカル state に同期し Canvas を更新する。
    const [particleSnapshot, setParticleSnapshot] = React.useState(
      particles.value
    );

    React.useEffect(() => {
      // Reanimated の addListener を使い SharedValue 変化を監視する
      // （react-native-reanimated v3 の公式パターン）
      const id = particles.addListener((value) => {
        setParticleSnapshot([...value]);
      });
      return () => particles.removeListener(id);
    }, [particles]);

    return (
      // pointerEvents="none": タッチイベントを下の View に透過させる
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Canvas style={{ width, height }}>
          {/* Layer 1: 感情連動アンビエント背景 */}
          <AmbientBackground width={width} height={height} emotion={emotion} />

          {/* Layer 2: パーティクル群 */}
          <ParticleSystem
            particles={particleSnapshot}
            screenWidth={width}
            screenHeight={height}
          />

          {/* Layer 3: 紙質テクスチャ（BlendMode.Multiply、最前面） */}
          <PaperTexture width={width} height={height} />
        </Canvas>
      </View>
    );
  }
);

FxLayer.displayName = 'FxLayer';
