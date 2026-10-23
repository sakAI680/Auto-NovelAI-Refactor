import test from "node:test";
import assert from "node:assert/strict";
import { t, m, getLanguage, setLanguage, setText, setAttribute } from "../i18n.js";
import ja from "../locales/ja.js";
import plugins from "../locales/plugins-ja.js";

// Sequential: these tests deliberately exercise the shared browser language state.
test("Japanese is the default, Chinese uses the original source, unknown text is preserved", () => {
  assert.equal(getLanguage(), "ja");
  assert.equal(t("图片生成"), "画像生成");
  assert.equal(t("unknown plugin label"), "unknown plugin label");
  assert.equal(t("toString"), "toString");
  assert.equal(t("__proto__"), "__proto__");
  assert.equal(t("保存, 中文 prompt, teXt: hello"), "保存, 中文 prompt, teXt: hello");
  setLanguage("zh-CN");
  assert.equal(t("图片生成"), "图片生成");
  setLanguage("ja");
  assert.throws(() => setLanguage("unsupported"), RangeError);
});

test("all catalog entries retain numbered interpolation parameters", () => {
  const slots = (s) => [...s.matchAll(/\{(\d+)\}/g)].map((v) => v[1]).sort();
  for (const [source, target] of Object.entries({ ...ja, ...plugins })) {
    assert.deepEqual(slots(target), slots(source), source);
  }
});

test("interpolation never translates prompts, paths, field values or markup", () => {
  const input = "图片生成, 配置设置, teXt: 中文, <b>保存</b>";
  assert.equal(t("已保存 <{0}:{1}>!", "分类", input), `<分类:${input}> を保存しました!`);
  assert.equal(t("找不到插件: {0}", "配置设置"), "プラグインが見つかりません: 配置设置");
  assert.equal(String(m("{0}", input)), input);
  setLanguage("zh-CN");
  assert.equal(String(m("{0}", input)), input);
  setLanguage("ja");
});

test("complete backend messages and error prefixes translate without changing diagnostics", () => {
  assert.equal(t("目录不存在: /tmp/图片生成.png"), "ディレクトリが存在しません: /tmp/图片生成.png");
  assert.equal(t("上传失败: 请先上传图片"), "アップロードに失敗しました: 先に画像をアップロードしてください");
  assert.equal(t("❌ 请先上传图片"), "❌ 先に画像をアップロードしてください");
  assert.equal(t("NovelAI 请求失败 (HTTP 402): quota"), "NovelAI リクエストに失敗しました (HTTP 402): quota");
});

test("live bindings switch labels and placeholders without touching input values", () => {
  const attrs = new Map();
  const node = { nodeType: 3, textContent: "", value: "保存, 中文 prompt", setAttribute: (k, v) => attrs.set(k, v), getAttribute: (k) => attrs.get(k) };
  setText(node, m("配置设置"));
  setAttribute(node, "placeholder", m("在此输入提示词..."));
  assert.equal(node.textContent, "設定");
  assert.equal(attrs.get("placeholder"), "プロンプトを入力...");
  setLanguage("zh-CN");
  assert.equal(node.textContent, "配置设置");
  assert.equal(attrs.get("placeholder"), "在此输入提示词...");
  setLanguage("ja");
  assert.equal(node.textContent, "設定");
  assert.equal(node.value, "保存, 中文 prompt");
  node.textContent = "图片生成.png"; // A filename replaced the previous placeholder.
  setLanguage("zh-CN");
  assert.equal(node.textContent, "图片生成.png");
  setLanguage("ja");
});

test("lazy nested UI labels switch, preserving dynamic data", () => {
  const message = m("{0}: {1}", m("图片工具"), "配置设置.png");
  assert.equal(String(message), "画像ツール: 配置设置.png");
  setLanguage("zh-CN");
  assert.equal(String(message), "图片工具: 配置设置.png");
  setLanguage("ja");
});
