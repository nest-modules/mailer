<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { type Adapter, renderEjs, renderPug } from './renderers';
import { adapters, defaultContext } from './samples';

type HandlebarsLike = {
  compile: (template: string) => (context: unknown) => string;
};

const adapter = ref<Adapter>('handlebars');
const template = ref(adapters.handlebars.defaultTemplate);
const contextStr = ref(defaultContext);
const showContext = ref(false);
const renderedHtml = ref('');
const error = ref('');

let handlebars: HandlebarsLike | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

async function compile(): Promise<string> {
  const ctx = JSON.parse(contextStr.value) as Record<string, unknown>;
  switch (adapter.value) {
    case 'handlebars': {
      if (!handlebars) {
        const mod = await import('handlebars');
        handlebars = ((mod as { default?: HandlebarsLike }).default ??
          mod) as HandlebarsLike;
      }
      return handlebars.compile(template.value)(ctx);
    }
    case 'ejs':
      return renderEjs(template.value, ctx);
    case 'pug':
      return renderPug(template.value, ctx);
  }
}

async function render() {
  try {
    renderedHtml.value = await compile();
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    renderedHtml.value = '';
  }
}

watch(
  [adapter, template, contextStr],
  () => {
    clearTimeout(timer);
    timer = setTimeout(render, 300);
  },
  { immediate: true },
);

onBeforeUnmount(() => clearTimeout(timer));

function onAdapterChange() {
  template.value = adapters[adapter.value].defaultTemplate;
}
</script>

<template>
  <div class="tp">
    <div class="tp-intro">
      <h1>Template Preview</h1>
      <p>
        Edit a template and its context to see the rendered email live.
        Handlebars uses the real engine; EJS and Pug use lightweight in-browser
        renderers that cover common syntax.
      </p>
    </div>

    <div class="tp-toolbar">
      <label class="tp-label">
        Adapter
        <select v-model="adapter" class="tp-select" @change="onAdapterChange">
          <option v-for="(info, key) in adapters" :key="key" :value="key">
            {{ info.label }}
          </option>
        </select>
      </label>
      <button
        type="button"
        class="tp-button"
        :class="{ active: showContext }"
        @click="showContext = !showContext"
      >
        {{ showContext ? 'Hide' : 'Show' }} Context (JSON)
      </button>
    </div>

    <div class="tp-panels">
      <div class="tp-panel">
        <div class="tp-panel-header">
          <span>Template</span>
          <span class="tp-badge">{{ adapters[adapter].label }}</span>
        </div>
        <textarea
          v-model="template"
          class="tp-editor"
          spellcheck="false"
          aria-label="Template source"
        />
        <textarea
          v-if="showContext"
          v-model="contextStr"
          class="tp-context"
          spellcheck="false"
          placeholder="Template context (JSON)"
          aria-label="Template context (JSON)"
        />
      </div>

      <div class="tp-panel">
        <div class="tp-panel-header">
          <span>Preview</span>
        </div>
        <div v-if="error" class="tp-error">{{ error }}</div>
        <iframe
          v-else
          class="tp-iframe"
          title="Email Preview"
          sandbox=""
          :srcdoc="renderedHtml"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tp {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--vp-nav-height));
}

.tp-intro h1 {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.3;
  margin: 0 0 8px;
}

.tp-intro p {
  color: var(--vp-c-text-2);
  margin: 0 0 16px;
}

.tp-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.tp-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--vp-c-text-2);
}

.tp-select,
.tp-button {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}

.tp-select:focus,
.tp-select:hover,
.tp-button:hover {
  border-color: var(--vp-c-brand-1);
  outline: none;
}

.tp-button.active {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-white);
}

.tp-panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  flex: 1;
  min-height: 560px;
}

@media (max-width: 768px) {
  .tp {
    padding: 16px;
  }

  .tp-panels {
    grid-template-columns: 1fr;
    grid-template-rows: 480px 480px;
  }
}

.tp-panel {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  min-height: 0;
}

.tp-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tp-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
}

.tp-editor,
.tp-context {
  width: 100%;
  margin: 0;
  padding: 16px;
  border: none;
  resize: none;
  outline: none;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre;
  overflow: auto;
}

.tp-editor {
  flex: 1;
  min-height: 0;
  background: var(--vp-code-block-bg);
  color: var(--vp-c-text-1);
}

.tp-context {
  height: 140px;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.tp-iframe {
  flex: 1;
  width: 100%;
  border: none;
  background: #ffffff;
}

.tp-error {
  padding: 16px;
  color: var(--vp-c-danger-1);
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  white-space: pre-wrap;
}
</style>
