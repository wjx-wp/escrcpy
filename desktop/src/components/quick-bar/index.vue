<template>
  <div class="flex items-center relative z-10 *:app-region-no-drag -mr-1">
    <component
      :is="item.component || 'div'"
      v-for="item in actionModel"
      :key="item.label"
      class="flex-none"
      v-bind="{
        ...(item.command
          ? {
            onClick: () => handleCommand(item),
          }
          : {}),
      }"
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
import Documentation from './components/documentation/index.vue'
import DocumentationWorkbench from './components/documentation-workbench/index.vue'
import DocumentationWorkspace from './components/documentation-workspace/index.vue'
import Log from './components/log/index.vue'
import Restart from './components/restart/index.vue'
import Search from './components/search/index.vue'
import Terminal from './components/terminal/index.vue'

const props = defineProps({})

const actionModel = [
  {
    label: 'Documentation Workbench',
    title: '文档工作台：连续截图、批量标注、步骤合集',
    fontIcon: 'i-bi-layout-text-window-reverse',
    component: DocumentationWorkbench,
  },
  {
    label: 'Documentation Project',
    title: '打开已保存的文档标注工程',
    fontIcon: 'i-bi-folder2-open',
    component: Documentation,
  },
  {
    label: 'Documentation Workspace',
    title: '设置 F8 文档截图保存目录',
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

function handleCommand() {}
</script>

<style></style>
