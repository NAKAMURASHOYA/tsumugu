/**
 * react-native-quick-crypto のテスト用モック
 *
 * なぜ必要か:
 * react-native-quick-crypto はネイティブモジュール（C++/OpenSSL バインディング）であり、
 * Jest（Node.js環境）では動作しない。
 * テスト環境では Node.js 標準の "crypto" モジュールを使用して同等の処理を再現する。
 * 本番環境（Expo/RN）では実際のネイティブモジュールが使われるため、挙動の差異はない。
 */
const nodeCrypto = require("crypto");

// Node.js の crypto モジュールを react-native-quick-crypto と同じ API で公開する
module.exports = nodeCrypto;
module.exports.default = nodeCrypto;
