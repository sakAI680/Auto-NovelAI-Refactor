// UI-only localization. No API payloads, input values, prompt text or data are rewritten.
import ja from "./locales/ja.js";
import pluginJa from "./locales/plugins-ja.js";

const dictionaries = { ja: Object.assign(Object.create(null), ja, pluginJa), "zh-CN": Object.create(null) };
const STORAGE_KEY = "anr-ui-language";
const supported = new Set(Object.keys(dictionaries));
let language = "ja";
try {
  const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
  if (supported.has(saved)) language = saved;
} catch { /* Storage can be disabled; the language still works for this session. */ }

export const getLanguage = () => language;
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = new Map();
function messagePatterns(locale) {
  if (patterns.has(locale)) return patterns.get(locale);
  const result = [];
  for (const [source, target] of Object.entries(dictionaries[locale])) {
    if (!/\{\d+\}/.test(source)) continue;
    const slots = [];
    const regex = source.split(/(\{\d+\})/).map((part) => {
      if (!/^\{\d+\}$/.test(part)) return escapeRegExp(part);
      slots.push(Number(part.slice(1, -1)));
      return "([\\s\\S]*?)";
    }).join("");
    result.push({ regex: new RegExp("^" + regex + "$"), target, slots, specificity: source.replace(/\{\d+\}/g, "").length });
  }
  result.sort((a, b) => b.specificity - a.specificity);
  patterns.set(locale, result);
  return result;
}

/** Exact source keys, then complete message templates. Interpolated values stay verbatim. */
export function t(source, ...values) {
  if (source instanceof Message) return String(source);
  if (source === null || source === undefined) return "";
  const text = String(source);
  let translated = dictionaries[language][text];
  if (translated === undefined && language !== "zh-CN" && !values.length) {
    for (const pattern of messagePatterns(language)) {
      const match = pattern.regex.exec(text);
      if (!match) continue;
      const captured = [];
      pattern.slots.forEach((slot, index) => { captured[slot] = match[index + 1]; });
      return pattern.target.replace(/\{(\d+)\}/g, (whole, index) => captured[index] ?? whole);
    }
    // Error prefixes are explicitly catalogued; preserve the diagnostic after the colon.
    const prefix = Object.keys(dictionaries[language]).filter((key) => key.endsWith(": ") && text.startsWith(key))
      .sort((a, b) => b.length - a.length)[0];
    if (prefix) return dictionaries[language][prefix] + t(text.slice(prefix.length));
    const decorated = /^([^\p{Letter}\p{Number}<]+)([\s\S]+)$/u.exec(text);
    if (decorated) return decorated[1] + t(decorated[2]);
  }
  translated ??= text;
  return translated.replace(/\{(\d+)\}/g, (whole, index) => index < values.length ? String(values[index] ?? "") : whole);
}

class Message {
  constructor(source, values) { this.source = source; this.values = values; }
  toString() { return t(this.source, ...this.values); }
}

class FormattedMessage extends Message {
  constructor(message, formatter) { super("", []); this.message = message; this.formatter = formatter; }
  toString() { return this.formatter(String(this.message)); }
}
export const formatMessage = (message, formatter) => new FormattedMessage(message, formatter);

/** A lazy UI message lets existing labels switch language without rebuilding forms. */
export const m = (source, ...values) => source instanceof Message ? source : new Message(source, values);
export const isMessage = (value) => value instanceof Message;

const bindings = new WeakMap();
const nodes = new Set();
let registrations = 0;
function bind(node, key, value, write, read) {
  if (!isMessage(value)) {
    bindings.get(node)?.delete(key);
    write(String(value ?? ""));
    return value;
  }
  let slots = bindings.get(node);
  if (!slots) {
    slots = new Map();
    bindings.set(node, slots);
    nodes.add(new WeakRef(node));
  }
  slots.set(key, { value, write, read, last: String(value) });
  write(String(value ?? ""));
  if (++registrations % 256 === 0) {
    for (const ref of nodes) if (!ref.deref()) nodes.delete(ref);
  }
  return value;
}

export const setText = (node, value) => bind(node, "text", value, (text) => { node.textContent = text; }, () => node.textContent);
export const setHTML = (node, value) => bind(node, "html", value, (text) => { node.innerHTML = text; }, () => node.innerHTML);
export function setAttribute(node, name, value) {
  return bind(node, "attr:" + name, value, (text) => {
    if (node.nodeType === 9 && name === "title") node.title = text;
    else node.setAttribute(name, text);
  }, () => node.nodeType === 9 ? node.title : node.getAttribute(name));
}
export function textNode(value) {
  // A stable inline wrapper survives Twemoji replacing text nodes with images.
  const node = isMessage(value) ? document.createElement("span") : document.createTextNode("");
  setText(node, value);
  return node;
}

export function setLanguage(next) {
  if (!supported.has(next)) throw new RangeError("Unsupported UI language: " + next);
  if (next === language) return;
  language = next;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, next); } catch { /* optional */ }
  for (const ref of nodes) {
    const node = ref.deref();
    if (!node) { nodes.delete(ref); continue; }
    const slots = bindings.get(node);
    for (const [key, binding] of slots) {
      // A later data write (e.g. a selected filename) cancels the old UI binding.
      // Emoji rendering changes textContent too, so compare its accessible text as well.
      const current = binding.read();
      const accessible = key === "text" && node.nodeType === 1
        ? [...node.childNodes].map((child) => child.nodeType === 1 && child.matches("img.twemoji") ? child.alt : child.textContent).join("")
        : current;
      if (key !== "html" && current !== binding.last && accessible !== binding.last) { slots.delete(key); continue; }
      const translated = String(binding.value);
      binding.write(translated);
      binding.last = translated;
    }
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = next;
    document.dispatchEvent(new CustomEvent("anr:language", { detail: { language: next } }));
  }
}

/** Only the built-in, initially static shell is scanned; runtime/user DOM is never scanned. */
export function initI18n() {
  document.documentElement.lang = language;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const initial = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest("script, style, textarea, input, [data-i18n-skip]")) continue;
    if (/[\u3400-\u9fff]/u.test(node.textContent)) initial.push(node);
  }
  initial.forEach((node) => node.replaceWith(textNode(m(node.textContent))));
  document.querySelectorAll("[title], [aria-label], [alt]").forEach((node) => {
    for (const attr of ["title", "aria-label", "alt"]) {
      const value = node.getAttribute(attr);
      if (value && /[\u3400-\u9fff]/u.test(value)) setAttribute(node, attr, m(value));
    }
  });
  const select = document.getElementById("ui-language");
  if (select) {
    select.value = language;
    select.addEventListener("change", () => setLanguage(select.value));
    document.addEventListener("anr:language", () => { select.value = language; });
  }
}
