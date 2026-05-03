/**
 * AmbientBackground
 *
 * Why: HTMLプロトタイプの .ambient セレクタが持つ3層の放射グラデーション
 * （感情の色が画面全体に滲み出るアンビエント表現）を Skia で再現する。
 *
 * 設計方針:
 * - emotionColor は useSharedValue<string> で受け取り、Skia の描画スレッドで直接補間する。
 *   JS → UIスレッド → Skia の2段ブリッジを経由しないため、
 *   1.2s の cubic-bezier 感情遷移中にドロップフレームを発生させない。
 * - 18秒周期の ambientShift アニメーションは Skia 内の useDerivedValue で
 *   transform を計算し、再レンダリングを Canvas 内部に閉じ込める。
 */

import React from 'react';
import {
  Canvas,
  RadialGradient,
  Rect,
  Group,
  vec,
  useDerivedValue,
  interpolateColors,
} from '@shopify/react-native-skia';
import { useSharedValue, withTiming, Easing, withRepeat, withSequence } from 'react-native-reanimated';
import { useWindowDimensions } from 'react-native';

// Tsumugu の感情 → 色マッピング（PRDのアースカラー体系に準拠）
export const EMOTION_COLORS = {
  joy:     { primary: 'rgba(201,154,46,0.22)',  secondary: 'rgba(255,191,0,0.12)' },
  calm:    { primary: 'rgba(107,142,35,0.20)',  secondary: 'rgba(107,142,35,0.10)' },
  neutral: { primary: 'rgba(138,136,128,0.14)', secondary: 'rgba(138,136,128,0.08)' },
  tired:   { primary: 'rgba(70,130,180,0.22)',  secondary: 'rgba(70,130,180,0.12)' },
  rough:   { primary: 'rgba(219,112,147,0.18)', secondary: 'rgba(219,112,147,0.10)' },
} as const;

export type EmotionType = keyof typeof EMOTION_COLORS;

interface AmbientBackgroundProps {
  width: number;
  height: number;
  /** 現在の感情タイプ。変更時に 1.2s cubic-bezier で色遷移する */
  emotion: EmotionType;
}

export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({
  width,
  height,
  emotion,
}) => {
  // --- 感情連動グラデーション（シナリオ③: 1.2s cubic-bezier 遷移） ---
  // useSharedValue を Skia の useDerivedValue に直接渡すことで
  // JS スレッドを経由せず描画スレッド上でカラー補間を行う
  const progress = useSharedValue(0);

  // emotion prop の変化を検知してアニメーション起動
  const prevEmotion = useSharedValue<EmotionType>(emotion);

  const animProgress = useDerivedValue(() => {
    // Skia の useDerivedValue 内で Reanimated 値を参照することで
    // UIスレッド直結の補間が実現される
    'worklet';
    return progress.value;
  });

  React.useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 1200,
      easing: Easing.bezier(0.4, 0, 0.2, 1), // CSS cubic-bezier(0.4, 0, 0.2, 1) と同値
    });
    prevEmotion.value = emotion;
  }, [emotion]);

  // 現在の感情色を useDerivedValue で Skia レイヤーに渡す
  const primaryColor = useDerivedValue(() => {
    'worklet';
    return interpolateColors(
      animProgress.value,
      [0, 1],
      [
        EMOTION_COLORS[prevEmotion.value].primary,
        EMOTION_COLORS[emotion].primary,
      ]
    );
  });

  const secondaryColor = useDerivedValue(() => {
    'worklet';
    return interpolateColors(
      animProgress.value,
      [0, 1],
      [
        EMOTION_COLORS[prevEmotion.value].secondary,
        EMOTION_COLORS[emotion].secondary,
      ]
    );
  });

  // --- 18秒周期の ambientShift (HTMLプロトタイプの ambientShift keyframe 再現) ---
  const shiftPhase = useSharedValue(0);

  React.useEffect(() => {
    shiftPhase.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 9000, easing: Easing.inOut(Easing.ease) })
      ),
      -1, // 無限ループ
      false
    );
  }, []);

  // shift に応じてグラデーション中心を微小移動させる（スケール 1.08 相当を座標で表現）
  const gradient1Center = useDerivedValue(() => {
    'worklet';
    const offsetX = shiftPhase.value * width * 0.04;
    const offsetY = shiftPhase.value * height * 0.04;
    return vec(width * 0.5 + offsetX, height * 0.3 - offsetY);
  });

  const gradient2Center = useDerivedValue(() => {
    'worklet';
    const offsetX = shiftPhase.value * width * 0.05;
    const offsetY = shiftPhase.value * height * 0.03;
    return vec(width * 0.7 + offsetX, height * 0.8 + offsetY);
  });

  const gradient3Center = useDerivedValue(() => {
    'worklet';
    const offsetX = shiftPhase.value * width * -0.03;
    const offsetY = shiftPhase.value * height * 0.02;
    return vec(width * 0.2 + offsetX, height * 0.7 + offsetY);
  });

  return (
    <Group>
      {/* Layer 1: 感情メイングラデーション（画面上部中央） */}
      <Rect x={0} y={0} width={width} height={height}>
        <RadialGradient
          c={gradient1Center}
          r={width * 0.7}
          colors={[primaryColor, 'transparent']}
        />
      </Rect>

      {/* Layer 2: 感情サブグラデーション（右下）*/}
      <Rect x={0} y={0} width={width} height={height}>
        <RadialGradient
          c={gradient2Center}
          r={width * 0.8}
          colors={[secondaryColor, 'transparent']}
        />
      </Rect>

      {/* Layer 3: アクセントグラデーション（左下・固定色）*/}
      <Rect x={0} y={0} width={width} height={height}>
        <RadialGradient
          c={gradient3Center}
          r={width * 0.5}
          colors={['rgba(255,191,0,0.06)', 'transparent']}
        />
      </Rect>
    </Group>
  );
};
