<template>
  <div class="flex items-center relative z-10 *:app-region-no-drag -mr-1">
    <component
      :is="item.component || 'div'"
      v-for="item in actionModel"
      :key="item.label"
      class="flex-none"
    >
      <template #default="{ trigger, ...slotProps } = {}">
        <el-button
          v-bind="{
            title: item.title || $t(item.tips || item.label),
            circle: true,
            borderless: true,
            text: true,
            ...slotProps,
            ...(trigger ? { onClick: trigger } : {}),
          }"
          class="!mx-1"
        >
          <template #icon>
            <el-icon v-if="item.elIcon" :class="item.iconClass">
              <component :is="item.elIcon" />
            </el-icon>
            <i v-else-if="item.fontIcon" :class="item.fontIcon"></i>
          </template>
        </el-button>
      </template>
    </component>
  </div>
</template>

<script setup>
import Arrange from './components/arrange/index.vue'
import DocumentationSync from './components/documentation-sync/index.vue'
import DocumentationWorkbench from './components/documentation-workbench/index.vue'
import DocumentationWorkspace from './components/documentation-workspace/index.vue'
import Log from './components/log/index.vue'
import Restart from './components/restart/index.vue'
import Search from './components/search/index.vue'
import Terminal from './components/terminal/index.vue'

const actionModel = [
  {
    label: 'GuidePix Workbench',
    title: 'GuidePix 工作台：连续截图、连续标注、合集导出',
    fontIcon: 'i-bi-layout-text-window-reverse',
    component: DocumentationWorkbench,
  },
  {
    label: 'GuidePix Sync',
    title: '同步手机截图到电脑 · Ctrl+F8',
    fontIcon: 'i-bi-cloud-arrow-down',
    component: DocumentationSync,
  },
  {
    label: 'GuidePix Workspace',
    title: '设置 GuidePix 项目保存位置',
    fontIcon: 'i-bi-folder-symlink',
    component: DocumentationWorkspace,
  },
  {
    label: 'device.arrange.name',
    fontIcon: 'i-bi-window-split',
    component: Arrange,
  },
  {
    label: 'device.terminal.name',
    fontIcon: 'i-bi-terminal',
    component: Terminal,
  },
  {
    label: 'device.log.name',
    fontIcon: 'i-qlementine-icons-run-debug-16',
    component: Log,
  },
  {
    label: 'device.restart.name',
    fontIcon: 'i-iconoir-refresh',
    component: Restart,
  },
  {
    label: 'common.search',
    fontIcon: 'i-bi-search',
    component: Search,
  },
]
</script>

<style></style>
