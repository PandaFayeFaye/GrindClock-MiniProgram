export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/stats/index',
    'pages/employer-form/index',
    'pages/backfill/index',
    'pages/batch-backfill/index',
    'pages/me/index',
    'pages/net-pay/index',
    'pages/badges/index',
    'pages/team/index',
    'pages/worker-form/index',
    'pages/recap/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FBF7EC',
    navigationBarTitleText: '牛马打卡机',
    navigationBarTextStyle: 'black',
    backgroundColor: '#FBF7EC'
  },
  tabBar: {
    color: '#8A8272',
    selectedColor: '#1A1A1A',
    backgroundColor: '#FFFFFF',
    list: [
      { pagePath: 'pages/index/index', text: '首页' },
      { pagePath: 'pages/stats/index', text: '统计' },
      { pagePath: 'pages/me/index', text: '我的' }
    ]
  },
  cloud: true
} as any)
