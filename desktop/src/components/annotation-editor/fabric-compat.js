import { BaseFabricObject } from 'fabric'

// Fabric.js 7 changed the default object origin to center. This editor stores
// Android screenshot coordinates in top-left space, so keep Fabric aligned to
// that coordinate system. Explicit center-origin objects (step markers,
// magnifiers, arrow heads, etc.) still override these defaults individually.
BaseFabricObject.ownDefaults.originX = 'left'
BaseFabricObject.ownDefaults.originY = 'top'
