const axios = require('axios');

// 目标 URL
const url = 'https://m.cyzw.org/book/69380_1/';

// 完全复制你浏览器的请求头（防屏蔽）
const headers = {
  "Host": "m.cyzw.org",
  "Connection": "keep-alive",
  "Cache-Control": "max-age=0",
  "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Upgrade-Insecure-Requests": "1",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-User": "?1",
  "Sec-Fetch-Dest": "document",
  "Referer": "https://m.cyzw.org/book/69380/",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cookie": "Hm_lvt_8227eec5de84c7658c44ce545e4b=1777209687; HMACCOUNT=84B469F8091E0A2D; Hm_lpvt_8227eec5de84c7658c44ce545e4b=1777640825"
};

// 发起请求
async function fetchChapter() {
  try {
    const res = await axios.get(url, { headers });
    
    console.log('✅ 请求成功！');
    console.log('状态码:', res.status);
    console.log('\n=== 页面 HTML 内容 ===');
    console.log(res.data); // 这里就是章节页面完整源码
  } catch (err) {
    console.error('❌ 请求失败:', err.message);
  }
}

fetchChapter();