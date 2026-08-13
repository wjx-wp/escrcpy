import { execSync } from 'node:child_process'

const raw = execSync('npm config get electron_mirror').toString().trim()
const mirror = (raw && raw !== 'undefined') ? raw : null

const commonNotices = [
  { from: '../LICENSE', to: 'LICENSE.txt' },
  { from: '../THIRD_PARTY_NOTICES.md', to: 'THIRD_PARTY_NOTICES.md' },
]

/** @type {import('electron-builder').Configuration} */
export default {
  productName: 'GuidePix',
  appId: 'io.github.wjx-wp.guidepix',

  directories: {
    output: 'dist-release',
    buildResources: 'electron/resources/build',
  },

  files: [
    'dist',
    'dist-electron',
    '!**/node_modules/@lydell/node-pty-*/**/*',
    '**/node_modules/@lydell/node-pty-*${platform}-${arch}/**/*',
  ],

  asar: true,

  asarUnpack: [
    '**/node_modules/@lydell/node-pty*/**/*',
  ],

  win: {
    icon: 'logo.ico',
    target: [
      { target: 'nsis', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },
      { target: 'portable', arch: ['x64', 'arm64'] },
    ],
    artifactName: 'GuidePix-${arch}.${ext}',
    extraResources: [
      {
        from: 'electron/resources/extra',
        to: 'extra',
        filter: ['common', 'win', 'win-${arch}'],
      },
      ...commonNotices,
    ],
  },

  nsis: {
    artifactName: 'GuidePix-Setup-${arch}.${ext}',
    shortcutName: 'GuidePix',
    uninstallDisplayName: 'GuidePix',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
  },

  portable: {
    artifactName: 'GuidePix-Portable-${arch}.${ext}',
    requestExecutionLevel: 'user',
  },

  appx: {
    identityName: 'wjxwp.GuidePix',
    publisher: 'CN=E67CC10B-A1BE-413C-BC3B-6E1137E0742D',
    publisherDisplayName: 'wjx-wp',
    languages: ['zh-CN', 'en-US', 'zh-TW'],
  },

  mac: {
    icon: 'logo.icns',
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },
    ],
    artifactName: 'GuidePix-${arch}.${ext}',
    extraResources: [
      {
        from: 'electron/resources/extra',
        to: 'extra',
        filter: ['common', 'mac', 'mac-${arch}'],
      },
      ...commonNotices,
    ],
    x64ArchFiles: 'Contents/Resources/extra/**/*',
    entitlementsInherit: 'entitlements.mac.plist',
    extendInfo: {
      NSDocumentsFolderUsageDescription:
        'GuidePix requests access to the Documents folder for guide projects.',
      NSDownloadsFolderUsageDescription:
        'GuidePix requests access to the Downloads folder for exported guide images.',
    },
    type: 'development',
    notarize: false,
    darkModeSupport: true,
    hardenedRuntime: false,
  },

  linux: {
    icon: 'logo.icns',
    maintainer: 'wjx-wp',
    category: 'Utility',
    target: [
      { target: 'AppImage', arch: ['x64', 'arm64'] },
      { target: 'deb', arch: ['x64', 'arm64'] },
    ],
    artifactName: 'GuidePix-${arch}.${ext}',
    extraResources: [
      {
        from: 'electron/resources/extra',
        to: 'extra',
        filter: ['common', 'linux', 'linux-${arch}'],
      },
      ...commonNotices,
    ],
  },

  flatpak: {
    runtime: 'org.freedesktop.Platform',
    runtimeVersion: '23.08',
    sdk: 'org.freedesktop.Sdk',
    base: 'org.electronjs.Electron2.BaseApp',
    baseVersion: '23.08',
    finishArgs: [
      '--share=network',
      '--share=ipc',
      '--socket=x11',
      '--socket=wayland',
      '--socket=pulseaudio',
      '--device=all',
      '--filesystem=home',
      '--filesystem=xdg-download',
      '--talk-name=org.freedesktop.Notifications',
      '--talk-name=org.kde.StatusNotifierWatcher',
      '--system-talk-name=org.freedesktop.UDisks2',
    ],
  },

  npmRebuild: true,

  publish: {
    provider: 'github',
    owner: 'wjx-wp',
    repo: 'escrcpy',
    updaterCacheDirName: 'guidepix-updater',
  },

  electronDownload: {
    mirror,
  },
}
