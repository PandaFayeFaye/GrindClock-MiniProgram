import { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'

import './app.scss'

// Cloud environment id -- fill this in from 云开发控制台 once the environment is
// created (Phase 0). Everything else (db reads/writes) assumes this is set.
export const CLOUD_ENV_ID = ''

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    if (CLOUD_ENV_ID) {
      Taro.cloud.init({ env: CLOUD_ENV_ID, traceUser: true })
    } else {
      console.warn('CLOUD_ENV_ID not set yet -- see docs/DATA_MODEL.md')
    }
  })

  // children 是将要会渲染的页面
  return children
}

export default App
