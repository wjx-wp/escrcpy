// Compatibility re-export. The active Documentation UX service is implemented
// in documentation-ux-native and intentionally uses the phone's own SystemUI
// screenshot path instead of loading image-processing native modules here.

export { default } from '../documentation-ux-native/index.js'
