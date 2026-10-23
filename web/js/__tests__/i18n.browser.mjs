// Integration tests only; Playwright is a test tool, never a frontend dependency.
// ANR_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node --test this-file
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.ANR_PLAYWRIGHT_MODULE || "playwright");
const base = process.env.ANR_TEST_URL || "http://127.0.0.1:11451";
let browser;
before(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.ANR_CHROMIUM ? { executablePath: process.env.ANR_CHROMIUM } : {}) });
});
after(async () => { await browser?.close(); });

async function openPage() {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Optional remote wallpaper/quote requests are not part of this local UI test.
  await page.route("**/*", (route) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  return { page, errors };
}
const switchLanguage = (page, language) => page.selectOption("#ui-language", language);
const nav = (page, view) => page.locator(`.nav-item[data-view="${view}"]`).click();

// All mutation requests in the integration scenarios below are intercepted.
test("all screens, tabs and dialogs switch live; prompt and API payloads stay identical", { timeout: 60000 }, async () => {
  const { page, errors } = await openPage();
  try {
    const payloads = [];
    await page.route("**/api/generate", async (route) => {
      payloads.push(route.request().postDataJSON());
      await route.fulfill({ json: { job_id: "i18n-test", queued: false } });
    });
    await page.goto(base);
    await page.waitForSelector('#view-generate textarea');
    const prompt = "图片生成, 配置设置, 中文 prompt, teXt: 保存";
    const negative = "任务失败, 中文 negative";
    // Use the existing public controller API to avoid depending on random field IDs.
    await page.evaluate(async ({ prompt, negative }) => {
      const { getC } = await import("/js/views/generate.js");
      const c = getC(); c.positive.set(prompt); c.negative.set(negative); c.seed.set("123");
    }, { prompt, negative });
    for (const language of ["ja", "zh-CN", "ja"]) {
      await switchLanguage(page, language);
      assert.equal(await page.locator("html").getAttribute("lang"), language);
      const state = await page.evaluate(async () => {
        const { getC } = await import("/js/views/generate.js"); const c = getC();
        return { prompt: c.positive.get(), negative: c.negative.get(), model: c.model.get(), sampler: c.sampler.get() };
      });
      assert.equal(state.prompt, prompt); assert.equal(state.negative, negative);
      assert.match(state.model, /^nai-diffusion-/); assert.match(state.sampler, /^k_|^ddim/);
      await page.locator("#view-generate .btn-primary.btn-lg").click();
      await page.waitForFunction(() => !document.querySelector("#view-generate .btn-primary.btn-lg").disabled);
    }
    assert.equal(payloads.length, 3);
    assert.deepEqual(payloads[0], payloads[1]); assert.deepEqual(payloads[1], payloads[2]);
    assert.equal(payloads[0].positive_prompt, prompt); assert.equal(payloads[0].negative_prompt, negative);
    for (const view of ["generate", "director", "upscale", "pnginfo", "selector", "browse", "plugins", "settings", "sponsor"]) {
      await nav(page, view);
      await page.locator(`#view-${view} h2`).waitFor();
      const heading = await page.locator(`#view-${view} h2`).innerText();
      assert.doesNotMatch(heading, /渲染失败/);
      // Exercise cached views, with both directions, after emoji parsing has run.
      await switchLanguage(page, "zh-CN"); await switchLanguage(page, "ja");
      const tabs = page.locator(`#view-${view} .tab-btn`);
      for (let i = 0; i < await tabs.count(); i++) if (await tabs.nth(i).isVisible()) await tabs.nth(i).click();
    }
    await nav(page, "settings");
    const tokenInput = page.locator("#view-settings textarea").first();
    await tokenInput.fill("local-ui-test-placeholder");
    await switchLanguage(page, "zh-CN"); await switchLanguage(page, "ja");
    assert.equal(await tokenInput.inputValue(), "local-ui-test-placeholder");
    await page.locator("#queue-toggle").click();
    assert.match(await page.locator("body").innerText(), /画像生成キュー/);
    await switchLanguage(page, "zh-CN");
    assert.match(await page.locator("body").innerText(), /生图队列/);
    await switchLanguage(page, "ja");
    assert.match(await page.locator("body").innerText(), /画像生成キュー/);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("backend error messages translate and Chinese language choice survives reload", { timeout: 30000 }, async () => {
  const { page, errors } = await openPage();
  try {
    await page.route("**/api/generate", (route) => route.fulfill({ status: 400, json: { detail: "请先上传图片" } }));
    await page.goto(base); await page.waitForSelector('#view-generate textarea');
    await page.locator("#view-generate .btn-primary.btn-lg").click();
    await page.getByText("先に画像をアップロードしてください", { exact: false }).first().waitFor();
    await switchLanguage(page, "zh-CN");
    await page.getByText("请先上传图片", { exact: false }).first().waitFor();
    await page.reload(); await page.waitForSelector('#view-generate textarea');
    assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
    assert.match(await page.locator('.nav-item[data-view="settings"]').innerText(), /配置设置/);
    await switchLanguage(page, "ja");
    assert.match(await page.locator('.nav-item[data-view="settings"]').innerText(), /設定/);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("plugin metadata translates while defaults, IDs, option values and action payloads stay original", { timeout: 30000 }, async () => {
  const { page, errors } = await openPage();
  try {
    const values = [];
    const plugin = { name: "i18n_fixture", title: "图片工具", icon: "🧩", description: "批量压缩并整理图片元数据", panels: [{
      id: "demo", title: "变换", fields: [
        { id: "prompt", label: "提示词", type: "textarea", default: "图片生成, 配置设置, 中文 prompt", placeholder: "在此输入提示词..." },
        { id: "method", label: "处理方式", type: "select", options: ["自定义", "随机"], default: "自定义" },
        { id: "mode", label: "打码方法", type: "radio", options: ["像素", "模糊"], default: "像素" },
        { id: "enabled", label: "启用", type: "checkbox", default: true },
      ], actions: [{ id: "run", label: "应用变换", inputs: ["prompt", "method", "mode", "enabled"], uses_novelai: false, stop: false, show_output: false }],
    }] };
    await page.route("**/api/state", async (route) => {
      const response = await route.fetch(); const state = await response.json();
      state.plugins = [plugin]; state.plugins_reload = { reloading: false };
      await route.fulfill({ json: state });
    });
    await page.route("**/api/plugin/i18n_fixture/**", async (route) => {
      if (route.request().url().endsWith("/run")) values.push(route.request().postDataJSON());
      await route.fulfill({ json: route.request().method() === "GET" ? { values: {} } : { job_id: "ui-only-test" } });
    });
    await page.goto(base); await page.locator('[data-view="plugin-i18n_fixture"]').waitFor();
    await nav(page, "plugin-i18n_fixture");
    const panel = page.locator("#view-plugin-page");
    await panel.locator('textarea').waitFor();
    await panel.locator('[data-field="method"] select').selectOption("自定义");
    for (const language of ["ja", "zh-CN", "ja"]) {
      await switchLanguage(page, language);
      assert.match(await panel.locator("h2").innerText(), language === "ja" ? /画像ツール/ : /图片工具/);
      assert.equal(await panel.locator('textarea').inputValue(), "图片生成, 配置设置, 中文 prompt");
      assert.equal(await panel.locator('[data-field="method"] select').inputValue(), "自定义");
      assert.equal(await panel.locator('[data-field="mode"] .selected').getAttribute("data-value"), "像素");
      assert.match(await panel.locator('[data-field="method"] option').first().innerText(), language === "ja" ? /カスタム/ : /自定义/);
      const button = panel.locator(".btn-primary").filter({ hasText: language === "ja" ? "変形を適用" : "应用变换" });
      await button.click(); await button.waitFor({ state: "visible" });
      await page.waitForFunction(() => !document.querySelector("#view-plugin-page .btn-primary").disabled);
    }
    assert.equal(values.length, 3); assert.deepEqual(values[0], values[1]); assert.deepEqual(values[1], values[2]);
    assert.equal(values[0].values.prompt, "图片生成, 配置设置, 中文 prompt");
    assert.equal(values[0].values.method, "自定义"); assert.equal(values[0].values.mode, "像素");
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
