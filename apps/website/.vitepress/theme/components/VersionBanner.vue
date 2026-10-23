<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed } from 'vue';

const props = defineProps<{ version: '2' | '3' }>();

const releases = { '2': '2.3.x', '3': '3.0.x' } as const;
const label = computed(() => releases[props.version]);
</script>

<template>
  <div class="warning custom-block version-banner">
    <p class="custom-block-title">Older version</p>
    <p>
      You're reading the docs for v{{ version }} ({{ label }}). The latest
      version is v4.
    </p>
    <p>
      <a :href="withBase('/guide/getting-started')">Read the v4 guide</a>
      ·
      <template v-if="version === '2'">
        <a :href="withBase('/guide/migration-v3')">Migrate from v2 to v3</a>
        ·
      </template>
      <a :href="withBase('/guide/migration')">Migrate from v3 to v4</a>
      ·
      <a :href="withBase('/guide/versions')">Versions &amp; upgrading</a>
    </p>
  </div>
</template>
