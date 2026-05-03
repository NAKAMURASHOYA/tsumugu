/**
 * _BenchmarkScreen (開発専用 — 本番ビルドには含めない)
 *
 * Why: PMとの合意「Tier B（iPhone 13 / Pixel 6a）において平均55fps以上」の
 * 合否判定を実機で実施するためのベンチマーク専用画面。
 *
 * 3つの計測シナリオを順次実行し、結果をスクロール可能なログとして表示する。
 * 結果は console.log にも出力されるため、EAS Dev Client の Logs タブでも確認できる。
 *
 * ⚠️  このファイルは __DEV__ ガードで保護されている。
 *     本番の App.tsx からは絶対にインポートしないこと。
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import {
  performanceMonitor,
  formatBenchmarkResult,
  type BenchmarkResult,
} from '../utils/performanceMonitor';
import { FxLayer, type FxLayerHandle, type EmotionType } from '../components/FxLayer';

// 感情遷移シナリオ③で使うシーケンス
const EMOTION_SEQUENCE: EmotionType[] = ['calm', 'joy', 'tired', 'rough', 'neutral'];

export const _BenchmarkScreen: React.FC = () => {
  if (!__DEV__) return null;

  const fxRef = useRef<FxLayerHandle>(null);
  const [currentEmotion, setCurrentEmotion] = useState<EmotionType>('calm');
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<BenchmarkResult[]>([]);

  const appendLog = (line: string) => {
    setLogs((prev) => [...prev, line]);
    console.log(`[Benchmark] ${line}`);
  };

  /** シナリオ①: パーティクルバースト（ワーストケース） */
  const runScenario1 = useCallback(async () => {
    appendLog('▶ Scenario 1: パーティクルバースト開始');
    performanceMonitor.start();

    // petal (18個) + light (30個) を同時放出
    fxRef.current?.emit('petal');
    fxRef.current?.emit('light');

    // 最長パーティクルの duration (5000ms) + バッファ (1000ms) 待機
    await sleep(6000);

    const result = performanceMonitor.stop('Scenario 1: パーティクルバースト');
    setResults((prev) => [...prev, result]);
    appendLog(formatBenchmarkResult(result));
    return result;
  }, []);

  /** シナリオ②: 持続アニメーション（60秒） */
  const runScenario2 = useCallback(async () => {
    appendLog('▶ Scenario 2: 持続アニメーション 60秒計測開始');
    performanceMonitor.start();

    // アンビエント + アバター float/pulse はFxLayerが常時稼働しているため
    // 60秒間そのまま計測する
    await sleep(60000);

    const result = performanceMonitor.stop('Scenario 2: 持続アニメーション');
    setResults((prev) => [...prev, result]);
    appendLog(formatBenchmarkResult(result));
    return result;
  }, []);

  /** シナリオ③: 感情遷移（ドロップフレーム 0 が合格） */
  const runScenario3 = useCallback(async () => {
    appendLog('▶ Scenario 3: 感情遷移 1.2s × 5回 計測開始');
    performanceMonitor.start();

    // 5種の感情を 2秒間隔で切り替え（1.2s 遷移 + 0.8s インターバル）
    for (const emotion of EMOTION_SEQUENCE) {
      setCurrentEmotion(emotion);
      await sleep(2000);
    }

    const result = performanceMonitor.stop('Scenario 3: 感情遷移');
    setResults((prev) => [...prev, result]);
    appendLog(formatBenchmarkResult(result));
    return result;
  }, []);

  /** 全シナリオを順次実行 */
  const runAll = async () => {
    setIsRunning(true);
    setLogs([]);
    setResults([]);
    appendLog('=== Tsumugu FX Layer ベンチマーク開始 ===');
    appendLog(`合格基準: 平均 ≥55fps / Critical drop = 0 / 感情遷移ドロップなし`);

    try {
      const r1 = await runScenario1();
      await sleep(2000); // シナリオ間インターバル

      const r2 = await runScenario2();
      await sleep(2000);

      const r3 = await runScenario3();

      // サマリー
      const allPassed = [r1, r2, r3].every((r) => r.passed);
      const summary = allPassed
        ? '✅ 全シナリオ合格 — Skia 採用を確定します'
        : '❌ 不合格シナリオあり — 最適化が必要です';
      appendLog('');
      appendLog(`=== 総合判定: ${summary} ===`);

      Alert.alert('計測完了', summary);
    } finally {
      setIsRunning(false);
    }
  };

  const passCount = results.filter((r) => r.passed).length;

  return (
    <View style={styles.container}>
      {/* FxLayer を背景に配置（実際のエフェクトを描画） */}
      <FxLayer ref={fxRef} emotion={currentEmotion} />

      <View style={styles.overlay}>
        <Text style={styles.title}>🔬 FX Layer Benchmark</Text>
        <Text style={styles.subtitle}>
          Tier B 合格基準: 平均 ≥55fps / Critical drop = 0
        </Text>

        {/* 現在の感情表示 */}
        <Text style={styles.emotionBadge}>
          現在の感情: {currentEmotion}
        </Text>

        {/* 結果サマリーバッジ */}
        {results.length > 0 && (
          <Text style={styles.scoreBadge}>
            {passCount}/{results.length} シナリオ合格
          </Text>
        )}

        {/* 実行ボタン */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnAll, isRunning && styles.btnDisabled]}
            onPress={runAll}
            disabled={isRunning}
          >
            <Text style={styles.btnText}>
              {isRunning ? '計測中...' : '▶ 全シナリオ実行'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, isRunning && styles.btnDisabled]}
            onPress={runScenario1}
            disabled={isRunning}
          >
            <Text style={styles.btnTextSmall}>① バースト</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, isRunning && styles.btnDisabled]}
            onPress={runScenario3}
            disabled={isRunning}
          >
            <Text style={styles.btnTextSmall}>③ 遷移</Text>
          </TouchableOpacity>
        </View>

        {/* ログ表示 */}
        <ScrollView style={styles.logContainer} contentContainerStyle={styles.logContent}>
          {logs.map((line, i) => (
            <Text
              key={i}
              style={[
                styles.logLine,
                line.includes('PASS') && styles.logPass,
                line.includes('FAIL') && styles.logFail,
                line.includes('===') && styles.logHeader,
              ]}
            >
              {line}
            </Text>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

// --- ユーティリティ ---
function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// --- スタイル ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F8F4',
  },
  overlay: {
    flex: 1,
    padding: 16,
    paddingTop: 60,
  },
  title: {
    fontFamily: 'System',
    fontSize: 18,
    fontWeight: '600',
    color: '#3a3a35',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: '#6f6e68',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  emotionBadge: {
    fontSize: 12,
    color: '#6B8E23',
    marginBottom: 4,
    fontWeight: '500',
  },
  scoreBadge: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4682B4',
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  btn: {
    backgroundColor: '#3a3a35',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 100,
  },
  btnAll: {
    backgroundColor: '#6B8E23',
    flex: 1,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    color: '#F9F8F4',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  btnTextSmall: {
    color: '#F9F8F4',
    fontSize: 11,
    fontWeight: '500',
  },
  logContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 12,
    padding: 12,
  },
  logContent: {
    paddingBottom: 20,
  },
  logLine: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: '#d0d0c8',
    lineHeight: 16,
  },
  logPass: {
    color: '#7EC8A4',
    fontWeight: '700',
  },
  logFail: {
    color: '#F08080',
    fontWeight: '700',
  },
  logHeader: {
    color: '#FFBF00',
    fontWeight: '700',
    marginTop: 4,
  },
});
