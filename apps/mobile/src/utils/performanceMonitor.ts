/**
 * performanceMonitor
 *
 * Why: スパイント合格基準（Tier B端末で平均55fps以上）の実証データを
 * 取得するためのFPS/メモリ計測ユーティリティ。
 *
 * 計測シナリオ（PMとの合意）:
 *   Scenario 1: パーティクルバースト（petal 18個 + light 30個 同時）
 *   Scenario 2: 持続アニメーション（アンビエント + float/pulse 60秒）
 *   Scenario 3: 感情遷移（1.2s cubic-bezier 遷移中のフレームドロップ検知）
 *
 * 使用技術:
 *   - requestAnimationFrame ループで毎フレームの経過時間を記録
 *   - performance.now() でサブミリ秒精度のタイムスタンプを取得
 *   - React Native の NativeModules.PlatformConstants でデバイス情報を取得
 */

import { NativeModules, Platform } from 'react-native';

export interface FrameSample {
  timestamp: number;
  fps: number;
}

export interface BenchmarkResult {
  scenarioName: string;
  deviceModel: string;
  platform: 'ios' | 'android';
  durationMs: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  /** 45fps を下回ったフレーム数（Warning ライン） */
  droppedFrameCount: number;
  /** 30fps を下回ったフレーム数（Fail ライン） */
  criticalDropCount: number;
  /** シナリオ③用: 遷移中にドロップが1フレームでもあれば true */
  hasTransitionDrop: boolean;
  samples: FrameSample[];
  /** 合否判定（合格ライン: 平均 ≥55fps かつ critical drop = 0） */
  passed: boolean;
}

class PerformanceMonitor {
  private rafId: number | null = null;
  private samples: FrameSample[] = [];
  private lastTimestamp: number | null = null;
  private isRecording = false;

  /** 計測開始 */
  start() {
    if (this.isRecording) return;
    this.isRecording = true;
    this.samples = [];
    this.lastTimestamp = null;
    this.loop();
  }

  private loop() {
    this.rafId = requestAnimationFrame((now) => {
      if (!this.isRecording) return;

      if (this.lastTimestamp !== null) {
        const delta = now - this.lastTimestamp;
        // delta が 0 の場合は除外（初回フレーム等）
        if (delta > 0) {
          const fps = Math.min(1000 / delta, 120); // 120fps キャップ
          this.samples.push({ timestamp: now, fps });
        }
      }
      this.lastTimestamp = now;
      this.loop();
    });
  }

  /** 計測停止し、集計結果を返す */
  stop(scenarioName: string): BenchmarkResult {
    this.isRecording = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    return this.aggregate(scenarioName);
  }

  private aggregate(scenarioName: string): BenchmarkResult {
    const samples = this.samples;

    if (samples.length === 0) {
      return this.emptyResult(scenarioName);
    }

    const fpsList = samples.map((s) => s.fps);
    const avgFps = fpsList.reduce((a, b) => a + b, 0) / fpsList.length;
    const minFps = Math.min(...fpsList);
    const maxFps = Math.max(...fpsList);
    const droppedFrameCount = fpsList.filter((f) => f < 45).length;
    const criticalDropCount = fpsList.filter((f) => f < 30).length;

    // シナリオ③: 遷移期間（最初の 1.2秒 = 1200ms）内のドロップを検知
    const transitionEnd = samples[0]?.timestamp + 1200;
    const hasTransitionDrop = samples
      .filter((s) => s.timestamp <= transitionEnd)
      .some((s) => s.fps < 58);

    const durationMs =
      samples[samples.length - 1].timestamp - samples[0].timestamp;

    // 合格基準: 平均 ≥55fps かつ critical drop (30fps未満) = 0
    const passed = avgFps >= 55 && criticalDropCount === 0;

    const deviceModel = this.getDeviceModel();

    return {
      scenarioName,
      deviceModel,
      platform: Platform.OS as 'ios' | 'android',
      durationMs,
      avgFps: Math.round(avgFps * 10) / 10,
      minFps: Math.round(minFps * 10) / 10,
      maxFps: Math.round(maxFps * 10) / 10,
      droppedFrameCount,
      criticalDropCount,
      hasTransitionDrop,
      samples,
      passed,
    };
  }

  private getDeviceModel(): string {
    try {
      if (Platform.OS === 'ios') {
        return NativeModules.PlatformConstants?.Model ?? 'Unknown iOS';
      }
      return `${NativeModules.PlatformConstants?.Brand ?? ''} ${NativeModules.PlatformConstants?.Model ?? ''}`.trim() || 'Unknown Android';
    } catch {
      return 'Unknown';
    }
  }

  private emptyResult(scenarioName: string): BenchmarkResult {
    return {
      scenarioName,
      deviceModel: this.getDeviceModel(),
      platform: Platform.OS as 'ios' | 'android',
      durationMs: 0,
      avgFps: 0,
      minFps: 0,
      maxFps: 0,
      droppedFrameCount: 0,
      criticalDropCount: 0,
      hasTransitionDrop: false,
      samples: [],
      passed: false,
    };
  }
}

/** シングルトンインスタンス */
export const performanceMonitor = new PerformanceMonitor();

/** BenchmarkResult を人間が読みやすいテキストに変換する */
export function formatBenchmarkResult(result: BenchmarkResult): string {
  const verdict = result.passed ? '✅ PASS' : '❌ FAIL';
  const lines = [
    `=== ${result.scenarioName} ===`,
    `${verdict}`,
    `デバイス: ${result.deviceModel} (${result.platform})`,
    `計測時間: ${(result.durationMs / 1000).toFixed(1)}s`,
    `平均FPS: ${result.avgFps} fps  (合格ライン: ≥55)`,
    `最低FPS: ${result.minFps} fps`,
    `最高FPS: ${result.maxFps} fps`,
    `Warning ドロップ (<45fps): ${result.droppedFrameCount} フレーム`,
    `Critical ドロップ (<30fps): ${result.criticalDropCount} フレーム`,
  ];

  if (result.hasTransitionDrop) {
    lines.push(`⚠️  感情遷移中 (0〜1.2s) にフレームドロップを検知`);
  } else {
    lines.push(`感情遷移中フレームドロップ: なし ✓`);
  }

  return lines.join('\n');
}
