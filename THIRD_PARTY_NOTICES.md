# Third-Party Notices

Escrcpy Docs is a fork of the open-source Escrcpy project. This file records the main upstream projects used by, bundled with, or directly referenced by the Documentation Mode work in this fork.

## Escrcpy

- Project: https://github.com/viarotel-org/escrcpy
- License: Apache License 2.0
- Role: The complete Electron/Vue Android device-management foundation used by this fork.

The repository root `LICENSE` is retained from Escrcpy and continues to apply to this fork subject to the Apache-2.0 terms.

## scrcpy

- Project: https://github.com/Genymobile/scrcpy
- License: Apache License 2.0
- Role: Android screen mirroring and control.

Please refer to the scrcpy distribution and upstream repository for its copyright and license notices.

## Fabric.js

- Project: https://github.com/fabricjs/fabric.js
- License: MIT
- Role: Canvas object model and interaction layer used by the Documentation Mode annotation editor.

MIT License

Copyright (c) 2008-2015 Printio (Juriy Zaytsev, Maxim Chernyak)
Copyright (c) 2016-present Andrea Bogazzi, Shachar Nen and Fabric.js contributors (https://github.com/fabricjs/fabric.js/graphs/contributors)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Other Escrcpy dependencies

Escrcpy itself depends on and integrates a number of open-source projects, including Electron, Vue, adbkit, yadb, UnoCSS, gnirehtet and others. Their licenses remain their own. See the upstream Escrcpy repository and the dependency metadata in this repository for the complete dependency set.

## ShareX

- Project: https://github.com/ShareX/ShareX
- License: GNU GPL v3
- Role in this fork: **design and workflow reference only**.

No ShareX source code is copied into the Documentation Mode implementation. ShareX is not linked or bundled as a dependency. The annotation features in this fork are independently implemented with Fabric.js and browser Canvas APIs so that ShareX's GPL-licensed implementation is not mixed into this codebase.

## PixPin

PixPin is referenced only as product/interaction inspiration based on normal end-user experience, especially for compact Chinese desktop screenshot-tool workflows. No PixPin code, binaries, icons, or other proprietary assets are included in this repository.
