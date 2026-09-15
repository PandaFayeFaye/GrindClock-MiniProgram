import { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'

import { DISPLAY_FONT_BASE64 } from './lib/displayFontBase64'
import './app.scss'

// Cloud environment id -- fill this in from 云开发控制台 once the environment is
// created (Phase 0). Everything else (db reads/writes) assumes this is set.
export const CLOUD_ENV_ID = 'cloudbase-d0go2ovbsd2343e4a'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    if (CLOUD_ENV_ID) {
      Taro.cloud.init({ env: CLOUD_ENV_ID, traceUser: true })
    } else {
      console.warn('CLOUD_ENV_ID not set yet -- see docs/DATA_MODEL.md')
    }

    // Web app's display font (ZCOOL KuaiLe) for page titles / big stat numbers,
    // subsetted to just the characters this app actually uses (~100KB TTF,
    // see assets/fonts/). WOFF2 is unreliable on older iOS per WeChat's own
    // docs, hence TTF. Loaded once, globally, at launch.
    //
    // wx.loadFontFace's `source` internally goes through a *download task*
    // even for a package-relative path like "/fonts/x.ttf" -- since that's
    // not a fetchable URL, it fails with "createDownloadTask:fail invalid
    // url" every time (silently falling back to the system font). Reading
    // the bundled file at runtime via getFileSystemManager doesn't work
    // reliably either -- package-bundled assets aren't guaranteed readable
    // through that API on every base library version. Inlining the font as
    // a base64 data URI build-time constant (DISPLAY_FONT_BASE64) sidesteps
    // both problems: no download, no runtime file read.
    Taro.loadFontFace({
      family: 'ZCOOL KuaiLe',
      source: `url("data:font/ttf;base64,${DISPLAY_FONT_BASE64}")`,
      global: true,
    }).then(
      (res) => console.log('Display font loaded', res),
      (err) => console.warn('Failed to load display font', err),
    )
  })

  // children 是将要会渲染的页面
  return children
}

export default App
