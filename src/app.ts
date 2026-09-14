import { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'

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
    // docs, hence TTF. Loaded once, globally, at launch -- WXSS @font-face with
    // a locally-bundled file is flaky across client versions, wx.loadFontFace
    // is the documented reliable path.
    Taro.loadFontFace({
      family: 'ZCOOL KuaiLe',
      source: 'url("/fonts/ZCOOLKuaiLe-subset.ttf")',
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
