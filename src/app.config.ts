export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/employer-form/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FBF7EC',
    navigationBarTitleText: '牛马打卡机',
    navigationBarTextStyle: 'black',
    backgroundColor: '#FBF7EC'
  },
  cloud: true
} as any)
